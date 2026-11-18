import { getAuthHeaders, parseResponse } from '@/lib/api-headers';
import { apiUrl } from '@/lib/api';

export async function createTask(roomId, taskData) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/rooms/${roomId}/tasks`), { method: 'POST', headers, body: JSON.stringify(taskData) });
  return parseResponse(res);
}

export async function getTasks(roomId, filters = {}) {
  const headers = getAuthHeaders();
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.assigned_to) params.set('assigned_to', filters.assigned_to);
  const qs = params.toString();
  const res = await fetch(apiUrl(`/api/rooms/${roomId}/tasks${qs ? `?${qs}` : ''}`), { headers });
  return parseResponse(res);
}

export async function updateTask(roomId, taskId, taskData) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/rooms/${roomId}/tasks/${taskId}`), { method: 'PATCH', headers, body: JSON.stringify(taskData) });
  return parseResponse(res);
}

export async function deleteTask(roomId, taskId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/rooms/${roomId}/tasks/${taskId}`), { method: 'DELETE', headers });
  return parseResponse(res);
}

export async function toggleAssignee(roomId, taskId, userId, status) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/rooms/${roomId}/tasks/${taskId}/assignees/${userId}`), {
    method: 'PATCH',
    headers,
    body: JSON.stringify(status ? { status } : {}),
  });
  return parseResponse(res);
}

export async function addAssignees(roomId, taskId, assignees) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/rooms/${roomId}/tasks/${taskId}/assignees`), { method: 'POST', headers, body: JSON.stringify({ assignees }) });
  return parseResponse(res);
}
