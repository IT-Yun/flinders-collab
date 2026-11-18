import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

const STORAGE_KEY = 'onboarding-tours';
const getInteractiveTutorialPhase = () => {
  if (typeof window === 'undefined') return 'idle';
  return window.__interactiveTutorialState?.phase || 'idle';
};
const getActiveOnboardingTourId = () => {
  if (typeof window === 'undefined') return null;
  return window.__activeOnboardingTourId || null;
};

/**
 * Premium onboarding tour with animated cursor that actually clicks elements.
 *
 * Props:
 *   tourId    - unique key per page
 *   steps     - array of { target, title, description, position?, icon?, action? }
 *               action: { click: true } to click the target element
 *               action: { click: 'selector' } to click a different element
 *   delay     - ms before tour starts (default 600)
 */
export default function OnboardingTour({ tourId, steps = [], delay = 600 }) {
  const session = useAuthStore((s) => s.session);
  const isTester = Boolean(session?.is_tester || session?.user?.is_tester);

  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [spotlight, setSpotlight] = useState(null);
  const [tipPos, setTipPos] = useState({});
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [cursorVisible, setCursorVisible] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | cursor-moving | clicking | shown
  const overlayRef = useRef(null);
  const tipRef = useRef(null);
  const isBlockedByOtherTutorial = useCallback(() => {
    const interactivePhase = getInteractiveTutorialPhase();
    const otherOnboardingTourId = getActiveOnboardingTourId();
    return interactivePhase !== 'idle' || Boolean(otherOnboardingTourId && otherOnboardingTourId !== tourId);
  }, [tourId]);

  // ── Should this tour show? ──
  // Only skip if permanently dismissed via "Don't show again" checkbox
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved[tourId] || isBlockedByOtherTutorial()) return;
    const t = setTimeout(() => {
      if (isBlockedByOtherTutorial()) return;
      window.__activeOnboardingTourId = tourId;
      setActive(true);
      setCursorPos({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    }, delay);
    return () => clearTimeout(t);
  }, [delay, isBlockedByOtherTutorial, tourId]);

  // ── Close helpers ──
  // All dismissals are permanent — user clearly doesn't want to see it again
  const dismissForever = useCallback(() => {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    saved[tourId] = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    if (window.__activeOnboardingTourId === tourId) {
      window.__activeOnboardingTourId = null;
    }
    setActive(false);
  }, [tourId]);

  // All close actions (X, skip, complete) permanently dismiss
  const dismiss = dismissForever;
  const skipAll = dismissForever;

  useEffect(() => {
    const syncWithInteractiveTutorial = (event) => {
      const phase = event?.detail?.phase || getInteractiveTutorialPhase();
      if (phase !== 'idle') {
        dismiss();
      }
    };
    window.addEventListener('interactive-tutorial-state', syncWithInteractiveTutorial);
    return () => window.removeEventListener('interactive-tutorial-state', syncWithInteractiveTutorial);
  }, [dismiss]);

  useEffect(() => () => {
    if (window.__activeOnboardingTourId === tourId) {
      window.__activeOnboardingTourId = null;
    }
  }, [tourId]);

  // ── Position calculation ──
  const computePositions = useCallback(() => {
    const s = steps[step];
    if (!s) return;

    if (!s.target) {
      setSpotlight(null);
      setTipPos({
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      });
      return;
    }

    const el = document.querySelector(s.target);
    if (!el) {
      setSpotlight(null);
      setTipPos({
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      });
      return;
    }

    const r = el.getBoundingClientRect();
    const pad = 10;
    const sp = {
      x: r.left - pad,
      y: r.top - pad,
      w: r.width + pad * 2,
      h: r.height + pad * 2,
      r: 14,
    };
    setSpotlight(sp);

    const pos = s.position || 'bottom';
    const tw = Math.min(320, window.innerWidth - 24);
    const gap = 14;
    const style = { position: 'fixed', width: tw };

    if (pos === 'bottom') {
      style.top = sp.y + sp.h + gap;
      style.left = clamp(sp.x + sp.w / 2 - tw / 2, 12, window.innerWidth - tw - 12);
    } else if (pos === 'top') {
      style.bottom = window.innerHeight - sp.y + gap;
      style.left = clamp(sp.x + sp.w / 2 - tw / 2, 12, window.innerWidth - tw - 12);
    } else if (pos === 'right') {
      style.top = clamp(sp.y + sp.h / 2 - 50, 12, window.innerHeight - 200);
      style.left = clamp(sp.x + sp.w + gap, 12, window.innerWidth - tw - 12);
    } else if (pos === 'left') {
      style.top = clamp(sp.y + sp.h / 2 - 50, 12, window.innerHeight - 200);
      style.right = window.innerWidth - sp.x + gap;
    }

    if (style.top !== undefined && style.top > window.innerHeight - 180) {
      delete style.top;
      style.bottom = window.innerHeight - sp.y + gap;
    }

    setTipPos(style);
  }, [step, steps]);

  // ── Animate step transitions (with real clicks) ──
  useEffect(() => {
    if (!active) return;
    const s = steps[step];
    if (!s) return;

    setPhase('cursor-moving');

    // 1) Scroll target into view
    if (s.target) {
      const el = document.querySelector(s.target);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    }

    // 2) Animate cursor to target center
    const moveCursor = () => {
      if (s.target) {
        const el = document.querySelector(s.target);
        if (el) {
          const r = el.getBoundingClientRect();
          setCursorPos({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
          setCursorVisible(true);
        }
      } else {
        setCursorPos({ x: window.innerWidth / 2, y: window.innerHeight / 2 - 40 });
        setCursorVisible(false);
      }
    };

    const t1 = setTimeout(moveCursor, 100);

    // 3) After cursor arrives — optionally click, then show tooltip
    const clickDelay = s.target ? 500 : 200;
    const t2 = setTimeout(() => {
      // If step has an action.click, actually click the element
      if (s.action?.click) {
        setPhase('clicking');
        const clickTarget = typeof s.action.click === 'string'
          ? document.querySelector(s.action.click)
          : document.querySelector(s.target);
        if (clickTarget) {
          clickTarget.click();
        }
        // Wait for UI to update after click
        setTimeout(() => {
          computePositions();
          setPhase('shown');
        }, 350);
      } else {
        computePositions();
        setPhase('shown');
      }
    }, clickDelay);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [active, step, steps, computePositions]);

  // ── Reposition on resize/scroll ──
  useEffect(() => {
    if (!active || phase !== 'shown') return;
    const h = () => computePositions();
    window.addEventListener('resize', h);
    window.addEventListener('scroll', h, true);
    return () => {
      window.removeEventListener('resize', h);
      window.removeEventListener('scroll', h, true);
    };
  }, [active, phase, computePositions]);

  const goNext = () => {
    if (step < steps.length - 1) {
      setPhase('idle');
      setStep((s) => s + 1);
    } else {
      // Last step — always permanently dismiss
      dismissForever();
    }
  };

  if (!active || steps.length === 0) return null;

  const s = steps[step];
  const isLast = step === steps.length - 1;
  const progress = ((step + 1) / steps.length) * 100;

  return (
    <>
      {/* ── Overlay with spotlight cutout ── */}
      <div ref={overlayRef} className="fixed inset-0" style={{ zIndex: 99998 }}>
        <svg className="absolute inset-0 w-full h-full">
          <defs>
            <mask id={`tour-mask-${tourId}`}>
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {spotlight && phase === 'shown' && (
                <rect
                  x={spotlight.x} y={spotlight.y}
                  width={spotlight.w} height={spotlight.h}
                  rx={spotlight.r} fill="black"
                  style={{ transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}
                />
              )}
            </mask>
          </defs>
          <rect
            x="0" y="0" width="100%" height="100%"
            fill="rgba(15, 23, 42, 0.6)"
            mask={`url(#tour-mask-${tourId})`}
            style={{ transition: 'opacity 0.3s' }}
          />
          {spotlight && phase === 'shown' && (
            <rect
              x={spotlight.x} y={spotlight.y}
              width={spotlight.w} height={spotlight.h}
              rx={spotlight.r}
              fill="none" stroke="rgba(165,180,252,0.45)" strokeWidth="2"
              style={{ transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}
            />
          )}
        </svg>
      </div>

      {/* ── Animated cursor ── */}
      {cursorVisible && (
        <div
          className="fixed pointer-events-none"
          style={{
            zIndex: 100001,
            left: cursorPos.x - 6,
            top: cursorPos.y - 2,
            transition: 'all 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
            opacity: phase !== 'idle' ? 1 : 0,
            transform: phase === 'clicking' ? 'scale(0.8)' : 'scale(1)',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}>
            <path d="M5 3L19 12L12 13L9 20L5 3Z" fill="white" stroke="rgb(79,70,229)" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          {(phase === 'shown' || phase === 'clicking') && (
            <div className="absolute top-0 left-0 w-6 h-6 rounded-full bg-indigo-400/30 animate-ping" />
          )}
        </div>
      )}

      {/* ── Tooltip ── */}
      <div
        ref={tipRef}
        className={`fixed transition-all duration-400 ease-out ${
          phase === 'shown' ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-[0.97]'
        }`}
        style={{ ...tipPos, zIndex: 100000 }}
      >
        <div className="rounded-2xl bg-white/95 backdrop-blur-xl shadow-[0_20px_60px_-12px_rgba(0,0,0,0.25)] border border-white/60 overflow-hidden">
          {/* Progress bar */}
          <div className="h-[3px] bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500">
            <div
              className="h-full bg-white/40 transition-all duration-700 ease-out"
              style={{ width: `${100 - progress}%`, marginLeft: 'auto' }}
            />
          </div>

          <div className="px-5 pt-4 pb-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-1">
              <div className="flex items-center gap-2.5">
                {s.icon && <span className="text-xl leading-none">{s.icon}</span>}
                <h3 className="text-[15px] font-bold text-slate-900 leading-snug">{s.title}</h3>
              </div>
              <button
                onClick={dismiss}
                className="mt-0.5 p-1 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Description */}
            <p className="text-[13px] leading-relaxed text-slate-500 pl-[30px]">
              {s.description}
            </p>
          </div>

          {/* Footer */}
          <div className="px-5 py-2.5 bg-slate-50/60">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-slate-400 tracking-wide">
                {step + 1} / {steps.length}
              </span>

              <div className="flex items-center gap-3">
                <button
                  onClick={skipAll}
                  className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Skip all
                </button>
                <button
                  onClick={goNext}
                  className="flex items-center gap-1 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 pl-3.5 pr-2.5 py-1.5 text-[12px] font-semibold text-white shadow-sm hover:shadow-md hover:brightness-110 transition-all active:scale-95"
                >
                  {isLast ? 'Got it' : 'Next'}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(val, max));
}

export function resetTour(tourId) {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  delete saved[tourId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

export function resetAllTours() {
  localStorage.removeItem(STORAGE_KEY);
}
