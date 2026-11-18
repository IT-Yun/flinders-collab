import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { searchTopics, getMyTimetable, addToTimetable, removeFromTimetable, removeTopic, getPopularTimes, ensureRoomMember, openTopicChat } from '@/services/timetable';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Search, Plus, X, BookOpen, Clock, MapPin, Users,
  MessageSquare, GraduationCap, Trash2, Check, Pencil, UserPlus, Mail,
} from 'lucide-react';
import { getFriendRequests, sendFriendRequest, respondToFriendRequest } from '@/services/flinders';
import { socket } from '@/lib/socket';
import { avatarThumb } from '@/lib/avatar';
import PageTour from '@/components/PageTour';
import OnboardingTour from '@/components/OnboardingTour';

const ChatPanel = lazy(() => import('@/components/chat/ChatPanel'));

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8am–8pm
const HOUR_HEIGHT = 56; // px per hour row

const COURSE_COLORS = [
  { bg: 'bg-blue-100', border: 'border-blue-300', text: 'text-blue-800', accent: 'bg-blue-500', hex: '#3b82f6' },
  { bg: 'bg-emerald-100', border: 'border-emerald-300', text: 'text-emerald-800', accent: 'bg-emerald-500', hex: '#10b981' },
  { bg: 'bg-violet-100', border: 'border-violet-300', text: 'text-violet-800', accent: 'bg-violet-500', hex: '#8b5cf6' },
  { bg: 'bg-amber-100', border: 'border-amber-300', text: 'text-amber-800', accent: 'bg-amber-500', hex: '#f59e0b' },
  { bg: 'bg-rose-100', border: 'border-rose-300', text: 'text-rose-800', accent: 'bg-rose-500', hex: '#f43f5e' },
  { bg: 'bg-cyan-100', border: 'border-cyan-300', text: 'text-cyan-800', accent: 'bg-cyan-500', hex: '#06b6d4' },
  { bg: 'bg-orange-100', border: 'border-orange-300', text: 'text-orange-800', accent: 'bg-orange-500', hex: '#f97316' },
  { bg: 'bg-indigo-100', border: 'border-indigo-300', text: 'text-indigo-800', accent: 'bg-indigo-500', hex: '#6366f1' },
];

function getColorForIndex(i) { return COURSE_COLORS[i % COURSE_COLORS.length]; }
function timeToHour(t) { if (!t) return null; const [h, m] = t.split(':').map(Number); return h + m / 60; }
function hourToTime(h) { const hh = Math.floor(h); const mm = Math.round((h - hh) * 60); return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; }
function formatHour(h) { return h > 12 ? `${h-12}pm` : h === 12 ? '12pm' : `${h}am`; }

// Snap to 15-min increments
function snapHour(h) { return Math.round(h * 4) / 4; }

