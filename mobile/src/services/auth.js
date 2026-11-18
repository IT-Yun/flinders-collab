import { api } from '../lib/api';

/**
 * Login with email and password.
 * Returns { session, user }.
 */
export async function login(email, password) {
  return api.post('/api/auth/login', { email, password });
}

export async function sendSignupVerification(email, accountType = 'flinders') {
  return api.post('/api/auth/verify-email/send', {
    email,
    account_type: accountType,
  });
}

export async function verifySignupCode(email, token) {
  return api.post('/api/auth/verify-email/confirm', { email, token });
}

export async function completeSignup({ password, full_name, student_id, major, university, account_type }) {
  return api.post('/api/auth/complete-signup', {
    password,
    full_name,
    student_id,
    major,
    university,
    account_type,
  });
}

/**
 * Logout — invalidates the session server-side.
 */
export async function logout() {
  return api.post('/api/auth/logout', {});
}

/**
 * Get the current authenticated user's profile.
 */
export async function getCurrentUser() {
  return api.get('/api/auth/me');
}

/**
 * Refresh the session using a refresh token.
 */
export async function refreshSession(refreshToken) {
  return api.post('/api/auth/refresh', { refresh_token: refreshToken });
}

/**
 * Send a password reset email.
 */
export async function requestPasswordReset(email) {
  return api.post('/api/auth/password/reset/send', { email });
}

export async function verifyPasswordResetCode(email, token) {
  return api.post('/api/auth/password/reset/confirm', { email, token });
}

export async function completePasswordReset(password) {
  return api.post('/api/auth/password/reset/complete', { password });
}
