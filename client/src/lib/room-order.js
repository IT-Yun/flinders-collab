export function getRoomOrderKey(userId) {
  return userId ? `room-order:${userId}` : null;
}

export function loadRoomOrder(userId) {
  const key = getRoomOrderKey(userId);
  if (!key) return [];

  try {
    const stored = window.localStorage.getItem(key);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function applyRoomOrder(rooms, orderedIds) {
  if (!orderedIds.length) return rooms;

  const roomMap = new Map(rooms.map((room) => [room.id, room]));
  const orderedRooms = orderedIds
    .map((id) => roomMap.get(id))
    .filter(Boolean);
  const remainingRooms = rooms.filter((room) => !orderedIds.includes(room.id));

  return [...orderedRooms, ...remainingRooms];
}

export function buildOrderedIds(rooms, tempPrefix = '') {
  return rooms
    .map((room) => room.id)
    .filter((id) => typeof id === 'string' && (!tempPrefix || !id.startsWith(tempPrefix)));
}

export function persistRoomOrder(userId, orderedIds) {
  const key = getRoomOrderKey(userId);
  if (!key) return;
  window.localStorage.setItem(key, JSON.stringify(orderedIds));
}
