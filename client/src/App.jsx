import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider } from '@/components/ui/toast';
import ErrorBoundary from '@/components/ErrorBoundary';
import InteractiveTutorial from '@/components/InteractiveTutorial';
import MainLayout from '@/layouts/MainLayout';
import { Loader2 } from 'lucide-react';
import { loadSession, clearSession, saveSession } from '@/lib/auth-token';
import { apiGuestCleanup } from '@/services/auth';

function hasRecoveryParams() {
  if (typeof window === 'undefined') return false;
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return search.get('type') === 'recovery'
    || hash.get('type') === 'recovery'
    || hash.has('access_token')
    || search.has('code');
}

function useViewportMetrics() {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const root = document.documentElement;
    const viewport = window.visualViewport;
    let rafId = 0;
    let stableHeight = 0;
    let lastWidth = 0;

    const sync = () => {
      const height = Math.round(viewport?.height || window.innerHeight || 0);
      const width = Math.round(viewport?.width || window.innerWidth || 0);

      if (height > 0) {
        root.style.setProperty('--viewport-dynamic-height', `${height}px`);
        root.style.setProperty('--viewport-height', `${height}px`);

        if (!stableHeight || (lastWidth && Math.abs(width - lastWidth) > 120)) {
          stableHeight = height;
        } else {
          stableHeight = Math.max(stableHeight, height);
        }

        root.style.setProperty('--viewport-stable-height', `${stableHeight}px`);
        root.style.setProperty('--keyboard-inset', `${Math.max(0, stableHeight - height)}px`);
      }

      if (width > 0) {
        root.style.setProperty('--viewport-width', `${width}px`);
        lastWidth = width;
      }
    };

    const scheduleSync = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        sync();
        // Prevent iOS/Android PWA from scrolling the page when keyboard opens
        if (viewport && viewport.offsetTop > 0) {
          window.scrollTo(0, 0);
        }
        if (document.documentElement.scrollTop > 0) {
          document.documentElement.scrollTop = 0;
        }
        if (document.body.scrollTop > 0) {
          document.body.scrollTop = 0;
        }
      });
    };

    sync();

    window.addEventListener('resize', scheduleSync);
    window.addEventListener('orientationchange', scheduleSync);
    viewport?.addEventListener('resize', scheduleSync);
    viewport?.addEventListener('scroll', scheduleSync);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', scheduleSync);
      window.removeEventListener('orientationchange', scheduleSync);
      viewport?.removeEventListener('resize', scheduleSync);
      viewport?.removeEventListener('scroll', scheduleSync);
    };
  }, []);
}

// Retry dynamic imports with page reload on chunk mismatch (after new deployments)
function lazyRetry(importFn) {
  return lazy(() =>
    importFn().catch(() => {
      // If chunk fails to load (hash mismatch after deploy), reload once
      const reloaded = sessionStorage.getItem('chunk_reload');
      if (!reloaded) {
        sessionStorage.setItem('chunk_reload', '1');
        window.location.reload();
        return new Promise(() => {}); // never resolves — page is reloading
      }
      sessionStorage.removeItem('chunk_reload');
      return importFn(); // second attempt after reload
    })
  );
}

const LoginPage = lazyRetry(() => import('@/pages/LoginPage'));
const SignupPage = lazyRetry(() => import('@/pages/SignupPage'));
const ResetPasswordPage = lazyRetry(() => import('@/pages/ResetPasswordPage'));
const DashboardPage = lazyRetry(() => import('@/pages/DashboardPage'));
const RoomPage = lazyRetry(() => import('@/pages/RoomPage'));
const AdminPage = lazyRetry(() => import('@/pages/AdminPage'));
const DeadlinesPage = lazyRetry(() => import('@/pages/DeadlinesPage'));
const FlindersLifePage = lazyRetry(() => import('@/pages/FlindersLifePage'));
const FlindersSocialPage = lazyRetry(() => import('@/pages/FlindersSocialPage'));
const SettingsPage = lazyRetry(() => import('@/pages/SettingsPage'));
const TimetablePage = lazyRetry(() => import('@/pages/TimetablePage'));
const MessagesPage = lazyRetry(() => import('@/pages/MessagesPage'));

// If a tester session exists on page load (e.g. refresh), clean up and redirect
if (typeof window !== 'undefined') {
  const session = loadSession();
  if (session?.is_tester) {
    // Call cleanup BEFORE clearing session (needs auth token)
    apiGuestCleanup().catch(() => {}).finally(() => {
      clearSession();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    });
  }

  // Handle Supabase magic link redirect (hash contains access_token after email link click)
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const hashAccessToken = hashParams.get('access_token');
  const hashRefreshToken = hashParams.get('refresh_token');
  const hashType = hashParams.get('type');
  if (hashAccessToken && (hashType === 'magiclink' || hashType === 'signup' || hashType === 'email')) {
    // Save the session from magic link
    const expiresIn = parseInt(hashParams.get('expires_in') || '3600', 10);
    saveSession({
      access_token: hashAccessToken,
      refresh_token: hashRefreshToken || '',
      expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    });
    // Clean the hash from URL
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

// Shared layout wrapper — MainLayout persists across page navigations
function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <MainLayout>
        <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
          <Outlet />
        </Suspense>
      </MainLayout>
    </ProtectedRoute>
  );
}

function AdminRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function PublicRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (hasRecoveryParams()) {
    return children;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default function App() {
  useViewportMetrics();

  return (
    <ErrorBoundary>
      <ToastProvider>
        <TooltipProvider>
          <BrowserRouter>
            <InteractiveTutorial />
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/login" element={<Suspense fallback={<PageLoader />}><PublicRoute><LoginPage /></PublicRoute></Suspense>} />
              <Route path="/signup" element={<Suspense fallback={<PageLoader />}><PublicRoute><SignupPage /></PublicRoute></Suspense>} />
              <Route path="/reset-password" element={<Suspense fallback={<PageLoader />}><ResetPasswordPage /></Suspense>} />
              {/* Protected routes share MainLayout — sidebar/header persist across navigations */}
              <Route element={<ProtectedLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/deadlines" element={<DeadlinesPage />} />
                <Route path="/board" element={<FlindersSocialPage />} />
                <Route path="/flinders-life" element={<FlindersLifePage />} />
                <Route path="/timetable" element={<TimetablePage />} />
                <Route path="/messages" element={<MessagesPage />} />
                <Route path="/rooms/:roomId" element={<RoomPage />} />
                <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
              </Route>
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
