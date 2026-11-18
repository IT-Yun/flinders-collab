import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import MemberList from '@/components/room/MemberList';
import { getQuickLinks, getMembers, getRoom, getRoomActivity, markRoomVisited as markRoomVisitedApi, leaveRoom } from '@/services/rooms';

// Lazy-load heavy tab components to reduce initial bundle (~150-200KB savings)
const TaskList = lazy(() => import('@/components/room/TaskList'));
const ScheduleCalendar = lazy(() => import('@/components/schedule/Calendar'));
const EventForm = lazy(() => import('@/components/schedule/EventForm'));
const EventList = lazy(() => import('@/components/schedule/EventList'));
const ChatPanel = lazy(() => import('@/components/chat/ChatPanel'));
const FileList = lazy(() => import('@/components/files/FileList'));
const FileUpload = lazy(() => import('@/components/files/FileUpload'));
import { getEvents } from '@/services/events';
import { getFiles, updateFile } from '@/services/files';
import { getTasks } from '@/services/tasks';
import { copyToClipboard } from '@/lib/native';
import { getRoomPalette } from '@/components/room/RoomCard';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Copy, Check, Plus, MessageSquare, FileUp, CalendarPlus, CheckSquare, Activity, Link2, Users, Megaphone, X, Filter, GraduationCap, LogOut } from 'lucide-react';
// useRef already imported above
import { Button } from '@/components/ui/button';
import ReportButton from '@/components/ReportButton';
import EditRoomDialog from '@/components/room/EditRoomDialog';
import QuickLinks from '@/components/room/QuickLinks';
import { getAnnouncements, createAnnouncement, deleteAnnouncement as deleteAnnouncementApi, markAllRead } from '@/services/announcements';
import { formatDistanceToNow, format } from 'date-fns';
import { isFlindersUser, getStoredFlindersWeekOffset, setStoredFlindersWeekOffset } from '@/lib/flinders-week';
import { getFlindersScheduleOverlayEvents } from '@/lib/flinders-academic-overlay';

function sortEvents(items) {
  return [...items].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
}

function upsertById(items, nextItem, { prepend = true, sorter } = {}) {
  if (!nextItem?.id) return items;
  const remaining = items.filter((item) => item.id !== nextItem.id);
  const next = prepend ? [nextItem, ...remaining] : [...remaining, nextItem];
  return sorter ? sorter(next) : next;
}

const APP_SOFT_REFRESH_EVENT = 'app-soft-refresh';

