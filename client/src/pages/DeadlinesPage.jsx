import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { getUpcomingEvents } from '@/services/events';
import { getRoomPalette } from '@/components/room/RoomCard';
import { useAuth } from '@/hooks/useAuth';
import { format, formatDistanceToNow } from 'date-fns';
import { Loader2, CalendarDays, Clock, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import OnboardingTour from '@/components/OnboardingTour';
import PageTour from '@/components/PageTour';

const CATEGORY_INFO = {
  meeting:      { icon: '👥', label: 'Meeting' },
  submission:   { icon: '📮', label: 'Submission' },
  quiz:         { icon: '✏️', label: 'Quiz' },
  exam:         { icon: '📝', label: 'Exam' },
  presentation: { icon: '📊', label: 'Presentation' },
  deadline:     { icon: '⏰', label: 'Deadline' },
  study:        { icon: '📚', label: 'Study Session' },
  lecture:      { icon: '🎓', label: 'Lecture' },
  social:       { icon: '🎉', label: 'Social' },
  other:        { icon: '📌', label: 'Other' },
};
const APP_SOFT_REFRESH_EVENT = 'app-soft-refresh';

function normalizeCategory(category) {
  const normalized = String(category || '').trim().toLowerCase();

  if (!normalized) return 'other';
  if (CATEGORY_INFO[normalized]) return normalized;
  if (normalized === 'due' || normalized === 'due date') return 'deadline';
  if (normalized === 'presentation' || normalized === 'presentations') return 'presentation';
  if (normalized === 'submission' || normalized === 'submissions') return 'submission';
  if (normalized === 'exam' || normalized === 'exams' || normalized === 'test') return 'exam';
  if (normalized === 'meeting' || normalized === 'meetings') return 'meeting';
  if (normalized === 'lecture' || normalized === 'class') return 'lecture';
  if (normalized === 'study' || normalized === 'study session') return 'study';
  if (normalized === 'social' || normalized === 'event') return 'social';

  return 'other';
}

export default function DeadlinesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const fetchAll = useCallback(async () => {
    try {
      const data = await getUpcomingEvents();
      const future = (Array.isArray(data?.events) ? data.events : []).map((event) => ({
        ...event,
        category: normalizeCategory(event.category),
      }));
      setEvents(future);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    window.addEventListener(APP_SOFT_REFRESH_EVENT, fetchAll);
    return () => window.removeEventListener(APP_SOFT_REFRESH_EVENT, fetchAll);
  }, [fetchAll]);

  const categories = ['all', ...new Set(events.map((e) => normalizeCategory(e.category)))];
  const filtered = filter === 'all'
    ? events
    : events.filter((e) => normalizeCategory(e.category) === filter);

  return (
    <>
      <OnboardingTour
        tourId="deadlines-onboarding"
        steps={[
          {
            target: '[data-tour="deadlines-header"]',
            title: 'Never miss a deadline!',
            description: 'Every event from all your rooms shows up here automatically. You\'re covered!',
            icon: '🔥',
            position: 'bottom',
          },
        ]}
      />
      <PageTour
        tourId="deadlines"
        steps={[
          {
            target: '[data-tour="deadlines-header"]',
            title: 'Deadlines',
            desc: 'All your upcoming events and deadlines across every room show up here. Create a room, schedule events, and never miss a thing!',
            position: 'bottom',
          },
        ]}
      />
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div data-tour="deadlines-header" className="relative overflow-hidden rounded-[24px] bg-gradient-to-r from-orange-500 via-rose-500 to-pink-600 px-4 py-5 text-white shadow-lg sm:rounded-2xl sm:px-8 sm:py-8">
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <h1 className="text-[1.7rem] font-black tracking-tight sm:text-3xl">Upcoming Deadlines</h1>
            <p className="mt-1.5 text-[13px] text-white/75 sm:mt-2 sm:text-base">All your upcoming events across every room</p>
          </div>
        </div>

        {/* Category filter */}
        {categories.length > 2 && (
          <div className="-mx-1 flex flex-nowrap gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-hide">
            {categories.map((cat) => {
              const info = CATEGORY_INFO[cat] || { icon: '📌', label: cat };
              return (
                <Button
                  key={cat}
                  variant={filter === cat ? 'default' : 'outline'}
                  size="sm"
                  className={`h-auto min-h-[2.15rem] shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11px] gap-1.5 sm:px-3 sm:text-xs ${filter === cat ? 'bg-gradient-to-r from-orange-500 to-rose-500 text-white border-0 shadow-md' : ''}`}
                  onClick={() => setFilter(cat)}
                >
                  {cat === 'all' ? '🔍' : info.icon}
                  {cat === 'all' ? 'All' : info.label}
                </Button>
              );
            })}
          </div>
        )}

        {/* Events list */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-orange-200 p-8 text-center sm:p-16">
            <CalendarDays className="h-12 w-12 mx-auto text-orange-300 mb-4" />
            <h3 className="text-lg font-semibold">No upcoming deadlines</h3>
            <p className="mt-2 text-sm text-muted-foreground">You're all caught up! No events scheduled.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((event) => {
              const startDate = new Date(event.start_time);
              const now = new Date();
              const diffMs = startDate - now;
              const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
              const palette = getRoomPalette({ id: event.room_id, name: event.room_name });
              const normalizedCategory = normalizeCategory(event.category);
              const catInfo = CATEGORY_INFO[normalizedCategory] || CATEGORY_INFO.other;

              let badgeText = `D-${diffDays}`;
              let badgeBg = 'bg-emerald-100 text-emerald-700';
              if (diffDays <= 0) { badgeText = 'TODAY'; badgeBg = 'bg-red-100 text-red-700'; }
              else if (diffDays === 1) { badgeText = 'D-1'; badgeBg = 'bg-red-100 text-red-700'; }
              else if (diffDays <= 3) { badgeBg = 'bg-orange-100 text-orange-700'; }
              else if (diffDays <= 7) { badgeBg = 'bg-yellow-100 text-yellow-700'; }

              return (
                <div
                  key={event.id}
                  className="flex items-start gap-3 rounded-2xl border bg-white px-3 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:items-center sm:gap-4 sm:px-5 sm:py-4"
                  style={{ borderLeftWidth: '4px', borderLeftColor: palette.accent }}
                  onClick={() => navigate(`/rooms/${event.room_id}`, {
                    state: { tab: 'schedule', eventDate: startDate.toISOString().slice(0, 10) },
                  })}
                >
                  <span
                    className="shrink-0 rounded-full px-2 py-1 text-[11px] font-bold sm:px-3 sm:text-sm"
                    style={{ backgroundColor: palette.pillBg, color: palette.pillText }}
                  >
                    {event.room_name}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="line-clamp-2 break-words text-[13px] font-semibold leading-snug sm:text-[15px]">
                      {event.title}
                    </p>
                    <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground sm:text-[13px]">
                      <p className="break-words text-muted-foreground/75">{catInfo.label}</p>
                      <p className="break-words">{format(startDate, 'EEE, MMM d · h:mm a')}</p>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-[13px] font-bold ${badgeBg} sm:px-3 sm:text-sm`}>
                      {badgeText}
                    </span>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground sm:text-xs">
                      {formatDistanceToNow(startDate, { addSuffix: true })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
