const TOKEN_KEY = 'flinders_session';

function getStorage() {
  if (typeof window === 'undefined') return null;
  return window.localStorage || null;
}

export function saveSession(session) {
  try {
    const storage = getStorage();
    storage?.setItem(TOKEN_KEY, JSON.stringify(session));
  } catch {
    // storage not available
  }
}

export function loadStoredSession() {
  try {
    const storage = getStorage();
    const raw = storage?.getItem(TOKEN_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isSessionExpired(session, skewMs = 30 * 1000) {
  if (!session?.expires_at) return false;
  const expiresAtMs = Number(session.expires_at) * 1000;
  if (!Number.isFinite(expiresAtMs)) return false;
  return Date.now() + skewMs >= expiresAtMs;
}

// Returns seconds until token expires (0 if already expired)
export function getSecondsUntilExpiry(session) {
  if (!session?.expires_at) return 0;
  const expiresAtMs = Number(session.expires_at) * 1000;
  if (!Number.isFinite(expiresAtMs)) return 0;
  return Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
}

export function loadSession() {
  const session = loadStoredSession();
  if (!session) return null;
  // Don't clear expired sessions here — let the refresh logic handle it
  return session;
}

export function clearSession() {
  try {
    const storage = getStorage();
    storage?.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function getAccessToken() {
  const session = loadStoredSession();
  if (!session?.access_token) return null;
  // Return token even if near-expiry — interceptors will refresh
  return session.access_token;
}
