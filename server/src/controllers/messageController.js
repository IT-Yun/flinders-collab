const { supabaseAdmin } = require('../services/supabase');
const config = require('../config');

// Cache signed URLs for 30 minutes (they expire in 60 min)
const SIGNED_URL_CACHE_TTL = 30 * 60 * 1000;
const signedUrlCache = new Map();

function getCachedSignedUrl(storagePath) {
  const cached = signedUrlCache.get(storagePath);
  if (cached && Date.now() - cached.ts < SIGNED_URL_CACHE_TTL) return cached.url;
  return null;
}

function setCachedSignedUrl(storagePath, url) {
  signedUrlCache.set(storagePath, { url, ts: Date.now() });
  // Evict old entries periodically
  if (signedUrlCache.size > 500) {
    const now = Date.now();
    for (const [key, val] of signedUrlCache) {
      if (now - val.ts > SIGNED_URL_CACHE_TTL) signedUrlCache.delete(key);
    }
  }
}

function formatMessage(message) {
  return {
    ...message,
    sender_name:
      message.users?.full_name ||
      message.users?.university_email ||
      message.sender_name ||
      'User',
  };
}

/**
 * Batch-refresh signed download URLs for file-type messages.
 * Fetches all file records in one query instead of N+1.
 */
async function refreshFileUrls(messages) {
  const fileMessages = messages.filter((m) => m.message_type === 'file');
  if (fileMessages.length === 0) return messages;

  const bucket = config.upload.storageBucket;

  // Extract all file IDs from message content
  const fileIds = [];
  const parsedMap = new Map();
  for (const msg of fileMessages) {
    try {
      const fileData = JSON.parse(msg.content);
      if (fileData.file_id) {
        fileIds.push(fileData.file_id);
        parsedMap.set(msg.id, fileData);
      }
    } catch { /* skip */ }
  }

  if (fileIds.length === 0) return messages;

  // Batch fetch all file records at once
  const { data: files } = await supabaseAdmin
    .from('files')
    .select('id, file_url, file_name, file_type, file_size')
    .in('id', fileIds);

  const fileMap = new Map();
  for (const f of files || []) {
    fileMap.set(f.id, f);
  }

  // Batch generate signed URLs (with caching)
  const urlMap = new Map();
  await Promise.all(
    (files || []).map(async (file) => {
      try {
        let storagePath = file.file_url;
        const bucketPrefix = `${bucket}/`;
        if (storagePath.startsWith(bucketPrefix)) {
          storagePath = storagePath.slice(bucketPrefix.length);
        }
        if (storagePath.includes('/object/')) {
          const match = storagePath.match(/\/object\/(?:public|sign|authenticated)\/[^/]+\/(.+)/);
          if (match) storagePath = match[1];
        }

        // Check cache first
        const cachedUrl = getCachedSignedUrl(storagePath);
        if (cachedUrl) {
          urlMap.set(file.id, cachedUrl);
          return;
        }

        const { data: signedData } = await supabaseAdmin.storage
          .from(bucket)
          .createSignedUrl(storagePath, 60 * 60, file.file_name ? { download: file.file_name } : undefined);
        if (signedData?.signedUrl) {
          setCachedSignedUrl(storagePath, signedData.signedUrl);
          urlMap.set(file.id, signedData.signedUrl);
        }
      } catch { /* skip */ }
    })
  );

  // Apply refreshed data to messages
  return messages.map((msg) => {
    if (msg.message_type !== 'file') return msg;
    const fileData = parsedMap.get(msg.id);
    if (!fileData?.file_id) return msg;

    const file = fileMap.get(fileData.file_id);
    if (!file) return msg;

    const refreshedContent = JSON.stringify({
      ...fileData,
      file_name: file.file_name || fileData.file_name,
      file_type: file.file_type || fileData.file_type,
      file_size: file.file_size || fileData.file_size,
      download_url: urlMap.get(file.id) || fileData.download_url,
    });

    return { ...msg, content: refreshedContent };
  });
}

/**
 * GET /rooms/:roomId/messages
 */
async function getMessages(req, res, next) {
  try {
    const { roomId } = req.params;
    const { limit = 50, before } = req.query;
    const pageLimit = Math.min(parseInt(limit, 10) || 50, 100);

    let query = supabaseAdmin
      .from('messages')
      .select('id, content, message_type, created_at, user_id, room_id, users:user_id(id, full_name, avatar_url)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(pageLimit);

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    const chronological = data.reverse().map(formatMessage);
    const withFreshUrls = await refreshFileUrls(chronological);
    res.json(withFreshUrls);
  } catch (err) {
    next(err);
  }
}

/**
 * Save a message to the database (used by both REST and Socket.IO).
 */
async function saveMessage({ room_id, user_id, content, message_type = 'text' }) {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({ room_id, user_id, content, message_type })
    .select('id, content, message_type, created_at, user_id, room_id, users:user_id(id, full_name, avatar_url)')
    .single();

  if (error) throw new Error(error.message);
  return formatMessage(data);
}

module.exports = { getMessages, saveMessage };
