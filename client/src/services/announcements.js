import { getAuthHeaders, parseResponse } from '@/lib/api-headers';
import { apiUrl } from '@/lib/api';

export async function getAnnouncements(roomId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/rooms/${roomId}/announcements`), { headers });
  return parseResponse(res);
}

export async function createAnnouncement(roomId, content) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/rooms/${roomId}/announcements`), {
    method: 'POST', headers, body: JSON.stringify({ content }),
  });
  return parseResponse(res);
}

export async function deleteAnnouncement(announcementId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/announcements/${announcementId}`), { method: 'DELETE', headers });
  return parseResponse(res);
}

export async function markAllRead(roomId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/rooms/${roomId}/announcements/read-all`), { method: 'POST', headers });
  return parseResponse(res);
}

export async function getUnreadCounts() {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/announcements/unread-counts'), { headers });
  return parseResponse(res);
}

// ── Admin global announcements ──

export async function getActiveAnnouncements() {
  const res = await fetch(apiUrl('/api/announcements/active'));
  if (!res.ok) return [];
  return res.json();
}

export async function getAdminAnnouncements() {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/admin/announcements'), { headers });
  return parseResponse(res);
}

export async function createAdminAnnouncement({ title, content, type, expires_at }) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/admin/announcements'), {
    method: 'POST', headers, body: JSON.stringify({ title, content, type, expires_at }),
  });
  return parseResponse(res);
}

export async function updateAdminAnnouncement(id, updates) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/admin/announcements/${id}`), {
    method: 'PATCH', headers, body: JSON.stringify(updates),
  });
  return parseResponse(res);
}

export async function deleteAdminAnnouncement(id) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/admin/announcements/${id}`), { method: 'DELETE', headers });
  return parseResponse(res);
}
