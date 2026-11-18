import { format, parseISO } from 'date-fns';

const FLINDERS_SCHEDULE_OVERLAYS_2026 = [
  { type: 'holiday', date: '2026-01-01', title: "New Year's Day" },
  { type: 'holiday', date: '2026-01-26', title: 'Australia Day' },
  { type: 'holiday', date: '2026-03-09', title: 'Adelaide Cup' },
  { type: 'holiday', date: '2026-04-03', title: 'Good Friday' },
  { type: 'holiday', date: '2026-04-04', title: 'Easter Saturday' },
  { type: 'holiday', date: '2026-04-06', title: 'Easter Monday' },
  { type: 'break', startDate: '2026-04-13', endDate: '2026-04-24', title: 'Mid-Semester Break' },
  { type: 'holiday', date: '2026-04-25', title: 'ANZAC Day' },
  { type: 'holiday', date: '2026-06-08', title: "King's Birthday" },
  { type: 'break', startDate: '2026-07-06', endDate: '2026-07-19', title: 'Mid-Year Break' },
  { type: 'break', startDate: '2026-09-21', endDate: '2026-10-02', title: 'Mid-Semester Break' },
  { type: 'holiday', date: '2026-10-05', title: 'Labour Day' },
  { type: 'holiday', date: '2026-12-25', title: 'Christmas Day' },
  { type: 'holiday', date: '2026-12-28', title: 'Proclamation Day (Observed)' },
];

function toAllDayIso(date, edge = 'start') {
  return `${date}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}`;
}

export function getFlindersScheduleOverlayEvents() {
  return FLINDERS_SCHEDULE_OVERLAYS_2026.map((entry) => {
    const startDate = entry.startDate || entry.date;
    const endDate = entry.endDate || entry.date;
    const rangeLabel = startDate === endDate
      ? format(parseISO(startDate), 'EEEE, d MMMM yyyy')
      : `${format(parseISO(startDate), 'd MMM')} - ${format(parseISO(endDate), 'd MMM yyyy')}`;

    return {
      id: `flinders-overlay-${entry.type}-${startDate}`,
      title: entry.title,
      description: `Flinders ${entry.type === 'break' ? 'semester break' : 'public holiday'} · ${rangeLabel}`,
      category: entry.type,
      start_time: toAllDayIso(startDate, 'start'),
      end_time: toAllDayIso(endDate, 'end'),
      all_day: true,
      isAcademicOverlay: true,
      enable_location_sharing: false,
    };
  });
}
