import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DateField, TimeField } from '@/components/ui/date-time-field';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MapPin, Clock, Trash2, Pencil, ChevronDown, ChevronUp, Loader2, Navigation } from 'lucide-react';
import { format } from 'date-fns';
import { deleteEvent, updateEvent } from '@/services/events';
import { getLocationStatus } from '@/services/location';
import { useAuth } from '@/hooks/useAuth';
import LocationToggle from '@/components/location/LocationToggle';
const LocationMap = lazy(() => import('@/components/location/LocationMap'));

const categoryConfig = {
  meeting:      { label: 'Meeting',       icon: '👥', color: 'bg-blue-500',    badgeBg: 'bg-blue-100 text-blue-800 border-blue-300', borderColor: 'border-l-blue-500' },
  submission:   { label: 'Submission',    icon: '📮', color: 'bg-orange-500',  badgeBg: 'bg-orange-100 text-orange-800 border-orange-300', borderColor: 'border-l-orange-500' },
  quiz:         { label: 'Quiz',          icon: '✏️', color: 'bg-teal-500',    badgeBg: 'bg-teal-100 text-teal-800 border-teal-300', borderColor: 'border-l-teal-500' },
  exam:         { label: 'Exam',          icon: '📝', color: 'bg-red-600',     badgeBg: 'bg-red-100 text-red-800 border-red-300', borderColor: 'border-l-red-600' },
  presentation: { label: 'Presentation',  icon: '📊', color: 'bg-violet-500',  badgeBg: 'bg-violet-100 text-violet-800 border-violet-300', borderColor: 'border-l-violet-500' },
  deadline:     { label: 'Deadline',       icon: '⏰', color: 'bg-rose-500',    badgeBg: 'bg-rose-50 text-rose-700 border-rose-200/60', borderColor: 'border-l-rose-500' },
  study:        { label: 'Study Session',  icon: '📚', color: 'bg-emerald-500', badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200/60', borderColor: 'border-l-emerald-500' },
  lecture:      { label: 'Lecture',        icon: '🎓', color: 'bg-indigo-500',  badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200/60', borderColor: 'border-l-indigo-500' },
  social:       { label: 'Social',        icon: '🎉', color: 'bg-amber-500',   badgeBg: 'bg-amber-50 text-amber-700 border-amber-200/60', borderColor: 'border-l-amber-500' },
  holiday:      { label: 'Holiday',       icon: '🏖️', color: 'bg-red-500',     badgeBg: 'bg-red-50 text-red-700 border-red-200/60', borderColor: 'border-l-red-500' },
  break:        { label: 'Break',         icon: '🌿', color: 'bg-emerald-500', badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200/60', borderColor: 'border-l-emerald-500' },
  other:        { label: 'Other',         icon: '📌', color: 'bg-gray-400',    badgeBg: 'bg-gray-50 text-gray-600 border-gray-200/60', borderColor: 'border-l-gray-400' },
};

const DUE_ONLY_CATEGORIES = new Set(['submission', 'deadline']);

export default function EventList({ events = [], roomId, onEventsChange }) {
  const { user } = useAuth();
  const [expandedId, setExpandedId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editEvent, setEditEvent] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editLoading, setEditLoading] = useState(false);
  const [activeMapEventId, setActiveMapEventId] = useState(null);
  const [locationMembers, setLocationMembers] = useState({});
  const [sharingEventIds, setSharingEventIds] = useState(new Set());
  const [showPast, setShowPast] = useState(false);

  // Fetch location status for events that have location sharing enabled
  const fetchLocationStatus = useCallback(async (eventId) => {
    try {
      const data = await getLocationStatus(eventId);
      const members = Array.isArray(data) ? data : [];
      setLocationMembers((prev) => ({ ...prev, [eventId]: members }));
      // Check if current user is sharing
      const userSession = members.find(
        (m) => String(m.user_id) === String(user?.id) && m.status !== 'stopped'
      );
      setSharingEventIds((prev) => {
        const next = new Set(prev);
        if (userSession) next.add(eventId);
        else next.delete(eventId);
        return next;
      });
    } catch {
      // non-critical
    }
  }, [user?.id]);

  // Load location status for location-enabled events
  useEffect(() => {
    const locationEvents = events.filter((e) => e.enable_location_sharing);
    locationEvents.forEach((e) => fetchLocationStatus(e.id));
  }, [events, fetchLocationStatus]);

  // Auto-refresh location data for the active map event
  useEffect(() => {
    if (!activeMapEventId) return;
    const interval = setInterval(() => fetchLocationStatus(activeMapEventId), 15000);
    return () => clearInterval(interval);
  }, [activeMapEventId, fetchLocationStatus]);

  const handleLocationToggle = useCallback(
    (eventId, sharing) => {
      setSharingEventIds((prev) => {
        const next = new Set(prev);
        if (sharing) next.add(eventId);
        else next.delete(eventId);
        return next;
      });
      // Refresh location data after toggle
      setTimeout(() => fetchLocationStatus(eventId), 500);
    },
    [fetchLocationStatus],
  );

  const sorted = [...events].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const eventId = confirmDelete.id;
    setConfirmDelete(null);
    setDeletingId(eventId);
    try {
      await deleteEvent(roomId, eventId);
      onEventsChange?.((prev) => prev.filter((event) => event.id !== eventId));
    } catch {
      // fail silently
    } finally {
      setDeletingId(null);
    }
  };

  const handleEditOpen = (event) => {
    setEditEvent(event);
    const start = new Date(event.start_time);
    const end = event.end_time ? new Date(event.end_time) : null;
    const isDueOnlyCategory = DUE_ONLY_CATEGORIES.has(event.category);
    setEditForm({
      title: event.title || '',
      description: event.description || '',
      location_name: event.location_name || event.location || '',
      start_date: format(start, 'yyyy-MM-dd'),
      start_time: isDueOnlyCategory ? '' : format(start, 'HH:mm'),
      end_time: end ? format(end, 'HH:mm') : (isDueOnlyCategory ? format(start, 'HH:mm') : ''),
      enable_location_sharing: event.enable_location_sharing || false,
    });
  };

  const handleEditSave = async () => {
    if (!editEvent) return;
    setEditLoading(true);
    try {
      const isDueOnlyCategory = DUE_ONLY_CATEGORIES.has(editEvent.category);
      if (!editForm.start_date) {
        return;
      }

      if (isDueOnlyCategory && !editForm.end_time) {
        return;
      }

      if (!isDueOnlyCategory && (!editForm.start_time || !editForm.end_time)) {
        return;
      }

      const startDt = new Date(`${editForm.start_date}T${isDueOnlyCategory ? editForm.end_time : editForm.start_time}`);
      const updates = {
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        location_name: editForm.location_name.trim() || null,
        start_time: startDt.toISOString(),
        enable_location_sharing: editForm.enable_location_sharing || false,
        end_time: null,
      };
      if (!isDueOnlyCategory && editForm.end_time) {
        updates.end_time = new Date(`${editForm.start_date}T${editForm.end_time}`).toISOString();
      }
      const updatedEvent = await updateEvent(roomId, editEvent.id, updates);
      onEventsChange?.((prev) =>
        prev.map((event) => (
          event.id === editEvent.id
            ? { ...event, ...updatedEvent }
            : event
        ))
      );
      setEditEvent(null);
    } catch {
      // fail silently
    } finally {
      setEditLoading(false);
    }
  };

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50">
          <span className="text-2xl">📅</span>
        </div>
        <p className="text-sm font-semibold text-slate-400">No events yet</p>
        <p className="text-[11px] text-slate-300 mt-1 max-w-[180px] leading-relaxed">Click a date to add your first event</p>
      </div>
    );
  }

  const todayKey = format(new Date(), 'yyyy-MM-dd');

  const upcomingGrouped = {};
  const pastGrouped = {};
  sorted.forEach((event) => {
    const dateKey = format(new Date(event.start_time), 'yyyy-MM-dd');
    if (dateKey < todayKey) {
      if (!pastGrouped[dateKey]) pastGrouped[dateKey] = [];
      pastGrouped[dateKey].push(event);
    } else {
      if (!upcomingGrouped[dateKey]) upcomingGrouped[dateKey] = [];
      upcomingGrouped[dateKey].push(event);
    }
  });

  const pastCount = Object.values(pastGrouped).reduce((sum, arr) => sum + arr.length, 0);

  const renderDateGroup = ([dateKey, dayEvents]) => {
          const date = new Date(dateKey + 'T00:00:00');
          const isPast = dateKey < todayKey;
          const isToday = dateKey === todayKey;
          return (
            <div key={dateKey} id={`event-date-${dateKey}`} className={`scroll-mt-4 rounded-2xl p-3 transition-all duration-500 ${isPast ? 'opacity-50' : ''}`}>
              {/* Date header row */}
              <div className="flex items-center gap-3 mb-3">
                <div className={`flex items-center gap-0 rounded-xl overflow-hidden shadow-sm ${
                  isToday
                    ? 'ring-2 ring-blue-400 ring-offset-2'
                    : ''
                }`}>
                  <div className={`px-3 py-1.5 text-center ${
                    isToday
                      ? 'bg-blue-600 text-white'
                      : isPast
                        ? 'bg-slate-200 text-slate-500'
                        : 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white'
                  }`}>
                    <span className="text-[10px] font-bold uppercase tracking-wider block leading-tight opacity-80">{format(date, 'EEE')}</span>
                    <span className="text-xl font-black leading-tight">{format(date, 'd')}</span>
                  </div>
                  <div className={`px-2.5 py-1.5 text-center ${
                    isToday
                      ? 'bg-blue-50 text-blue-700'
                      : isPast
                        ? 'bg-slate-50 text-slate-400'
                        : 'bg-indigo-50 text-indigo-600'
                  }`}>
                    <span className="text-xs font-bold">{format(date, 'MMM')}</span>
                  </div>
                </div>
                <div className={`h-px flex-1 ${isToday ? 'bg-blue-300' : isPast ? 'bg-slate-100' : 'bg-indigo-100'}`} />
                {isToday && <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-wider">Today</span>}
              </div>

              {/* Events */}
              <div className="space-y-2 pl-1">
                {dayEvents.map((event) => {
                  const cat = categoryConfig[event.category] || categoryConfig.other;
                  const startDt = new Date(event.start_time);
                  const endDt = event.end_time ? new Date(event.end_time) : null;
                  const locationName = event.location_name || event.location;
                  const isExpanded = expandedId === event.id;
                  const hasDetails = Boolean(locationName || event.enable_location_sharing);
                  const isAcademicOverlay = Boolean(event.isAcademicOverlay);
                  const isDueOnlyCategory = DUE_ONLY_CATEGORIES.has(event.category);
                  const timeLabel = isAcademicOverlay && event.all_day
                    ? 'All day'
                    : isDueOnlyCategory && !endDt
                      ? `Due ${format(startDt, 'h:mm a')}`
                      : `${format(startDt, 'h:mm a')}${endDt ? ` – ${format(endDt, 'h:mm a')}` : ''}`;

                  return (
                    <div key={event.id} className={`group relative rounded-xl border border-slate-100 border-l-[3px] ${cat.borderColor} bg-white px-3.5 py-3 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-px`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="outline" className={`text-[10px] px-2 py-0 leading-4 gap-0.5 font-semibold rounded-full border ${cat.badgeBg}`}>
                              <span className="text-xs">{cat.icon}</span>
                              {cat.label}
                            </Badge>
                            <span className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                              <Clock className="h-3 w-3" />
                              {timeLabel}
                            </span>
                          </div>
                          <p className="mt-1.5 text-[19px] font-bold leading-tight tracking-[-0.01em] text-slate-900">
                            {event.title}
                          </p>
                          {event.description && (
                            <p className="mt-2 text-[14px] leading-6 text-slate-600 whitespace-pre-wrap">
                              {event.description}
                            </p>
                          )}
                          {hasDetails && (
                            <>
                              <button
                                type="button"
                                onClick={() => setExpandedId(isExpanded ? null : event.id)}
                                className="mt-2 flex items-center gap-1 text-[12px] text-blue-500 hover:text-blue-700 transition-colors duration-150 font-medium"
                              >
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                {isExpanded ? 'Hide details' : 'Details'}
                              </button>
                              {isExpanded && (
                                <div className="mt-2 space-y-2.5 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                                  {locationName && (
                                    <p className="flex items-center gap-2 text-[13px] text-slate-600">
                                      <MapPin className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                                      <span className="font-medium">{locationName}</span>
                                    </p>
                                  )}
                                  {event.enable_location_sharing && (
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <LocationToggle
                                          roomId={roomId}
                                          eventId={event.id}
                                          isSharing={sharingEventIds.has(event.id)}
                                          onToggle={(sharing) => handleLocationToggle(event.id, sharing)}
                                        />
                                        {(locationMembers[event.id]?.length || 0) > 0 && (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="text-xs"
                                            onClick={() => setActiveMapEventId(activeMapEventId === event.id ? null : event.id)}
                                          >
                                            <Navigation className="mr-1.5 h-3 w-3" />
                                            {activeMapEventId === event.id ? 'Hide Map' : `Map (${locationMembers[event.id].length})`}
                                          </Button>
                                        )}
                                      </div>
                                      {activeMapEventId === event.id && (
                                        <Suspense fallback={<div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
                                          <LocationMap members={locationMembers[event.id] || []} />
                                        </Suspense>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {!isAcademicOverlay && (
                          <div className="flex items-center gap-0.5 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-7 sm:w-7 rounded-lg hover:bg-blue-50" onClick={() => handleEditOpen(event)}>
                                  <Pencil className="h-3.5 w-3.5 text-blue-500 sm:text-slate-400 sm:group-hover:text-blue-500 transition-colors" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top"><p>Edit</p></TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 sm:h-7 sm:w-7 rounded-lg hover:bg-red-50"
                                  onClick={() => setConfirmDelete({ id: event.id, title: event.title })}
                                  disabled={deletingId === event.id}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-red-500 sm:text-slate-400 sm:group-hover:text-red-500 transition-colors" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top"><p>Delete</p></TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
  };

  return (
    <>
      <div className="space-y-1">
        {/* Upcoming & today events */}
        {Object.entries(upcomingGrouped).map(renderDateGroup)}

        {/* Past events section */}
        {pastCount > 0 && (
          <div className="pt-1">
            <button
              onClick={() => setShowPast(!showPast)}
              className="w-full flex items-center gap-3 py-2.5 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors"
            >
              <div className="h-px flex-1 bg-slate-200" />
              <span className="flex items-center gap-1">
                {showPast ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {showPast ? 'Hide' : 'Show'} past events ({pastCount})
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </button>
            {showPast && (
              <div className="space-y-1 mt-1">
                {Object.entries(pastGrouped).reverse().map(renderDateGroup)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit event dialog */}
      <Dialog open={!!editEvent} onOpenChange={(open) => !open && setEditEvent(null)}>
      <DialogContent className="sm:max-w-[560px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Edit Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Title</label>
              <Input className="rounded-xl border-slate-200" value={editForm.title || ''} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} disabled={editLoading} />
            </div>
            <div className={`grid gap-3 ${DUE_ONLY_CATEGORIES.has(editEvent?.category) ? 'md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]' : 'md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]'}`}>
              <DateField
                label="Date"
                value={editForm.start_date || ''}
                onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                disabled={editLoading}
              />
              {!DUE_ONLY_CATEGORIES.has(editEvent?.category) && (
                <TimeField
                  label="Start"
                  value={editForm.start_time || ''}
                  onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })}
                  disabled={editLoading}
                />
              )}
              <TimeField
                label={DUE_ONLY_CATEGORIES.has(editEvent?.category) ? 'Due' : 'End'}
                value={editForm.end_time || ''}
                onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })}
                disabled={editLoading}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Location</label>
              <Input className="rounded-xl border-slate-200" value={editForm.location_name || ''} onChange={(e) => setEditForm({ ...editForm, location_name: e.target.value })} disabled={editLoading} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Description</label>
              <Textarea className="rounded-xl border-slate-200" value={editForm.description || ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} disabled={editLoading} />
            </div>
            {editForm.location_name?.trim() && (
              <button
                type="button"
                onClick={() => setEditForm({ ...editForm, enable_location_sharing: !editForm.enable_location_sharing })}
                disabled={editLoading}
                className={`flex items-center gap-2.5 w-full rounded-xl border-2 px-4 py-3 text-sm transition-all duration-200 ${
                  editForm.enable_location_sharing
                    ? 'border-blue-500 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 font-semibold'
                    : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 text-slate-500'
                }`}
              >
                <MapPin className={`h-4 w-4 ${editForm.enable_location_sharing ? 'text-blue-600' : 'text-slate-400'}`} />
                Enable live location sharing
              </button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setEditEvent(null)} disabled={editLoading}>Cancel</Button>
            <Button className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25" onClick={handleEditSave} disabled={editLoading || !editForm.title?.trim()}>
              {editLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{confirmDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Yes, Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
