const { supabaseAdmin } = require('../services/supabase');
const config = require('../config');
const path = require('path');
const { notifyRoom } = require('./pushController');
const { v4: uuidv4, validate: isUuid } = require('uuid');

const SIGNED_URL_TTL_SECONDS = 60 * 5;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractStoragePath(rawValue, bucket) {
  if (!rawValue) return null;

  const value = String(rawValue).trim();
  if (!value) return null;

  const candidates = [value];

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const pathParam = url.searchParams.get('path');

      if (pathParam) {
        candidates.unshift(pathParam);
      }

      candidates.push(url.pathname);
    } catch {
      return null;
    }
  }

  const bucketPattern = new RegExp(
    `(?:^|/)${escapeRegex(bucket)}/(.+)$`
  );

  for (const candidate of candidates) {
    let decodedValue;

    try {
      decodedValue = decodeURIComponent(candidate);
    } catch {
      decodedValue = candidate;
    }

    decodedValue = decodedValue
      .split('?')[0]
      .split('#')[0]
      .replace(/^\/+/, '');
    const storageMatch = decodedValue.match(
      new RegExp(
        `(?:^|/)object/(?:public|sign|authenticated)/${escapeRegex(bucket)}/(.+)$`
      )
    );

    if (storageMatch) {
      return storageMatch[1];
    }

    const bucketMatch = decodedValue.match(bucketPattern);
    if (bucketMatch) {
      return bucketMatch[1];
    }

    if (!/^https?:\/\//i.test(candidate)) {
      return decodedValue;
    }
  }

  return null;
}

async function getMembershipRole(roomId, userId) {
  const { data } = await supabaseAdmin
    .from('room_members')
    .select('role')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();

  return data?.role || null;
}

async function getEventContext(eventId) {
  const { data, error } = await supabaseAdmin
    .from('events')
    .select('id, room_id')
    .eq('id', eventId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function buildSignedDownloadUrl(storagePath, fileName = null) {
  const bucket = config.upload.storageBucket;
  const normalizedPath = extractStoragePath(storagePath, bucket);

  if (!normalizedPath) {
    return null;
  }

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(normalizedPath, SIGNED_URL_TTL_SECONDS, fileName ? { download: fileName } : undefined);

  if (error) {
    throw error;
  }

  return data.signedUrl;
}

async function removeStorageObject(bucket, storagePath) {
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .remove([storagePath]);

  if (error) {
    throw error;
  }
}

/**
 * POST /rooms/:roomId/files
 * Upload a file to Supabase Storage and record metadata.
 * Automatically creates a backup copy in the backup bucket.
 */
async function uploadFile(req, res, next) {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.file;

    // Validate file type
    if (!config.upload.allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        error: 'File type not allowed. Supported: PDF, PPTX, DOCX, PNG, JPG, ZIP, TXT',
      });
    }

    // Validate file size (defence-in-depth; multer also limits)
    if (file.size > config.upload.maxFileSize) {
      return res.status(400).json({
        error: `File size exceeds the ${config.upload.maxFileSize / (1024 * 1024)}MB limit`,
      });
    }

    const bucket = config.upload.storageBucket;
    const backupBucket = config.upload.backupBucket;

    if (req.body.event_id) {
      if (!isUuid(req.body.event_id)) {
        return res.status(400).json({ error: 'Invalid event ID' });
      }

      const event = await getEventContext(req.body.event_id);

      if (!event) {
        return res.status(400).json({ error: 'Event not found' });
      }

      if (event.room_id !== roomId) {
        return res.status(400).json({
          error: 'File event_id must belong to the same room',
        });
      }
    }

    // Decode filename — multer may encode non-ASCII as latin1
    let originalName = file.originalname;
    try {
      const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
      if (decoded !== file.originalname && /[^\x00-\x7F]/.test(decoded)) {
        originalName = decoded;
      }
    } catch {}

    // Allow custom filename from client (sanitize dangerous characters)
    if (req.body.file_name) {
      const customName = String(req.body.file_name).trim();
      if (customName) originalName = customName;
    }
    // Strip path separators and null bytes to prevent path traversal
    originalName = originalName.replace(/[/\\:\0]/g, '_').replace(/\.{2,}/g, '.').substring(0, 255);

    const ext = path.extname(originalName);
    const fileUuid = uuidv4();
    const storagePath = `rooms/${roomId}/${fileUuid}${ext}`;
    const backupPath = `rooms/${roomId}/${fileUuid}_backup${ext}`;

    // Upload to main bucket
    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      return res.status(400).json({ error: uploadError.message });
    }

    // Upload backup copy as part of the write path so every stored file
    // has a deterministic recovery target in the backup bucket.
    const { error: backupError } = await supabaseAdmin.storage
      .from(backupBucket)
      .upload(backupPath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (backupError) {
      await supabaseAdmin.storage.from(bucket).remove([storagePath]).catch(() => {});
      return res.status(500).json({
        error: 'Failed to create backup copy for this file upload',
      });
    }

    // Save file metadata to database
    const insertObj = {
      room_id: roomId,
      uploaded_by: userId,
      file_name: originalName,
      file_url: storagePath,
      file_type: file.mimetype,
      file_size: file.size,
      backup_path: backupPath,
    };
    if (req.body.category) insertObj.category = String(req.body.category).trim().substring(0, 50);
    if (req.body.description) insertObj.file_description = String(req.body.description).trim().substring(0, 1000);
    if (req.body.event_id) insertObj.event_id = req.body.event_id;

    const { data, error: dbError } = await supabaseAdmin
      .from('files')
      .insert(insertObj)
      .select()
      .single();

    if (dbError) {
      await supabaseAdmin.storage.from(bucket).remove([storagePath]).catch(() => {});
      await supabaseAdmin.storage.from(backupBucket).remove([backupPath]).catch(() => {});
      return res.status(400).json({ error: dbError.message });
    }

    const download_url = await buildSignedDownloadUrl(data.file_url, data.file_name).catch(() => null);
    res.status(201).json({
      ...data,
      download_url,
    });

    notifyRoom(req.params.roomId, req.user.id, {
      type: 'files',
      title: 'New File',
      body: data.file_name || 'A file was uploaded',
      tag: `file-${req.params.roomId}`,
      data: { url: `/rooms/${req.params.roomId}` },
    }).catch(() => {});
  } catch (err) {
    next(err);
  }
}

