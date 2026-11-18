import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, LogOut, Menu, Users, ChevronRight, Shield, User, CalendarClock, CalendarDays, MapPinned, Wrench, GraduationCap, Settings, Mail, X, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { socket } from '@/lib/socket';
import ProfileDialog from '@/components/ProfileDialog';

import { getRoomActivitySummary, getRooms } from '@/services/rooms';
import { getUpcomingEventCount } from '@/services/events';
import { applyRoomOrder } from '@/lib/room-order';
import { getCachedPreferences, hydratePreferences } from '@/lib/preferences';
import { avatarThumb } from '@/lib/avatar';
import { preloadRoute } from '@/lib/route-preload';
import { getUnreadCounts, getActiveAnnouncements } from '@/services/announcements';
import { syncAppBadge } from '@/lib/app-badge';

const ROOM_NAVIGATION_UPDATED_EVENT = 'rooms-updated';
const APP_SOFT_REFRESH_EVENT = 'app-soft-refresh';
const PULL_REFRESH_MIN_DRAG = 18;
const PULL_REFRESH_READY_DISTANCE = 108;
const PULL_REFRESH_MAX_DISTANCE = 120;

const roomPalettes = [
  { softBg: '#fff1f6', softBorder: '#fbcfe8', text: '#831843', icon: '#9d174d' },
  { softBg: '#f0f9ff', softBorder: '#bae6fd', text: '#0c4a6e', icon: '#075985' },
  { softBg: '#f0fdf4', softBorder: '#bbf7d0', text: '#14532d', icon: '#166534' },
  { softBg: '#fffbeb', softBorder: '#fde68a', text: '#78350f', icon: '#92400e' },
  { softBg: '#f5f3ff', softBorder: '#ddd6fe', text: '#4c1d95', icon: '#5b21b6' },
  { softBg: '#f0fdfa', softBorder: '#ccfbf1', text: '#134e4a', icon: '#0f766e' },
];

function getRoomPalette(room) {
  const seed = `${room.id || ''}-${room.name || ''}`;
  const hash = [...seed].reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) % roomPalettes.length, 0);
  return roomPalettes[Math.abs(hash) % roomPalettes.length];
}

function NavItem({ to, isActive, icon: Icon, label, palette, badgeCount = 0, badgeLabel = '', onIntent, tourId }) {
  const roomStyle = palette
    ? isActive
      ? { background: palette.icon + '22' }
      : undefined
    : undefined;

  const activeAccentColor = palette ? palette.icon : '#818cf8';
  const hasBadge = Boolean(badgeLabel) || badgeCount > 0;

  return (
    <Link to={to}>
      <button
        data-tour={tourId}
        onMouseEnter={onIntent}
        onFocus={onIntent}
        onTouchStart={onIntent}
        className={`
          group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-smooth
          ${isActive
            ? 'bg-white/15 text-white font-semibold'
            : 'text-slate-400 hover:text-white hover:bg-white/10'
          }
        `}
        style={roomStyle}
        role="link"
        aria-current={isActive ? 'page' : undefined}
      >
        {isActive && (
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
            style={{ backgroundColor: activeAccentColor }}
          />
        )}
        {palette && (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              backgroundColor: palette.icon,
              boxShadow: isActive ? `0 0 8px ${palette.icon}88` : undefined,
            }}
          />
        )}
        <Icon
          className={`h-[18px] w-[18px] shrink-0 transition-smooth ${
            isActive
              ? palette ? 'text-white' : 'text-indigo-400'
              : 'text-slate-500 group-hover:text-slate-300'
          }`}
        />
        <span className="min-w-0 flex flex-1 items-center gap-1.5">
          <span className="min-w-0 truncate">{label}</span>
          {hasBadge && (
            badgeLabel
              ? <span className="inline-flex h-[16px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[8px] font-bold text-white shadow-sm whitespace-nowrap shrink-0">
                  {badgeLabel}
                </span>
              : <span className="inline-flex h-5 min-w-5 max-w-[5.5rem] items-center justify-center rounded-full bg-rose-500 px-2 text-[10px] font-bold tabular-nums text-white shadow-sm whitespace-nowrap shrink-0">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
          )}
        </span>
        <ChevronRight className={`ml-2 h-3.5 w-3.5 shrink-0 text-slate-400 transition-opacity ${isActive ? 'opacity-40' : 'opacity-0'}`} />
      </button>
    </Link>
  );
}

