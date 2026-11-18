import { getAuthHeaders, parseResponse } from '@/lib/api-headers';
import { apiUrl } from '@/lib/api';

export async function uploadFile(roomId, file, { description, category, event_id, file_name } = {}) {
  const headers = getAuthHeaders(false);
  const formData = new FormData();
  formData.append('file', file);
  if (description) formData.append('description', description);
  if (category) formData.append('category', category);
  if (event_id) formData.append('event_id', event_id);
  if (file_name) formData.append('file_name', file_name);
  const res = await fetch(apiUrl(`/api/rooms/${roomId}/files`), { method: 'POST', headers, body: formData });
  return parseResponse(res);
}

export async function getFiles(roomId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/rooms/${roomId}/files`), { headers });
  return parseResponse(res);
}

export async function getFileDownloadUrl(fileId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/files/${fileId}/download`), { headers });
  return parseResponse(res);
}

export async function updateFile(fileId, data) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/files/${fileId}`), { method: 'PATCH', headers, body: JSON.stringify(data) });
  return parseResponse(res);
}

export async function deleteFile(roomId, fileId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/files/${fileId}`), { method: 'DELETE', headers });
  return parseResponse(res);
}