/**
 * GET /rooms/:roomId/files
 * List all files in a room (excluding soft-deleted).
 */
async function getFiles(req, res, next) {
  try {
    const { roomId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('files')
      .select(`
        *,
        users:uploaded_by (
          id,
          full_name,
          avatar_url
        ),
        event:event_id (
          id,
          title,
          start_time
        )
      `)
      .eq('room_id', roomId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const filesWithSignedUrls = await Promise.all(
      data.map(async (file) => ({
        ...file,
        download_url: await buildSignedDownloadUrl(file.file_url, file.file_name).catch(() => null),
      }))
    );

    res.json(filesWithSignedUrls);
  } catch (err) {
    next(err);
  }
}

async function getFileDownloadUrl(req, res, next) {
  try {
    const { fileId } = req.params;
    const userId = req.user.id;

    const { data: file, error } = await supabaseAdmin
      .from('files')
      .select('id, room_id, file_name, file_url, deleted_at')
      .eq('id', fileId)
      .maybeSingle();

    if (error || !file || file.deleted_at) {
      return res.status(404).json({ error: 'File not found' });
    }

    const role = await getMembershipRole(file.room_id, userId);
    if (!role) {
      return res.status(403).json({ error: 'You are not a member of this room' });
    }

    const download_url = await buildSignedDownloadUrl(file.file_url, file.file_name);

    res.json({
      file_id: file.id,
      file_name: file.file_name,
      download_url,
      expires_in: SIGNED_URL_TTL_SECONDS,
    });
  } catch (err) {
    next(err);
  }
}

async function downloadFile(req, res, next) {
  try {
    const { fileId } = req.params;
    const userId = req.user.id;
    const bucket = config.upload.storageBucket;

    const { data: file, error } = await supabaseAdmin
      .from('files')
      .select('id, room_id, file_name, file_url, file_type, deleted_at')
      .eq('id', fileId)
      .maybeSingle();

    if (error || !file || file.deleted_at) {
      return res.status(404).json({ error: 'File not found' });
    }

    const role = await getMembershipRole(file.room_id, userId);
    if (!role) {
      return res.status(403).json({ error: 'You are not a member of this room' });
    }

    const storagePath = extractStoragePath(file.file_url, bucket);
    if (!storagePath) {
      return res.status(500).json({ error: 'Stored file path is invalid and could not be downloaded' });
    }

    const { data: blob, error: downloadError } = await supabaseAdmin.storage
      .from(bucket)
      .download(storagePath);

    if (downloadError || !blob) {
      return res.status(500).json({ error: downloadError?.message || 'Failed to download file from storage' });
    }

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const encodedFileName = encodeURIComponent(file.file_name || 'download').replace(/['()]/g, escape).replace(/\*/g, '%2A');

    res.setHeader('Content-Type', file.file_type || 'application/octet-stream');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /files/:fileId
 * Soft-delete a file. The file is hidden from the UI but remains in the
 * backup bucket for recovery. Only the uploader or room admin/owner can delete.
 */
async function deleteFile(req, res, next) {
  try {
    const { fileId } = req.params;
    const userId = req.user.id;

    const { data: file, error: fetchError } = await supabaseAdmin
      .from('files')
      .select('*')
      .eq('id', fileId)
      .maybeSingle();

    if (fetchError || !file || file.deleted_at) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check room membership
    const role = await getMembershipRole(file.room_id, userId);
    if (!role) {
      return res.status(403).json({
        error: 'You are not a member of this room',
      });
    }

    const isUploader = file.uploaded_by === userId;
    const isAdmin = role === 'owner' || role === 'admin';

    if (!isUploader && !isAdmin) {
      return res.status(403).json({
        error: 'Only the uploader or room admin can delete this file',
      });
    }

    const bucket = config.upload.storageBucket;
    const storagePath = extractStoragePath(file.file_url, bucket);

    if (!storagePath) {
      return res.status(500).json({
        error: 'Stored file path is invalid and could not be deleted',
      });
    }

    const deletedAt = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from('files')
      .update({ deleted_at: deletedAt })
      .eq('id', fileId);

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    try {
      await removeStorageObject(bucket, storagePath);
    } catch (storageError) {
      await supabaseAdmin
        .from('files')
        .update({ deleted_at: null })
        .eq('id', fileId);

      return res.status(500).json({
        error: 'Failed to remove file from storage',
      });
    }

    res.json({ message: 'File deleted successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /files/:fileId
 * Update file metadata (description). Only the uploader or room admin can edit.
 */
async function updateFile(req, res, next) {
  try {
    const { fileId } = req.params;
    const userId = req.user.id;

    const { data: file } = await supabaseAdmin
      .from('files')
      .select('*')
      .eq('id', fileId)
      .maybeSingle();

    if (!file || file.deleted_at) return res.status(404).json({ error: 'File not found' });

    const role = await getMembershipRole(file.room_id, userId);
    if (!role) return res.status(403).json({ error: 'Not a room member' });

    const isUploader = file.uploaded_by === userId;
    const isAdmin = role === 'owner' || role === 'admin';
    if (!isUploader && !isAdmin) {
      return res.status(403).json({ error: 'Only the uploader or admin can edit this file' });
    }

    const { file_description, file_name, category } = req.body;
    const updates = {};
    if (file_description !== undefined) updates.file_description = file_description;
    if (file_name !== undefined) {
      const trimmed = String(file_name).trim();
      if (!trimmed) return res.status(400).json({ error: 'File name cannot be empty' });
      updates.file_name = trimmed;
    }
    if (category !== undefined) {
      const allowed = ['lecture', 'submission', 'chat'];
      if (!allowed.includes(category)) {
        return res.status(400).json({ error: `Category must be one of: ${allowed.join(', ')}` });
      }
      updates.category = category;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { data, error } = await supabaseAdmin
      .from('files')
      .update(updates)
      .eq('id', fileId)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadFile,
  getFiles,
  getFileDownloadUrl,
  downloadFile,
  deleteFile,
  updateFile,
};
