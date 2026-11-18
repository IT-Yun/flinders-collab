import { useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import {
  apiSignup,
  apiLogin,
  apiLogout,
  apiUpdateProfile,
  apiGuestLogin,
  apiGuestCleanup,
  apiRequestPasswordReset,
  apiVerifyPasswordResetCode,
  apiCompletePasswordReset,
  apiRefreshSession,
  apiGetMe,
  apiCompleteSignup,
} from '@/services/auth';
import { saveSession, loadSession, loadStoredSession, clearSession, isSessionExpired, getSecondsUntilExpiry } from '@/lib/auth-token';
import { subscribeToPush } from '@/lib/push';

function buildSessionData(result, fallback = {}) {
  const accountType = result.user.account_type || fallback.account_type || 'flinders';

  return {
    access_token: result.session.access_token,
    refresh_token: result.session.refresh_token || fallback.refresh_token || null,
    expires_at: result.session.expires_at,
    account_type: accountType,
    is_tester: result.user.is_tester || fallback.is_tester || false,
    user: {
      id: result.user.id,
      email: result.user.email,
      is_admin: result.user.is_admin || false,
      is_tester: result.user.is_tester || fallback.is_tester || false,
      account_type: accountType,
      user_metadata: {
        name: result.user.full_name,
        full_name: result.user.full_name,
        avatar_url: result.user.avatar_url || null,
        account_type: accountType,
        student_id: result.user.student_id || fallback.student_id || null,
        major: result.user.major || fallback.major || null,
        university: result.user.university || fallback.university || null,
        year_level: result.user.year_level || fallback.year_level || null,
        semester: result.user.semester || fallback.semester || null,
      },
    },
  };
}

const PROFILE_SYNC_INTERVAL_MS = 5 * 1000;

export function useAuth() {
  const { user, session, isLoading, setUser, setSession, setLoading, logout: clearAuth } = useAuthStore();

  // Silently refresh the access token if expired or about to expire
  const ensureFreshToken = useCallback(async () => {
    const current = loadSession();
    if (!current?.refresh_token) return current;
    // Refresh if expired or within 60s of expiry
    if (!isSessionExpired(current, 60_000)) return current;

    try {
      const refreshed = await apiRefreshSession(current.refresh_token);
      const sessionData = buildSessionData(refreshed, {
        account_type: current.account_type,
        is_tester: current.is_tester,
      });
      saveSession(sessionData);
      setSession(sessionData);
      setUser(sessionData.user);
      return sessionData;
    } catch (err) {
      // Only hard-logout when the refresh token is definitely invalid.
      if (err?.status === 400 || err?.status === 401) {
        clearSession();
        clearAuth();
        return null;
      }

      return current;
    }
  }, [setSession, setUser, clearAuth]);

  const syncProfileFromServer = useCallback(async (baseSession) => {
    if (!baseSession?.access_token || !baseSession?.user) return baseSession;

    try {
      const profile = await apiGetMe();
      const nextAvatarUrl = profile?.avatar_url || null;
      const prevAvatarUrl = baseSession.user.user_metadata?.avatar_url || null;
      const syncedUser = {
        ...baseSession.user,
        email: profile?.email || baseSession.user.email,
        user_metadata: {
          ...baseSession.user.user_metadata,
          name: profile?.full_name || baseSession.user.user_metadata?.name,
          full_name: profile?.full_name || baseSession.user.user_metadata?.full_name,
          avatar_url: nextAvatarUrl,
          student_id: profile?.student_id ?? baseSession.user.user_metadata?.student_id ?? null,
          major: profile?.major ?? baseSession.user.user_metadata?.major ?? null,
          university: profile?.university ?? baseSession.user.user_metadata?.university ?? null,
          year_level: profile?.year_level ?? baseSession.user.user_metadata?.year_level ?? null,
          semester: profile?.semester ?? baseSession.user.user_metadata?.semester ?? null,
        },
      };
      const syncedSession = { ...baseSession, user: syncedUser };
      saveSession(syncedSession);
      setSession(syncedSession);
      setUser(syncedUser);
      if (typeof window !== 'undefined' && nextAvatarUrl !== prevAvatarUrl) {
        window.dispatchEvent(new CustomEvent('profile-updated', { detail: { avatar_url: nextAvatarUrl } }));
      }
      return syncedSession;
    } catch {
      return baseSession;
    }
  }, [setSession, setUser]);

  // On mount, restore session from localStorage
  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      const stored = loadStoredSession();
      if (!stored) {
        if (active) setLoading(false);
        return;
      }

      if (!isSessionExpired(stored)) {
        if (active) {
          setSession(stored);
          setUser(stored.user || null);
          setLoading(false);
          subscribeToPush().catch(() => {});
          syncProfileFromServer(stored).catch(() => {});
        }
        return;
      }

      if (!stored.refresh_token) {
        clearSession();
        if (active) {
          clearAuth();
          setLoading(false);
        }
        return;
      }

      try {
        const refreshed = await apiRefreshSession(stored.refresh_token);
        const sessionData = buildSessionData(refreshed, {
          account_type: stored.account_type,
          is_tester: stored.is_tester,
        });
        saveSession(sessionData);
        if (active) {
          setSession(sessionData);
          setUser(sessionData.user);
          syncProfileFromServer(sessionData).catch(() => {});
        }
      } catch (err) {
        if (err?.status === 400 || err?.status === 401) {
          clearSession();
          if (active) {
            clearAuth();
          }
          return;
        }

        if (active) {
          setSession(stored);
          setUser(stored.user || null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    restoreSession();

    return () => {
      active = false;
    };
  }, [setUser, setSession, setLoading, syncProfileFromServer]);

  useEffect(() => {
    if (!session?.access_token) return undefined;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // Refresh token first if expired, then sync profile
        const fresh = await ensureFreshToken();
        if (fresh) syncProfileFromServer(fresh).catch(() => {});
      }
    };

    window.addEventListener('focus', handleVisibilityChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session, syncProfileFromServer, ensureFreshToken]);

  useEffect(() => {
    if (!session?.access_token) return undefined;

    const intervalId = window.setInterval(async () => {
      const fresh = await ensureFreshToken();
      if (fresh) syncProfileFromServer(fresh).catch(() => {});
    }, PROFILE_SYNC_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [session, syncProfileFromServer, ensureFreshToken]);

  const login = useCallback(async (email, password) => {
    const result = await apiLogin({ email, password });
    const sessionData = buildSessionData(result, {
      account_type: email.endsWith('@flinders.edu.au') ? 'flinders' : 'general',
    });

    saveSession(sessionData);
    setSession(sessionData);
    setUser(sessionData.user);
    subscribeToPush().catch(() => {});

    return sessionData;
  }, [setSession, setUser]);

  const signup = useCallback(async (email, password, metadata) => {
    const accountType = metadata.account_type || 'flinders';

    if (accountType === 'flinders' && !email.endsWith('@flinders.edu.au')) {
      throw new Error('Please use your @flinders.edu.au email address');
    }

    return apiSignup({
      email,
      password,
      full_name: metadata.name,
      student_id: metadata.student_id,
      major: metadata.major,
      university: metadata.university,
      account_type: accountType,
    });
  }, [setSession, setUser]);

  const updateUser = useCallback(async (formData) => {
    const updated = await apiUpdateProfile(formData);

    // Update local session with new data
    const currentSession = loadSession();
    if (currentSession) {
      const newUser = {
        ...currentSession.user,
        user_metadata: {
          ...currentSession.user.user_metadata,
          name: updated.full_name || currentSession.user.user_metadata?.name,
          full_name: updated.full_name || currentSession.user.user_metadata?.full_name,
          avatar_url: updated.avatar_url || currentSession.user.user_metadata?.avatar_url,
          student_id: updated.student_id !== undefined ? updated.student_id : currentSession.user.user_metadata?.student_id,
          major: updated.major !== undefined ? updated.major : currentSession.user.user_metadata?.major,
          year_level: updated.year_level !== undefined ? updated.year_level : currentSession.user.user_metadata?.year_level,
          semester: updated.semester !== undefined ? updated.semester : currentSession.user.user_metadata?.semester,
        },
      };
      const newSession = { ...currentSession, user: newUser };
      saveSession(newSession);
      setSession(newSession);
      setUser(newUser);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('profile-updated', { detail: { avatar_url: updated.avatar_url || null } }));
      }
      syncProfileFromServer(newSession).catch(() => {});
    }

    return updated;
  }, [setSession, setUser, syncProfileFromServer]);

  const requestPasswordReset = useCallback(async (email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error('Email is required');
    }

    await apiRequestPasswordReset(normalizedEmail);
  }, []);

  const verifyPasswordResetCode = useCallback(async (email, token) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const result = await apiVerifyPasswordResetCode(normalizedEmail, token);

    const tempSession = {
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
      expires_at: result.session.expires_at,
      user: {
        id: result.user.id,
        email: result.user.email,
      },
    };

    saveSession(tempSession);
    return tempSession;
  }, []);

  const completePasswordReset = useCallback(async ({ session: resetSession, password }) => {
    const tempSession = {
      access_token: resetSession.access_token,
      refresh_token: resetSession.refresh_token,
      expires_at: resetSession.expires_at,
      user: resetSession.user || { id: 'pending' },
    };
    saveSession(tempSession);

    try {
      const result = await apiCompletePasswordReset(password);
      clearSession();
      clearAuth();
      return result;
    } catch (err) {
      clearSession();
      clearAuth();
      throw err;
    }
  }, [clearAuth]);

  const completeSignup = useCallback(async ({ session: otpSession, password, full_name, student_id, major, university, account_type }) => {
    // Temporarily store the OTP session so apiCompleteSignup can use auth headers
    const tempSession = {
      access_token: otpSession.access_token,
      refresh_token: otpSession.refresh_token,
      expires_at: otpSession.expires_at,
      user: { id: 'pending' },
    };
    saveSession(tempSession);

    try {
      const result = await apiCompleteSignup({
        password,
        full_name,
        student_id,
        major,
        university,
        account_type,
      });

      const sessionData = {
        access_token: otpSession.access_token,
        refresh_token: otpSession.refresh_token,
        expires_at: otpSession.expires_at,
        account_type: account_type || 'flinders',
        is_tester: false,
        user: {
          id: result.user.id,
          email: result.user.email,
          is_admin: result.user.is_admin || false,
          is_tester: false,
          account_type: account_type || 'flinders',
          user_metadata: {
            name: result.user.full_name,
            full_name: result.user.full_name,
            avatar_url: result.user.avatar_url || null,
            account_type: account_type || 'flinders',
            student_id: student_id || null,
            major: result.user.major || major || null,
            university: result.user.university || university || null,
          },
        },
      };

      saveSession(sessionData);
      setSession(sessionData);
      setUser(sessionData.user);
      subscribeToPush().catch(() => {});

      return sessionData;
    } catch (err) {
      clearSession();
      throw err;
    }
  }, [setSession, setUser]);

  const guestLogin = useCallback(async () => {
    const result = await apiGuestLogin();
    const sessionData = buildSessionData(result, { is_tester: true, account_type: 'flinders' });

    saveSession(sessionData);
    setSession(sessionData);
    setUser(sessionData.user);
    subscribeToPush().catch(() => {});

    return sessionData;
  }, [setSession, setUser]);

  const guestCleanup = useCallback(() => {
    const currentSession = loadSession();
    const accessToken = currentSession?.access_token || null;
    clearSession();
    clearAuth();

    apiGuestCleanup(accessToken).catch(() => {});
  }, [clearAuth]);

  const logout = useCallback(() => {
    const currentSession = loadSession();
    const accessToken = currentSession?.access_token || null;

    clearSession();
    clearAuth();

    if (currentSession?.is_tester) {
      apiGuestCleanup(accessToken).catch(() => {});
      return;
    }

    apiLogout(accessToken).catch(() => {});
  }, [clearAuth, guestCleanup]);

  const refreshProfile = useCallback(() => syncProfileFromServer(loadSession() || session), [session, syncProfileFromServer]);

  return {
    user,
    session,
    isLoading,
    login,
    signup,
    completeSignup,
    logout,
    updateUser,
    requestPasswordReset,
    verifyPasswordResetCode,
    completePasswordReset,
    guestLogin,
    guestCleanup,
    refreshProfile,
  };
}
