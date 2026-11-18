import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { createRoom, deleteRoom, getRoom, getRooms } from '@/services/rooms';
import { createEvent } from '@/services/events';
import { updateAcademicInfo } from '@/services/board';
import { loadSession, clearSession } from '@/lib/auth-token';
import { apiGuestCleanup } from '@/services/auth';
import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

const TUTORIAL_KEY = 'tutorial-completed';
const TUTORIAL_ROOM_NAME = '🎓 Tutorial Room';
const TUTORIAL_ROOM_ID_KEY = 'tutorial-room-id';
const TUTORIAL_SESSION_DISMISS_KEY = 'tutorial-dismissed-session';
const SEAN_IMG = '/images/project-mark.svg';

// Preload Sean's avatar so it renders instantly when the modal appears
if (typeof window !== 'undefined') {
  const img = new Image();
  img.src = SEAN_IMG;
}
const hasTutorialSuppression = () => {
  if (typeof window === 'undefined') return false;
  return Boolean(window.localStorage.getItem(TUTORIAL_KEY));
};
const hasTutorialSessionDismissed = () => {
  if (typeof window === 'undefined') return false;
  return Boolean(window.sessionStorage.getItem(TUTORIAL_SESSION_DISMISS_KEY));
};

export default function InteractiveTutorial() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);
  const [showPrompt, setShowPrompt] = useState(false);
  const [active, setActive] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });
  const [cursorVisible, setCursorVisible] = useState(false);
  const [cursorScale, setCursorScale] = useState(1);
  const [showOverlay, setShowOverlay] = useState(false);
  const [spotlight, setSpotlight] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [progress, setProgress] = useState(0);
  const cancelRef = useRef(false);
  const skipRef = useRef(false);
  const canSkipRef = useRef(true);
  const [canSkip, setCanSkip] = useState(true);
  const createdRoomIdRef = useRef(null);
  const suppressedRef = useRef(hasTutorialSuppression());
  const sessionDismissedRef = useRef(hasTutorialSessionDismissed());
  const activeRef = useRef(false);
  const showPromptRef = useRef(false);
  const totalSteps = 14;
  const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 768;
  const swallowPointer = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);
  const isTutorialSuppressed = useCallback(() => {
    const value = hasTutorialSuppression();
    suppressedRef.current = value;
    return value;
  }, []);
  const isTutorialSessionDismissed = useCallback(() => {
    const value = hasTutorialSessionDismissed();
    sessionDismissedRef.current = value;
    return value;
  }, []);
  const rememberSuppressed = useCallback((value) => {
    suppressedRef.current = value;
  }, []);
  const rememberSessionDismissed = useCallback((value) => {
    sessionDismissedRef.current = value;
  }, []);
  const persistTutorialSuppression = useCallback(() => {
    localStorage.setItem(TUTORIAL_KEY, Date.now().toString());
    rememberSuppressed(true);
    sessionStorage.setItem(TUTORIAL_SESSION_DISMISS_KEY, Date.now().toString());
    rememberSessionDismissed(true);
  }, [rememberSessionDismissed, rememberSuppressed]);
  const clearTutorialSuppression = useCallback(() => {
    localStorage.removeItem(TUTORIAL_KEY);
    rememberSuppressed(false);
  }, [rememberSuppressed]);
  const persistTutorialSessionDismiss = useCallback(() => {
    sessionStorage.setItem(TUTORIAL_SESSION_DISMISS_KEY, Date.now().toString());
    rememberSessionDismissed(true);
  }, [rememberSessionDismissed]);
  const clearTutorialSessionDismiss = useCallback(() => {
    sessionStorage.removeItem(TUTORIAL_SESSION_DISMISS_KEY);
    rememberSessionDismissed(false);
  }, [rememberSessionDismissed]);
  const guardedSetShowPrompt = useCallback((value, options = {}) => {
    const { force = false } = options;
    if (value && !force && (isTutorialSuppressed() || isTutorialSessionDismissed() || activeRef.current)) return;
    setShowPrompt(value);
  }, [isTutorialSessionDismissed, isTutorialSuppressed]);
  const guardedStartTutorial = useCallback((options = {}) => {
    const { force = false } = options;
    if (activeRef.current) return;
    if (!force && (isTutorialSuppressed() || isTutorialSessionDismissed())) return;
    setShowPrompt(false);
    setActive(true);
  }, [isTutorialSessionDismissed, isTutorialSuppressed]);

  // ── Clean up any leftover tutorial room from a previous crashed session ──
  useEffect(() => {
    const leftover = localStorage.getItem(TUTORIAL_ROOM_ID_KEY);
    if (leftover) {
      localStorage.removeItem(TUTORIAL_ROOM_ID_KEY);
      deleteRoom(leftover)
        .then(() => window.dispatchEvent(new CustomEvent('rooms-updated')))
        .catch(() => {
          // Retry once after a short delay
          setTimeout(() => {
            deleteRoom(leftover)
              .then(() => window.dispatchEvent(new CustomEvent('rooms-updated')))
              .catch(() => {});
          }, 1000);
        });
    }
  }, []);

  // Show welcome modal for new users, full tutorial only for testers
  const [showWelcome, setShowWelcome] = useState(false);
  const WELCOME_KEY = 'welcome-shown';

  const testerModeRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const testerMode = Boolean(session?.is_tester || user?.is_tester);
    testerModeRef.current = testerMode;

    // Testers always get the full tutorial prompt — clear any cached suppression
    if (testerMode) {
      setShowWelcome(false);
      clearTutorialSuppression();
      clearTutorialSessionDismiss();
      setShowPrompt(true);
      return;
    }

    // Regular users: no tutorial, no welcome modal
    setShowWelcome(false);
    setShowPrompt(false);
    return () => { cancelled = true; };
  }, [clearTutorialSuppression, clearTutorialSessionDismiss, session?.is_tester, user?.is_tester, user?.id]);

  useEffect(() => {
    const syncPromptVisibility = async () => {
      if (!showPromptRef.current || activeRef.current) return;
      // Never auto-hide the tutorial prompt for testers
      if (testerModeRef.current) return;
      if (isTutorialSuppressed() || isTutorialSessionDismissed()) {
        setShowPrompt(false);
        return;
      }
      try {
        const rooms = await getRooms();
        const list = Array.isArray(rooms) ? rooms : rooms?.rooms || [];
        if (list.length > 0) setShowPrompt(false);
      } catch {
        // Ignore sync failures; prompt suppression guards still apply.
      }
    };
    window.addEventListener('rooms-updated', syncPromptVisibility);
    return () => window.removeEventListener('rooms-updated', syncPromptVisibility);
  }, [isTutorialSessionDismissed, isTutorialSuppressed]);

  useEffect(() => {
    const handler = (event) => {
      const force = Boolean(event?.detail?.force);
      guardedStartTutorial({ force });
    };
    window.addEventListener('start-interactive-tutorial', handler);
    return () => window.removeEventListener('start-interactive-tutorial', handler);
  }, [guardedStartTutorial]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    showPromptRef.current = showPrompt;
  }, [showPrompt]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const detail = {
      active,
      promptVisible: showPrompt && !active,
      phase: active ? 'active' : showPrompt ? 'prompt' : 'idle',
    };
    window.__interactiveTutorialState = detail;
    window.dispatchEvent(new CustomEvent('interactive-tutorial-state', { detail }));
    return () => {
      const idleDetail = { active: false, promptVisible: false, phase: 'idle' };
      window.__interactiveTutorialState = idleDetail;
      window.dispatchEvent(new CustomEvent('interactive-tutorial-state', { detail: idleDetail }));
    };
  }, [active, showPrompt]);

  // If tester closes the tab/browser, try cleanup via fetch keepalive
  useEffect(() => {
    const handleBeforeUnload = () => {
      const session = loadSession();
      if (session?.is_tester && session?.access_token) {
        const url = apiUrl('/api/auth/guest/cleanup');
        fetch(url, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          keepalive: true,
        }).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // ── Utilities ──
  const setSkipEnabled = useCallback((value) => {
    canSkipRef.current = value;
    if (!value) {
      skipRef.current = false;
    }
    setCanSkip(value);
  }, []);

  const wait = useCallback((ms, allowSkip = false) =>
    new Promise((resolve) => {
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; resolve(); } }, ms);
      const check = setInterval(() => {
        if (cancelRef.current && !done) {
          done = true;
          clearTimeout(t);
          clearInterval(check);
          resolve();
          return;
        }
        if (allowSkip && skipRef.current && !done) {
          done = true;
          clearTimeout(t);
          clearInterval(check);
          skipRef.current = false;
          resolve();
        }
      }, 100);
      setTimeout(() => clearInterval(check), ms + 50);
    }), []);

  const sleep = useCallback((ms) => wait(ms, false), [wait]);
  const pauseFor = useCallback((ms) => wait(ms, true), [wait]);

  const waitForEl = useCallback((selector, timeout = 8000) =>
    new Promise((resolve) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const start = Date.now();
      const interval = setInterval(() => {
        if (cancelRef.current) { clearInterval(interval); resolve(null); return; }
        const found = document.querySelector(selector);
        if (found) { clearInterval(interval); resolve(found); return; }
        if (Date.now() - start > timeout) { clearInterval(interval); resolve(null); }
      }, 150);
    }), []);

  const waitForGone = useCallback((selector, timeout = 2000) =>
    new Promise((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        if (cancelRef.current) {
          clearInterval(interval);
          resolve(false);
          return;
        }
        if (!document.querySelector(selector)) {
          clearInterval(interval);
          resolve(true);
          return;
        }
        if (Date.now() - start > timeout) {
          clearInterval(interval);
          resolve(false);
        }
      }, 120);
    }), []);

  const moveCursorTo = useCallback(async (target) => {
    if (cancelRef.current) return;
    let x, y;
    if (typeof target === 'string') {
      const el = document.querySelector(target);
      if (!el) return;
      const r = el.getBoundingClientRect();
      x = r.left + r.width / 2; y = r.top + r.height / 2;
    } else { x = target.x; y = target.y; }
    setCursorVisible(true); setCursorPos({ x, y });
    await sleep(450);
  }, [sleep]);

  const simulateClick = useCallback((el) => {
    if (!el || cancelRef.current) return;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1 };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.click();
  }, []);

  const clickEl = useCallback(async (selector) => {
    if (cancelRef.current) return;
    const el = document.querySelector(selector);
    if (!el) return;
    await moveCursorTo(selector);
    if (cancelRef.current) return;
    setCursorScale(0.75); await sleep(100); setCursorScale(1);
    simulateClick(el); await sleep(250);
  }, [moveCursorTo, sleep, simulateClick]);

  const clickDomEl = useCallback(async (el) => {
    if (!el || cancelRef.current) return;
    const r = el.getBoundingClientRect();
    await moveCursorTo({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    if (cancelRef.current) return;
    setCursorScale(0.75); await sleep(100); setCursorScale(1);
    simulateClick(el); await sleep(250);
  }, [moveCursorTo, sleep, simulateClick]);

  const spotlightEl = useCallback((selector) => {
    const el = document.querySelector(selector);
    if (!el) { setSpotlight(null); return; }
    const r = el.getBoundingClientRect();
    const pad = 10;
    setSpotlight({ x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2, r: 14 });
  }, []);

  const showTip = useCallback((title, desc, options = {}) => {
    if (cancelRef.current) return;
    const safeTop = 16;
    const safeBottom = 20;
    const tw = Math.min(isMobileViewport ? 320 : 340, window.innerWidth - 24);
    const sidebar = document.querySelector('aside');
    const sidebarW = (sidebar && sidebar.offsetWidth > 0) ? sidebar.getBoundingClientRect().width : 0;
    const centerLeft = sidebarW + (window.innerWidth - sidebarW) / 2;
    if (options.center || !options.target) {
      setTooltip({
        title,
        desc,
        style: {
          position: 'fixed',
          top: isMobileViewport ? `max(calc(env(safe-area-inset-top) + ${safeTop}px), 5.25rem)` : '50%',
          left: centerLeft,
          transform: isMobileViewport ? 'translateX(-50%)' : 'translate(-50%, -50%)',
          width: tw,
        },
        icon: options.icon,
      });
      if (!options.keepSpotlight) setSpotlight(null);
      return;
    }
    const el = document.querySelector(options.target);
    if (!el) {
      setTooltip({
        title,
        desc,
        style: {
          position: 'fixed',
          top: isMobileViewport ? `max(calc(env(safe-area-inset-top) + ${safeTop}px), 5.25rem)` : '50%',
          left: centerLeft,
          transform: isMobileViewport ? 'translateX(-50%)' : 'translate(-50%, -50%)',
          width: tw,
        },
        icon: options.icon,
      });
      if (!options.keepSpotlight) setSpotlight(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const gap = 14; const style = { position: 'fixed', width: tw };
    const pos = options.position || 'bottom';
    if (pos === 'bottom') { style.top = r.bottom + gap + 10; style.left = Math.max(12, Math.min(r.left + r.width / 2 - tw / 2, window.innerWidth - tw - 12)); }
    else if (pos === 'top') { style.bottom = window.innerHeight - r.top + gap; style.left = Math.max(12, Math.min(r.left + r.width / 2 - tw / 2, window.innerWidth - tw - 12)); }
    else if (pos === 'right') { style.top = Math.max(12, Math.min(r.top + r.height / 2 - 50, window.innerHeight - 200)); style.left = Math.max(12, Math.min(r.right + gap, window.innerWidth - tw - 12)); }
    else if (pos === 'left') { style.top = Math.max(12, Math.min(r.top + r.height / 2 - 50, window.innerHeight - 200)); style.right = window.innerWidth - r.left + gap; }
    if (style.top !== undefined && style.top > window.innerHeight - 160 && pos !== 'right' && pos !== 'left') { delete style.top; style.bottom = window.innerHeight - r.top + gap; }
    if (style.top !== undefined) {
      style.top = Math.max(safeTop, Math.min(style.top, window.innerHeight - 220 - safeBottom));
    }
    if (style.bottom !== undefined) {
      style.bottom = Math.max(safeBottom, Math.min(style.bottom, window.innerHeight - 220 - safeTop));
    }
    setTooltip({ title, desc, style, icon: options.icon });
    spotlightEl(options.target);
  }, [isMobileViewport, spotlightEl]);

  const typeInto = useCallback(async (selector, text) => {
    if (cancelRef.current) return;
    const el = document.querySelector(selector);
    if (!el) return;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (!setter) return;
    await moveCursorTo(selector);
    el.focus();
    for (let i = 1; i <= text.length; i++) {
      if (cancelRef.current) return;
      setter.call(el, text.slice(0, i));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(18 + Math.random() * 10);
    }
    await sleep(200);
  }, [moveCursorTo, sleep]);

  const safeDeleteTutorialRoom = useCallback(async () => {
    const roomId = createdRoomIdRef.current;
    if (!roomId) return;
    // Try up to 3 times with short delay
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await deleteRoom(roomId);
        break; // success
      } catch {
        if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
      }
    }
    createdRoomIdRef.current = null;
    localStorage.removeItem(TUTORIAL_ROOM_ID_KEY);
    // Fire multiple rooms-updated events to ensure dashboard refreshes
    window.dispatchEvent(new CustomEvent('rooms-updated'));
  }, []);

  const resetUI = useCallback(() => {
    setTooltip(null); setSpotlight(null); setCursorVisible(false); setShowOverlay(false); setSkipEnabled(true);
  }, [setSkipEnabled]);

  const logoutTester = useCallback(async () => {
    try { await apiGuestCleanup(); } catch { /* ignore */ }
    clearSession();
    window.location.href = '/login';
  }, []);

  const cleanup = useCallback(async () => {
    resetUI();
    await safeDeleteTutorialRoom();
    // If tester → full cleanup and redirect to login
    const session = loadSession();
    if (session?.is_tester) {
      await logoutTester();
      return;
    }
    navigate('/dashboard');
    window.dispatchEvent(new CustomEvent('rooms-updated'));
    setTimeout(() => window.dispatchEvent(new CustomEvent('rooms-updated')), 800);
    setTimeout(() => window.dispatchEvent(new CustomEvent('rooms-updated')), 2000);
  }, [navigate, safeDeleteTutorialRoom, resetUI, logoutTester]);

  const deactivateTutorial = useCallback(() => {
    cancelRef.current = true;
    setActive(false);
    setShowPrompt(false);
    resetUI();
  }, [resetUI]);

  const findBtn = useCallback((text) => {
    const btns = document.querySelectorAll('button');
    for (const b of btns) { if (b.textContent.includes(text)) return b; }
    return null;
  }, []);

  // ── Main tutorial flow ──
  const runTutorial = useCallback(async () => {
    cancelRef.current = false;
    const bail = () => cancelRef.current;
    const end = async () => {
      deactivateTutorial();
      await cleanup();
    };
    const pause = (ms) => pauseFor(ms);
    const setP = (n) => { setProgress(n); };

    try {
      // ── 1: Welcome ──
      setP(1); setShowOverlay(true);
      navigate('/dashboard');
      await waitForEl('[data-tour="create-room"]');
      await sleep(500);
      if (bail()) { await end(); return; }
      showTip('Welcome!', "Hey! I'm Sean. Let me quickly show you around.", { center: true, icon: '👋' });
      await pause(3000); if (bail()) { await end(); return; }

      // ── 2: Create Room button ──
      setP(2); setTooltip(null); setSpotlight(null);
      showTip('Create Room', "Here you make a room for your team.", { target: '[data-tour="create-room"]', icon: '✨', position: 'bottom' });
      await moveCursorTo('[data-tour="create-room"]');
      await pause(3500); if (bail()) { await end(); return; }

      // ── 3: Join Room button ──
      setP(3); setTooltip(null); setSpotlight(null);
      const joinBtn = await waitForEl('[data-tour="join-room"]');
      if (joinBtn && !bail()) {
        showTip('Join Room', "Got an invite code? Paste it here to join.", { target: '[data-tour="join-room"]', icon: '🔗', position: 'bottom' });
        await moveCursorTo('[data-tour="join-room"]');
        await pause(3000); if (bail()) { await end(); return; }
      }

      // ── 3.5: Sidebar navigation ──
      setTooltip(null); setSpotlight(null); setCursorVisible(false);
      const sidebarEl = document.querySelector('aside');
      if (sidebarEl && !bail()) {
        const sr = sidebarEl.getBoundingClientRect();
        setSpotlight({ x: sr.left, y: sr.top, w: sr.width, h: sr.height, r: 0 });
        showTip('Sidebar', "All your pages and rooms are here.", { target: '[data-tour="sidebar-nav"]', icon: '📌', position: 'right' });
        await pause(3500); if (bail()) { await end(); return; }
      }

      // ── 4: Let's make a room ──
      setP(4); setTooltip(null); setSpotlight(null); setCursorVisible(false);
      showTip("Let's try it!", "I'll make a room for you real quick.", { center: true, icon: '🚀' });
      await pause(2500); if (bail()) { await end(); return; }

      // ── 5: Open dialog, type room name + course code, create via API ──
      // ** SKIP DISABLED — must create room **
      setSkipEnabled(false);
      setP(5); setTooltip(null); setSpotlight(null); setShowOverlay(false);
      await sleep(300); if (bail()) { await end(); return; }
      const triggerBtn = document.querySelector('[data-tour="create-room"] button');
      if (triggerBtn) await clickDomEl(triggerBtn);
      await sleep(600); if (bail()) { await end(); return; }

      const nameInput = await waitForEl('[role="dialog"] input');
      if (!nameInput || bail()) { await end(); return; }
      await typeInto('[role="dialog"] input', TUTORIAL_ROOM_NAME);
      if (bail()) { await end(); return; }
      await pause(400); if (bail()) { await end(); return; }

      // Type course code
      const courseInput = document.querySelector('[role="dialog"] input[placeholder*="COMP"]');
      if (courseInput && !bail()) {
        await typeInto('[role="dialog"] input[placeholder*="COMP"]', 'COMP2342');
        await pause(400); if (bail()) { await end(); return; }
      }

      // Create room via API
      setTooltip(null);
      let tutorialRoomId = null;
      try {
        const result = await createRoom({ name: TUTORIAL_ROOM_NAME, course_name: 'COMP2342' });
        tutorialRoomId = result?.id || result?.room?.id;
      } catch { /* fail */ }
      if (!tutorialRoomId || bail()) { await end(); return; }
      createdRoomIdRef.current = tutorialRoomId;
      localStorage.setItem(TUTORIAL_ROOM_ID_KEY, tutorialRoomId);

      setSkipEnabled(true);
      setShowOverlay(true); setCursorVisible(false);
      showTip('Room Created!', "Let's go inside.", { center: true, icon: '🎉' });
      await pause(2500); if (bail()) { await end(); return; }

      // ── 6: Navigate into room ──
      setP(6); setTooltip(null); setSpotlight(null);
      navigate(`/rooms/${tutorialRoomId}`);
      window.dispatchEvent(new CustomEvent('rooms-updated'));
      showTip('Entering Room...', "Loading your new room...", { center: true, icon: '⏳' });
      const roomTabs = await waitForEl('[data-tour="tab-schedule"]', 15000);
      if (!roomTabs || bail()) { await end(); return; }
      await sleep(800); if (bail()) { await end(); return; }
      showTip('Your Room', "Each tab has a different feature. Let me walk you through.", { center: true, icon: '🏠' });
      await pause(3500); if (bail()) { await end(); return; }

      // ── 6.5: Invite code ──
      setTooltip(null); setSpotlight(null);
      const inviteBtn = document.querySelector('button code.font-mono')?.closest('button');
      if (inviteBtn && !bail()) {
        showTip('Invite Code', "Share this code so friends can join your room.", { center: true, icon: '🔑' });
        const ir = inviteBtn.getBoundingClientRect();
        setSpotlight({ x: ir.left - 10, y: ir.top - 10, w: ir.width + 20, h: ir.height + 20, r: 14 });
        await moveCursorTo({ x: ir.left + ir.width / 2, y: ir.top + ir.height / 2 });
        await pause(3500); if (bail()) { await end(); return; }
      }

      // ── 7: Schedule — show tab, type demo, THEN create event via API ──
      // ** SKIP DISABLED — must create event **
      setSkipEnabled(false);
      setP(7); setTooltip(null); setSpotlight(null);

      showTip('Schedule', "Team calendar. Let me add an event.", { target: '[data-tour="tab-schedule"]', icon: '📆', position: 'bottom' });
      await pause(2500); if (bail()) { await end(); return; }

      // Click schedule tab first (no event yet)
      await clickEl('[data-tour="tab-schedule"]');
      await sleep(1200); if (bail()) { await end(); return; }

      // Wait for "Add Event" button
      let addEventBtn = null;
      for (let i = 0; i < 15; i++) {
        if (bail()) break;
        addEventBtn = findBtn('Add Event');
        if (addEventBtn) break;
        await sleep(300);
      }

      if (addEventBtn && !bail()) {
        setTooltip(null); setShowOverlay(false);
        await clickDomEl(addEventBtn);
        await sleep(600); if (bail()) { await end(); return; }

        const eventDialog = await waitForEl('[role="dialog"]', 5000);
        if (eventDialog && !bail()) {
          await sleep(300);

          // Pick "study" category
          const allCatBtns = document.querySelectorAll('[role="dialog"] button[type="button"]');
          for (const btn of allCatBtns) {
            if (btn.textContent.includes('Study')) {
              await clickDomEl(btn); await sleep(300); break;
            }
          }
          if (bail()) { await end(); return; }

          // Type event title
          const titleIn = document.querySelector('[role="dialog"] input[placeholder*="Group Meeting"]');
          if (titleIn && !bail()) {
            await typeInto('[role="dialog"] input[placeholder*="Group Meeting"]', 'Team Study Session');
            await pause(300); if (bail()) { await end(); return; }
          }

          // Type location
          const locIn = document.querySelector('[role="dialog"] input[placeholder*="Flinders Library"]');
          if (locIn && !bail()) {
            await typeInto('[role="dialog"] input[placeholder*="Flinders Library"]', 'Flinders Library Room 3');
            await pause(300); if (bail()) { await end(); return; }
          }

          // Close dialog
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          await sleep(400);
        }
      }

      // NOW create event via API (after the typing demo)
      if (!bail()) {
        try {
          const futureDate = new Date();
          futureDate.setDate(futureDate.getDate() + 5);
          const start = new Date(futureDate); start.setHours(14, 0, 0, 0);
          const endT = new Date(futureDate); endT.setHours(16, 0, 0, 0);
          await createEvent(tutorialRoomId, {
            title: 'Team Study Session', category: 'study',
            start_time: start.toISOString(), end_time: endT.toISOString(),
            location_name: 'Flinders Library Room 3',
          });
        } catch { /* ok */ }
        // Refetch so it appears on the calendar
        window.dispatchEvent(new CustomEvent('events-updated'));
        await sleep(800);
      }

      if (!bail()) {
        setSkipEnabled(true);
        setShowOverlay(true);
        showTip('Event Added!', "Everyone in the room can see it now.", { center: true, icon: '🎉' });
        await pause(3000); if (bail()) { await end(); return; }
      }

      // ── 8: Tasks tab ──
      setP(8); setTooltip(null); setSpotlight(null);
      showTip('Tasks', "Assign tasks to teammates.", { target: '[data-tour="tab-tasks"]', icon: '✅', position: 'bottom' });
      await pause(2500); if (bail()) { await end(); return; }

      await clickEl('[data-tour="tab-tasks"]');
      await sleep(1000); if (bail()) { await end(); return; }

      // Find "New Task" button
      let newTaskBtn = null;
      for (let i = 0; i < 15; i++) {
        if (bail()) break;
        newTaskBtn = findBtn('New Task');
        if (newTaskBtn) break;
        await sleep(300);
      }

      if (newTaskBtn && !bail()) {
        setTooltip(null); setShowOverlay(false);
        await clickDomEl(newTaskBtn);
        await sleep(800); if (bail()) { await end(); return; }

        const taskInput = await waitForEl('input[placeholder="What needs to be done?"]', 5000);
        if (taskInput && !bail()) {
          await typeInto('input[placeholder="What needs to be done?"]', 'Review lecture notes');
          await pause(400); if (bail()) { await end(); return; }

          // Select member
          let selectMembersBtn = null;
          for (let i = 0; i < 10; i++) {
            if (bail()) break;
            selectMembersBtn = findBtn('Select Members');
            if (selectMembersBtn) break;
            await sleep(200);
          }
          if (selectMembersBtn && !bail()) {
            await clickDomEl(selectMembersBtn);
            await sleep(500); if (bail()) { await end(); return; }
            const memberBtns = document.querySelectorAll('.grid button[type="button"]');
            if (memberBtns.length > 0 && !bail()) {
              await clickDomEl(memberBtns[0]);
              await sleep(400); if (bail()) { await end(); return; }
            }
          }

          // Create Task
          if (!bail()) {
            const submitBtn = findBtn('Create Task');
            if (submitBtn) {
              await clickDomEl(submitBtn);
              await sleep(1200); if (bail()) { await end(); return; }
            }
          }

          if (!bail()) {
            setShowOverlay(true);
            showTip('Task Created!', "Done! You can check it off later.", { center: true, icon: '🎉' });
            await pause(2500); if (bail()) { await end(); return; }
          }
        } else if (!bail()) {
          setShowOverlay(true);
          showTip('Tasks', "Create and assign tasks here.", { center: true, icon: '✅' });
          await pause(2500); if (bail()) { await end(); return; }
        }
      } else if (!bail()) {
        setShowOverlay(true);
        showTip('Tasks', "Create and assign tasks here.", { center: true, icon: '✅' });
        await pause(2500); if (bail()) { await end(); return; }
      }

      // ── 9: Chat tab ──
      setP(9); setTooltip(null); setSpotlight(null);
      await clickEl('[data-tour="tab-chat"]');
      await sleep(600); if (bail()) { await end(); return; }
      showTip('Chat', "Real-time messaging. Send texts, images, files.", { center: true, icon: '💬' });
      await pause(2500); if (bail()) { await end(); return; }

      // ── 10: Files tab ──
      setP(10); setTooltip(null); setSpotlight(null);
      await clickEl('[data-tour="tab-files"]');
      await sleep(600); if (bail()) { await end(); return; }
      showTip('Files', "Drag and drop to share files with your team.", { center: true, icon: '📁' });
      await pause(2500); if (bail()) { await end(); return; }

      // ── 11: Deadlines page ──
      setP(11); setTooltip(null); setSpotlight(null); setCursorVisible(false);
      navigate('/deadlines');
      showTip('Loading...', "Opening Deadlines...", { center: true, icon: '⏳' });
      await sleep(2500); if (bail()) { await end(); return; }
      const deadlinesMain = document.querySelector('main');
      if (deadlinesMain && !bail()) {
        const mr = deadlinesMain.getBoundingClientRect();
        setSpotlight({ x: mr.left + 10, y: mr.top + 10, w: mr.width - 20, h: Math.min(mr.height - 20, 400), r: 16 });
      }
      showTip('Deadlines', "All your room events in one place. The one we just made is here too.", { center: true, icon: '📅', keepSpotlight: true });
      await pause(3500); if (bail()) { await end(); return; }

      // ── 12: Free Board — set academic info first, then demo ──
      setP(12); setTooltip(null); setSpotlight(null); setCursorVisible(false);

      // Pre-set academic info via API so AcademicInfoGate doesn't block
      if (!bail()) {
        try { await updateAcademicInfo(2, 1); } catch { /* ok */ }
      }
      if (bail()) { await end(); return; }

      navigate('/board');

      // Check if AcademicInfoGate is showing — fill it out
      await sleep(1000);
      const yearSelect = document.querySelector('select');
      if (yearSelect && !bail()) {
        // Gate is showing — select year and semester
        setShowOverlay(false);
        showTip('Board Setup', "Let me set this up for you.", { center: true, icon: '📋' });

        const selects = document.querySelectorAll('select');
        if (selects[0]) {
          const yearSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
          if (yearSetter) {
            await moveCursorTo({ x: selects[0].getBoundingClientRect().left + selects[0].getBoundingClientRect().width / 2, y: selects[0].getBoundingClientRect().top + selects[0].getBoundingClientRect().height / 2 });
            setCursorScale(0.75); await sleep(100); setCursorScale(1);
            yearSetter.call(selects[0], '2');
            selects[0].dispatchEvent(new Event('change', { bubbles: true }));
            await sleep(400);
          }
        }
        if (selects[1] && !bail()) {
          const semSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
          if (semSetter) {
            await moveCursorTo({ x: selects[1].getBoundingClientRect().left + selects[1].getBoundingClientRect().width / 2, y: selects[1].getBoundingClientRect().top + selects[1].getBoundingClientRect().height / 2 });
            setCursorScale(0.75); await sleep(100); setCursorScale(1);
            semSetter.call(selects[1], '1');
            selects[1].dispatchEvent(new Event('change', { bubbles: true }));
            await sleep(400);
          }
        }
        if (!bail()) {
          // Click Continue button
          const continueBtn = findBtn('Continue');
          if (continueBtn) {
            await clickDomEl(continueBtn);
            await sleep(1500);
          }
        }
        if (bail()) { await end(); return; }
      }

      const boardBtn = await waitForEl('[data-tour="board-new-post"]', 8000);
      await sleep(800); if (bail()) { await end(); return; }

      setShowOverlay(true);
      showTip('Free Board', "Community board — post anything, polls, find study buddies.", { center: true, icon: '📋' });
      await pause(2500); if (bail()) { await end(); return; }

      // Open New Post dialog and type demo
      if (boardBtn && !bail()) {
        setTooltip(null); setSpotlight(null); setShowOverlay(false);
        await clickDomEl(boardBtn);
        await sleep(600); if (bail()) { await end(); return; }

        const postDialog = await waitForEl('[role="dialog"]', 5000);
        if (postDialog && !bail()) {
          // Type title
          const titleInput = document.querySelector('[role="dialog"] input[placeholder="Title"]');
          if (titleInput && !bail()) {
            await typeInto('[role="dialog"] input[placeholder="Title"]', 'Looking for study group!');
            await pause(300); if (bail()) { await end(); return; }
          }

          // Type content
          const contentArea = document.querySelector('[role="dialog"] textarea[placeholder="What\'s on your mind?"]');
          if (contentArea && !bail()) {
            await typeInto('[role="dialog"] textarea[placeholder="What\'s on your mind?"]', 'Anyone doing COMP2342 this sem?');
            await pause(400); if (bail()) { await end(); return; }
          }

          // Close dialog without posting
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          await sleep(400);
        }
      }

      if (!bail()) {
        setShowOverlay(true); setCursorVisible(false);
        showTip('Easy!', "Post questions, find teammates, share tips.", { center: true, icon: '✨' });
        await pause(2500); if (bail()) { await end(); return; }
      }

      // ── 13: Flinders Life — click each tab (skip for general users) ──
      const acctType = user?.account_type || user?.user_metadata?.account_type || 'flinders';
      if (acctType === 'general') {
        // Skip Flinders Life for non-Flinders users
        setP(14); setTooltip(null); setSpotlight(null); setCursorVisible(false);
        showTip('All done!', "That's it! The demo room will be cleaned up. Go make your own room!", { center: true, icon: '🎉' });
        await pause(3500);
        persistTutorialSuppression();
        await end();
        return;
      }
      setP(13); setTooltip(null); setSpotlight(null); setCursorVisible(false);
      navigate('/flinders-life');
      showTip('Loading...', "Opening Flinders Life...", { center: true, icon: '⏳' });
      const flTab = await waitForEl('[data-tutorial="flinders-tab-events"], button[value="events"]', 7000);
      await sleep(450); if (bail()) { await end(); return; }

      if (!flTab || bail()) {
        // Flinders Life not available — skip
        showTip('Flinders Life', "Campus info at a glance.", { center: true, icon: '🎓' });
        await pause(2500); if (bail()) { await end(); return; }
      } else {
        // Events tab
        setTooltip(null); setSpotlight(null);
        await clickDomEl(flTab);
        await Promise.race([
          waitForGone('[data-tutorial="flinders-events-loading"]', 1800),
          sleep(1400),
        ]);
        if (bail()) { await end(); return; }
        const evtPanel = document.querySelector('[data-tutorial="flinders-events-content"]')
          || document.querySelector('[data-tutorial="flinders-events-interest-picker"]')
          || document.querySelector('[data-tutorial="flinders-panel-events"]')
          || document.querySelector('[role="tabpanel"]');
        if (evtPanel) {
          const er = evtPanel.getBoundingClientRect();
          setSpotlight({ x: er.left, y: er.top, w: er.width, h: Math.min(er.height, 350), r: 12 });
        }
        showTip('Events', 'Campus events at a glance.', {
          target: '[data-tutorial="flinders-tab-events"]',
          icon: '🎪',
          position: 'bottom',
        });
        await pause(2400); if (bail()) { await end(); return; }

        // Academic Calendar tab
        setTooltip(null); setSpotlight(null);
        const acadTab = document.querySelector('[data-tutorial="flinders-tab-academic-calendar"]')
          || document.querySelector('button[value="academic-calendar"]');
        if (acadTab && !bail()) {
          await clickDomEl(acadTab);
          await sleep(350); if (bail()) { await end(); return; }
          const acadPanel = document.querySelector('[data-tutorial="flinders-academic-calendar-content"]')
            || document.querySelector('[data-tutorial="flinders-panel-academic-calendar"]')
            || document.querySelector('[role="tabpanel"]');
          if (acadPanel) {
            const ar = acadPanel.getBoundingClientRect();
            setSpotlight({ x: ar.left, y: ar.top, w: ar.width, h: Math.min(ar.height, 350), r: 12 });
          }
          showTip('Academic Calendar', 'Semester dates and key deadlines.', {
            target: '[data-tutorial="flinders-tab-academic-calendar"]',
            icon: '📅',
            position: 'bottom',
          });
          await pause(2400); if (bail()) { await end(); return; }
        }

        // Study Rooms tab
        setTooltip(null); setSpotlight(null);
        const studyTab = document.querySelector('[data-tutorial="flinders-tab-study-rooms"]')
          || document.querySelector('button[value="study-rooms"]');
        if (studyTab && !bail()) {
          await clickDomEl(studyTab);
          await sleep(350); if (bail()) { await end(); return; }
          const studyPanel = document.querySelector('[data-tutorial="flinders-study-rooms-content"]')
            || document.querySelector('[data-tutorial="flinders-panel-study-rooms"]')
            || document.querySelector('[role="tabpanel"]');
          if (studyPanel) {
            const str = studyPanel.getBoundingClientRect();
            setSpotlight({ x: str.left, y: str.top, w: str.width, h: Math.min(str.height, 350), r: 12 });
          }
          showTip('Study Rooms', 'Book a study room on campus.', {
            target: '[data-tutorial="flinders-tab-study-rooms"]',
            icon: '📚',
            position: 'bottom',
          });
          await pause(2400); if (bail()) { await end(); return; }
        }
      }

      // ── 14: Done ──
      setP(14); setTooltip(null); setSpotlight(null); setCursorVisible(false);
      showTip('All done!', "That's it! The demo room will be cleaned up. Go make your own room!", { center: true, icon: '🎉' });
      await pause(3500);

      // Persist suppression BEFORE cleanup to avoid race conditions
      persistTutorialSuppression();
      await end();
    } catch (err) {
      // Safety net — if anything crashes, clean up gracefully and suppress future prompts
      console.warn('Tutorial error:', err);
      persistTutorialSuppression();
      try { await cleanup(); } catch { /* ignore */ }
      setActive(false);
    }
  }, [navigate, sleep, pauseFor, waitForEl, waitForGone, moveCursorTo, clickEl, clickDomEl, showTip, typeInto, cleanup, deactivateTutorial, findBtn, simulateClick, resetUI, setSkipEnabled, persistTutorialSuppression]);

  const runTutorialRef = useRef(runTutorial);
  runTutorialRef.current = runTutorial;

  useEffect(() => {
    if (!active) return;
    runTutorialRef.current();
    return () => { cancelRef.current = true; };
  }, [active]);

  const handleStop = useCallback(async (permanent) => {
    if (permanent) persistTutorialSuppression();
    deactivateTutorial();
    // Small delay to let any in-flight sleeps resolve
    await new Promise((r) => setTimeout(r, 200));
    try { await cleanup(); } catch { /* ignore */ }
  }, [cleanup, deactivateTutorial, persistTutorialSuppression]);

  const handleDecline = () => {
    if (session?.is_tester) {
      logoutTester();
      return;
    }
    setShowPrompt(false);
    // Permanently suppress — user said they don't want a tour
    persistTutorialSuppression();
  };
  const handleNeverShow = () => {
    if (session?.is_tester) {
      logoutTester();
      return;
    }
    setShowPrompt(false);
    persistTutorialSuppression();
  };
  const startTutorial = () => {
    clearTutorialSuppression();
    clearTutorialSessionDismiss();
    guardedStartTutorial({ force: true });
  };

  // ── Welcome modal (testers see tutorial prompt instead, regular users skip entirely) ──
  if (showWelcome && !active && !showPrompt && testerModeRef.current) {
    const dismissWelcome = () => {
      localStorage.setItem(WELCOME_KEY, Date.now().toString());
      setShowWelcome(false);
    };
    return (
      <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
        <div className="mx-4 max-h-[calc(100svh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl animate-scale-in sm:p-8">
          <div className="text-center">
            <div className="mx-auto mb-4 h-20 w-20 rounded-full overflow-hidden shadow-lg shadow-indigo-500/30 ring-3 ring-indigo-100">
              <img src={SEAN_IMG} alt="IT-Yun" className="h-full w-full object-cover" />
            </div>
            <h2 className="text-xl font-black text-slate-900">Welcome! 👋</h2>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              Hey <strong>{user?.full_name?.split(' ')[0] || 'there'}</strong>!<br/>
              I'm Sean — I built this app for Flinders students.<br/>
              Hope it helps your team collaboration!
            </p>
          </div>
          <div className="mt-6">
            <button onClick={dismissWelcome} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl transition-all active:scale-[0.98]">
              Let's go!
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Tutorial prompt modal (testers only) ──
  if (showPrompt && !active) {
    return (
      <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
        <div className="mx-4 max-h-[calc(100svh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl animate-scale-in sm:p-8">
          <div className="text-center">
            <div className="mx-auto mb-4 h-20 w-20 rounded-full overflow-hidden shadow-lg shadow-indigo-500/30 ring-3 ring-indigo-100">
              <img src={SEAN_IMG} alt="IT-Yun" className="h-full w-full object-cover" />
            </div>
            <h2 className="text-xl font-black text-slate-900">Hi, I'm Sean!</h2>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              I built this app for Flinders students.<br/>
              Let me give you a quick tour!
            </p>
          </div>
          <div className="mt-6 space-y-2">
            <button onClick={startTutorial} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl transition-all active:scale-[0.98]">
              Show me around!
            </button>
            <button onClick={handleDecline} className="w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-all">
              Exit tester mode
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!active) return null;
  const progressPct = (progress / totalSteps) * 100;

  return (
    <div data-tutorial-root="" style={{ pointerEvents: 'auto' }}>
      {/* ── Fixed top-right control bar ── */}
      <div
        className="fixed right-3 z-[100002] flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center justify-end gap-2 animate-fade-in sm:right-4"
        style={{ pointerEvents: 'auto', top: 'max(0.75rem, calc(env(safe-area-inset-top) + 0.5rem))' }}
      >
        {canSkip && (
          <button
            onClick={() => {
              if (!canSkipRef.current) return;
              skipRef.current = true;
            }}
            className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-[12px] font-bold text-white shadow-lg hover:shadow-xl hover:brightness-110 transition-all active:scale-95"
          >
            Skip →
          </button>
        )}
        <button
          onClick={() => handleStop(true)}
          className="flex items-center gap-1.5 rounded-full bg-white/90 backdrop-blur-sm px-3 py-1.5 text-[11px] font-semibold text-slate-400 shadow-lg border border-white/60 hover:bg-white hover:text-slate-600 transition-all"
        >
          Don't show again
        </button>
        <button
          onClick={() => handleStop(true)}
          className="flex items-center gap-1.5 rounded-full bg-white/90 backdrop-blur-sm px-3 py-1.5 text-[11px] font-semibold text-slate-500 shadow-lg border border-white/60 hover:bg-white hover:text-slate-700 transition-all"
        >
          <X className="h-3 w-3" />
          Exit
        </button>
      </div>

      {/* ── Global pointer-events kill — blocks ALL clicks including Radix portals ── */}
      <style>{`
        body > *:not([data-tutorial-root]) { pointer-events: none !important; }
        [data-radix-portal] { pointer-events: none !important; }
        [data-radix-portal] * { pointer-events: none !important; }
      `}</style>
      <div
        className="fixed inset-0"
        style={{ zIndex: 99998, pointerEvents: 'auto' }}
        onClick={swallowPointer}
        onMouseDown={swallowPointer}
        onPointerDown={swallowPointer}
      />

      {/* ── Dark overlay with spotlight — only when showOverlay is true ── */}
      {showOverlay && (
        <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 99999 }}>
          <svg className="absolute inset-0 w-full h-full">
            <defs>
              <mask id="tutorial-mask">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                {spotlight && <rect x={spotlight.x} y={spotlight.y} width={spotlight.w} height={spotlight.h} rx={spotlight.r} fill="black" style={{ transition: 'all 0.4s cubic-bezier(0.4,0,0.2,1)' }} />}
              </mask>
            </defs>
            <rect x="0" y="0" width="100%" height="100%" fill="rgba(15,23,42,0.55)" mask="url(#tutorial-mask)" />
            {spotlight && <rect x={spotlight.x} y={spotlight.y} width={spotlight.w} height={spotlight.h} rx={spotlight.r} fill="none" stroke="rgba(165,180,252,0.5)" strokeWidth="2" style={{ transition: 'all 0.4s cubic-bezier(0.4,0,0.2,1)' }} />}
          </svg>
        </div>
      )}

      {/* ── Cursor ── */}
      {cursorVisible && (
        <div className="fixed pointer-events-none" style={{ zIndex: 100001, left: cursorPos.x - 6, top: cursorPos.y - 2, transition: 'left 0.5s cubic-bezier(0.34,1.56,0.64,1), top 0.5s cubic-bezier(0.34,1.56,0.64,1), transform 0.15s ease', transform: `scale(${cursorScale})` }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}>
            <path d="M5 3L19 12L12 13L9 20L5 3Z" fill="white" stroke="rgb(79,70,229)" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <div className="absolute top-0 left-0 w-6 h-6 rounded-full bg-indigo-400/30 animate-ping" />
        </div>
      )}

      {/* ── Tooltip ── */}
      {tooltip && (
        <div
          className="fixed animate-fade-in"
          style={{
            ...tooltip.style,
            zIndex: 100000,
            pointerEvents: 'none',
            maxHeight: 'calc(100svh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 1.5rem)',
          }}
        >
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_25px_60px_-12px_rgba(0,0,0,0.4)]" style={{ minWidth: 290, maxHeight: 'inherit' }}>
            <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500">
              <div className="h-full bg-white/40 transition-all duration-700" style={{ width: `${100 - progressPct}%`, marginLeft: 'auto' }} />
            </div>
            <div className="max-h-[inherit] overflow-y-auto px-4 py-3.5 sm:px-5 sm:py-4">
              <div className="flex items-center gap-2.5 mb-2">
                {tooltip.icon && <span className="text-2xl">{tooltip.icon}</span>}
                <h3 className="text-[17px] font-black text-slate-950 tracking-tight leading-snug">{tooltip.title}</h3>
              </div>
              <p className="pl-[34px] text-[13px] font-semibold leading-[1.65] text-slate-800 sm:text-[14px] sm:leading-[1.7]">{tooltip.desc}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
