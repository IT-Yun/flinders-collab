const { supabaseAdmin } = require('../services/supabase');

// In-memory token verification cache (TTL: 30 seconds)
const TOKEN_CACHE_TTL = 30_000;
const tokenCache = new Map();

function pruneTokenCache() {
  const now = Date.now();
  for (const [key, entry] of tokenCache) {
    if (now - entry.ts > TOKEN_CACHE_TTL) tokenCache.delete(key);
  }
}

// Prune every 60 seconds to avoid unbounded growth
setInterval(pruneTokenCache, 60_000).unref();

/**
 * Authentication middleware.
 * Verifies the Supabase JWT from the Authorization header
 * and attaches the user object to req.user.
 * Caches verified tokens for 30s to avoid repeated Supabase round-trips.
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing or invalid authorization header',
      });
    }

    const token = authHeader.split(' ')[1];

    // Check cache first
    const cached = tokenCache.get(token);
    if (cached && Date.now() - cached.ts < TOKEN_CACHE_TTL) {
      req.user = cached.user;
      req.accessToken = token;
      return next();
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      tokenCache.delete(token);
      return res.status(401).json({
        error: 'Invalid or expired token',
      });
    }

    // Cache the verified user
    tokenCache.set(token, { user: data.user, ts: Date.now() });

    // Attach user and token to request
    req.user = data.user;
    req.accessToken = token;

    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    return res.status(401).json({
      error: 'Authentication failed',
    });
  }
}

/**
 * Room membership middleware.
 * Checks that the authenticated user is a member of the room
 * specified by req.params.roomId.
 * Caches membership checks for 45 seconds to avoid per-request DB queries.
 */
const MEMBER_CACHE_TTL = 45_000;
const memberCache = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memberCache) {
    if (now - entry.ts > MEMBER_CACHE_TTL) memberCache.delete(key);
  }
}, 90_000).unref();

async function requireRoomMember(req, res, next) {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;
    const cacheKey = `${roomId}:${userId}`;

    // Check cache first
    const cached = memberCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < MEMBER_CACHE_TTL) {
      req.memberRole = cached.role;
      return next();
    }

    const { data, error } = await supabaseAdmin
      .from('room_members')
      .select('id, role')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .limit(1);

    if (error || !data?.[0]) {
      memberCache.delete(cacheKey);
      return res.status(403).json({
        error: 'You are not a member of this room',
      });
    }

    const membership = data[0];

    // Cache the result
    memberCache.set(cacheKey, { role: membership.role, ts: Date.now() });
    req.memberRole = membership.role;
    next();
  } catch (err) {
    console.error('Room member check error:', err.message);
    return res.status(500).json({
      error: 'Failed to verify room membership',
    });
  }
}

/**
 * Room admin/owner middleware.
 * Must be used after requireRoomMember.
 */
function requireRoomAdmin(req, res, next) {
  if (req.memberRole !== 'owner' && req.memberRole !== 'admin') {
    return res.status(403).json({
      error: 'Admin or owner access required',
    });
  }
  next();
}

module.exports = {
  authenticate,
  requireRoomMember,
  requireRoomAdmin,
};
