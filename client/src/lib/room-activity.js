const ROOM_LAST_VISITED_PREFIX = 'room-last-visited';

function getRoomLastVisitedKey(userId, roomId) {
  if (!userId || !roomId) return null;
  return `${ROOM_LAST_VISITED_PREFIX}:${userId}:${roomId}`;
}

export function readRoomLastVisited(userId, roomId) {
  if (typeof window === 'undefined') return 0;
  const key = getRoomLastVisitedKey(userId, roomId);
  if (!key) return 0;
  const value = window.localStorage.getItem(key);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function markRoomVisited(userId, roomId, timestamp = Date.now()) {
  if (typeof window === 'undefined') return;
  const key = getRoomLastVisitedKey(userId, roomId);
  if (!key) return;
  window.localStorage.setItem(key, String(timestamp));
}
