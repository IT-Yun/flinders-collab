const crypto = require('crypto');
const webpush = require('web-push');
const config = require('../config');
const { supabaseAdmin } = require('../services/supabase');

const DEFAULT_NOTIFICATION_PREFERENCES = {
  chat: true,
  tasks: true,
  schedule: true,
  files: true,
  announcements: true,
  board: true,
  room_updates: true,
};

if (!config.vapid.publicKey || !config.vapid.privateKey) {
  const derived = deriveDeterministicVapidKeys(
    config.supabase.serviceRoleKey || config.jwtSecret || config.supabase.url || 'collab-vapid-fallback'
  );
  config.vapid.publicKey = derived.publicKey;
  config.vapid.privateKey = derived.privateKey;
  console.log('[push] VAPID keys missing in env, derived stable keys from server secret');
}

if (config.vapid.publicKey && config.vapid.privateKey) {
  webpush.setVapidDetails(
    config.vapid.subject,
    config.vapid.publicKey,
    config.vapid.privateKey
  );
}

// Ensure table exists on startup
(async () => {
  try {
    await supabaseAdmin.rpc('exec_sql', {
      query: `CREATE TABLE IF NOT EXISTS push_subscriptions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        subscription JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      ); CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);`
    });
  } catch {
    // Table might already exist or RPC not available — will be created via migration
  }
})();

// Store push subscription
async function subscribe(req, res) {
  const { subscription } = req.body;
  if (!subscription?.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }

  const userId = req.user.id;

  // Upsert — one user can have multiple devices
  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .upsert(
      { user_id: userId, endpoint: subscription.endpoint, subscription: subscription },
      { onConflict: 'endpoint' }
    );

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
}

// Remove push subscription
async function unsubscribe(req, res) {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });

  await supabaseAdmin
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint);

  res.json({ ok: true });
}

// Get VAPID public key
function getVapidKey(req, res) {
  res.json({ publicKey: config.vapid.publicKey });
}

async function notifyUsers(userIds, payload) {
  if (!Array.isArray(userIds) || userIds.length === 0) return;
  // Get all subscriptions for these users
  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('subscription, id, user_id')
    .in('user_id', userIds);

  if (!subs?.length) return;

  const uniqueUserIds = [...new Set(subs.map((row) => row.user_id).filter(Boolean))];
  const { data: preferenceRows } = await supabaseAdmin
    .from('users')
    .select('id, notification_preferences')
    .in('id', uniqueUserIds);

  const preferenceMap = new Map(
    (preferenceRows || []).map((row) => [row.id, normalizeNotificationPreferences(row.notification_preferences)])
  );

  const pushPayload = JSON.stringify(payload);
  const staleIds = [];

  await Promise.allSettled(
    subs.map(async (row) => {
      const preferences = preferenceMap.get(row.user_id) || DEFAULT_NOTIFICATION_PREFERENCES;
      if (!shouldSendNotification(preferences, payload?.type)) {
        return;
      }
      try {
        await webpush.sendNotification(row.subscription, pushPayload);
      } catch (err) {
        // Remove stale subscriptions (410 Gone or 404)
        if (err.statusCode === 410 || err.statusCode === 404) {
          staleIds.push(row.id);
        }
      }
    })
  );

  // Clean up stale subscriptions
  if (staleIds.length) {
    await supabaseAdmin.from('push_subscriptions').delete().in('id', staleIds);
  }
}

// Send push to all members of a room (except sender)
async function notifyRoom(roomId, senderId, payload) {
  const { data: members } = await supabaseAdmin
    .from('room_members')
    .select('user_id')
    .eq('room_id', roomId)
    .neq('user_id', senderId);

  if (!members?.length) return;

  const userIds = members.map((m) => m.user_id);
  await notifyUsers(userIds, payload);
}

module.exports = { subscribe, unsubscribe, getVapidKey, notifyRoom, notifyUsers };

function normalizeNotificationPreferences(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    chat: source.chat !== false,
    tasks: source.tasks !== false,
    schedule: source.schedule !== false,
    files: source.files !== false,
    announcements: source.announcements !== false,
    board: source.board !== false,
    room_updates: source.room_updates !== false,
    friend_requests: source.friend_requests !== false,
  };
}

function shouldSendNotification(preferences, type) {
  if (!type) return true;
  return preferences[type] !== false;
}

function deriveDeterministicVapidKeys(secret) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const seed = crypto
      .createHash('sha256')
      .update(`${secret}:vapid:${attempt}`)
      .digest();

    try {
      const ecdh = crypto.createECDH('prime256v1');
      ecdh.setPrivateKey(seed);

      const privateKey = ecdh.getPrivateKey();
      const publicKey = ecdh.getPublicKey(undefined, 'uncompressed');

      if (privateKey.length === 32 && publicKey.length === 65) {
        return {
          publicKey: toBase64Url(publicKey),
          privateKey: toBase64Url(privateKey),
        };
      }
    } catch {
      // Try the next derived seed if this scalar is invalid for the curve.
    }
  }

  return webpush.generateVAPIDKeys();
}

function toBase64Url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
