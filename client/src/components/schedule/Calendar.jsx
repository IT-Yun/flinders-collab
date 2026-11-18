import React, { useEffect, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getFlindersWeekLabelForDates } from '@/lib/flinders-week';

const categoryColors = {
  meeting: '#3b82f6',
  submission: '#f97316',
  quiz: '#14b8a6',
  exam: '#dc2626',
  presentation: '#8b5cf6',
  deadline: '#f43f5e',
  study: '#10b981',
  lecture: '#4f46e5',
  social: '#f59e0b',
  holiday: '#ef4444',
  break: '#10b981',
  other: '#94a3b8',
};

export default function ScheduleCalendar({ events = [], selectedDate, onSelectDate, onDateClick, onAddEvent, onDismissPrompt, roomId, promptResetToken = 0, scrollFollowDate, weekOffset = 0 }) {
  const [month, setMonth] = useState(new Date());
  const [addPrompt, setAddPrompt] = useState(null); // date to show "add event?" prompt
  const showWeekColumn = events.some((event) => event.isAcademicOverlay);

  // Reset to current month when room changes
  useEffect(() => {
    setMonth(new Date());
    setAddPrompt(null);
  }, [roomId]);

  useEffect(() => {
    setAddPrompt(null);
  }, [promptResetToken]);

  // Follow scroll — update displayed month when scrollFollowDate changes
  useEffect(() => {
    if (!scrollFollowDate) return;
    const scrollMonth = new Date(scrollFollowDate);
    if (scrollMonth.getFullYear() !== month.getFullYear() || scrollMonth.getMonth() !== month.getMonth()) {
      setMonth(scrollMonth);
    }
  }, [scrollFollowDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const eventMarkersByDate = events.reduce((map, event) => {
    const rawDate = event.date || event.start_time;
    if (!rawDate) return map;
    if (event.isAcademicOverlay) return map;
    const color = categoryColors[event.category] || categoryColors.other;
    const startDate = new Date(rawDate);
    const endDate = event.end_time ? new Date(event.end_time) : startDate;
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    days.forEach((day) => {
      const dateKey = format(day, 'yyyy-MM-dd');
      const existing = map.get(dateKey) || [];
      if (!existing.includes(color)) {
        existing.push(color);
      }
      map.set(dateKey, existing.slice(0, 3));
    });
    return map;
  }, new Map());

  const overlayTypeByDate = events.reduce((map, event) => {
    if (!event.isAcademicOverlay) return map;
    const rawDate = event.date || event.start_time;
    if (!rawDate) return map;
    const startDate = new Date(rawDate);
    const endDate = event.end_time ? new Date(event.end_time) : startDate;
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    days.forEach((day) => {
      const dateKey = format(day, 'yyyy-MM-dd');
      map.set(dateKey, event.category === 'holiday' ? 'holiday' : 'break');
    });
    return map;
  }, new Map());

  const eventDateKeys = new Set(eventMarkersByDate.keys());
  const hasEvent = (date) => eventDateKeys.has(format(date, 'yyyy-MM-dd'));
  const hasAcademicOverlay = (date) => overlayTypeByDate.has(format(date, 'yyyy-MM-dd'));

  const calendarRows = [];
  let rowStart = startOfWeek(startOfMonth(month));
  const lastRowEnd = endOfWeek(endOfMonth(month));
  while (rowStart <= lastRowEnd) {
    const dates = Array.from({ length: 7 }, (_, index) => addDays(rowStart, index));
    calendarRows.push({
      key: format(rowStart, 'yyyy-MM-dd'),
      label: getFlindersWeekLabelForDates(dates, { short: true, weekOffset }),
    });
    rowStart = addDays(rowStart, 7);
  }

  const EventDayButton = (props) => {
    const { modifiers, day, className, children, ...buttonProps } = props;
    const dateKey = format(day.date, 'yyyy-MM-dd');
    const markerColors = eventMarkersByDate.get(dateKey) || [];
    const overlayType = overlayTypeByDate.get(dateKey);
    const prevDateKey = format(addDays(day.date, -1), 'yyyy-MM-dd');
    const nextDateKey = format(addDays(day.date, 1), 'yyyy-MM-dd');
    const connectsLeft = Boolean(
      overlayType
      && day.date.getDay() !== 0
      && overlayTypeByDate.get(prevDateKey) === overlayType
    );
    const connectsRight = Boolean(
      overlayType
      && day.date.getDay() !== 6
      && overlayTypeByDate.get(nextDateKey) === overlayType
    );
    const buttonRef = useRef(null);

    useEffect(() => {
      if (modifiers.focused) {
        buttonRef.current?.focus();
      }
    }, [modifiers.focused]);

    return (
      <button
        {...buttonProps}
        ref={buttonRef}
        type="button"
        data-calendar-date={dateKey}
        className={cn(
          className,
          'relative flex h-10 w-10 sm:h-9 sm:w-9 flex-col items-center justify-center gap-0.5 overflow-visible transition-all duration-150',
          overlayType && 'rounded-none',
          overlayType && !connectsLeft && 'rounded-l-xl',
          overlayType && !connectsRight && 'rounded-r-xl',
          overlayType === 'holiday' && 'bg-red-50 text-red-700 hover:bg-red-100 ring-1 ring-red-200/70',
          overlayType === 'break' && 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 ring-1 ring-emerald-200/80',
          overlayType && connectsLeft && '-ml-1 pl-1',
          overlayType && connectsRight && '-mr-1 pr-1',
          !overlayType && 'hover:bg-blue-50'
        )}
      >
        <span className="relative z-[1] leading-none">{children}</span>
        {markerColors.length > 0 && (
          <span className="relative z-[1] flex items-center gap-0.5" aria-hidden="true">
            {markerColors.map((color) => (
              <span
                key={color}
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: color }}
              />
            ))}
          </span>
        )}
      </button>
    );
  };

  const modifiers = {
    hasEvent,
  };

  const modifiersStyles = {
    hasEvent: {},
  };

  const handleSelect = (date) => {
    if (!date) {
      if (addPrompt && hasEvent(addPrompt)) {
        onSelectDate?.(addPrompt);
        setAddPrompt(addPrompt);
        return;
      }
      onSelectDate?.(date);
      return;
    }

    onSelectDate?.(date);
    if (date && hasEvent(date)) {
      onDateClick?.(date);
      setAddPrompt(date);
    } else if (date && hasAcademicOverlay(date)) {
      onDateClick?.(date);
      setAddPrompt(date);
    } else {
      setAddPrompt(null);
      onAddEvent?.(date);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white shadow-xl shadow-blue-500/5 overflow-visible">
      {/* Gradient header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-2xl p-4 flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full text-white hover:bg-white/20 transition-colors duration-150"
          onClick={() => setMonth((m) => subMonths(m, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-base font-bold tracking-wide text-white">{format(month, 'MMMM yyyy')}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full text-white hover:bg-white/20 transition-colors duration-150"
          onClick={() => setMonth((m) => addMonths(m, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {/* Calendar body */}
      <div className="bg-white rounded-b-2xl p-4">
        <div className="flex gap-3">
          {showWeekColumn && (
            <div className="hidden w-11 shrink-0 sm:block">
              <div className="h-7" />
              {calendarRows.map((row) => (
                <div key={row.key} className="mt-2 flex h-10 items-center justify-center sm:h-9">
                  {row.label ? (
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-500">
                      {row.label}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <DayPicker
              mode="single"
              selected={selectedDate}
              onSelect={handleSelect}
              month={month}
              onMonthChange={setMonth}
              hideNavigation
              modifiers={modifiers}
              modifiersStyles={modifiersStyles}
              components={{
                DayButton: EventDayButton,
              }}
              showOutsideDays
              classNames={{
                months: 'flex flex-col',
                month: 'space-y-2',
                month_caption: 'hidden',
                month_grid: 'w-full border-collapse space-y-1',
                weekdays: 'flex',
                weekday: 'w-10 sm:w-9 rounded-md text-[0.75rem] font-bold uppercase tracking-wider text-blue-600/60',
                week: 'mt-2 flex w-full',
                day: 'relative h-10 w-10 sm:h-9 sm:w-9 p-0 text-center text-sm',
                day_button: cn(
                  buttonVariants({ variant: 'ghost' }),
                  'h-10 w-10 sm:h-9 sm:w-9 p-0 font-normal rounded-xl transition-all duration-150 aria-selected:opacity-100'
                ),
                selected: 'rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/30 hover:bg-blue-600 hover:text-white focus:bg-blue-600 focus:text-white font-bold',
                today: 'rounded-xl bg-blue-50 text-blue-700 font-bold ring-2 ring-blue-200',
                outside: 'text-slate-300 opacity-50',
                disabled: 'text-muted-foreground opacity-50',
                hidden: 'invisible',
              }}
            />
          </div>
        </div>
      </div>

      {/* Add event prompt - appears below calendar */}
      {addPrompt && (
        <div className="border-t border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-b-2xl px-4 py-3 animate-fade-in">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-700">
                {format(addPrompt, 'MMM d, EEEE')}
              </p>
              <p className="text-xs text-slate-500">Add a new event?</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                size="sm"
                className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md text-xs gap-1"
                onClick={() => {
                  onAddEvent?.(addPrompt);
                  setAddPrompt(null);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-slate-600"
                onClick={() => { setAddPrompt(null); onDismissPrompt?.(); }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
