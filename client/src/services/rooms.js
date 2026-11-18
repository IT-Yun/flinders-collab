import { apiUrl } from '@/lib/api';
import { getAuthHeaders, parseResponse } from '@/lib/api-headers';
import { cacheForOffline } from '@/lib/push';

const memoryCache = new Map();
const inflightRequests = new Map();

function getCachedValue(key, ttlMs) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedValue(key, value) {
  memoryCache.set(key, { value, timestamp: Date.now() });
}

async function cachedJsonRequest(key, ttlMs, requestFactory) {
  const cached = getCachedValue(key, ttlMs);
  if (cached) return cached;

  if (inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }

  const request = requestFactory()
    .then((value) => {
      setCachedValue(key, value);
      inflightRequests.delete(key);
      return value;
    })
    .catch((error) => {
      inflightRequests.delete(key);
      throw error;
    });

  inflightRequests.set(key, request);
  return request;
}

export async function createRoom(roomData) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/rooms'), { method: 'POST', headers, body: JSON.stringify(roomData) });
  return parseResponse(res);
}

export async function getRooms() {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/rooms'), { headers });
  const data = await parseResponse(res);
  cacheForOffline('/api/rooms', data);
  return data;
}

export async function getRoom(roomId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/rooms/${roomId}`), { headers });
  return parseResponse(res);
}

export async function joinRoom(inviteCode) {
  const headers = getAuthHeaders();
  const normalizedCode = String(inviteCode || '').trim().toUpperCase();
  const res = await fetch(apiUrl('/api/rooms/join'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ invite_code: normalizedCode }),
  });

  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const error = new Error(body?.error || `Request failed (${res.status})`);
    error.status = res.status;
    error.room = body?.room || null;
    throw error;
  }

  return body;
}

export async function getMembers(roomId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/rooms/${roomId}/members`), { headers });
  return parseResponse(res);
}

export async function updateRoom(roomId, data) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/rooms/${roomId}`), { method: 'PATCH', headers, body: JSON.stringify(data) });
  return parseResponse(res);
}

export async function deleteRoom(roomId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/rooms/${roomId}`), { method: 'DELETE', headers });
  return parseResponse(res);
}

export async function leaveRoom(roomId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/rooms/${roomId}/leave`), { method: 'POST', headers });
  return parseResponse(res);
}

export async function getRoomActivity(roomId) {
  return cachedJsonRequest(`room-activity:${roomId}`, 15000, async () => {
    const headers = getAuthHeaders();
    const res = await fetch(apiUrl(`/api/rooms/${roomId}/activity`), { headers });
    return parseResponse(res);
  });
}

export async function getRoomActivitySummary() {
  return cachedJsonRequest('room-activity-summary', 20000, async () => {
    const headers = getAuthHeaders();
    const res = await fetch(apiUrl('/api/rooms/activity-summary'), { headers });
    return parseResponse(res);
  });
}

export async function markRoomVisited(roomId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/rooms/${roomId}/visit`), {
    method: 'POST',
    headers,
  });
  return parseResponse(res);
}

export async function getQuickLinks(roomId) {
  return cachedJsonRequest(`quick-links:${roomId}`, 60000, async () => {
    const headers = getAuthHeaders();
    const res = await fetch(apiUrl(`/api/rooms/${roomId}/quick-links`), { headers });
    return parseResponse(res);
  });
}

export async function createQuickLink(roomId, data) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/rooms/${roomId}/quick-links`), {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  memoryCache.delete(`quick-links:${roomId}`);
  return parseResponse(res);
}

export async function deleteQuickLink(roomId, linkId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/rooms/${roomId}/quick-links/${linkId}`), {
    method: 'DELETE',
    headers,
  });
  memoryCache.delete(`quick-links:${roomId}`);
  return parseResponse(res);
}