function SidebarContent({ rooms, location, isAdmin, roomBadgeCounts = {}, user, deadlineCount = 0, dmUnreadCount = 0, dmMessageBadge = 0 }) {
  return (
    <nav className="flex flex-col gap-1" role="navigation" aria-label="Main navigation" data-tour="sidebar-nav">
      <NavItem
        to="/dashboard"
        isActive={location.pathname === '/dashboard'}
        icon={LayoutDashboard}
        label="Room Hub"
        tourId="nav-room-hub"
        onIntent={() => preloadRoute('/dashboard')}
      />
      <NavItem
        to="/deadlines"
        isActive={location.pathname === '/deadlines'}
        icon={CalendarClock}
        label="Deadlines"
        tourId="nav-deadlines"
        badgeCount={deadlineCount}
        onIntent={() => preloadRoute('/deadlines')}
      />
      {(user?.account_type || user?.user_metadata?.account_type || 'flinders') !== 'general' && (
        <NavItem
          to="/timetable"
          isActive={location.pathname === '/timetable'}
          icon={CalendarDays}
          label="Timetable Buddy"
          tourId="nav-timetable"
          badgeLabel="NEW!"
          onIntent={() => preloadRoute('/timetable')}
        />
      )}
      <NavItem
        to="/board"
        isActive={location.pathname === '/board'}
        icon={MapPinned}
        label="Where are you?"
        tourId="nav-social"
        badgeLabel="NEW!"
        onIntent={() => preloadRoute('/board')}
      />
      {(user?.account_type || user?.user_metadata?.account_type || 'flinders') !== 'general' && (
        <NavItem
          to="/flinders-life"
          isActive={location.pathname === '/flinders-life'}
          icon={GraduationCap}
          label="Flinders Life"
          tourId="nav-life"
          onIntent={() => preloadRoute('/flinders-life')}
        />
      )}
      <NavItem
        to="/messages"
        isActive={location.pathname === '/messages'}
        icon={Mail}
        label="Messages"
        tourId="nav-messages"
        badgeCount={dmUnreadCount + (dmMessageBadge || 0)}
        onIntent={() => preloadRoute('/messages')}
      />
      {/* Room section divider */}
      <div className="mt-5 mb-1 flex items-center gap-2 px-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
          Your Rooms
        </span>
        <div className="h-px flex-1 bg-white/5" />
        {rooms.filter((r) => r.room_type !== 'direct' && r.room_type !== 'topic').length > 0 && (
          <span className="text-[10px] tabular-nums text-slate-500 bg-white/10 px-1.5 py-0.5 rounded-md">
            {rooms.filter((r) => r.room_type !== 'direct' && r.room_type !== 'topic').length}
          </span>
        )}
      </div>

      {/* Room list (exclude DM + topic rooms — those appear in Messages / Timetable) */}
      <div className="flex flex-col gap-0.5" data-tour="sidebar-rooms">
        {rooms.filter((r) => r.room_type !== 'direct' && r.room_type !== 'topic').map((room) => {
          const unread = roomBadgeCounts[room.id] || 0;
          return (
            <div key={room.id} className="relative">
              <NavItem
                to={`/rooms/${room.id}`}
                isActive={location.pathname === `/rooms/${room.id}`}
                icon={Users}
                label={room.name}
                palette={getRoomPalette(room)}
                onIntent={() => preloadRoute(`/rooms/${room.id}`)}
              />
              {unread > 0 && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white shadow-sm">
                  {unread}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {rooms.length === 0 && (
        <div className="mx-3 mt-1 rounded-lg border border-dashed border-white/10 px-4 py-5 text-center">
          <Users className="mx-auto h-5 w-5 text-slate-500 mb-1.5 opacity-50" />
          <p className="text-xs text-slate-400">No rooms yet</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Create or join a room to start</p>
        </div>
      )}

      <div className="mt-5 mb-1 flex items-center gap-2 px-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
          Preferences
        </span>
        <div className="h-px flex-1 bg-white/5" />
      </div>
      <NavItem
        to="/settings"
        isActive={location.pathname === '/settings'}
        icon={Settings}
        label="Settings"
        onIntent={() => preloadRoute('/settings')}
      />

      {/* Admin - only visible to admins */}
      {isAdmin && (
        <>
          <div className="mt-5 mb-1 flex items-center gap-2 px-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Admin</span>
            <div className="h-px flex-1 bg-white/5" />
          </div>
          <NavItem to="/admin" isActive={location.pathname === '/admin'} icon={Shield} label="Admin Panel" onIntent={() => preloadRoute('/admin')} />
        </>
      )}
    </nav>
  );
}

function getPageLabel(pathname) {
  if (pathname.startsWith('/rooms/')) return 'Room';
  if (pathname === '/dashboard') return 'Room Hub';
  if (pathname === '/deadlines') return 'Deadlines';
  if (pathname === '/timetable') return 'Timetable';
  if (pathname === '/board') return 'Where are you?';
  if (pathname === '/flinders-life') return 'Flinders Life';
  if (pathname === '/messages') return 'Messages';
  if (pathname === '/settings') return 'Settings';
  if (pathname === '/admin') return 'Admin';
  return 'Flinders Collab';
}

const BANNER_ICONS = { info: Info, warning: AlertTriangle, success: CheckCircle2 };
const BANNER_STYLES = {
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
};

function GlobalAnnouncementsBanner() {
  const [announcements, setAnnouncements] = useState([]);
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dismissed-announcements') || '[]'); } catch { return []; }
  });

  useEffect(() => {
    getActiveAnnouncements().then(setAnnouncements).catch(() => {});
  }, []);

  const visible = announcements.filter((a) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  const dismiss = (id) => {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem('dismissed-announcements', JSON.stringify(next));
  };

  return (
    <div className="space-y-2 px-2 pt-2 sm:px-4">
      {visible.map((a) => {
        const Icon = BANNER_ICONS[a.type] || Info;
        const style = BANNER_STYLES[a.type] || BANNER_STYLES.info;
        return (
          <div key={a.id} className={`relative flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${style}`}>
            <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              {a.title && <p className="font-semibold">{a.title}</p>}
              {a.content && <p className="text-xs opacity-80">{a.content}</p>}
            </div>
            <button onClick={() => dismiss(a.id)} className="ml-1 flex-shrink-0 opacity-60 hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default function MainLayout({ children }) {
  const { user, session, logout, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mainScrollRef = useRef(null);
  const [rooms, setRooms] = useState([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [maintenance, setMaintenance] = useState(null); // { type, message, minutesUntil }
  const [announcementUnreadCounts, setAnnouncementUnreadCounts] = useState({});
  const [recentActivityCounts, setRecentActivityCounts] = useState({});
  const [deadlineCount, setDeadlineCount] = useState(0);
  const [roomLastVisitedMap, setRoomLastVisitedMap] = useState({});
  const [roomOrderIds, setRoomOrderIds] = useState([]);
  const pullStartYRef = useRef(null);
  const pullDistanceRef = useRef(0);
  const pullTriggeredRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [avatarRenderKey, setAvatarRenderKey] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  const syncRoomVisitState = useCallback((roomList = []) => {
    setRoomLastVisitedMap((prev) => {
      const next = { ...prev };
      roomList.forEach((room) => {
        const timestamp = room?.last_visited_at ? new Date(room.last_visited_at).getTime() : 0;
        next[room.id] = Number.isFinite(timestamp) ? timestamp : 0;
      });
      return next;
    });
  }, []);

  const refreshRooms = async () => {
    const data = await getRooms();
    const nextRooms = data.rooms || data || [];
    syncRoomVisitState(nextRooms);
    setRooms(applyRoomOrder(nextRooms, roomOrderIds));
  };

  const refreshDeadlineCount = async () => {
    try {
      const data = await getUpcomingEventCount();
      setDeadlineCount(Number(data?.count || 0));
    } catch {
      setDeadlineCount(0);
    }
  };

  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;

  const locationRef = useRef(location);
  locationRef.current = location;

  const refreshRecentActivityCounts = useCallback(async (targetRooms) => {
    if (!user?.id) {
      setRecentActivityCounts({});
      return;
    }

    const resolvedRooms = targetRooms || roomsRef.current;
    try {
      const summary = await getRoomActivitySummary();
      // Exclude the room the user is currently viewing
      const currentRoomMatch = locationRef.current.pathname.match(/^\/rooms\/(.+)$/);
      const currentRoomId = currentRoomMatch?.[1] || null;
      const next = {};
      resolvedRooms.forEach((room) => {
        if (room.id === currentRoomId) return; // skip current room
        const count = Number(summary?.[room.id] || 0);
        if (count > 0) next[room.id] = count;
      });
      setRecentActivityCounts(next);
    } catch {
      setRecentActivityCounts({});
    }
  }, [user?.id]);

  const roomBadgeCounts = useMemo(() => {
    const next = {};
    const roomIds = new Set([
      ...Object.keys(announcementUnreadCounts || {}),
      ...Object.keys(recentActivityCounts || {}),
    ]);

    roomIds.forEach((roomId) => {
      const count = (announcementUnreadCounts[roomId] || 0) + (recentActivityCounts[roomId] || 0);
      if (count > 0) next[roomId] = count;
    });

    return next;
  }, [announcementUnreadCounts, recentActivityCounts]);

  // DM unread badge: sum of badges for rooms with room_type='direct' + real-time socket count
  const dmUnreadCount = useMemo(() => {
    const activityCount = rooms
      .filter((r) => r.room_type === 'direct')
      .reduce((sum, r) => sum + (roomBadgeCounts[r.id] || 0), 0);
    return activityCount;
  }, [rooms, roomBadgeCounts]);

  const totalAppBadgeCount = useMemo(() => {
    const roomUnreadTotal = Object.values(roomBadgeCounts).reduce((sum, value) => sum + Number(value || 0), 0);
    return roomUnreadTotal + dmUnreadCount;
  }, [roomBadgeCounts, dmUnreadCount]);

  const mobileUnreadItems = useMemo(() => {
    const items = [];

    rooms.forEach((room) => {
      if (room.room_type === 'direct' || room.room_type === 'topic') return;
      const count = Number(roomBadgeCounts[room.id] || 0);
      if (count <= 0) return;
      items.push({
        key: room.id,
        label: room.name,
        count,
        to: `/rooms/${room.id}`,
        accentClass: 'bg-amber-50 text-amber-800 border-amber-200',
      });
    });

    return items;
  }, [roomBadgeCounts, rooms]);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    const hydrateInitialState = async () => {
      // Fetch preferences and rooms in parallel instead of sequentially
      const [preferences, data] = await Promise.all([
        hydratePreferences().catch(() => getCachedPreferences()),
        getRooms(),
      ]);
      if (cancelled) return;
      const orderedIds = Array.isArray(preferences?.room_order) ? preferences.room_order : [];
      setRoomOrderIds(orderedIds);

      const nextRooms = data.rooms || data || [];
      syncRoomVisitState(nextRooms);
      setRooms(applyRoomOrder(nextRooms, orderedIds));

      refreshDeadlineCount().catch(() => {});
    };

    hydrateInitialState().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [refreshDeadlineCount, syncRoomVisitState, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setRecentActivityCounts({});
      return;
    }
    if (rooms.length === 0) {
      setRecentActivityCounts({});
      return;
    }
    refreshRecentActivityCounts(rooms).catch(() => {});
  }, [rooms, user?.id]);

  useEffect(() => {
    const handleRoomOrderUpdated = (event) => {
      const detail = event.detail || {};
      if (detail.userId && detail.userId !== user?.id) {
        return;
      }

      const nextOrder = Array.isArray(detail.orderedIds) ? detail.orderedIds : roomOrderIds;
      setRoomOrderIds(nextOrder);
      setRooms((prev) => applyRoomOrder(prev, nextOrder));
    };

    const handleRoomsUpdated = (event) => {
      const detail = event.detail || {};
      if (detail.userId && detail.userId !== user?.id) {
        return;
      }

      if (Array.isArray(detail.rooms)) {
        syncRoomVisitState(detail.rooms);
        const orderedIds = Array.isArray(detail.orderedIds) ? detail.orderedIds : roomOrderIds;
        setRoomOrderIds(orderedIds);
        setRooms(applyRoomOrder(detail.rooms, orderedIds));
        refreshDeadlineCount().catch(() => {});
        refreshRecentActivityCounts(detail.rooms).catch(() => {});
        return;
      }

      refreshRooms().catch(() => {});
      refreshDeadlineCount().catch(() => {});
      refreshRecentActivityCounts().catch(() => {});
    };

    // Debounce window focus to avoid excessive refetches (min 30s between)
    let lastFocusRefresh = 0;
    const handleWindowFocus = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastFocusRefresh < 30000) return;
      lastFocusRefresh = now;
      Promise.all([
        refreshRooms(),
        refreshDeadlineCount(),
        refreshRecentActivityCounts(),
      ]).catch(() => {});
    };

    const handleRoomActivityVisited = (event) => {
      const { roomId, timestamp } = event.detail || {};
      if (!roomId) return;
      const safeTimestamp = Number(timestamp || Date.now());
      setRoomLastVisitedMap((prev) => ({ ...prev, [roomId]: safeTimestamp }));
      setRecentActivityCounts((prev) => {
        if (!(roomId in prev)) return prev;
        const next = { ...prev };
        delete next[roomId];
        return next;
      });
      setAnnouncementUnreadCounts((prev) => {
        if (!(roomId in prev)) return prev;
        const next = { ...prev };
        delete next[roomId];
        return next;
      });
    };

    window.addEventListener('room-order-updated', handleRoomOrderUpdated);
    window.addEventListener(ROOM_NAVIGATION_UPDATED_EVENT, handleRoomsUpdated);
    window.addEventListener('room-activity-visited', handleRoomActivityVisited);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleWindowFocus);

    return () => {
      window.removeEventListener('room-order-updated', handleRoomOrderUpdated);
      window.removeEventListener(ROOM_NAVIGATION_UPDATED_EVENT, handleRoomsUpdated);
      window.removeEventListener('room-activity-visited', handleRoomActivityVisited);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleWindowFocus);
    };
  }, [refreshDeadlineCount, refreshRecentActivityCounts, roomOrderIds, syncRoomVisitState, user?.id]);

  // Fetch unread announcement counts for sidebar badges
  useEffect(() => {
    const fetchUnreadCounts = async () => {
      try {
        const counts = await getUnreadCounts();
        setAnnouncementUnreadCounts(counts || {});
      } catch { /* silent */ }
    };
    fetchUnreadCounts();

    const handleAnnouncementsRead = (e) => {
      const { roomId } = e.detail || {};
      if (roomId) {
        setAnnouncementUnreadCounts(prev => {
          const next = { ...prev };
          delete next[roomId];
          return next;
        });
      }
    };
    window.addEventListener('announcements-read', handleAnnouncementsRead);
    return () => window.removeEventListener('announcements-read', handleAnnouncementsRead);
  }, []);

  useEffect(() => {
    syncAppBadge(totalAppBadgeCount).catch(() => {});
  }, [totalAppBadgeCount]);

  // Join DM rooms for real-time message badge updates
  const [dmMessageBadge, setDmMessageBadge] = useState(0);
  useEffect(() => {
    const dmRooms = rooms.filter((r) => r.room_type === 'direct');
    if (dmRooms.length === 0) return;

    // Join all DM rooms so we receive messages
    dmRooms.forEach((r) => socket.emit('chat:join', { roomId: r.id }));

    const handleDmMessage = (msg) => {
      if (msg.user_id === user?.id) return;
      const isDm = dmRooms.some((r) => r.id === msg.room_id);
      if (isDm && location.pathname !== '/messages') {
        setDmMessageBadge((prev) => prev + 1);
      }
    };

    socket.on('chat:message', handleDmMessage);
    return () => {
      socket.off('chat:message', handleDmMessage);
      dmRooms.forEach((r) => socket.emit('chat:leave', { roomId: r.id }));
    };
  }, [rooms, user?.id, location.pathname]);

  // Clear DM badge when visiting messages page
  useEffect(() => {
    const handleProfileUpdated = () => {
      setAvatarRenderKey((value) => value + 1);
    };

    window.addEventListener('profile-updated', handleProfileUpdated);
    return () => window.removeEventListener('profile-updated', handleProfileUpdated);
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      if (socket.connected) {
        socket.disconnect();
      }
      return undefined;
    }

    socket.auth = { token: session.access_token };
    if (!socket.connected) {
      socket.connect();
    }

    const handleRemoteProfileUpdated = () => {
      refreshProfile().catch(() => {});
      setAvatarRenderKey((value) => value + 1);
    };

    socket.on('profile:updated', handleRemoteProfileUpdated);
    return () => {
      socket.off('profile:updated', handleRemoteProfileUpdated);
    };
  }, [refreshProfile, session?.access_token]);

  // Clear badges immediately when navigating to pages
  useEffect(() => {
    if (location.pathname === '/messages') {
      setDmMessageBadge(0);
    }
    // Clear room badge instantly on room enter (don't wait for API)
    const roomMatch = location.pathname.match(/^\/rooms\/(.+)$/);
    if (roomMatch) {
      const roomId = roomMatch[1];
      setRecentActivityCounts((prev) => {
        if (!(roomId in prev)) return prev;
        const next = { ...prev };
        delete next[roomId];
        return next;
      });
      setAnnouncementUnreadCounts((prev) => {
        if (!(roomId in prev)) return prev;
        const next = { ...prev };
        delete next[roomId];
        return next;
      });
    }
  }, [location.pathname]);

  // Listen for maintenance notifications via Socket.IO
  useEffect(() => {
    const onUpcoming = (data) => {
      setMaintenance({
        type: 'upcoming',
        message: `DB optimization in ${data.minutesUntil} min (est. ${data.estimatedDuration})`,
      });
    };
    const onStarted = () => {
      setMaintenance({
        type: 'started',
        message: 'DB optimization in progress...',
      });
    };
    const onDone = (data) => {
      setMaintenance({
        type: 'done',
        message: `DB optimization complete (${(data.duration / 1000).toFixed(1)}s)`,
      });
      setTimeout(() => setMaintenance(null), 10000);
    };

    socket.on('maintenance:upcoming', onUpcoming);
    socket.on('maintenance:started', onStarted);
    socket.on('maintenance:done', onDone);

    return () => {
      socket.off('maintenance:upcoming', onUpcoming);
      socket.off('maintenance:started', onStarted);
      socket.off('maintenance:done', onDone);
    };
  }, []);

  const handleLogout = () => {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutOpen(false);
    try { logout(); } catch {}
    // Force full navigation to /login to clear all React state
    window.location.href = '/login';
  };

  const initials = user?.user_metadata?.name
    ? user.user_metadata.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || '?';

  const displayName = user?.user_metadata?.name || user?.email;
  const currentPageLabel = getPageLabel(location.pathname);
  const canPullToRefresh = typeof window !== 'undefined' && window.innerWidth < 768;
  const pullReady = pullDistance >= PULL_REFRESH_READY_DISTANCE;

  const resetPullState = useCallback(() => {
    pullStartYRef.current = null;
    pullDistanceRef.current = 0;
    pullTriggeredRef.current = false;
    setPullDistance(0);
  }, []);

  const handleMainTouchStart = useCallback((event) => {
    if (!canPullToRefresh || isPullRefreshing) return;
    const scrollTop = mainScrollRef.current?.scrollTop || 0;
    if (scrollTop > 0) {
      pullStartYRef.current = null;
      return;
    }
    pullStartYRef.current = event.touches[0]?.clientY ?? null;
    pullTriggeredRef.current = false;
  }, [canPullToRefresh, isPullRefreshing]);

  const handleMainTouchMove = useCallback((event) => {
    if (!canPullToRefresh || isPullRefreshing) return;
    if (pullStartYRef.current == null) return;

    const scrollTop = mainScrollRef.current?.scrollTop || 0;
    if (scrollTop > 0) {
      resetPullState();
      return;
    }

    const currentY = event.touches[0]?.clientY ?? pullStartYRef.current;
    const delta = currentY - pullStartYRef.current;
    if (delta <= 0) {
      setPullDistance(0);
      pullDistanceRef.current = 0;
      return;
    }

    if (delta < PULL_REFRESH_MIN_DRAG) {
      setPullDistance(0);
      pullDistanceRef.current = 0;
      pullTriggeredRef.current = false;
      return;
    }

    const nextDistance = Math.min((delta - PULL_REFRESH_MIN_DRAG) * 0.32, PULL_REFRESH_MAX_DISTANCE);
    pullDistanceRef.current = nextDistance;
    setPullDistance(nextDistance);
    if (nextDistance >= PULL_REFRESH_READY_DISTANCE) {
      pullTriggeredRef.current = true;
    }
  }, [canPullToRefresh, isPullRefreshing, resetPullState]);

  const handleMainTouchEnd = useCallback(() => {
    if (!canPullToRefresh || isPullRefreshing) {
      resetPullState();
      return;
    }

    if (pullTriggeredRef.current) {
      setIsPullRefreshing(true);
      setPullDistance(56);
      Promise.allSettled([
        refreshRooms(),
        refreshDeadlineCount(),
        refreshRecentActivityCounts(),
      ]).finally(() => {
        window.dispatchEvent(new CustomEvent(APP_SOFT_REFRESH_EVENT, {
          detail: { path: location.pathname, at: Date.now() },
        }));
        window.setTimeout(() => {
          setIsPullRefreshing(false);
          resetPullState();
        }, 250);
      });
      return;
    }

    resetPullState();
  }, [
    canPullToRefresh,
    isPullRefreshing,
    location.pathname,
    refreshDeadlineCount,
    refreshRecentActivityCounts,
    refreshRooms,
    resetPullState,
  ]);

  return (
    <div className="app-shell overflow-x-safe flex bg-background">
      {/* Desktop Sidebar */}
      <aside className="app-shell hidden w-64 shrink-0 flex-col overflow-hidden bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950 md:flex">
        {/* Sidebar header / brand */}
        <div className="flex h-16 items-center gap-3 px-5">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-white p-1 shadow-lg flex items-center justify-center">
            <img
              src="/images/flinders-logo.png"
              alt="Flinders"
              className="h-full w-full object-contain"
              onError={(e) => { e.target.parentElement.style.display = 'none'; }}
            />
          </div>
          <span className="text-[15px] font-bold tracking-tight text-white">
            Flinders Collab
          </span>
        </div>
        <div className="h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent mx-3" />

        {/* Sidebar navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-4 custom-scrollbar">
          <SidebarContent rooms={rooms} location={location} isAdmin={user?.is_admin} roomBadgeCounts={roomBadgeCounts} user={user} deadlineCount={deadlineCount} dmUnreadCount={dmUnreadCount} dmMessageBadge={dmMessageBadge} />
        </div>

        {/* Sidebar footer / user info */}
        <div className="mt-auto border-t border-white/5 bg-gradient-to-t from-indigo-950 via-slate-900 to-slate-900/95 px-3 py-3 backdrop-blur">
          <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/5 px-3 py-3 shadow-inner shadow-black/10">
            <Avatar className="h-8 w-8 ring-2 ring-indigo-500/50 shadow-lg shadow-indigo-500/20">
              {user?.user_metadata?.avatar_url && (
                <AvatarImage key={`sidebar-${avatarRenderKey}-${user.user_metadata.avatar_url}`} src={avatarThumb(user.user_metadata.avatar_url)} alt="Profile" className="object-cover" />
              )}
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-[11px] font-bold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-[13px] font-semibold leading-tight text-white">{user?.user_metadata?.name || 'Student'}</p>
              <p className="truncate text-[11px] text-slate-400">{user?.email}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        <header
          className="sticky top-0 z-30 flex min-h-[3.5rem] shrink-0 items-center justify-between gap-2 border-b-2 border-slate-200 bg-white/90 backdrop-blur-xl sm:min-h-16 sm:gap-3"
          style={{
            paddingTop: 'max(0.375rem, var(--safe-top))',
            paddingBottom: '0.375rem',
            paddingLeft: 'max(0.75rem, var(--safe-left))',
            paddingRight: 'max(0.75rem, var(--safe-right))',
          }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="app-shell flex w-[88vw] max-w-72 flex-col overflow-hidden border-r-0 bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950 p-0">
                <SheetHeader
                  className="shrink-0 px-5 pb-4 pt-4"
                  style={{
                    paddingTop: 'max(0.875rem, var(--safe-top))',
                    paddingLeft: 'max(1.25rem, var(--safe-left))',
                    paddingRight: 'max(1.25rem, var(--safe-right))',
                  }}
                >
                  <SheetTitle className="flex items-center gap-2.5 text-left">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-white p-1 shadow-lg flex items-center justify-center">
                      <img
                        src="/images/flinders-logo.png"
                        alt="Flinders"
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <span className="text-[15px] font-bold tracking-tight text-white">Flinders Collab</span>
                  </SheetTitle>
                </SheetHeader>
                <div className="h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent mx-3" />
                <div className="px-3 py-4">
                  <SidebarContent rooms={rooms} location={location} isAdmin={user?.is_admin} roomBadgeCounts={roomBadgeCounts} user={user} deadlineCount={deadlineCount} dmUnreadCount={dmUnreadCount} dmMessageBadge={dmMessageBadge} />
                </div>
              </SheetContent>
            </Sheet>
            <div className="min-w-0 md:hidden">
              <span className="block truncate text-sm font-semibold">{currentPageLabel}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {displayName}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Maintenance notification */}
          {maintenance && (
            <div className={`hidden sm:flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium animate-fade-in ${
              maintenance.type === 'upcoming' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
              maintenance.type === 'started' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
              'bg-green-50 text-green-700 border border-green-200'
            }`}>
              <Wrench className={`h-3.5 w-3.5 ${maintenance.type === 'started' ? 'animate-spin' : ''}`} />
              <span>{maintenance.message}</span>
              {maintenance.type !== 'started' && (
                <button onClick={() => setMaintenance(null)} className="ml-1 text-current opacity-50 hover:opacity-100">&times;</button>
              )}
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-1.5 rounded-full px-1.5 sm:gap-2.5 sm:px-2 sm:pr-3 hover:bg-muted" aria-label="User menu" data-tour="user-menu">
                <Avatar className="h-8 w-8 ring-2 ring-white shadow-sm">
                  {user?.user_metadata?.avatar_url && (
                    <AvatarImage key={`header-${avatarRenderKey}-${user.user_metadata.avatar_url}`} src={avatarThumb(user.user_metadata.avatar_url)} alt="Profile" className="object-cover" />
                  )}
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-[10px] font-bold text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden max-w-[160px] truncate text-sm font-medium sm:inline">{displayName}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 rounded-xl shadow-xl border-border/40 p-1.5">
              <div className="px-3 py-2">
                <p className="text-sm font-medium">{user?.user_metadata?.name || 'Student'}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setLogoutOpen(true)} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </header>

        {/* Mobile maintenance notification */}
        {maintenance && (
          <div className={`sm:hidden flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium ${
            maintenance.type === 'upcoming' ? 'bg-amber-50 text-amber-700' :
            maintenance.type === 'started' ? 'bg-blue-50 text-blue-700' :
            'bg-green-50 text-green-700'
          }`}>
            <div className="flex items-center gap-2">
              <Wrench className={`h-3.5 w-3.5 shrink-0 ${maintenance.type === 'started' ? 'animate-spin' : ''}`} />
              <span>{maintenance.message}</span>
            </div>
            {maintenance.type !== 'started' && (
              <button onClick={() => setMaintenance(null)} className="text-current opacity-50 hover:opacity-100 shrink-0">&times;</button>
            )}
          </div>
        )}

        {mobileUnreadItems.length > 0 && location.pathname !== '/messages' && (
          <div className="border-b border-slate-200/70 bg-white/92 px-2.5 py-1.5 backdrop-blur md:hidden">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Updates
              </span>
              <span className="text-[10px] text-slate-400">
                Tap to open
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {mobileUnreadItems.slice(0, 4).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigate(item.to)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm ${item.accentClass}`}
                >
                  <span className="max-w-[9.5rem] truncate">{item.label}</span>
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-bold">
                    {item.count > 99 ? '99+' : item.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Main Content */}
        <main
          ref={mainScrollRef}
          data-main-scroll-container="true"
          className="relative flex-1 overflow-y-auto bg-slate-50 p-2 pb-4 sm:p-4 md:p-6 custom-scrollbar animate-fade-in"
          onTouchStart={handleMainTouchStart}
          onTouchMove={handleMainTouchMove}
          onTouchEnd={handleMainTouchEnd}
          onTouchCancel={handleMainTouchEnd}
          style={{
            paddingTop: '0.375rem',
            paddingBottom: 'max(1rem, var(--safe-bottom))',
            paddingLeft: 'max(0.5rem, var(--safe-left))',
            paddingRight: 'max(0.5rem, var(--safe-right))',
          }}
        >
          <div
            className={`pointer-events-none sticky top-0 z-20 mx-auto flex w-full max-w-xs items-center justify-center overflow-hidden transition-all duration-200 ${pullDistance > 0 || isPullRefreshing ? 'opacity-100' : 'opacity-0'}`}
            style={{
              height: `${isPullRefreshing ? 3.5 : Math.max(0, pullDistance)}rem`,
            }}
          >
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm">
              <div className={`h-2.5 w-2.5 rounded-full ${isPullRefreshing ? 'animate-pulse bg-blue-500' : pullReady ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span>{isPullRefreshing ? 'Refreshing...' : pullReady ? 'Release to refresh' : 'Pull to refresh'}</span>
            </div>
          </div>
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              background: 'radial-gradient(ellipse at 20% 0%, rgba(99,102,241,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(59,130,246,0.06) 0%, transparent 50%)',
            }}
          />
          <GlobalAnnouncementsBanner />
          <div className="relative">
            {children}
          </div>
        </main>
      </div>

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />

      {/* Logout confirmation */}
      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign Out</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to sign out? You will need to log in again to access your rooms.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout} disabled={logoutPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {logoutPending ? 'Signing out...' : 'Yes, Sign Out'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