export default function RoomPage() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const navState = location.state || {};
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [files, setFiles] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedDate, setSelectedDate] = useState(undefined);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState(navState.tab || 'members');
  const isTopicRoom = room?.room_type === 'topic';
  const [leaveConfirm, setLeaveConfirm] = useState(false);

  const handleLeaveTopicRoom = async () => {
    try {
      await leaveRoom(roomId);
      navigate('/timetable');
    } catch {}
  };
  const [activities, setActivities] = useState([]);
  const [quickLinks, setQuickLinks] = useState([]);
  const [error, setError] = useState('');
  const [announcements, setAnnouncements] = useState([]);
  const [announcementInput, setAnnouncementInput] = useState('');
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [activitiesLoaded, setActivitiesLoaded] = useState(false);
  const [quickLinksLoaded, setQuickLinksLoaded] = useState(false);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [showAcademicInList, setShowAcademicInList] = useState(false);
  const [weekOffset, setWeekOffset] = useState(() => getStoredFlindersWeekOffset());
  const [sectionLoading, setSectionLoading] = useState({
    events: false,
    files: false,
    tasks: false,
  });
  const highlightRef = useRef(null);
  const highlightTimerRef = useRef(null);
  const academicFilterRestoreTimerRef = useRef(null);
  const eventListColumnRef = useRef(null);

  const clearHighlight = useCallback(() => {
    if (highlightRef.current) {
      highlightRef.current.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-4', 'bg-blue-50/50');
      highlightRef.current = null;
    }
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
  }, []);

  const clearAcademicFilterRestore = useCallback(() => {
    if (academicFilterRestoreTimerRef.current) {
      clearTimeout(academicFilterRestoreTimerRef.current);
      academicFilterRestoreTimerRef.current = null;
    }
  }, []);

  const fetchRoom = useCallback(async () => {
    try {
      const data = await getRoom(roomId);
      setRoom(data.room || data);
    } catch {
      // non-critical
    }
  }, [roomId]);

  const fetchMembers = useCallback(async () => {
    try {
      const data = await getMembers(roomId);
      setMembers(data.members || data || []);
    } catch {
      // non-critical
    }
  }, [roomId]);

  const fetchEvents = useCallback(async () => {
    try {
      const data = await getEvents(roomId);
      setEvents(Array.isArray(data) ? data : data.events || []);
    } catch {
      // non-critical
    }
  }, [roomId]);

  const fetchFiles = useCallback(async () => {
    try {
      const data = await getFiles(roomId);
      setFiles(Array.isArray(data) ? data : data.files || []);
    } catch {
      // non-critical
    }
  }, [roomId]);

  const fetchTasks = useCallback(async () => {
    try {
      const data = await getTasks(roomId);
      setTasks(Array.isArray(data) ? data : data.tasks || []);
    } catch {
      // non-critical
    }
  }, [roomId]);

  const fetchActivity = useCallback(async () => {
    try {
      const data = await getRoomActivity(roomId);
      setActivities(Array.isArray(data) ? data : []);
    } catch {
      // non-critical
    }
  }, [roomId]);

  const fetchAnnouncements = useCallback(async () => {
    try {
      const data = await getAnnouncements(roomId);
      setAnnouncements(Array.isArray(data) ? data : []);
    } catch { /* non-critical */ }
  }, [roomId]);

  const fetchQuickLinks = useCallback(async () => {
    try {
      const data = await getQuickLinks(roomId);
      setQuickLinks(Array.isArray(data) ? data : []);
    } catch {
      setQuickLinks([]);
    }
  }, [roomId]);

  useEffect(() => {
    setLoading(true);
    setEvents([]);
    setFiles([]);
    setTasks([]);
    setActivities([]);
    setQuickLinks([]);
    setActivitiesLoaded(false);
    setQuickLinksLoaded(false);
    setEventsLoaded(false);
    setFilesLoaded(false);
    setTasksLoaded(false);
    setSectionLoading({ events: false, files: false, tasks: false });
    const init = async () => {
      try {
        // Batch quick links fetch with initial load to reduce round trips
        const [,,,, linksData] = await Promise.all([
          fetchRoom(),
          fetchMembers(),
          fetchAnnouncements(),
          Promise.resolve([]),
        ]);
        setQuickLinks(Array.isArray(linksData) ? linksData : []);
      } catch {
        setError('Failed to load some data. Please refresh.');
      }
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    let cancelled = false;

    const ensureTabData = async () => {
      const loaders = {
        schedule: {
          key: 'events',
          loaded: eventsLoaded,
          fetcher: fetchEvents,
          onLoaded: () => setEventsLoaded(true),
        },
        tasks: {
          key: 'tasks',
          loaded: tasksLoaded,
          fetcher: fetchTasks,
          onLoaded: () => setTasksLoaded(true),
        },
        members: {
          key: 'activities',
          loaded: activitiesLoaded,
          fetcher: fetchActivity,
          onLoaded: () => setActivitiesLoaded(true),
        },
        links: {
          key: 'quickLinks',
          loaded: quickLinksLoaded,
          fetcher: fetchQuickLinks,
          onLoaded: () => setQuickLinksLoaded(true),
        },
        files: {
          key: 'files',
          loaded: filesLoaded,
          fetcher: fetchFiles,
          onLoaded: () => setFilesLoaded(true),
        },
      };

      const target = loaders[activeTab];
      if (!target || target.loaded) return;

      setSectionLoading((prev) => ({ ...prev, [target.key]: true }));
      try {
        await target.fetcher();
        if (!cancelled) {
          target.onLoaded();
        }
      } finally {
        if (!cancelled) {
          setSectionLoading((prev) => ({ ...prev, [target.key]: false }));
        }
      }
    };

    ensureTabData();
    return () => {
      cancelled = true;
    };
  }, [activeTab, activitiesLoaded, eventsLoaded, filesLoaded, quickLinksLoaded, tasksLoaded, fetchActivity, fetchEvents, fetchFiles, fetchQuickLinks, fetchTasks]);

  // Navigate from DeadlinesPage: scroll to event date after schedule data loads
  useEffect(() => {
    if (!navState.eventDate || !eventsLoaded || activeTab !== 'schedule') return;
    const dateKey = navState.eventDate;
    // Small delay to let the DOM render the event list
    const timer = setTimeout(() => {
      const el = document.getElementById(`event-date-${dateKey}`);
      if (!el) return;
      clearHighlight();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-blue-400', 'ring-offset-4', 'bg-blue-50/50');
      highlightRef.current = el;
      highlightTimerRef.current = setTimeout(() => clearHighlight(), 4000);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsLoaded, activeTab]);

  // Topic rooms default to chat tab
  useEffect(() => {
    if (room?.room_type === 'topic' && !navState.tab) {
      setActiveTab('chat');
    }
  }, [room?.room_type, navState.tab]);

  // Listen for external event creation (e.g. tutorial) to refetch events
  useEffect(() => {
    const handler = () => fetchEvents();
    window.addEventListener('events-updated', handler);
    return () => window.removeEventListener('events-updated', handler);
  }, [fetchEvents]);

  useEffect(() => {
    const handleSoftRefresh = () => {
      fetchRoom();
      fetchMembers();
      fetchActivity();
      fetchAnnouncements();
      fetchEvents();
      if (activitiesLoaded) fetchActivity();
      if (quickLinksLoaded) fetchQuickLinks();
      if (filesLoaded) fetchFiles();
      if (tasksLoaded) fetchTasks();
    };
    window.addEventListener(APP_SOFT_REFRESH_EVENT, handleSoftRefresh);
    return () => window.removeEventListener(APP_SOFT_REFRESH_EVENT, handleSoftRefresh);
  }, [
    fetchActivity,
    fetchAnnouncements,
    fetchEvents,
    fetchFiles,
    fetchMembers,
    fetchRoom,
    fetchQuickLinks,
    fetchTasks,
    activitiesLoaded,
    filesLoaded,
    quickLinksLoaded,
    tasksLoaded,
  ]);

  // Quick links are now fetched as part of the initial batch load above

  useEffect(() => {
    if (!user?.id || !roomId) return undefined;
    let lastSyncedAt = 0;

    const syncVisitedAt = (force = false) => {
      const now = Date.now();
      if (!force && now - lastSyncedAt < 180000) return;
      lastSyncedAt = now;
      markRoomVisitedApi(roomId)
        .then((result) => {
          const timestamp = result?.last_visited_at ? new Date(result.last_visited_at).getTime() : Date.now();
          window.dispatchEvent(new CustomEvent('room-activity-visited', {
            detail: { roomId, timestamp },
          }));
        })
        .catch(() => {});
    };

    syncVisitedAt(true);
    const intervalId = window.setInterval(() => syncVisitedAt(false), 180000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncVisitedAt(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', syncVisitedAt);

    return () => {
      syncVisitedAt(true);
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', syncVisitedAt);
    };
  }, [roomId, user?.id]);

  useEffect(() => {
    if (!loading && announcements.some(a => !a.is_read)) {
      markAllRead(roomId).catch(() => {});
      // Dispatch event so sidebar updates
      window.dispatchEvent(new CustomEvent('announcements-read', { detail: { roomId } }));
    }
  }, [loading, roomId, announcements]);

  const handleCreateAnnouncement = async () => {
    if (!announcementInput.trim()) return;
    try {
      const ann = await createAnnouncement(roomId, announcementInput.trim());
      setAnnouncements(prev => [ann, ...prev]);
      setAnnouncementInput('');
      setShowAnnouncementForm(false);
    } catch { /* silent */ }
  };

  const handleDeleteAnnouncement = async (id) => {
    try {
      await deleteAnnouncementApi(id);
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    } catch { /* silent */ }
  };

  // Scroll-follow: detect which event date group is at top of viewport
  const [scrollFollowDate, setScrollFollowDate] = useState(null);

  useEffect(() => {
    if (activeTab !== 'schedule') return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible date group
        let topEntry = null;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!topEntry || entry.boundingClientRect.top < topEntry.boundingClientRect.top) {
              topEntry = entry;
            }
          }
        }
        if (topEntry) {
          const dateKey = topEntry.target.id.replace('event-date-', '');
          if (dateKey) setScrollFollowDate(dateKey);
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    );

    // Small delay to let DOM render
    const timer = setTimeout(() => {
      const dateElements = document.querySelectorAll('[id^="event-date-"]');
      dateElements.forEach((el) => observer.observe(el));
    }, 300);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [activeTab, events]);

  const handleCopyInviteCode = async () => {
    if (room?.invite_code) {
      try {
        await copyToClipboard(room.invite_code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // clipboard not available
      }
    }
  };

  const handleEventCreated = useCallback((event, tempId) => {
    setEventsLoaded(true);
    setEvents((prev) => {
      const withoutTemp = tempId ? prev.filter((item) => item.id !== tempId) : prev;
      return upsertById(withoutTemp, event, { sorter: sortEvents });
    });
  }, []);

  const handleEventCreateStart = useCallback((tempEvent) => {
    setEventsLoaded(true);
    setEvents((prev) => upsertById(prev, tempEvent, { sorter: sortEvents }));
  }, []);

  const handleEventCreateError = useCallback((tempId) => {
    setEvents((prev) => prev.filter((item) => item.id !== tempId));
  }, []);

  const handleEventsChange = useCallback((updater) => {
    setEvents((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return sortEvents(next);
    });
  }, []);

  const scheduleEvents = useMemo(() => {
    if (!isFlindersUser(user)) return events;
    return sortEvents([...events, ...getFlindersScheduleOverlayEvents()]);
  }, [events, user]);

  const scheduleListEvents = useMemo(() => {
    if (!showAcademicInList) return events;
    return scheduleEvents;
  }, [events, scheduleEvents, showAcademicInList]);

  const eventCoversDate = useCallback((event, date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const clickedTime = new Date(`${dateKey}T12:00:00`).getTime();
    const start = new Date(event.start_time).getTime();
    const end = new Date(event.end_time || event.start_time).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && clickedTime >= start && clickedTime <= end;
  }, []);

  const findScheduleScrollTarget = useCallback((date) => {
    const exactDateKey = format(date, 'yyyy-MM-dd');
    const exactElement = document.getElementById(`event-date-${exactDateKey}`);
    if (exactElement) {
      return exactDateKey;
    }

    const spanningEvent = scheduleEvents.find((event) => eventCoversDate(event, date));

    if (!spanningEvent) return exactDateKey;
    return format(new Date(spanningEvent.start_time), 'yyyy-MM-dd');
  }, [eventCoversDate, scheduleEvents]);

  useEffect(() => () => clearAcademicFilterRestore(), [clearAcademicFilterRestore]);

  const handleFileUploaded = useCallback((file) => {
    setFilesLoaded(true);
    setFiles((prev) => upsertById(prev, file, {
      prepend: true,
      sorter: (items) => [...items].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    }));
  }, []);

  if (loading) {
    return (
      <>
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-5 pb-20 sm:space-y-6 sm:pb-0">
        {(() => {
          const palette = room ? getRoomPalette(room) : { headerGradient: 'linear-gradient(135deg, #0ea5e9, #7dd3fc)', accent: '#7dd3fc' };
          if (isTopicRoom) {
            return (
              <div className="relative overflow-hidden rounded-2xl px-4 sm:px-6 md:px-8 py-4 sm:py-5 text-white shadow-xl mb-4" style={{ background: palette.headerGradient }}>
                <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                <div className="relative flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                      <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">{room?.name}</h1>
                      {room?.course_name && (
                        <Badge className="bg-white/20 text-white border-0 rounded-full text-xs">{room.course_name}</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-white/70 text-xs flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      {members.length} member{members.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {!leaveConfirm ? (
                      <button onClick={() => setLeaveConfirm(true)} className="flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1.5 text-xs hover:bg-red-500/60 transition-colors">
                        <LogOut className="h-3.5 w-3.5" />Leave
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button onClick={handleLeaveTopicRoom} className="flex items-center gap-1 bg-red-500 rounded-full px-3 py-1.5 text-xs font-medium hover:bg-red-600 transition-colors">
                          Leave
                        </button>
                        <button onClick={() => setLeaveConfirm(false)} className="bg-white/20 rounded-full px-2.5 py-1.5 text-xs hover:bg-white/30 transition-colors">
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div className="relative overflow-hidden rounded-2xl px-4 sm:px-6 md:px-8 py-5 sm:py-6 text-white shadow-xl mb-6" style={{ background: palette.headerGradient }}>
              <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
              <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">{room?.name}</h1>
                    {room?.course_name && (
                      <Badge className="bg-white/20 text-white border-0 rounded-full text-xs">{room.course_name}</Badge>
                    )}
                  </div>
                  {room?.description && <p className="mt-1 text-white/70 text-sm">{room.description}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                  {room?.invite_code && (
                    <button onClick={handleCopyInviteCode} className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-2 sm:py-1.5 text-xs font-medium hover:bg-white/30 transition-colors min-h-[44px] sm:min-h-0">
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      <code className="font-mono">{copied ? 'Copied!' : room.invite_code}</code>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Topic rooms: direct group chat — no tabs */}
        {isTopicRoom && (
          <Suspense fallback={<div className="flex min-h-[20rem] items-center justify-center rounded-2xl border border-slate-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>}>
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <ChatPanel roomId={roomId} onChatFileUploaded={handleFileUploaded} />
              </CardContent>
            </Card>
          </Suspense>
        )}

        {/* Regular rooms: full layout */}
        {!isTopicRoom && <>
        {/* Announcements */}
        {announcements.length > 0 && (
          <div className="space-y-2">
            {announcements.map((ann) => {
              const authorName = ann.users?.full_name || 'Admin';
              const currentMember = members.find(m => String(m.user_id) === String(user?.id));
              const canDelete = ann.author_id === user?.id || currentMember?.role === 'owner' || currentMember?.role === 'admin';
              return (
                <div key={ann.id} className="flex items-start gap-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 px-4 py-3 shadow-sm">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
                    <Megaphone className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-700">{authorName}</span>
                      <span className="text-[10px] text-amber-500">{ann.created_at ? formatDistanceToNow(new Date(ann.created_at), { addSuffix: true }) : ''}</span>
                    </div>
                    <p className="text-sm text-amber-900 mt-0.5 whitespace-pre-wrap">{ann.content}</p>
                  </div>
                  {canDelete && (
                    <button onClick={() => handleDeleteAnnouncement(ann.id)} className="shrink-0 text-amber-400 hover:text-red-500 transition-colors mt-1">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Create announcement (admin/owner only) */}
        {(() => {
          const currentMember = members.find(m => String(m.user_id) === String(user?.id));
          const isAdminOrOwner = currentMember?.role === 'owner' || currentMember?.role === 'admin';
          if (!isAdminOrOwner) return null;
          return showAnnouncementForm ? (
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="Write an announcement..."
                value={announcementInput}
                onChange={(e) => setAnnouncementInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateAnnouncement(); }}
                maxLength={2000}
              />
              <Button size="sm" className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white" onClick={handleCreateAnnouncement}>Post</Button>
              <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => setShowAnnouncementForm(false)}>Cancel</Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50" onClick={() => setShowAnnouncementForm(true)}>
              <Megaphone className="h-3.5 w-3.5 mr-1.5" />
              New Announcement
            </Button>
          );
        })()}

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="relative">
            <div className="-mx-1 overflow-x-auto px-1">
              <TabsList className="w-max min-w-full justify-start gap-1 rounded-xl border bg-white p-1.5 shadow-sm scrollbar-hide">
                <TabsTrigger value="members" className="min-h-[40px] shrink-0 px-2.5 text-[11px] sm:min-h-[44px] sm:px-3 sm:text-sm data-[state=active]:bg-indigo-50 data-[state=active]:font-semibold data-[state=active]:text-indigo-700">Members</TabsTrigger>
                <TabsTrigger value="schedule" data-tour="tab-schedule" className="min-h-[40px] shrink-0 px-2.5 text-[11px] sm:min-h-[44px] sm:px-3 sm:text-sm data-[state=active]:bg-indigo-50 data-[state=active]:font-semibold data-[state=active]:text-indigo-700">Schedule</TabsTrigger>
                <TabsTrigger value="tasks" data-tour="tab-tasks" className="min-h-[40px] shrink-0 px-2.5 text-[11px] sm:min-h-[44px] sm:px-3 sm:text-sm data-[state=active]:bg-indigo-50 data-[state=active]:font-semibold data-[state=active]:text-indigo-700">Tasks</TabsTrigger>
                <TabsTrigger value="chat" data-tour="tab-chat" className="min-h-[40px] shrink-0 px-2.5 text-[11px] sm:min-h-[44px] sm:px-3 sm:text-sm data-[state=active]:bg-indigo-50 data-[state=active]:font-semibold data-[state=active]:text-indigo-700">Chat</TabsTrigger>
                <TabsTrigger value="files" data-tour="tab-files" className="min-h-[40px] shrink-0 px-2.5 text-[11px] sm:min-h-[44px] sm:px-3 sm:text-sm data-[state=active]:bg-indigo-50 data-[state=active]:font-semibold data-[state=active]:text-indigo-700">Files</TabsTrigger>
                <TabsTrigger value="links" className="min-h-[40px] shrink-0 px-2.5 text-[11px] sm:min-h-[44px] sm:px-3 sm:text-sm data-[state=active]:bg-indigo-50 data-[state=active]:font-semibold data-[state=active]:text-indigo-700">
                  <Link2 className="h-4 w-4 mr-1" />Links
                </TabsTrigger>
              </TabsList>
            </div>
            {/* Scroll hint — fade on right edge */}
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent rounded-r-xl pointer-events-none sm:hidden" />
          </div>

          <TabsContent value="members" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Members ({members.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <MemberList members={members} />
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-indigo-500" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!activitiesLoaded ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : activities.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
                ) : (
                  <div className="space-y-3">
                    {activities.slice(0, 10).map((activity) => {
                      const iconMap = {
                        message: <MessageSquare className="h-4 w-4 text-blue-500" />,
                        file: <FileUp className="h-4 w-4 text-emerald-500" />,
                        event: <CalendarPlus className="h-4 w-4 text-orange-500" />,
                        task: <CheckSquare className="h-4 w-4 text-violet-500" />,
                      };
                      return (
                        <div key={activity.id} className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/60">
                            {iconMap[activity.type] || <Activity className="h-4 w-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm">
                              <span className="font-semibold">{activity.user_name}</span>{' '}
                              <span className="text-muted-foreground">{activity.description}</span>
                            </p>
                            <p className="text-xs text-muted-foreground/60 mt-0.5">
                              {activity.created_at ? formatDistanceToNow(new Date(activity.created_at), { addSuffix: true }) : ''}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schedule" className="space-y-4" style={{ overflow: 'visible' }}><Suspense fallback={<div className="flex min-h-[18rem] items-center justify-center rounded-2xl border border-slate-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>}>
            <div className="flex items-start justify-between rounded-xl bg-gradient-to-r from-slate-50 to-indigo-50 px-5 py-4 gap-4">
              <div className="space-y-2">
                <h2 className="text-lg font-bold text-indigo-900">Schedule</h2>
                {isFlindersUser(user) && (
                  <label className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/85 px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
                    <span className="text-slate-500">Week Start</span>
                    <select
                      value={weekOffset}
                      onChange={(e) => {
                        const nextOffset = Number.parseInt(e.target.value, 10) || 0;
                        setWeekOffset(nextOffset);
                        setStoredFlindersWeekOffset(nextOffset);
                      }}
                      className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 outline-none"
                    >
                      <option value={-3}>-3 weeks</option>
                      <option value={-2}>-2 weeks</option>
                      <option value={-1}>-1 week</option>
                      <option value={0}>Default</option>
                      <option value={1}>+1 week</option>
                      <option value={2}>+2 weeks</option>
                      <option value={3}>+3 weeks</option>
                    </select>
                  </label>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 shadow-md" onClick={() => { if (!selectedDate) setSelectedDate(new Date()); setEventFormOpen(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Event
                </Button>
              </div>
            </div>
            <div className="flex flex-col md:flex-row gap-4" style={{ overflow: 'visible' }}>
              {/* Calendar sidebar — sticky on desktop */}
              <div className="w-full shrink-0 md:w-[344px]">
                <div className="md:sticky md:top-4 z-10">
                  <ScheduleCalendar
                    roomId={roomId}
                    events={scheduleEvents}
                    selectedDate={selectedDate}
                    onSelectDate={setSelectedDate}
                    scrollFollowDate={scrollFollowDate}
                    weekOffset={weekOffset}
                    onDismissPrompt={() => {
                      clearHighlight();
                    }}
                    onDateClick={(date) => {
                      setSelectedDate(date);
                      clearHighlight();
                      clearAcademicFilterRestore();
                      const targetDateKey = findScheduleScrollTarget(date);
                      const needsTemporaryAcademicReveal = isFlindersUser(user)
                        && !showAcademicInList
                        && scheduleEvents.some((event) => event.isAcademicOverlay && eventCoversDate(event, date))
                        && !scheduleListEvents.some((event) => eventCoversDate(event, date));

                      if (needsTemporaryAcademicReveal) {
                        setShowAcademicInList(true);
                      }

                      setTimeout(() => {
                        const el = document.getElementById(`event-date-${targetDateKey}`);
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          el.classList.add('ring-2', 'ring-blue-400', 'ring-offset-4', 'bg-blue-50/50');
                          highlightRef.current = el;
                          highlightTimerRef.current = setTimeout(() => {
                            el.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-4', 'bg-blue-50/50');
                            highlightRef.current = null;
                          }, 4000);
                        }
                        if (needsTemporaryAcademicReveal) {
                          academicFilterRestoreTimerRef.current = setTimeout(() => {
                            setShowAcademicInList(false);
                            academicFilterRestoreTimerRef.current = null;
                          }, 4200);
                        }
                      }, needsTemporaryAcademicReveal ? 260 : 150);
                    }}
                    onAddEvent={(date) => {
                      clearHighlight();
                      setSelectedDate(date);
                      setEventFormOpen(true);
                    }}
                  />
                </div>
              </div>
              <div ref={eventListColumnRef} className="flex-1 min-w-0">
                {isFlindersUser(user) && (
                  <div className="mb-3 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-2.5">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                          <Filter className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">List Filter</p>
                          <p className="text-xs text-slate-500">Choose whether the list shows only team events or also Flinders academic overlays.</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAcademicInList(false)}
                          className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
                            !showAcademicInList
                              ? 'bg-slate-900 text-white shadow-sm'
                              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <Users className="h-3.5 w-3.5" />
                          Only Team Events
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAcademicInList(true)}
                          className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
                            showAcademicInList
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <GraduationCap className="h-3.5 w-3.5" />
                          Academic + Team
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {sectionLoading.events && !eventsLoaded ? (
                  <div className="flex min-h-[18rem] items-center justify-center rounded-2xl border border-slate-200 bg-white">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                  </div>
                ) : (
                  <EventList events={scheduleListEvents} roomId={roomId} onEventsChange={handleEventsChange} />
                )}
              </div>
            </div>

            <EventForm
              roomId={roomId}
              selectedDate={selectedDate}
              open={eventFormOpen}
              onOpenChange={setEventFormOpen}
              onCreateStart={handleEventCreateStart}
              onCreated={handleEventCreated}
              onCreateError={handleEventCreateError}
            />
          </Suspense></TabsContent>

          <TabsContent value="tasks" className="space-y-4"><Suspense fallback={<div className="flex min-h-[14rem] items-center justify-center rounded-2xl border border-slate-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>}>
            <h2 className="text-lg font-semibold">Tasks</h2>
            {sectionLoading.tasks && !tasksLoaded ? (
              <div className="flex min-h-[14rem] items-center justify-center rounded-2xl border border-slate-200 bg-white">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              </div>
            ) : (
              <TaskList
                tasks={tasks}
                members={members}
                roomId={roomId}
                currentUserId={user?.id}
                onTasksChange={setTasks}
                onUpdated={fetchTasks}
              />
            )}
          </Suspense></TabsContent>

          <TabsContent value="chat"><Suspense fallback={<div className="flex min-h-[14rem] items-center justify-center rounded-2xl border border-slate-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>}>
            <Card>
              <CardContent className="p-0">
                <ChatPanel roomId={roomId} onChatFileUploaded={handleFileUploaded} />
              </CardContent>
            </Card>
          </Suspense></TabsContent>

          <TabsContent value="files" className="space-y-6"><Suspense fallback={<div className="flex min-h-[14rem] items-center justify-center rounded-2xl border border-slate-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>}>
            {sectionLoading.files && !filesLoaded ? (
              <div className="flex min-h-[14rem] items-center justify-center rounded-2xl border border-slate-200 bg-white">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              </div>
            ) : (() => {
              const categories = [
                { key: 'lecture', label: 'Lecture Materials', icon: '📖', canUpload: true },
                { key: 'submission', label: 'Team Submissions', icon: '📝', canUpload: true },
                { key: 'chat', label: 'Chat Files', icon: '💬', canUpload: false },
              ];

              const handleDrop = async (e, targetCategory) => {
                e.preventDefault();
                e.currentTarget.classList.remove('ring-2', 'ring-blue-400', 'bg-blue-50/30');
                const fileId = e.dataTransfer.getData('text/file-id');
                const sourceCategory = e.dataTransfer.getData('text/source-category');
                if (!fileId || sourceCategory === targetCategory) return;
                try {
                  await updateFile(fileId, { category: targetCategory });
                  setFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, category: targetCategory } : f));
                } catch { /* ignore */ }
              };

              const handleDragOver = (e) => {
                e.preventDefault();
                e.currentTarget.classList.add('ring-2', 'ring-blue-400', 'bg-blue-50/30');
              };

              const handleDragLeave = (e) => {
                e.currentTarget.classList.remove('ring-2', 'ring-blue-400', 'bg-blue-50/30');
              };

              return categories.map((cat, idx) => (
                <React.Fragment key={cat.key}>
                  {idx > 0 && <div className="h-px bg-border" />}
                  <div
                    className="space-y-3 rounded-xl p-3 transition-all"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, cat.key)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{cat.icon}</span>
                        <h2 className="text-lg font-semibold">{cat.label}</h2>
                        <Badge variant="secondary" className="text-xs">{files.filter(f => f.category === cat.key).length}</Badge>
                      </div>
                      {cat.canUpload && (
                        <FileUpload roomId={roomId} onUploaded={handleFileUploaded} category={cat.key} events={events} />
                      )}
                    </div>
                    <FileList files={files} roomId={roomId} onFilesChange={setFiles} filterCategory={cat.key} members={members} draggable />
                  </div>
                </React.Fragment>
              ));
            })()}
          </Suspense></TabsContent>

          <TabsContent value="links">
            <Card>
              <CardContent className="p-5">
                {!quickLinksLoaded ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <QuickLinks roomId={roomId} links={quickLinks} onLinksChange={setQuickLinks} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
        </>}
      </div>
      <ReportButton section={activeTab} roomId={roomId} floating />
    </>
  );
}
