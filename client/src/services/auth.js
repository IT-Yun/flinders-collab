import { apiUrl } from '@/lib/api';
import { getAuthHeaders, parseResponse } from '@/lib/api-headers';

function buildStatusError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function buildBearerHeaders(accessToken, isJson = true) {
  if (!accessToken) {
    return getAuthHeaders(isJson);
  }

  const headers = { Authorization: `Bearer ${accessToken}` };
  if (isJson) headers['Content-Type'] = 'application/json';
  return headers;
}

export async function apiSignup(userData) {
  const res = await fetch(apiUrl('/api/auth/signup'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });
  return parseResponse(res);
}

export async function apiSendVerification(email, accountType) {
  const res = await fetch(apiUrl('/api/auth/verify-email/send'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, account_type: accountType }),
  });
  return parseResponse(res);
}

export async function apiVerifyEmailCode(email, token) {
  const res = await fetch(apiUrl('/api/auth/verify-email/confirm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, token }),
  });
  return parseResponse(res);
}

export async function apiCompleteSignup(data) {
  const res = await fetch(apiUrl('/api/auth/complete-signup'), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return parseResponse(res);
}

export async function apiLogin(credentials) {
  const res = await fetch(apiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  return parseResponse(res);
}

export async function apiRefreshSession(refreshToken) {
  const res = await fetch(apiUrl('/api/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    throw buildStatusError(body?.error || `Request failed (${res.status})`, res.status);
  }

  return body;
}

export async function apiRequestPasswordReset(email) {
  const res = await fetch(apiUrl('/api/auth/password/reset/send'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await parseResponse(res);
  return data;
}

export async function apiVerifyPasswordResetCode(email, token) {
  const res = await fetch(apiUrl('/api/auth/password/reset/confirm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, token }),
  });
  return parseResponse(res);
}

export async function apiCompletePasswordReset(password) {
  const res = await fetch(apiUrl('/api/auth/password/reset/complete'), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ password }),
  });
  return parseResponse(res);
}

export async function apiLogout(accessToken) {
  const res = await fetch(apiUrl('/api/auth/logout'), {
    method: 'POST',
    headers: buildBearerHeaders(accessToken),
  });
  return parseResponse(res);
}

export async function apiGuestLogin() {
  const res = await fetch(apiUrl('/api/auth/guest'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return parseResponse(res);
}

export async function apiGuestCleanup(accessToken) {
  const res = await fetch(apiUrl('/api/auth/guest/cleanup'), {
    method: 'POST',
    headers: buildBearerHeaders(accessToken),
  });
  return parseResponse(res);
}

export async function apiUpdateProfile(formData) {
  const headers = getAuthHeaders(false); // Don't set Content-Type for FormData
  const res = await fetch(apiUrl('/api/auth/me'), {
    method: 'PATCH',
    headers,
    body: formData,
  });
  return parseResponse(res);
}

export async function apiGetMe() {
  const res = await fetch(apiUrl('/api/auth/me'), {
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

export async function apiGetPreferences() {
  const res = await fetch(apiUrl('/api/auth/preferences'), {
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

export async function apiUpdatePreferences(updates) {
  const res = await fetch(apiUrl('/api/auth/preferences'), {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(updates),
  });
  return parseResponse(res);
}
