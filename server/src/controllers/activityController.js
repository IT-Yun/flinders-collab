const { supabaseAdmin } = require('../services/supabase');

const ROOM_ACTIVITY_TTL_MS = 15 * 1000;
const ACTIVITY_SUMMARY_TTL_MS = 20 * 1000;
const roomActivityCache = new Map();
const activitySummaryCache = new Map();

function getFreshCacheEntry(cache, key, ttlMs) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCacheEntry(cache, key, value) {
  cache.set(key, { value, timestamp: Date.now() });
}

async function buildRoomActivityEntries(roomId) {
  const [messagesResult, filesResult, eventsResult, tasksResult] = await Promise.all([
    supabaseAdmin
      .from('messages')
      .select('id, content, created_at, user_id, users!inner(full_name)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabaseAdmin
      .from('files')
      .select('id, file_name, created_at, uploaded_by, users!inner(full_name)')
      .eq('room_id', roomId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5),
    supabaseAdmin
      .from('events')
      .select('id, title, created_at, created_by, users!inner(full_name)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabaseAdmin
      .from('tasks')
      .select('id, title, created_at, created_by, users!inner(full_name)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const activities = [];

  for (const m of messagesResult.data || []) {
    activities.push({
      id: `msg-${m.id}`,
      type: 'message',
      user_name: m.users?.full_name || 'Someone',
      description: m.content?.substring(0, 80) + (m.content?.length > 80 ? '...' : ''),
      created_at: m.created_at,
    });
  }
  for (const f of filesResult.data || []) {
    activities.push({
      id: `file-${f.id}`,
      type: 'file',
      user_name: f.users?.full_name || 'Someone',
      description: `uploaded "${f.file_name}"`,
      created_at: f.created_at,
    });
  }
  for (const e of eventsResult.data || []) {
    activities.push({
      id: `event-${e.id}`,
      type: 'event',
      user_name: e.users?.full_name || 'Someone',
      description: `created event "${e.title}"`,
      created_at: e.created_at,
    });
  }
  for (const t of tasksResult.data || []) {
    activities.push({
      id: `task-${t.id}`,
      type: 'task',
      user_name: t.users?.full_name || 'Someone',
      description: `added task "${t.title}"`,
      created_at: t.created_at,
    });
  }

  activities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return activities.slice(0, 15);
}

function addUnreadCounts(rows, lastVisitedByRoom, counts) {
  for (const row of rows || []) {
    const roomId = row?.room_id;
    if (!roomId) continue;
    const createdAt = new Date(row.created_at).getTime();
    const lastVisitedAt = lastVisitedByRoom.get(roomId) || 0;
    if (!Number.isFinite(createdAt) || createdAt <= lastVisitedAt) continue;
    counts.set(roomId, (counts.get(roomId) || 0) + 1);
  }
}

async function getUnreadActivityCounts(memberships, userId) {
  const roomIds = memberships.map((membership) => membership.room_id).filter(Boolean);
  if (roomIds.length === 0) return {};

  const lastVisitedByRoom = new Map(
    memberships.map((membership) => [
      membership.room_id,
      membership.last_visited_at ? new Date(membership.last_visited_at).getTime() : 0,
    ])
  );

  // Find the earliest last_visited_at to use as a date floor filter
  // This avoids fetching ALL historical rows — only rows newer than the oldest visit matter
  const visitTimestamps = memberships
    .map((m) => (m.last_visited_at ? new Date(m.last_visited_at).getTime() : 0))
    .filter((t) => t > 0);
  const earliestVisit = visitTimestamps.length > 0
    ? new Date(Math.min(...visitTimestamps)).toISOString()
    : null;

  const applyDateFloor = (query) => {
    return earliestVisit ? query.gte('created_at', earliestVisit) : query;
  };

  const [messagesResult, filesResult, eventsResult, tasksResult] = await Promise.all([
    applyDateFloor(
      supabaseAdmin
        .from('messages')
        .select('room_id, created_at')
        .in('room_id', roomIds)
        .neq('user_id', userId)
    ),
    applyDateFloor(
      supabaseAdmin
        .from('files')
        .select('room_id, created_at')
        .in('room_id', roomIds)
        .is('deleted_at', null)
        .neq('uploaded_by', userId)
    ),
    applyDateFloor(
      supabaseAdmin
        .from('events')
        .select('room_id, created_at')
        .in('room_id', roomIds)
        .neq('created_by', userId)
    ),
    applyDateFloor(
      supabaseAdmin
        .from('tasks')
        .select('room_id, created_at')
        .in('room_id', roomIds)
        .neq('assigned_by', userId)
    ),
  ]);

  const errors = [messagesResult, filesResult, eventsResult, tasksResult]
    .map((result) => result.error)
    .filter(Boolean);

  if (errors.length > 0) {
    throw new Error(errors[0].message);
  }

  const counts = new Map();
  addUnreadCounts(messagesResult.data, lastVisitedByRoom, counts);
  addUnreadCounts(filesResult.data, lastVisitedByRoom, counts);
  addUnreadCounts(eventsResult.data, lastVisitedByRoom, counts);
  addUnreadCounts(tasksResult.data, lastVisitedByRoom, counts);

  return Object.fromEntries([...counts.entries()].filter(([, count]) => count > 0));
}

async function getRoomActivity(req, res, next) {
  try {
    const { roomId } = req.params;
    const cached = getFreshCacheEntry(roomActivityCache, roomId, ROOM_ACTIVITY_TTL_MS);
    if (cached) {
      return res.json(cached);
    }
    const activities = await buildRoomActivityEntries(roomId);
    setCacheEntry(roomActivityCache, roomId, activities);
    res.json(activities);
  } catch (err) {
    next(err);
  }
}

async function getActivitySummary(req, res, next) {
  try {
    const userId = req.user.id;
    const { data: memberships, error } = await supabaseAdmin
      .from('room_members')
      .select('room_id, last_visited_at')
      .eq('user_id', userId);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const membershipFingerprint = (memberships || [])
      .map((membership) => `${membership.room_id}:${membership.last_visited_at || '0'}`)
      .sort()
      .join('|');
    const cacheKey = `${userId}:${membershipFingerprint}`;
    const cached = getFreshCacheEntry(activitySummaryCache, cacheKey, ACTIVITY_SUMMARY_TTL_MS);
    if (cached) {
      return res.json(cached);
    }

    const summary = await getUnreadActivityCounts(memberships || [], userId);
    setCacheEntry(activitySummaryCache, cacheKey, summary);
    res.json(summary);
  } catch (err) {
    next(err);
  }
}

module.exports = { getRoomActivity, getActivitySummary };
