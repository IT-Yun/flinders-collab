import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import InstallBanner, { DesktopSidePanel } from '@/components/InstallBanner';

export default function AuthLayout({ children }) {
  const [showSidePanel, setShowSidePanel] = useState(false);

  useEffect(() => {
    // Always show the side panel on large desktop screens unless running installed.
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent || '';
      const isMobile = /iPad|iPhone|iPod|Android|Mobi|Tablet/i.test(ua);
      if (isMobile) return;
    }
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
    if (standalone) return;
    setShowSidePanel(true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('auth-scroll-page');
    document.body.classList.add('auth-scroll-page');
    document.getElementById('root')?.classList.add('auth-scroll-page');

    return () => {
      document.documentElement.classList.remove('auth-scroll-page');
      document.body.classList.remove('auth-scroll-page');
      document.getElementById('root')?.classList.remove('auth-scroll-page');
    };
  }, []);

  const handleDismiss = () => {
    setShowSidePanel(false);
  };

  const handleNeverShow = () => {
    setShowSidePanel(false);
  };

  return (
    <div
      className="relative min-h-[var(--viewport-dynamic-height,100dvh)] overflow-x-hidden overflow-y-auto px-4 py-4 sm:min-h-app sm:px-6 sm:py-6"
      style={{
        paddingTop: 'max(1rem, calc(env(safe-area-inset-top) + 0.5rem))',
        paddingBottom: 'max(1.25rem, calc(env(safe-area-inset-bottom) + 1rem))',
      }}
    >
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0118] via-[#1a0a3e] to-[#0d1b3e]" />

      {/* Subtle pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Floating animated orbs */}
      <div className="absolute left-1/4 top-1/4 hidden h-[400px] w-[400px] rounded-full bg-indigo-600/20 blur-[100px] animate-float sm:block" />
      <div className="absolute bottom-1/4 right-1/4 hidden h-[300px] w-[300px] rounded-full bg-violet-500/15 blur-[100px] animate-float sm:block" style={{ animationDelay: '2s' }} />
      <div className="absolute top-1/2 right-1/3 hidden h-[250px] w-[250px] rounded-full bg-blue-500/15 blur-[80px] animate-float sm:block" style={{ animationDelay: '4s' }} />
      <div className="absolute bottom-1/3 left-1/3 hidden h-[200px] w-[200px] rounded-full bg-purple-500/10 blur-[80px] animate-float sm:block" style={{ animationDelay: '6s' }} />

      {/* Main content — login card + optional side panel */}
      <div className="relative z-10 flex min-h-[var(--viewport-dynamic-height,100dvh)] flex-col justify-center py-2 sm:min-h-app sm:py-3">
        <div className="mb-3 hidden w-full md:block xl:hidden">
          <InstallBanner />
        </div>
        <div className="relative flex w-full items-center justify-center">
          {/* Login column */}
          <div className="w-full max-w-[392px] animate-slide-up sm:max-w-[440px] min-[1380px]:max-w-[472px]">
            {/* Logo area */}
            <div className="mb-4 text-center sm:mb-4 min-[1380px]:mb-5">
              <div className="mx-auto mb-2.5 flex h-12 items-center justify-center min-[1380px]:mb-2.5 min-[1380px]:h-16">
                <img
                  src="/images/flinders-logo.png"
                  alt="Flinders University"
                  className="h-10 object-contain min-[1380px]:h-14"
                />
              </div>
              <h1 className="text-[1.95rem] font-bold tracking-tight text-white sm:text-[1.65rem] min-[1380px]:text-3xl">
                Flinders <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">Collab</span>
              </h1>
              <p className="mt-1.5 text-[12px] text-white/50 sm:text-xs min-[1380px]:mt-1.5 min-[1380px]:text-sm">
                Team collaboration for Flinders University students
              </p>
              <div className="mx-auto mt-3 h-0.5 w-16 rounded-full bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent min-[1380px]:mt-3.5" />
            </div>

            {/* Subtle glow behind card */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[300px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-[90px] sm:block" />

            <div className="relative">
              {/* Auth card */}
              <Card className="relative rounded-[28px] border border-white/10 bg-white/[0.985] shadow-xl shadow-black/30 backdrop-blur-xl sm:rounded-[28px] sm:shadow-2xl">
                <CardContent className="p-5 pb-5 sm:p-6 min-[1380px]:p-7">
                  {children}
                </CardContent>
              </Card>

              {/* Desktop side panel */}
              {showSidePanel && (
                <div className="hidden min-[1380px]:absolute min-[1380px]:left-[calc(100%+22px)] min-[1380px]:top-0 min-[1380px]:block">
                  <DesktopSidePanel onDismiss={handleDismiss} onNeverShow={handleNeverShow} />
                </div>
              )}
            </div>

            {/* Footer - university info */}
            <p className="mt-4 text-center text-[10px] text-white/28 sm:mt-5 sm:text-xs">
              Flinders University &middot; Adelaide, South Australia
            </p>
          </div>
        </div>
      </div>

      {/* Developer credit - bottom of page */}
      <div className="relative z-10 mt-3 hidden flex-col items-center gap-2 pb-1 pt-2 sm:mt-5 sm:flex">
        <div className="h-px w-16 bg-white/10" />
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src="/images/project-mark.svg"
              alt="IT-Yun"
              className="h-9 w-9 rounded-full object-cover ring-2 ring-white/20 shadow-lg"
            />
            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#FFD300] ring-2 ring-[#002F60]" />
          </div>
          <div className="text-center">
            <p className="text-[11px] text-white/40 leading-tight">
              Designed & Built by
            </p>
            <p className="text-xs font-semibold text-white/70 tracking-wide">
              IT-Yun
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