export default function TimetablePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [timetable, setTimetable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('setup');

  // Course slots
  const [slots, setSlots] = useState([
    { id: 1, query: '', results: [], selectedTopic: null, searching: false, adding: false, searched: false },
    { id: 2, query: '', results: [], selectedTopic: null, searching: false, adding: false, searched: false },
    { id: 3, query: '', results: [], selectedTopic: null, searching: false, adding: false, searched: false },
    { id: 4, query: '', results: [], selectedTopic: null, searching: false, adding: false, searched: false },
  ]);

  // Drag-to-add state
  const [dragTopic, setDragTopic] = useState(null); // topic being added via calendar drag
  const [dragOffering, setDragOffering] = useState(null);
  const [popularTimes, setPopularTimes] = useState([]);

  // Class form (offering selection + mini confirm after drag)
  const [classForm, setClassForm] = useState(null);
  const [confirmForm, setConfirmForm] = useState(null); // {topicId, dayOfWeek, startTime, endTime, classType, location}
  const [editEntry, setEditEntry] = useState(null); // entry being edited
  const [chatPopup, setChatPopup] = useState(null); // {roomId, topicCode, topicTitle}
  const [chatOpening, setChatOpening] = useState(false);
  const [chatOpenError, setChatOpenError] = useState('');
  const [showMembers, setShowMembers] = useState(false);
  const [chatMembers, setChatMembers] = useState([]);
  const [friendState, setFriendState] = useState({ incoming: [], outgoing: [], friends: [] });
  const [friendLoading, setFriendLoading] = useState(null); // userId being acted on
  const [friendRequestDialog, setFriendRequestDialog] = useState(null); // { memberId, memberName }
  const [friendRequestMsg, setFriendRequestMsg] = useState('');
  const [topicUnread, setTopicUnread] = useState({}); // roomId → count

  const [searchTimers, setSearchTimers] = useState({});

  const loadTimetable = useCallback(async () => {
    try {
      const data = await getMyTimetable();
      setTimetable(data);
      const uniqueTopics = [];
      const seen = new Set();
      for (const entry of data) {
        if (entry.topic && !seen.has(entry.topic.id)) {
          seen.add(entry.topic.id);
          uniqueTopics.push(entry.topic);
        }
      }
      if (uniqueTopics.length > 0) {
        setSlots((prev) => {
          const newSlots = [...prev];
          uniqueTopics.forEach((topic, i) => {
            if (i < newSlots.length) {
              newSlots[i] = { ...newSlots[i], selectedTopic: topic, query: topic.topic_code };
            }
          });
          return newSlots;
        });
        setView('calendar');
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadTimetable(); }, [loadTimetable]);

  // Join topic rooms for unread badge via Socket.IO
  useEffect(() => {
    const roomIds = [...new Set(timetable.map((e) => e.room_id).filter(Boolean))];
    if (roomIds.length === 0) return;

    roomIds.forEach((rid) => socket.emit('chat:join', { roomId: rid }));

    const handleMessage = (msg) => {
      if (msg.user_id === user?.id) return;
      // Only count if the chat popup is NOT open for this room
      if (chatPopup?.roomId === msg.room_id) return;
      if (roomIds.includes(msg.room_id)) {
        setTopicUnread((prev) => ({ ...prev, [msg.room_id]: (prev[msg.room_id] || 0) + 1 }));
      }
    };

    socket.on('chat:message', handleMessage);
    return () => {
      socket.off('chat:message', handleMessage);
      roomIds.forEach((rid) => socket.emit('chat:leave', { roomId: rid }));
    };
  }, [timetable, user?.id, chatPopup?.roomId]);

  // Clear unread when opening a chat popup
  useEffect(() => {
    if (chatPopup?.roomId) {
      setTopicUnread((prev) => {
        if (!prev[chatPopup.roomId]) return prev;
        const next = { ...prev };
        delete next[chatPopup.roomId];
        return next;
      });
    }
  }, [chatPopup?.roomId]);

  // Search
  const handleSearch = useCallback(async (slotId, query) => {
    setSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, query, results: [], selectedTopic: null, searched: false } : s)));
    if (query.trim().length < 2) return;
    setSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, searching: true, searched: false } : s)));
    try {
      const results = await searchTopics(query);
      setSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, results, searching: false, searched: true } : s)));
    } catch {
      setSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, searching: false, searched: true } : s)));
    }
  }, []);

  const onQueryChange = (slotId, value) => {
    setSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, query: value } : s)));
    if (searchTimers[slotId]) clearTimeout(searchTimers[slotId]);
    const timer = setTimeout(() => handleSearch(slotId, value), 400);
    setSearchTimers((prev) => ({ ...prev, [slotId]: timer }));
  };

  // Select topic → show offering selection
  const selectTopic = (slotId, topic) => {
    setSlots((prev) => prev.map((s) => s.id === slotId ? { ...s, selectedTopic: topic, query: topic.topic_code, results: [] } : s));
    const offerings = topic.offerings || [];
    if (offerings.length > 0) {
      setClassForm({ slotId, topic, offerings, step: 'offering' });
    } else {
      // No offerings — go straight to calendar drag mode
      startDragMode(topic, null);
    }
  };

  // Start drag mode on calendar
  const startDragMode = async (topic, offering) => {
    setDragTopic(topic);
    setDragOffering(offering);
    setClassForm(null);
    setView('calendar');
    // Fetch popular times
    try {
      const popular = await getPopularTimes(topic.id);
      setPopularTimes(popular);
    } catch { setPopularTimes([]); }
  };

  // After drag completes on calendar
  const handleDragComplete = (dayOfWeek, startHour, endHour) => {
    if (!dragTopic) return;
    setConfirmForm({
      topicId: dragTopic.id,
      topicCode: dragTopic.topic_code,
      topicTitle: dragTopic.title,
      dayOfWeek,
      startTime: hourToTime(startHour),
      endTime: hourToTime(endHour),
      classType: 'lecture',
      location: dragOffering?.campus || '',
    });
  };

  // Confirm the dragged class
  const handleConfirmAdd = async () => {
    if (!confirmForm) return;
    try {
      await addToTimetable({
        topicId: confirmForm.topicId,
        dayOfWeek: confirmForm.dayOfWeek,
        startTime: confirmForm.startTime,
        endTime: confirmForm.endTime,
        classType: confirmForm.classType,
        location: confirmForm.location,
      });
      setConfirmForm(null);
      // Don't exit drag mode — user may want to add tutorial/workshop too
      await loadTimetable();
    } catch {}
  };

  // Finish adding classes for this topic
  const finishAdding = () => {
    setDragTopic(null);
    setDragOffering(null);
    setPopularTimes([]);
    setConfirmForm(null);
  };

  // Add another class for the same topic (from setup view)
  const addAnotherClass = (topic) => {
    startDragMode(topic, null);
  };

  const handleRemoveTopic = async (topicId) => {
    try {
      await removeTopic(topicId);
      setSlots((prev) => prev.map((s) => s.selectedTopic?.id === topicId ? { ...s, selectedTopic: null, query: '', results: [] } : s));
      await loadTimetable();
    } catch {}
  };

  // Open edit modal for an existing entry
  const openEditEntry = (entry) => {
    if (dragTopic) return; // don't open edit while in drag mode
    setEditEntry({
      id: entry.id,
      topicId: entry.topic?.id,
      topicCode: entry.topic?.topic_code,
      topicTitle: entry.topic?.title,
      roomId: entry.room_id,
      dayOfWeek: entry.day_of_week,
      startTime: entry.start_time?.slice(0, 5) || '',
      endTime: entry.end_time?.slice(0, 5) || '',
      classType: entry.class_type || 'lecture',
      location: entry.location || '',
    });
  };

  // Save edited entry (delete old + add new)
  const handleSaveEdit = async () => {
    if (!editEntry) return;
    try {
      await removeFromTimetable(editEntry.id);
      await addToTimetable({
        topicId: editEntry.topicId,
        dayOfWeek: editEntry.dayOfWeek,
        startTime: editEntry.startTime,
        endTime: editEntry.endTime,
        classType: editEntry.classType,
        location: editEntry.location,
      });
      setEditEntry(null);
      await loadTimetable();
    } catch {}
  };

  // Delete a single entry
  const handleDeleteEntry = async () => {
    if (!editEntry) return;
    try {
      await removeFromTimetable(editEntry.id);
      setEditEntry(null);
      await loadTimetable();
    } catch {}
  };

  const addSlot = () => {
    const nextId = Math.max(...slots.map((s) => s.id)) + 1;
    setSlots((prev) => [...prev, { id: nextId, query: '', results: [], selectedTopic: null, searching: false, adding: false, searched: false }]);
  };

  const removeSlot = (slotId) => {
    if (slots.length <= 1) return;
    const slot = slots.find((s) => s.id === slotId);
    if (slot?.selectedTopic) return;
    setSlots((prev) => prev.filter((s) => s.id !== slotId));
  };

  const openChat = async (roomId, topicCode, topicTitle, topicId = null) => {
    const fallbackRoomId = topicId
      ? timetable.find((entry) => entry.topic?.id === topicId && entry.room_id)?.room_id
      : null;
    const initialRoomId = fallbackRoomId || roomId;

    if (!initialRoomId) return;

    setChatPopup({ roomId: initialRoomId, topicId, topicCode: topicCode || '', topicTitle: topicTitle || '' });
    setChatOpening(true);
    setChatOpenError('');
    setShowMembers(false);
    setChatMembers([]);

    try {
      let data = null;
      let lastError = null;

      if (topicId) {
        try {
          data = await openTopicChat(topicId);
        } catch (err) {
          lastError = err;
        }
      }

      if (!data && initialRoomId) {
        try {
          data = await ensureRoomMember(initialRoomId);
        } catch (err) {
          lastError = err;
        }
      }

      if (!data && roomId && roomId !== initialRoomId) {
        try {
          data = await ensureRoomMember(roomId);
        } catch (err) {
          lastError = err;
        }
      }

      if (!data) {
        throw lastError || new Error('Failed to open this topic chat.');
      }

      const members = data?.members || data || [];
      const canonicalRoomId = data?.canonicalRoomId || initialRoomId;
      setChatMembers(Array.isArray(members) ? members : []);
      if (canonicalRoomId !== initialRoomId) {
        setChatPopup((prev) => prev ? { ...prev, roomId: canonicalRoomId } : prev);
      }
    } catch (err) {
      console.error('ensure-member failed:', err);
      setChatMembers([]);
      setChatOpenError(err?.message || 'Failed to open this topic chat.');
    } finally {
      setChatOpening(false);
    }
  };

  const goToRoom = (roomId) => { if (roomId) navigate(`/rooms/${roomId}`); };

  // Load friend state when chat popup opens
  const loadFriends = useCallback(async () => {
    try {
      const data = await getFriendRequests();
      setFriendState({
        incoming: Array.isArray(data?.incoming) ? data.incoming : [],
        outgoing: Array.isArray(data?.outgoing) ? data.outgoing : [],
        friends: Array.isArray(data?.friends) ? data.friends : [],
      });
    } catch {
      setFriendState({ incoming: [], outgoing: [], friends: [] });
    }
  }, []);

  useEffect(() => {
    if (chatPopup) loadFriends();
  }, [chatPopup, loadFriends]);

  const getFriendStatus = (memberId) => {
    if (memberId === user?.id) return { kind: 'self' };
    const friend = friendState.friends.find((f) => f.other_user?.user_id === memberId);
    if (friend) return { kind: 'friend', request: friend };
    const incoming = friendState.incoming.find((f) => f.other_user?.user_id === memberId);
    if (incoming) return { kind: 'incoming', request: incoming };
    const outgoing = friendState.outgoing.find((f) => f.other_user?.user_id === memberId);
    if (outgoing) return { kind: 'outgoing', request: outgoing };
    return { kind: 'none' };
  };

  const showAddFriendDialog = (memberId, memberName) => {
    setFriendRequestDialog({ memberId, memberName });
    setFriendRequestMsg('');
  };

  const handleConfirmAddFriend = async () => {
    if (!friendRequestDialog) return;
    setFriendLoading(friendRequestDialog.memberId);
    try {
      await sendFriendRequest({
        target_user_id: friendRequestDialog.memberId,
        message: friendRequestMsg.trim() || undefined,
      });
      await loadFriends();
      setFriendRequestDialog(null);
      setFriendRequestMsg('');
    } catch {} finally { setFriendLoading(null); }
  };

  const handleRespondFriend = async (requestId, action) => {
    setFriendLoading(requestId);
    try {
      await respondToFriendRequest(requestId, action);
      await loadFriends();
    } catch {} finally { setFriendLoading(null); }
  };

  const openDM = (memberId) => {
    navigate('/messages');
  };

  const calendarEntries = timetable.filter((e) => e.day_of_week != null && e.start_time);
  const uniqueTopicIds = [...new Set(timetable.map((e) => e.topic?.id).filter(Boolean))];
  const topicColorMap = {};
  uniqueTopicIds.forEach((id, i) => { topicColorMap[id] = getColorForIndex(i); });
  // Also assign color for drag topic if not already in map
  if (dragTopic && !topicColorMap[dragTopic.id]) {
    topicColorMap[dragTopic.id] = getColorForIndex(uniqueTopicIds.length);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-white">
      <OnboardingTour
        tourId="timetable-onboarding"
        steps={[
          {
            target: '[data-tour="timetable-courses-tab"]',
            title: 'Search your courses!',
            description: 'Tap here and search your course code — we\'ll build your timetable for you!',
            icon: '🔍',
            position: 'bottom',
          },
          {
            target: '[data-tour="timetable-course-list"]',
            title: 'Meet your classmates!',
            description: 'Tap any course to jump into a group chat with everyone in the same class. Say hi!',
            icon: '👋',
            position: 'top',
          },
        ]}
      />
      <PageTour
        tourId="timetable"
        steps={[
          {
            target: '[data-tour="timetable-courses-tab"]',
            title: 'Start here!',
            desc: 'Search your course code and add your classes — it only takes a sec!',
            position: 'bottom',
          },
          {
            target: '[data-tour="timetable-calendar-tab"]',
            title: 'See your week!',
            desc: 'Switch to calendar view to see your full weekly timetable at a glance.',
            position: 'bottom',
          },
        ]}
      />
      {/* Header */}
      <div data-tour="timetable-header" className="sticky top-0 z-20 border-b border-slate-100 bg-white/90 px-3 py-3 backdrop-blur-md safe-area-top sm:px-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-blue-600" />
            <h1 className="text-base font-bold text-slate-900 sm:text-lg">Timetable Buddy</h1>
            {uniqueTopicIds.length > 0 && (
              <Badge className="rounded-full bg-blue-100 text-blue-700 border-blue-200 text-[10px]">{uniqueTopicIds.length} topics</Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            {dragTopic && (
              <Button size="sm" onClick={finishAdding} className="col-span-2 h-9 rounded-full text-xs bg-emerald-600 hover:bg-emerald-700 sm:col-span-1 sm:h-8">
                <Check className="h-3.5 w-3.5 mr-1" />
                Done
              </Button>
            )}
            <Button data-tour="timetable-courses-tab" variant={view === 'setup' ? 'default' : 'outline'} size="sm" onClick={() => { setView('setup'); finishAdding(); }} className="h-9 rounded-full text-xs sm:h-8">
              <BookOpen className="h-3.5 w-3.5 mr-1" />Courses
            </Button>
            <Button data-tour="timetable-calendar-tab" variant={view === 'calendar' ? 'default' : 'outline'} size="sm" onClick={() => setView('calendar')} className="h-9 rounded-full text-xs sm:h-8" disabled={timetable.length === 0 && !dragTopic}>
              <Clock className="h-3.5 w-3.5 mr-1" />Timetable
            </Button>
          </div>
        </div>
      </div>

      {/* Drag mode banner */}
      {dragTopic && view === 'calendar' && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-3 text-white sm:px-4 sm:py-2.5">
          <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
              <Plus className="h-4 w-4 shrink-0" />
              <span className="font-medium">{dragTopic.topic_code}</span>
              <span className="opacity-80">Drag on the calendar to add class times</span>
              {dragOffering && <Badge className="rounded-full border-0 bg-white/20 text-[10px]">{dragOffering.semester} · {dragOffering.campus}</Badge>}
            </div>
            <Button size="sm" variant="ghost" onClick={finishAdding} className="h-8 self-start rounded-full px-3 text-xs text-white/80 hover:bg-white/10 hover:text-white sm:h-7 sm:self-auto">
              Done adding
            </Button>
          </div>
        </div>
      )}

      <div data-tour={view === 'setup' ? 'timetable-course-list' : undefined} className="mx-auto max-w-5xl px-2 py-3 sm:p-4">
        {view === 'setup' ? (
          <SetupView
            slots={slots} timetable={timetable} topicColorMap={topicColorMap}
            onQueryChange={onQueryChange} selectTopic={selectTopic}
            handleRemoveTopic={handleRemoveTopic} addAnotherClass={addAnotherClass}
            addSlot={addSlot} removeSlot={removeSlot} openChat={openChat}
            openEditEntry={openEditEntry}
          />
        ) : (
          <CalendarView
            entries={calendarEntries} topicColorMap={topicColorMap} openChat={openChat}
            timetable={timetable} dragTopic={dragTopic} popularTimes={popularTimes}
            onDragComplete={handleDragComplete} openEditEntry={openEditEntry}
            topicUnread={topicUnread}
          />
        )}
      </div>

      {/* Offering selection modal */}
      {classForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md shadow-2xl">
            <CardContent className="max-h-[calc(var(--viewport-dynamic-height,100dvh)-2rem)] overflow-y-auto p-5">
              <h3 className="font-semibold text-slate-900 mb-1">Select Your Class</h3>
              <p className="text-sm text-slate-500 mb-4">{classForm.topic.topic_code} — {classForm.topic.title}</p>
              <div className="space-y-2">
                {classForm.offerings.map((offering, i) => (
                  <button key={i} onClick={() => startDragMode(classForm.topic, offering)}
                    className="w-full text-left p-3 rounded-xl border-2 border-slate-200 transition-all hover:border-blue-400 hover:bg-blue-50">
                    <div className="flex items-center gap-2">
                      <Badge className="rounded-full text-[10px] bg-blue-100 text-blue-700 border-blue-200">{offering.semester || 'TBC'}</Badge>
                      <span className="text-sm font-medium text-slate-800">{offering.campus || 'TBC'}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">{offering.mode || 'In person'}</div>
                  </button>
                ))}
                <button onClick={() => startDragMode(classForm.topic, null)} className="w-full text-center text-xs text-slate-400 hover:text-blue-500 py-2 mt-2">
                  None of these? Add manually on calendar
                </button>
                <Button variant="outline" onClick={() => setClassForm(null)} className="w-full h-10 rounded-xl mt-2">Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit entry modal */}
      {editEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditEntry(null)}>
          <Card className="w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <CardContent className="max-h-[calc(var(--viewport-dynamic-height,100dvh)-2rem)] overflow-y-auto p-5">
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="font-semibold text-slate-900">Edit Class</h3>
                <Button variant="ghost" size="sm" onClick={() => { setEditEntry(null); openChat(editEntry.roomId, editEntry.topicCode, editEntry.topicTitle, editEntry.topicId); }} className="h-8 self-start rounded-full px-3 text-xs text-blue-600 sm:h-7" disabled={!editEntry.roomId}>
                  <MessageSquare className="h-3.5 w-3.5 mr-1" />Chat
                </Button>
              </div>
              <p className="text-sm text-slate-500 mb-4">{editEntry.topicCode} — {editEntry.topicTitle}</p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Day</label>
                  <div className="grid grid-cols-3 gap-1 sm:flex">
                    {DAYS.map((day, i) => (
                      <Button key={day} variant={editEntry.dayOfWeek === i ? 'default' : 'outline'} size="sm"
                        onClick={() => setEditEntry((e) => ({ ...e, dayOfWeek: i }))} className="h-8 text-xs rounded-full sm:flex-1">
                        {day}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 mb-1 block">Start</label>
                    <Input type="time" value={editEntry.startTime}
                      onChange={(e) => setEditEntry((prev) => ({ ...prev, startTime: e.target.value }))} className="h-9 rounded-lg" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 mb-1 block">End</label>
                    <Input type="time" value={editEntry.endTime}
                      onChange={(e) => setEditEntry((prev) => ({ ...prev, endTime: e.target.value }))} className="h-9 rounded-lg" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Type</label>
                  <div className="flex gap-1 flex-wrap">
                    {['lecture', 'tutorial', 'practical', 'workshop', 'seminar'].map((type) => (
                      <Button key={type} variant={editEntry.classType === type ? 'default' : 'outline'} size="sm"
                        onClick={() => setEditEntry((e) => ({ ...e, classType: type }))} className="h-8 text-xs rounded-full capitalize">
                        {type}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Location</label>
                  <Input placeholder="e.g. Room 101" value={editEntry.location}
                    onChange={(e) => setEditEntry((prev) => ({ ...prev, location: e.target.value }))} className="h-9 rounded-lg" />
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={handleDeleteEntry} className="h-10 rounded-xl text-red-500 hover:bg-red-50 hover:text-red-600 border-red-200">
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={() => setEditEntry(null)} className="flex-1 h-10 rounded-xl">Cancel</Button>
                <Button onClick={handleSaveEdit} className="flex-1 h-10 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600">Save</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Confirm after drag */}
      {confirmForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-sm shadow-2xl">
            <CardContent className="max-h-[calc(var(--viewport-dynamic-height,100dvh)-2rem)] overflow-y-auto p-5">
              <h3 className="font-semibold text-slate-900 mb-1">Confirm Class</h3>
              <p className="text-sm text-slate-500 mb-3">{confirmForm.topicCode} — {DAYS[confirmForm.dayOfWeek]} {confirmForm.startTime}–{confirmForm.endTime}</p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Type</label>
                  <div className="flex gap-1 flex-wrap">
                    {['lecture', 'tutorial', 'practical', 'workshop', 'seminar'].map((type) => (
                      <Button key={type} variant={confirmForm.classType === type ? 'default' : 'outline'} size="sm"
                        onClick={() => setConfirmForm((f) => ({ ...f, classType: type }))} className="h-8 text-xs rounded-full capitalize">
                        {type}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Location (optional)</label>
                  <Input placeholder="e.g. Room 101" value={confirmForm.location}
                    onChange={(e) => setConfirmForm((f) => ({ ...f, location: e.target.value }))} className="h-9 rounded-lg" />
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={() => setConfirmForm(null)} className="flex-1 h-10 rounded-xl">Cancel</Button>
                <Button onClick={handleConfirmAdd} className="flex-1 h-10 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600">Add</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Chat popup */}
      {chatPopup && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[90] flex items-stretch justify-center bg-black/55 p-0 sm:items-center sm:p-4" onClick={() => { setShowMembers(false); setChatPopup(null); setChatOpenError(''); }}>
          <div
            className={`relative flex h-[var(--viewport-dynamic-height,100dvh)] w-full min-h-0 flex-col overflow-hidden bg-white shadow-2xl sm:h-[82vh] ${showMembers ? 'sm:max-w-3xl' : 'sm:max-w-2xl'} sm:rounded-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex shrink-0 items-start justify-between border-b border-slate-100 bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 pb-3 pt-4 text-white sm:items-center sm:px-4 sm:py-3"
              style={{ paddingTop: 'max(0.9rem, calc(var(--safe-top) + 0.65rem))' }}
            >
              <div className="min-w-0 pr-2">
                <div className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">Topic chat</div>
                <h3 className="mt-1 truncate text-[15px] font-bold leading-tight sm:text-sm">{chatPopup.topicCode}{chatPopup.topicTitle ? ` — ${chatPopup.topicTitle}` : ''}</h3>
              </div>
              <div className="ml-2 flex shrink-0 items-center gap-1 self-start sm:self-auto">
                <button onClick={() => setShowMembers((v) => !v)} className={`rounded-full p-2 transition-colors ${showMembers ? 'bg-white/30' : 'hover:bg-white/20'}`} title="Toggle members">
                  <Users className="h-4 w-4" />
                </button>
                <button onClick={() => { setShowMembers(false); setChatPopup(null); setChatOpenError(''); }} className="rounded-full p-2 transition-colors hover:bg-white/20">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1">
              <div className="min-h-0 flex-1">
                {chatOpening ? (
                  <div className="flex h-full items-center justify-center bg-white">
                    <div className="flex flex-col items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                      <span>Opening topic chat...</span>
                    </div>
                  </div>
                ) : chatOpenError ? (
                  <div className="flex h-full items-center justify-center bg-white px-6">
                    <div className="max-w-sm text-center">
                      <p className="text-sm font-semibold text-slate-700">Unable to open chat</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">{chatOpenError}</p>
                      <Button
                        onClick={() => openChat(chatPopup.roomId, chatPopup.topicCode, chatPopup.topicTitle, chatPopup.topicId)}
                        className="mt-4 h-9 rounded-full bg-blue-600 px-4 text-xs text-white hover:bg-blue-700"
                      >
                        Try again
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>}>
                    <ChatPanel roomId={chatPopup.roomId} embedded />
                  </Suspense>
                )}
              </div>

              {showMembers && (
                <>
                  <button
                    type="button"
                    aria-label="Close members"
                    className="absolute inset-0 z-[9] bg-black/10 sm:hidden"
                    onClick={() => setShowMembers(false)}
                  />
                  <div
                    className="absolute inset-y-0 right-0 z-10 flex w-[84vw] max-w-[18rem] flex-col border-l border-slate-200 bg-slate-50 shadow-2xl sm:static sm:w-56 sm:max-w-none sm:shadow-none"
                    style={{ paddingTop: 'var(--safe-top)' }}
                  >
                    <div className="flex items-center justify-between border-b border-slate-200 px-3 py-3 text-xs font-semibold text-slate-500">
                      <span>Members ({chatMembers.length})</span>
                      <button
                        type="button"
                        onClick={() => setShowMembers(false)}
                        className="rounded-full px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-white"
                      >
                        Close
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                    {chatMembers.map((m) => {
                      const fs = getFriendStatus(m.id);
                      return (
                        <div key={m.id} className="rounded-lg px-2 py-2 transition-colors hover:bg-white">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7 shrink-0">
                              {m.avatar_url ? <AvatarImage src={avatarThumb(m.avatar_url)} alt={m.full_name || 'User'} className="object-cover" /> : null}
                              <AvatarFallback className="bg-blue-100 text-[11px] font-bold text-blue-600">
                                {(m.full_name || '?')[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-medium text-slate-800">{m.full_name || 'User'}</div>
                              {m.major && <div className="truncate text-[10px] text-slate-400">{m.major}</div>}
                            </div>
                          </div>
                          {fs.kind !== 'self' && (
                            <div className="ml-9 mt-1.5">
                              {fs.kind === 'friend' && (
                                <button onClick={() => openDM(m.id)} className="flex items-center gap-1 text-[10px] font-medium text-blue-600 transition-colors hover:text-blue-800">
                                  <Mail className="h-3 w-3" />DM
                                </button>
                              )}
                              {fs.kind === 'none' && (
                                <button onClick={() => showAddFriendDialog(m.id, m.full_name)} className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 transition-colors hover:text-emerald-800">
                                  <UserPlus className="h-3 w-3" />
                                  Add Friend
                                </button>
                              )}
                              {fs.kind === 'outgoing' && <span className="text-[10px] font-medium text-amber-600">Requested</span>}
                              {fs.kind === 'incoming' && (
                                <div className="flex items-center gap-1.5">
                                  <button onClick={() => handleRespondFriend(fs.request.id, 'accept')} disabled={friendLoading === fs.request.id} className="text-[10px] font-medium text-emerald-600 hover:text-emerald-800 disabled:opacity-50">
                                    {friendLoading === fs.request.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Accept'}
                                  </button>
                                  <span className="text-slate-300">|</span>
                                  <button onClick={() => handleRespondFriend(fs.request.id, 'decline')} className="text-[10px] font-medium text-slate-400 hover:text-red-500">
                                    Decline
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {chatMembers.length === 0 && <div className="py-4 text-center text-xs text-slate-400">No members yet</div>}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Friend request confirmation dialog */}
      {friendRequestDialog && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={() => setFriendRequestDialog(null)}>
          <Card className="w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <UserPlus className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">Send Friend Request</h3>
                  <p className="text-xs text-slate-500">to {friendRequestDialog.memberName || 'this student'}</p>
                </div>
              </div>
              <div className="mb-4">
                <label className="text-xs font-medium text-slate-600 mb-1.5 block">Message (optional)</label>
                <Input
                  placeholder="Hi! Let's study together..."
                  value={friendRequestMsg}
                  onChange={(e) => setFriendRequestMsg(e.target.value)}
                  className="h-10 rounded-xl"
                  maxLength={160}
                />
                <p className="text-[10px] text-slate-400 mt-1 text-right">{friendRequestMsg.length}/160</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setFriendRequestDialog(null)} className="flex-1 h-10 rounded-xl">Cancel</Button>
                <Button
                  onClick={handleConfirmAddFriend}
                  disabled={friendLoading === friendRequestDialog.memberId}
                  className="flex-1 h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
                >
                  {friendLoading === friendRequestDialog.memberId ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <UserPlus className="h-4 w-4 mr-1" />
                  )}
                  Send Request
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ========== Setup View ========== */
function SetupView({ slots, timetable, topicColorMap, onQueryChange, selectTopic, handleRemoveTopic, addAnotherClass, addSlot, removeSlot, openChat, openEditEntry }) {
  return (
    <div className="space-y-3 sm:space-y-4">
      <p className="px-1 text-[12px] leading-relaxed text-slate-500 sm:px-0 sm:text-sm">Add your courses below, then drag on the calendar to set class times.</p>
      {slots.map((slot, idx) => {
        const color = slot.selectedTopic ? topicColorMap[slot.selectedTopic.id] || getColorForIndex(idx) : null;
        const topicEntries = slot.selectedTopic ? timetable.filter((e) => e.topic?.id === slot.selectedTopic.id) : [];
        return (
          <Card key={slot.id} className={`overflow-visible rounded-[22px] shadow-sm transition-all ${color ? `${color.border} border-l-4` : 'border-slate-200'}`}>
            <CardContent className="p-3 sm:p-4">
              <div className="mb-2.5 flex items-start gap-2">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold text-white ${color ? color.accent : 'bg-slate-300'}`}>{idx + 1}</div>
                <div className="min-w-0 flex-1">
                  {slot.selectedTopic ? (
                    <>
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:gap-2">
                      <span className="font-semibold text-slate-900">{slot.selectedTopic.topic_code}</span>
                      <span className="text-[13px] leading-snug text-slate-500 sm:truncate sm:text-sm">{slot.selectedTopic.title}</span>
                    </div>
                    {slot.selectedTopic.school && <p className="text-[10px] text-slate-400 truncate">{slot.selectedTopic.school}</p>}
                    </>
                  ) : <span className="text-sm text-slate-400">Course {idx + 1}</span>}
                </div>
                <div className="ml-auto shrink-0">
                  {slot.selectedTopic ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveTopic(slot.selectedTopic.id)}
                      className="h-8 rounded-lg px-2.5 text-[11px] font-medium text-red-500 hover:bg-red-50 hover:text-red-600 sm:h-7 sm:px-2"
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />Remove
                    </Button>
                  ) : slots.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeSlot(slot.id)} className="h-7 px-2 text-xs text-slate-400"><X className="h-3.5 w-3.5" /></Button>
                  )}
                </div>
              </div>

              {slot.selectedTopic && (
                <div className="mb-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openChat(topicEntries[0]?.room_id, slot.selectedTopic.topic_code, slot.selectedTopic.title, slot.selectedTopic.id)}
                    className="h-9 rounded-xl border-blue-200 bg-blue-50 text-xs text-blue-700 hover:bg-blue-100 sm:h-8 sm:w-auto"
                    disabled={!topicEntries[0]?.room_id}
                  >
                    <MessageSquare className="mr-1.5 h-3.5 w-3.5" />Chat
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addAnotherClass(slot.selectedTopic)}
                    className="h-9 rounded-xl border-emerald-200 bg-emerald-50 text-xs text-emerald-700 hover:bg-emerald-100 sm:h-8 sm:w-auto"
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />Add class
                  </Button>
                </div>
              )}

              {!slot.selectedTopic && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input placeholder="Enter topic code (e.g. COMP2711)" value={slot.query}
                    onChange={(e) => onQueryChange(slot.id, e.target.value)} className="pl-9 h-10 rounded-xl bg-slate-50 border-slate-200" />
                  {slot.searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-blue-500" />}

                  {slot.searched && slot.results.length === 0 && slot.query.length >= 2 && !slot.searching && (
                    <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg p-4 text-center">
                      <p className="text-sm text-slate-500">No results for "{slot.query}"</p>
                      <p className="text-xs text-slate-400 mt-1">Check the topic code and try again</p>
                    </div>
                  )}

                  {slot.results.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-auto">
                      {slot.results.map((topic) => (
                        <button key={topic.id} onClick={() => selectTopic(slot.id, topic)}
                          className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-slate-50 last:border-0 transition-colors">
                          <div className="flex items-center gap-2">
                            <Badge className="rounded bg-slate-100 text-slate-700 border-slate-200 text-xs font-mono">{topic.topic_code}</Badge>
                            <span className="text-sm font-medium text-slate-800 truncate">{topic.title}</span>
                          </div>
                          <div className="flex gap-2 mt-1 text-[11px] text-slate-400">
                            {topic.credit_points && <span>{topic.credit_points}</span>}
                            {topic.level && <span>{topic.level}</span>}
                            {topic.campuses?.length > 0 && <span>{topic.campuses.join(', ')}</span>}
                            {topic.semesters?.length > 0 && <span>{topic.semesters.join(', ')}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {slot.selectedTopic && topicEntries.length > 0 && (
                <div className="mt-1.5 space-y-1.5">
                  {topicEntries.map((entry) => (
                    <button key={entry.id} onClick={() => openEditEntry(entry)}
                      className={`w-full rounded-xl px-3 py-2 text-left transition-all hover:ring-2 hover:ring-blue-300 ${color?.bg || 'bg-slate-50'}`}>
                      <div className="flex items-start gap-2">
                        <Clock className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${color?.text || 'text-slate-500'}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-semibold text-slate-800">{DAYS[entry.day_of_week]}</span>
                            <span className="text-sm text-slate-600">{entry.start_time?.slice(0,5)} — {entry.end_time?.slice(0,5)}</span>
                            {entry.class_type && <Badge className="rounded-full border-0 bg-white/70 text-[10px] capitalize">{entry.class_type}</Badge>}
                          </div>
                          {entry.location && (
                            <span className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                              <MapPin className="h-3 w-3 shrink-0" />{entry.location}
                            </span>
                          )}
                        </div>
                        <Pencil className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      <Button variant="outline" onClick={addSlot} className="h-11 w-full rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-500">
        <Plus className="h-4 w-4 mr-2" />Add another course
      </Button>
    </div>
  );
}

/* ========== Calendar View with Drag ========== */
function CalendarView({ entries, topicColorMap, openChat, timetable, dragTopic, popularTimes, onDragComplete, openEditEntry, topicUnread = {} }) {
  const gridRef = useRef(null);
  const [dragging, setDragging] = useState(null); // {dayOfWeek, startHour, currentHour}

  // Unique topics for legend
  const uniqueTopics = [];
  const seen = new Set();
  for (const e of timetable) {
    if (e.topic && !seen.has(e.topic.id)) { seen.add(e.topic.id); uniqueTopics.push({ ...e.topic, roomId: e.room_id }); }
  }

  // Convert mouse/touch position to day + hour
  const posToCell = useCallback((clientX, clientY) => {
    if (!gridRef.current) return null;
    const rect = gridRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const timeColWidth = 60;
    const dayWidth = (rect.width - timeColWidth) / 5;
    const dayOfWeek = Math.floor((x - timeColWidth) / dayWidth);
    const hour = 8 + y / HOUR_HEIGHT;

    if (dayOfWeek < 0 || dayOfWeek > 4) return null;
    return { dayOfWeek, hour: snapHour(Math.max(8, Math.min(20, hour))) };
  }, []);

  const handlePointerDown = (e) => {
    if (!dragTopic) return;
    const cell = posToCell(e.clientX, e.clientY);
    if (!cell) return;
    e.preventDefault();
    setDragging({ dayOfWeek: cell.dayOfWeek, startHour: cell.hour, currentHour: cell.hour + 1 });
  };

  const handlePointerMove = (e) => {
    if (!dragging) return;
    const cell = posToCell(e.clientX, e.clientY);
    if (!cell) return;
    e.preventDefault();
    setDragging((prev) => ({ ...prev, currentHour: Math.max(prev.startHour + 0.5, cell.hour) }));
  };

  const handlePointerUp = () => {
    if (!dragging) return;
    const startH = Math.min(dragging.startHour, dragging.currentHour);
    const endH = Math.max(dragging.startHour, dragging.currentHour);
    if (endH - startH >= 0.25) {
      onDragComplete(dragging.dayOfWeek, startH, endH);
    }
    setDragging(null);
  };

  return (
    <div className="space-y-3.5 sm:space-y-4">
      {/* Legend */}
      {uniqueTopics.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {uniqueTopics.map((topic) => {
            const color = topicColorMap[topic.id];
            const unread = topicUnread[topic.roomId] || 0;
            return (
              <button key={topic.id} onClick={() => openChat(topic.roomId, topic.topic_code, topic.title, topic.id)}
                className={`relative flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${color?.bg} ${color?.text} ${color?.border} transition-shadow hover:shadow-md`}>
                <MessageSquare className="h-3 w-3" />{topic.topic_code}
                {unread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow-sm">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Calendar grid */}
      <Card className="overflow-hidden rounded-[22px] border-slate-200 shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-3 py-2 text-[11px] font-medium text-slate-500 sm:hidden">
          Swipe left and right to see the full timetable.
        </div>
        <div className="overflow-x-auto overscroll-x-contain">
          <div className="min-w-[760px]">
            {/* Day headers */}
            <div className="grid grid-cols-[60px_repeat(5,1fr)] border-b border-slate-100">
              <div className="p-2" />
              {DAYS.map((day) => (
                <div key={day} className="p-2 text-center text-xs font-semibold text-slate-500 border-l border-slate-100">{day}</div>
              ))}
            </div>

            {/* Time grid */}
            <div className="relative select-none" ref={gridRef}
              onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp} style={{ touchAction: dragTopic ? 'none' : 'auto', cursor: dragTopic ? 'crosshair' : 'default' }}>

              {HOURS.map((hour) => (
                <div key={hour} className="grid grid-cols-[60px_repeat(5,1fr)] h-14 border-b border-slate-50">
                  <div className="p-1 text-[11px] text-slate-400 text-right pr-2 pt-0">{formatHour(hour)}</div>
                  {DAYS.map((_, di) => (
                    <div key={di} className={`border-l border-slate-50 ${dragTopic ? 'hover:bg-blue-50/30' : ''}`} />
                  ))}
                </div>
              ))}

              {/* Popular time suggestions (faded blocks) */}
              {dragTopic && popularTimes.map((pt, i) => {
                const startH = timeToHour(pt.start_time);
                const endH = timeToHour(pt.end_time);
                if (startH == null || endH == null || pt.day_of_week == null) return null;
                const top = (startH - 8) * HOUR_HEIGHT;
                const height = (endH - startH) * HOUR_HEIGHT;
                const left = `calc(60px + ${pt.day_of_week} * ((100% - 60px) / 5) + 2px)`;
                const width = `calc((100% - 60px) / 5 - 4px)`;
                return (
                  <div key={`pop-${i}`} className="absolute rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/40 flex items-center justify-center pointer-events-none"
                    style={{ top: `${top}px`, height: `${Math.max(height, 28)}px`, left, width }}>
                    <span className="text-[10px] text-blue-400 font-medium">
                      <Users className="h-3 w-3 inline mr-0.5" />{pt.count} {pt.count === 1 ? 'student' : 'students'}
                    </span>
                  </div>
                );
              })}

              {/* Drag preview */}
              {dragging && dragTopic && (() => {
                const startH = Math.min(dragging.startHour, dragging.currentHour);
                const endH = Math.max(dragging.startHour, dragging.currentHour);
                const top = (startH - 8) * HOUR_HEIGHT;
                const height = (endH - startH) * HOUR_HEIGHT;
                const left = `calc(60px + ${dragging.dayOfWeek} * ((100% - 60px) / 5) + 2px)`;
                const width = `calc((100% - 60px) / 5 - 4px)`;
                const color = topicColorMap[dragTopic.id];
                return (
                  <div className={`absolute rounded-lg border-2 ${color?.border || 'border-blue-400'} ${color?.bg || 'bg-blue-100'} opacity-70 pointer-events-none flex items-center justify-center`}
                    style={{ top: `${top}px`, height: `${Math.max(height, 14)}px`, left, width }}>
                    <span className={`text-[11px] font-bold ${color?.text || 'text-blue-700'}`}>
                      {dragTopic.topic_code} · {hourToTime(startH)}–{hourToTime(endH)}
                    </span>
                  </div>
                );
              })()}

              {/* Existing entries */}
              {entries.map((entry) => {
                const startH = timeToHour(entry.start_time);
                const endH = timeToHour(entry.end_time);
                if (startH == null || endH == null) return null;
                const top = (startH - 8) * HOUR_HEIGHT;
                const height = (endH - startH) * HOUR_HEIGHT;
                const left = `calc(60px + ${entry.day_of_week} * ((100% - 60px) / 5) + 2px)`;
                const width = `calc((100% - 60px) / 5 - 4px)`;
                const color = topicColorMap[entry.topic?.id];
                const blockUnread = topicUnread[entry.room_id] || 0;
                return (
                  <button key={entry.id} onClick={() => openChat(entry.room_id, entry.topic?.topic_code, entry.topic?.title, entry.topic?.id)}
                    className={`absolute rounded-lg p-1.5 overflow-hidden cursor-pointer hover:shadow-lg hover:ring-2 hover:ring-blue-400 transition-all border ${color?.bg || 'bg-blue-100'} ${color?.border || 'border-blue-300'} ${color?.text || 'text-blue-800'}`}
                    style={{ top: `${top}px`, height: `${Math.max(height, 28)}px`, left, width }}>
                    <div className="text-[11px] font-bold leading-tight truncate">{entry.topic?.topic_code}</div>
                    {height >= 42 && <div className="text-[10px] opacity-70 truncate capitalize">{entry.class_type}</div>}
                    {height >= 56 && entry.location && <div className="text-[9px] opacity-60 truncate">{entry.location}</div>}
                    {blockUnread > 0 && (
                      <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[8px] font-bold text-white shadow">
                        {blockUnread > 99 ? '99+' : blockUnread}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
