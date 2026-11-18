import { API_URL } from './config';
import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = 'flinders_session';

/**
 * Get the current session's access token from Supabase.
 * Returns null if no active session exists.
 */
async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  if (data?.session?.access_token) return data.session.access_token;

  try {
    const rawSession = await AsyncStorage.getItem(SESSION_KEY);
    const parsed = rawSession ? JSON.parse(rawSession) : null;
    return parsed?.access_token || null;
  } catch {
    return null;
  }
}

/**
 * Fetch wrapper that injects Authorization header and JSON content-type.
 *
 * @param {string} path - API path (e.g. '/api/auth/login')
 * @param {RequestInit} options - Standard fetch options
 * @returns {Promise<any>} Parsed JSON response
 */
export async function apiFetch(path, options = {}) {
  const token = await getAccessToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // If body is FormData, let the browser set the content-type boundary
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  let data;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const message = (typeof data === 'object' && data?.error) ? data.error : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

/**
 * Convenience helpers
 */
export const api = {
  get: (path, opts = {}) => apiFetch(path, { method: 'GET', ...opts }),
  post: (path, body, opts = {}) =>
    apiFetch(path, { method: 'POST', body: JSON.stringify(body), ...opts }),
  patch: (path, body, opts = {}) =>
    apiFetch(path, { method: 'PATCH', body: JSON.stringify(body), ...opts }),
  delete: (path, opts = {}) => apiFetch(path, { method: 'DELETE', ...opts }),
};
