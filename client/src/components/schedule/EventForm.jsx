import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DateField, TimeField } from '@/components/ui/date-time-field';
import { Loader2, MapPin } from 'lucide-react';
import { createEvent } from '@/services/events';
import { format } from 'date-fns';

const CATEGORIES = [
  { value: 'meeting', label: 'Meeting', icon: '👥' },
  { value: 'submission', label: 'Submission', icon: '📮' },
  { value: 'quiz', label: 'Quiz', icon: '✏️' },
  { value: 'exam', label: 'Exam', icon: '📝' },
  { value: 'presentation', label: 'Presentation', icon: '📊' },
  { value: 'deadline', label: 'Deadline', icon: '⏰' },
  { value: 'study', label: 'Study Session', icon: '📚' },
  { value: 'lecture', label: 'Lecture', icon: '🎓' },
  { value: 'social', label: 'Social', icon: '🎉' },
  { value: 'other', label: 'Other', icon: '📌' },
];

const DUE_ONLY_CATEGORIES = new Set(['submission', 'deadline']);
const CATEGORY_THEME = {
  meeting: {
    accent: 'from-sky-400 to-indigo-400',
    soft: 'bg-sky-50 text-sky-600 border-sky-100',
    selected: 'border-sky-300 bg-sky-50 text-sky-600 shadow-sky-100/80',
    ring: 'focus:border-sky-400',
  },
  submission: {
    accent: 'from-amber-300 to-orange-300',
    soft: 'bg-amber-50 text-amber-700 border-amber-100',
    selected: 'border-amber-300 bg-amber-50 text-amber-700 shadow-amber-100/80',
    ring: 'focus:border-amber-400',
  },
  quiz: {
    accent: 'from-teal-300 to-cyan-300',
    soft: 'bg-teal-50 text-teal-700 border-teal-100',
    selected: 'border-teal-300 bg-teal-50 text-teal-700 shadow-teal-100/80',
    ring: 'focus:border-teal-400',
  },
  exam: {
    accent: 'from-rose-400 to-red-400',
    soft: 'bg-rose-50 text-rose-700 border-rose-100',
    selected: 'border-rose-300 bg-rose-50 text-rose-700 shadow-rose-100/80',
    ring: 'focus:border-rose-400',
  },
  presentation: {
    accent: 'from-fuchsia-400 to-violet-400',
    soft: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100',
    selected: 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700 shadow-fuchsia-100/80',
    ring: 'focus:border-fuchsia-400',
  },
  deadline: {
    accent: 'from-amber-300 to-rose-300',
    soft: 'bg-amber-50 text-amber-700 border-amber-100',
    selected: 'border-amber-300 bg-gradient-to-br from-amber-50 to-rose-50 text-amber-700 shadow-amber-100/80',
    ring: 'focus:border-amber-400',
  },
  study: {
    accent: 'from-emerald-300 to-green-400',
    soft: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    selected: 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-emerald-100/80',
    ring: 'focus:border-emerald-400',
  },
  lecture: {
    accent: 'from-indigo-400 to-blue-400',
    soft: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    selected: 'border-indigo-300 bg-indigo-50 text-indigo-700 shadow-indigo-100/80',
    ring: 'focus:border-indigo-400',
  },
  social: {
    accent: 'from-pink-300 to-orange-300',
    soft: 'bg-pink-50 text-pink-700 border-pink-100',
    selected: 'border-pink-300 bg-pink-50 text-pink-700 shadow-pink-100/80',
    ring: 'focus:border-pink-400',
  },
  other: {
    accent: 'from-slate-300 to-slate-400',
    soft: 'bg-slate-50 text-slate-600 border-slate-100',
    selected: 'border-slate-300 bg-slate-50 text-slate-600 shadow-slate-100/80',
    ring: 'focus:border-slate-400',
  },
};

