import { getAuthHeaders } from './api-headers';

const API = import.meta.env.VITE_API_BASE_URL || '';

export async function diagnosePushSubscription() {
  const result = {
    stage: 'start',
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
    hasServiceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    hasPushManager: typeof window !== 'undefined' && 'PushManager' in window,
    hasNotificationApi: typeof window !== 'undefined' && 'Notification' in window,
    serviceWorkerReady: false,
    hasVapidKey: false,
    hasSubscription: false,
    savedToServer: false,
    endpoint: null,
    error: null,
  };

  if (!result.hasServiceWorker || !result.hasPushManager || !result.hasNotificationApi) {
    return result;
  }

  try {
    result.stage = 'service-worker';
    const registration = await withTimeout(
      navigator.serviceWorker.ready,
      6000,
      'Service worker ready timeout',
    );
    result.serviceWorkerReady = true;

    result.stage = 'vapid-key';
    const keyRes = await fetchWithTimeout(`${API}/api/push/vapid-key`, {
      timeoutMs: 6000,
    });
    if (!keyRes.ok) {
      throw new Error(`VAPID key request failed (${keyRes.status})`);
    }
    const { publicKey } = await keyRes.json();
    result.hasVapidKey = Boolean(publicKey);
    if (!publicKey) return result;

    result.stage = 'get-subscription';
    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !subscriptionMatchesKey(subscription, applicationServerKey)) {
      await removeStoredSubscription(subscription);
      await subscription.unsubscribe().catch(() => {});
      subscription = null;
    }

    if (!subscription && Notification.permission === 'granted') {
      result.stage = 'subscribe';
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    result.hasSubscription = Boolean(subscription);
    result.endpoint = subscription?.endpoint || null;

    if (subscription) {
      result.stage = 'save-subscription';
      const saveRes = await fetchWithTimeout(`${API}/api/push/subscribe`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription }),
        timeoutMs: 6000,
      });
      result.savedToServer = saveRes.ok;
      if (!saveRes.ok) {
        const text = await saveRes.text();
        throw new Error(`Subscription save failed (${saveRes.status}): ${text.slice(0, 120)}`);
      }
    }

    result.stage = 'done';
    return result;
  } catch (err) {
    result.error = `[${result.stage}] ${err?.message || 'Unknown push diagnosis error'}`;
    return result;
  }
}

export async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (!('Notification' in window)) return;

  try {
    // Request notification permission first
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const registration = await navigator.serviceWorker.ready;

    // Get VAPID key from server
    const keyRes = await fetch(`${API}/api/push/vapid-key`);
    if (!keyRes.ok) return null;
    const { publicKey } = await keyRes.json();
    if (!publicKey) return null;

    // Check existing subscription
    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !subscriptionMatchesKey(subscription, applicationServerKey)) {
      await removeStoredSubscription(subscription);
      await subscription.unsubscribe().catch(() => {});
      subscription = null;
    }

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    // Send subscription to server
    const subRes = await fetch(`${API}/api/push/subscribe`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription }),
    });
    if (!subRes.ok) {
      console.warn('Push subscribe API failed:', subRes.status);
    }

    return subscription;
  } catch (err) {
    console.warn('Push subscription failed:', err);
    return null;
  }
}

export async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    await subscription.unsubscribe();
    await fetch(`${API}/api/push/unsubscribe`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  } catch (err) {
    console.warn('Push unsubscribe failed:', err);
  }
}

// Cache API data for offline viewing
export function cacheForOffline(url, data) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CACHE_API',
      url,
      data,
    });
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const array = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) array[i] = raw.charCodeAt(i);
  return array;
}

async function fetchWithTimeout(url, options = {}) {
  const { timeoutMs = 6000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(new Error('Fetch timeout')), timeoutMs);

  try {
    return await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function subscriptionMatchesKey(subscription, expectedKey) {
  const currentKey = subscription?.options?.applicationServerKey;
  if (!currentKey || !expectedKey) return true;

  const currentBytes = new Uint8Array(currentKey);
  if (currentBytes.length !== expectedKey.length) return false;

  for (let i = 0; i < currentBytes.length; i += 1) {
    if (currentBytes[i] !== expectedKey[i]) return false;
  }
  return true;
}

async function removeStoredSubscription(subscription) {
  if (!subscription?.endpoint) return;

  try {
    await fetch(`${API}/api/push/unsubscribe`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  } catch {
    // Ignore stale unsubscribe failures during key rotation.
  }
}
