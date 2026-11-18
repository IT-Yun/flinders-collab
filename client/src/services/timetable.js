import { apiUrl } from '@/lib/api';
import { getAuthHeaders, parseResponse } from '@/lib/api-headers';

export async function searchTopics(query, year = new Date().getFullYear()) {
  const res = await fetch(
    apiUrl(`/api/timetable/topics/search?q=${encodeURIComponent(query)}&year=${year}`),
    { headers: getAuthHeaders() }
  );
  return parseResponse(res);
}

export async function getMyTimetable() {
  const res = await fetch(apiUrl('/api/timetable/my'), {
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

export async function addToTimetable({ topicId, dayOfWeek, startTime, endTime, classType, location }) {
  const res = await fetch(apiUrl('/api/timetable/add'), {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ topicId, dayOfWeek, startTime, endTime, classType, location }),
  });
  return parseResponse(res);
}

export async function removeFromTimetable(entryId) {
  const res = await fetch(apiUrl(`/api/timetable/${entryId}`), {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

export async function removeTopic(topicId) {
  const res = await fetch(apiUrl(`/api/timetable/topic/${topicId}`), {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

export async function getPopularTimes(topicId) {
  const res = await fetch(apiUrl(`/api/timetable/topic/${topicId}/popular-times`), {
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

export async function getTopicMembers(topicId) {
  const res = await fetch(apiUrl(`/api/timetable/topic/${topicId}/members`), {
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

export async function ensureRoomMember(roomId) {
  const res = await fetch(apiUrl(`/api/timetable/room/${roomId}/ensure-member`), {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

export async function openTopicChat(topicId) {
  const res = await fetch(apiUrl(`/api/timetable/topic/${topicId}/open-chat`), {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}
