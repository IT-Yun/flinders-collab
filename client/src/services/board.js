import { getAuthHeaders, parseResponse } from '@/lib/api-headers';
import { apiUrl } from '@/lib/api';

let boardNotificationsCache = null;
let boardNotificationsCacheAt = 0;
let boardNotificationsInflight = null;

export async function getPosts(category) {
  const headers = getAuthHeaders();
  const params = category && category !== 'all' ? `?category=${category}` : '';
  const res = await fetch(apiUrl(`/api/board/posts${params}`), { headers });
  return parseResponse(res);
}

export async function getBoardState() {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/board/state'), { headers });
  return parseResponse(res);
}

export async function getBoardNotifications() {
  if (boardNotificationsCache && Date.now() - boardNotificationsCacheAt < 20000) {
    return boardNotificationsCache;
  }
  if (boardNotificationsInflight) {
    return boardNotificationsInflight;
  }

  const headers = getAuthHeaders();
  boardNotificationsInflight = fetch(apiUrl('/api/board/notifications'), { headers })
    .then(parseResponse)
    .then((data) => {
      boardNotificationsCache = data;
      boardNotificationsCacheAt = Date.now();
      boardNotificationsInflight = null;
      return data;
    })
    .catch((error) => {
      boardNotificationsInflight = null;
      throw error;
    });

  return boardNotificationsInflight;
}

export async function updateBoardState(lastSeenAt) {
  const headers = getAuthHeaders();
  const body = lastSeenAt ? { last_seen_at: lastSeenAt } : {};
  const res = await fetch(apiUrl('/api/board/state'), {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  boardNotificationsCache = null;
  boardNotificationsCacheAt = 0;
  return parseResponse(res);
}

export async function createPost(data) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/board/posts'), { method: 'POST', headers, body: JSON.stringify(data) });
  boardNotificationsCache = null;
  boardNotificationsCacheAt = 0;
  return parseResponse(res);
}

export async function deletePost(postId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/board/posts/${postId}`), { method: 'DELETE', headers });
  boardNotificationsCache = null;
  boardNotificationsCacheAt = 0;
  return parseResponse(res);
}

export async function toggleParticipation(postId, status) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/board/posts/${postId}/participate`), {
    method: 'POST', headers, body: JSON.stringify({ status }),
  });
  return parseResponse(res);
}

export async function getMyParticipations() {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/board/my-participations'), { headers });
  return parseResponse(res);
}

export async function getComments(targetType, targetId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/comments/${targetType}/${targetId}`), { headers });
  return parseResponse(res);
}

export async function createComment(targetType, targetId, content) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/comments/${targetType}/${targetId}`), {
    method: 'POST', headers, body: JSON.stringify({ content }),
  });
  return parseResponse(res);
}

export async function deleteComment(commentId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/comments/${commentId}`), { method: 'DELETE', headers });
  return parseResponse(res);
}

export async function getAcademicInfo() {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/academic-info'), { headers });
  return parseResponse(res);
}

export async function updateAcademicInfo(yearLevel, semester) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl('/api/academic-info'), {
    method: 'PUT', headers, body: JSON.stringify({ year_level: yearLevel, semester }),
  });
  return parseResponse(res);
}

export async function toggleReaction(postId, emoji) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/board/posts/${postId}/react`), {
    method: 'POST', headers, body: JSON.stringify({ emoji }),
  });
  return parseResponse(res);
}

export async function votePoll(postId, optionIndex) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/board/posts/${postId}/vote`), {
    method: 'POST', headers, body: JSON.stringify({ optionIndex }),
  });
  return parseResponse(res);
}

export async function getReactions(postId) {
  const headers = getAuthHeaders();
  const res = await fetch(apiUrl(`/api/board/posts/${postId}/reactions`), { headers });
  return parseResponse(res);
}
