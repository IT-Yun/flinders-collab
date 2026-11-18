import { getAuthHeaders, parseResponse } from '@/lib/api-headers';
import { apiUrl } from '@/lib/api';

export async function getMessages(roomId, cursor) {
  const headers = getAuthHeaders();
  const params = cursor ? `?cursor=${cursor}` : '';
  const res = await fetch(apiUrl(`/api/rooms/${roomId}/messages${params}`), { headers });
  return parseResponse(res);
}
