import { apiGetPreferences, apiUpdatePreferences } from '@/services/auth';

const DEFAULT_PREFERENCES = {
  room_order: [],
  flinders_interests: [],
  flinders_favorites: [],
  notification_preferences: {
    chat: true,
    tasks: true,
    schedule: true,
    files: true,
    announcements: true,
    board: true,
    room_updates: true,
    friend_requests: true,
  },
};

let cachedPreferences = { ...DEFAULT_PREFERENCES };
let preferencesPromise = null;
let preferencesHydrated = false;

function normalizePreferences(data) {
  return {
    room_order: Array.isArray(data?.room_order) ? data.room_order.filter((value) => typeof value === 'string') : [],
    flinders_interests: Array.isArray(data?.flinders_interests) ? data.flinders_interests.filter((value) => typeof value === 'string') : [],
    flinders_favorites: Array.isArray(data?.flinders_favorites) ? data.flinders_favorites.filter((value) => typeof value === 'string') : [],
    notification_preferences: normalizeNotificationPreferences(data?.notification_preferences),
  };
}

function normalizeNotificationPreferences(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    chat: source.chat !== false,
    tasks: source.tasks !== false,
    schedule: source.schedule !== false,
    files: source.files !== false,
    announcements: source.announcements !== false,
    board: source.board !== false,
    room_updates: source.room_updates !== false,
    friend_requests: source.friend_requests !== false,
  };
}

export function getCachedPreferences() {
  return cachedPreferences;
}

export async function hydratePreferences({ force = false } = {}) {
  if (!force && preferencesPromise) {
    return preferencesPromise;
  }

  if (!force && preferencesHydrated) {
    return cachedPreferences;
  }

  preferencesPromise = apiGetPreferences()
    .then((data) => {
      cachedPreferences = normalizePreferences(data);
      preferencesHydrated = true;
      return cachedPreferences;
    })
    .catch(() => cachedPreferences)
    .finally(() => {
      preferencesPromise = null;
    });

  return preferencesPromise;
}

export async function updatePreferences(updates) {
  const optimistic = normalizePreferences({ ...cachedPreferences, ...updates });
  cachedPreferences = optimistic;
  preferencesHydrated = true;

  try {
    const data = await apiUpdatePreferences(updates);
    cachedPreferences = normalizePreferences(data);
    return cachedPreferences;
  } catch (error) {
    throw error;
  }
}
