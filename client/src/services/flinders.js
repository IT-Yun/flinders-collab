import { getAuthHeaders, parseResponse } from '@/lib/api-headers';
import { apiUrl } from '@/lib/api';

export async function getFlindersEvents() {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/flinders/events'), { headers });
  return parseResponse(res);
}

export async function getFlindersNews() {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/flinders/news'), { headers });
  return parseResponse(res);
}

export async function getRecommendedEvents(interests = []) {
  const headers = getAuthHeaders();
  const query = interests.length > 0 ? `?interests=${encodeURIComponent(interests.join(','))}` : '';
  const res = await fetch(apiUrl(`/api/flinders/recommended-events${query}`), { headers });
  return parseResponse(res);
}

export async function getCampusPresence() {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/flinders/campus-presence'), { headers });
  return parseResponse(res);
}

export async function updateCampusPresence(payload) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/flinders/campus-presence'), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return parseResponse(res);
}

export async function clearCampusPresence() {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/flinders/campus-presence'), {
    method: 'DELETE',
    headers,
  });
  return parseResponse(res);
}

export async function getFriendRequests() {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/flinders/friend-requests'), { headers });
  return parseResponse(res);
}

export async function sendFriendRequest(payload) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/flinders/friend-requests'), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return parseResponse(res);
}

export async function respondToFriendRequest(requestId, action) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/flinders/friend-requests/${requestId}/respond`), {
    method: 'POST',
    headers,
    body: JSON.stringify({ action }),
  });
  return parseResponse(res);
}

export async function openDirectFriendChat(requestId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/flinders/friend-requests/${requestId}/direct-room`), {
    method: 'POST',
    headers,
  });
  return parseResponse(res);
}

export async function removeFriend(requestId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/flinders/friend-requests/${requestId}`), {
    method: 'DELETE',
    headers,
  });
  return parseResponse(res);
}

export async function blockFriend(requestId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/flinders/friend-requests/${requestId}/block`), {
    method: 'POST',
    headers,
  });
  return parseResponse(res);
}

export async function toggleFriendLocationVisibility(requestId, visible) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/flinders/friend-requests/${requestId}/location-visibility`), {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ visible }),
  });
  return parseResponse(res);
}