export default function EventForm({ roomId, onCreateStart, onCreated, onCreateError, selectedDate, open, onOpenChange }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('meeting');
  const [eventDate, setEventDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [locationName, setLocationName] = useState('');
  const [enableLocationSharing, setEnableLocationSharing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isDueOnlyCategory = DUE_ONLY_CATEGORIES.has(category);
  const theme = CATEGORY_THEME[category] || CATEGORY_THEME.meeting;
  const categoryButtonClasses = (isSelected) => `shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition-all ${
    isSelected
      ? `${theme.selected} shadow-sm`
      : 'border-slate-100 bg-white/90 text-slate-400'
  }`;

  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setCategory('meeting');
      setEventDate(selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '');
      setStartTime('09:00');
      setEndTime('10:00');
      setLocationName('');
      setEnableLocationSharing(false);
      setError('');
    }
  }, [open, selectedDate]);

  const displayDate = eventDate
    ? format(new Date(`${eventDate}T12:00:00`), 'EEEE, MMMM d, yyyy')
    : 'Choose a date for this event';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!eventDate) {
      setError('Please choose a date for this event.');
      return;
    }
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    let start;
    let end;

    if (isDueOnlyCategory) {
      if (!endTime) {
        setError('Due time is required for this type of event.');
        return;
      }
      start = new Date(`${eventDate}T${endTime}`).toISOString();
    } else {
      if (!startTime || !endTime) {
        setError('Start and end times are required.');
        return;
      }

      start = new Date(`${eventDate}T${startTime}`).toISOString();
      end = new Date(`${eventDate}T${endTime}`).toISOString();

      if (new Date(end) <= new Date(start)) {
        setError('End time must be after start time.');
        return;
      }
    }

    if (enableLocationSharing && !locationName.trim()) {
      setError('Location name is required when location sharing is enabled.');
      return;
    }

    setLoading(true);
    const tempEventId = `temp-event-${Date.now()}`;
    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      category,
      start_time: start,
      end_time: end,
      location_name: locationName.trim() || undefined,
      enable_location_sharing: enableLocationSharing,
    };
    try {
      onCreateStart?.({
        id: tempEventId,
        room_id: roomId,
        ...payload,
      });

      const createdEvent = await createEvent(roomId, payload);
      onOpenChange(false);
      onCreated?.(createdEvent, tempEventId);
    } catch (err) {
      onCreateError?.(tempEventId);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[calc(100dvh-0.75rem)] max-h-[calc(100dvh-0.75rem)] w-[calc(100vw-0.75rem)] max-w-[560px] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-[26px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))] p-0 backdrop-blur-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-full">
        <DialogHeader className="border-b border-slate-100 px-4 pb-2.5 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pb-4 sm:pt-6">
          <DialogTitle className="text-lg font-bold">New Event</DialogTitle>
          <DialogDescription className="text-slate-500">{displayDate}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-36 pt-3.5 sm:px-6 sm:pb-8 sm:pt-4">
          {/* Category selection */}
          <div className="space-y-2.5">
            <label className="text-sm font-semibold text-slate-700">Category</label>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0">
              {CATEGORIES.map((c) => {
                const isSelected = category === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={`${categoryButtonClasses(isSelected)} sm:min-h-[84px] sm:flex-col sm:justify-center sm:rounded-2xl sm:px-2 sm:py-2.5 sm:text-[11px]`}
                  >
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm sm:h-8 sm:w-8 sm:text-base ${isSelected ? 'bg-white/80' : 'bg-slate-50'}`}>{c.icon}</span>
                    <span className="whitespace-nowrap text-center leading-tight sm:w-full sm:break-words">{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div className="mt-4 space-y-2">
            <label className="text-sm font-semibold text-slate-700">Event Title</label>
            <Input
              className={`rounded-xl border-slate-100 bg-white/90 text-slate-700 placeholder:text-slate-300 ${theme.ring}`}
              placeholder="e.g. Group Meeting, Final Presentation..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          {/* Date and Time */}
          <div className="mt-4 space-y-3">
            <div className={`grid gap-3 ${isDueOnlyCategory ? 'grid-cols-1 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]' : 'grid-cols-1 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]'}`}>
              <DateField
                label="Date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                inputClassName="text-slate-600"
                className="sm:col-span-1"
              />
              {!isDueOnlyCategory && (
                <TimeField
                  label="Start"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              )}
              <TimeField
                label={isDueOnlyCategory ? 'Due' : 'End'}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
            <p className="text-xs text-slate-400">
              {isDueOnlyCategory
                ? 'Submission-style events only need a due date and due time.'
                : 'You can still change the date here even if you opened the form from another day on the calendar.'}
            </p>
          </div>

          {/* Location */}
          <div className="mt-4 space-y-2">
            <label className="text-sm font-semibold text-slate-700">Location <span className="text-slate-400 font-normal">(optional)</span></label>
            <Input className={`rounded-xl border-slate-100 bg-white/90 text-slate-700 placeholder:text-slate-300 ${theme.ring}`} placeholder="e.g. Flinders Library Room 3" value={locationName} onChange={(e) => setLocationName(e.target.value)} />
          </div>

          {/* Location Sharing Toggle */}
          {locationName.trim() && (
            <button
              type="button"
              onClick={() => setEnableLocationSharing((v) => !v)}
              className={`flex items-center gap-2.5 w-full rounded-xl border-2 px-4 py-3 text-sm transition-all duration-200 ${
                enableLocationSharing
                  ? `${theme.soft} font-semibold shadow-md`
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-500'
              }`}
            >
              <MapPin className={`h-4 w-4 ${enableLocationSharing ? 'text-current' : 'text-slate-400'}`} />
              Enable live location sharing for this event
            </button>
          )}

          {/* Description */}
          <div className="mt-4 space-y-2">
            <label className="text-sm font-semibold text-slate-700">Description <span className="text-slate-400 font-normal">(optional)</span></label>
            <Textarea
              className={`rounded-xl border-slate-100 bg-white/90 text-slate-700 placeholder:text-slate-300 ${theme.ring}`}
              placeholder="Add any details about this event..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {error && <p className="mt-4 text-sm font-medium text-destructive">{error}</p>}
          </div>
          <div className="sticky bottom-0 border-t border-slate-100 bg-white/98 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-6 sm:pb-6">
            <Button type="submit" className={`h-12 w-full rounded-xl bg-gradient-to-r ${theme.accent} font-semibold text-slate-800 shadow-sm transition-all duration-200`} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Event
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
