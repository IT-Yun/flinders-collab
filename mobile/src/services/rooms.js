import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = (() => {
  try {
    const config = require('../lib/config.js');
    return config.API_URL || 'https://flinders-collab-id3a.onrender.com';
  } catch {
    return 'https://flinders-collab-id3a.onrender.com';
  }
})();

async function getAuthHeaders() {
  try {
    // Try to get token from the api lib first
    const apiLib = require('../lib/api.js');
    if (apiLib && typeof apiLib.getAuthHeaders === 'function') {
      return apiLib.getAuthHeaders();
    }
  } catch {
    // Fall through to AsyncStorage
  }

  const token = await AsyncStorage.getItem('auth_token');
  if (!token) {
    throw new Error('You must be signed in to use this feature.');
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function parseResponse(res) {
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message = body?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

/**
 * Get all rooms the authenticated user is a member of.
 * @returns {Promise<Array>} Array of room objects
 */
export async function getUserRooms() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/rooms`, { headers });
  return parseResponse(res);
}

/**
 * Get a single room by ID.
 * @param {string} roomId
 * @returns {Promise<Object>} Room object
 */
export async function getRoomById(roomId) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/rooms/${roomId}`, { headers });
  return parseResponse(res);
}

/**
 * Get members of a room.
 * @param {string} roomId
 * @returns {Promise<Array>} Array of member objects
 */
export async function getRoomMembers(roomId) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/rooms/${roomId}/members`, { headers });
  return parseResponse(res);
}

/**
 * Create a new room.
 * @param {{ name: string, course_name?: string, description?: string }} data
 * @returns {Promise<Object>} Created room object
 */
export async function createRoom(data) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/rooms`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  return parseResponse(res);
}

/**
 * Join a room using an invite code.
 * @param {string} inviteCode
 * @returns {Promise<Object>} Join result with room data
 */
export async function joinRoom(inviteCode) {
  const headers = await getAuthHeaders();
  const normalizedCode = String(inviteCode || '').trim().toUpperCase();
  const res = await fetch(`${API_URL}/api/rooms/join`, {
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

/**
 * Leave a room.
 * @param {string} roomId
 * @returns {Promise<Object>}
 */
export async function leaveRoom(roomId) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/rooms/${roomId}/leave`, {
    method: 'POST',
    headers,
  });
  return parseResponse(res);
}
