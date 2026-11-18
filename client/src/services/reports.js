import { getAuthHeaders, parseResponse } from '@/lib/api-headers';
import { apiUrl } from '@/lib/api';

export async function createReport(data) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/reports'), { method: 'POST', headers, body: JSON.stringify(data) });
  return parseResponse(res);
}

export async function getReports(params = {}) {
  const headers = getAuthHeaders();
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(apiUrl(`/api/reports${qs ? `?${qs}` : ''}`), { headers });
  return parseResponse(res);
}

export async function updateReport(reportId, data) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/reports/${reportId}`), { method: 'PATCH', headers, body: JSON.stringify(data) });
  return parseResponse(res);
}

export async function getAdminUsers() {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/admin/users'), { headers });
  return parseResponse(res);
}

export async function toggleUserAdmin(userId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/admin/users/${userId}/admin`), { method: 'PATCH', headers });
  return parseResponse(res);
}

export async function deleteAdminUser(userId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/admin/users/${userId}`), { method: 'DELETE', headers });
  return parseResponse(res);
}

export async function getMonitorStats() {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/admin/monitor'), { headers });
  return parseResponse(res);
}

export async function resolveAlert(alertId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/admin/alerts/${alertId}/resolve`), { method: 'POST', headers });
  return parseResponse(res);
}

export async function triggerHealthCheck() {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/admin/health'), { headers });
  return parseResponse(res);
}

export async function getCrawlerStats() {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/admin/crawlers'), { headers });
  return parseResponse(res);
}

export async function runEventCrawler() {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/admin/crawlers/events/run'), { method: 'POST', headers });
  return parseResponse(res);
}

export async function runTopicCrawler() {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/admin/crawlers/topics/run'), { method: 'POST', headers });
  return parseResponse(res);
}

export async function getDeletedFiles() {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/admin/files/deleted'), { headers });
  return parseResponse(res);
}

export async function restoreDeletedFile(fileId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/admin/files/${fileId}/restore`), { method: 'POST', headers });
  return parseResponse(res);
}

export async function getFileIntegrityReport() {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/admin/files/integrity'), { headers });
  return parseResponse(res);
}
