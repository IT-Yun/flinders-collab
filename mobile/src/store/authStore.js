import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = 'flinders_session';
const USER_KEY = 'flinders_user';

export const useAuthStore = create((set, get) => ({
  user: null,
  session: null,
  isLoading: true,

  /** Persist and set session + user after login/signup */
  setSession: async (session, user) => {
    try {
      if (session) {
        await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } else {
        await AsyncStorage.removeItem(SESSION_KEY);
      }
      if (user) {
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
      } else {
        await AsyncStorage.removeItem(USER_KEY);
      }
    } catch (e) {
      console.warn('AuthStore: failed to persist session', e);
    }
    set({ session, user });
  },

  /** Load persisted session from AsyncStorage on app start */
  loadSession: async () => {
    try {
      const [sessionStr, userStr] = await Promise.all([
        AsyncStorage.getItem(SESSION_KEY),
        AsyncStorage.getItem(USER_KEY),
      ]);
      const session = sessionStr ? JSON.parse(sessionStr) : null;
      const user = userStr ? JSON.parse(userStr) : null;
      set({ session, user, isLoading: false });
    } catch (e) {
      console.warn('AuthStore: failed to load session', e);
      set({ isLoading: false });
    }
  },

  /** Login action — calls auth service and stores session */
  login: async (email, password) => {
    const { login: authLogin } = await import('../services/auth');
    const data = await authLogin(email, password);
    await get().setSession(data.session, data.user);
    return data;
  },

  /** Logout action — clears session from store and AsyncStorage */
  logout: async () => {
    try {
      const { logout: authLogout } = await import('../services/auth');
      await authLogout();
    } catch (e) {
      // Best-effort — always clear local state even if server call fails
    }
    await AsyncStorage.multiRemove([SESSION_KEY, USER_KEY]);
    set({ user: null, session: null });
  },

  /** Synchronously update user data (e.g. after profile edit) */
  setUser: (user) => {
    set({ user });
    AsyncStorage.setItem(USER_KEY, JSON.stringify(user)).catch(() => {});
  },
}));
