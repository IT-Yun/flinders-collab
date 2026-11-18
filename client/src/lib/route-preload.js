const preloaders = {
  '/dashboard': () => import('@/pages/DashboardPage'),
  '/deadlines': () => import('@/pages/DeadlinesPage'),
  '/board': () => import('@/pages/BoardPage'),
  '/flinders-life': () => import('@/pages/FlindersLifePage'),
  '/timetable': () => import('@/pages/TimetablePage'),
  '/admin': () => import('@/pages/AdminPage'),
  '/rooms/:roomId': () => import('@/pages/RoomPage'),
};

const prefetched = new Set();

export function preloadRoute(path) {
  const normalized = path.startsWith('/rooms/') ? '/rooms/:roomId' : path;
  const loader = preloaders[normalized];
  if (!loader || prefetched.has(normalized)) return;
  prefetched.add(normalized);
  loader().catch(() => {
    prefetched.delete(normalized);
  });
}

export function preloadSidebarRoutes({ includeAdmin = false, includeFlindersLife = false } = {}) {
  preloadRoute('/dashboard');
  preloadRoute('/deadlines');
  preloadRoute('/board');
  if (includeFlindersLife) {
    preloadRoute('/flinders-life');
    preloadRoute('/timetable');
  }
  if (includeAdmin) preloadRoute('/admin');
}
