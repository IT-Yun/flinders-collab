const CACHE_NAME = 'collab-v3';
const OFFLINE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

function isNavigationRequest(request) {
  return request.mode === 'navigate' || request.destination === 'document';
}

function isStaticAsset(requestUrl) {
  return requestUrl.pathname.startsWith('/assets/')
    || requestUrl.pathname.startsWith('/icons/')
    || requestUrl.pathname === '/manifest.json';
}

// Install — cache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      if ('navigationPreload' in self.registration) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })()
  );
});

// Fetch — prefer fresh app shell so PWA reflects new deploys quickly
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const requestUrl = new URL(request.url);

  // Skip non-GET and API/socket requests
  if (request.method !== 'GET') return;
  if (request.url.includes('/api/') || request.url.includes('/socket.io')) return;
  if (requestUrl.origin !== self.location.origin) return;

  if (isNavigationRequest(request)) {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;

        const response = await fetch(request, { cache: 'no-store' });
        const cache = await caches.open(CACHE_NAME);
        cache.put('/index.html', response.clone());
        return response;
      } catch {
        const cached = await caches.match('/index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  if (isStaticAsset(requestUrl)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cached = await cache.match(request);
        return cached || Response.error();
      }
    })());
    return;
  }

  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

// Cache API responses for offline viewing (rooms, messages, files)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data?.type === 'CACHE_API') {
    const { url, data } = event.data;
    caches.open(CACHE_NAME).then((cache) => {
      const response = new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' },
      });
      cache.put(url, response);
    });
  }
});

// Push notification received
self.addEventListener('push', (event) => {
  let payload = { title: 'Collab', body: 'New activity in your room' };
  try {
    payload = event.data.json();
  } catch {
    payload.body = event.data?.text() || payload.body;
  }

  event.waitUntil(
    (async () => {
      const badgeCount = Math.max(1, Number(payload.badgeCount || 1));

      if (typeof self.navigator?.setAppBadge === 'function') {
        try {
          await self.navigator.setAppBadge(badgeCount);
        } catch {
          // Ignore unsupported badge failures.
        }
      }

      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: payload.tag || 'collab-notification',
        data: payload.data || {},
        actions: payload.actions || [],
        vibrate: [100, 50, 100],
      });
    })()
  );
});

// Notification click — open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    (async () => {
      if (typeof self.navigator?.clearAppBadge === 'function') {
        try {
          await self.navigator.clearAppBadge();
        } catch {
          // Ignore unsupported badge failures.
        }
      }

      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = clients.find((c) => c.url.includes(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })()
  );
});
