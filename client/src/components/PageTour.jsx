import React, { useState, useEffect, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * Reusable per-page guided tour with spotlight + tooltip.
 *
 * Props:
 *   tourId  — unique key (localStorage: `page-tour-${tourId}`)
 *   steps   — [{ target: 'CSS selector', title, desc, position: 'bottom'|'right'|'left'|'top' }]
 *   delay   — ms before tour starts (default 600)
 */
export default function PageTour({ tourId, steps = [], delay = 600 }) {
  const storageKey = `page-tour-${tourId}`;
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!steps.length) return;
    if (localStorage.getItem(storageKey)) return;

    const timer = setTimeout(() => {
      // Don't start if WelcomeTutorial is still showing
      const welcomeOverlay = document.querySelector('[class*="z-[99997]"]');
      if (welcomeOverlay) {
        const poll = setInterval(() => {
          if (!document.querySelector('[class*="z-[99997]"]')) {
            clearInterval(poll);
            setTimeout(() => setActive(true), 400);
          }
        }, 300);
        return;
      }
      setActive(true);
    }, delay);
    return () => clearTimeout(timer);
  }, [storageKey, steps.length, delay]);

  const measureTarget = useCallback(() => {
    if (!active || !steps[step]) return;

    const el = document.querySelector(steps[step].target);
    if (!el) {
      // Skip missing targets
      if (step < steps.length - 1) {
        setStep((s) => s + 1);
      } else {
        localStorage.setItem(storageKey, Date.now().toString());
        setActive(false);
      }
      return;
    }

    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [active, step, steps, storageKey]);

  useEffect(() => {
    measureTarget();
    const onResize = () => measureTarget();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [measureTarget]);

  const finish = () => {
    localStorage.setItem(storageKey, Date.now().toString());
    setActive(false);
  };

  const next = () => {
    if (step >= steps.length - 1) {
      finish();
    } else {
      setStep((s) => s + 1);
    }
  };

  if (!active || !rect || !steps[step]) return null;

  const current = steps[step];
  const pad = 6;
  const spotX = rect.left - pad;
  const spotY = rect.top - pad;
  const spotW = rect.width + pad * 2;
  const spotH = rect.height + pad * 2;

  // Tooltip positioning
  let tooltipStyle = {};
  const pos = current.position || 'bottom';
  if (pos === 'bottom') {
    tooltipStyle = {
      top: rect.top + rect.height + 14,
      left: Math.max(12, Math.min(rect.left + rect.width / 2 - 140, window.innerWidth - 292)),
    };
  } else if (pos === 'top') {
    tooltipStyle = {
      bottom: window.innerHeight - rect.top + 14,
      left: Math.max(12, Math.min(rect.left + rect.width / 2 - 140, window.innerWidth - 292)),
    };
  } else if (pos === 'right') {
    tooltipStyle = {
      top: Math.max(12, rect.top + rect.height / 2 - 40),
      left: Math.min(rect.left + rect.width + 14, window.innerWidth - 292),
    };
  } else {
    // left
    tooltipStyle = {
      top: Math.max(12, rect.top + rect.height / 2 - 40),
      right: window.innerWidth - rect.left + 14,
    };
  }

  return (
    <div className="fixed inset-0 z-[99998]" onClick={next}>
      {/* Dark overlay with spotlight cutout */}
      <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id={`tour-mask-${tourId}`}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect x={spotX} y={spotY} width={spotW} height={spotH} rx="12" fill="black" />
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask={`url(#tour-mask-${tourId})`} />
      </svg>

      {/* Spotlight glow */}
      <div
        className="absolute rounded-xl ring-2 ring-blue-400/60 ring-offset-2 ring-offset-transparent transition-all duration-300"
        style={{ top: spotY, left: spotX, width: spotW, height: spotH, pointerEvents: 'none' }}
      />

      {/* Tooltip */}
      <div
        className="absolute w-[280px] rounded-xl bg-white px-4 py-3.5 shadow-2xl transition-all duration-300"
        style={tooltipStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[14px] font-bold text-slate-900">{current.title}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{current.desc}</p>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-4 bg-blue-500' : 'w-1.5 bg-slate-200'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); finish(); }}
              className="text-[11px] font-medium text-slate-400 hover:text-slate-600"
            >
              Skip
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); next(); }}
              className="flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-700 transition-colors active:scale-95"
            >
              {step === steps.length - 1 ? 'Got it' : 'Next'}
              {step < steps.length - 1 && <ChevronRight className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
