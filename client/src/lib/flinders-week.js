import { differenceInCalendarDays, format, isValid, parseISO, startOfDay } from 'date-fns';

const FLINDERS_WEEK_OFFSET_KEY = 'flinders-week-offset';

const FLINDERS_SEMESTER_STARTS = [
  { date: '2025-03-03', semester: 1 },
  { date: '2025-07-28', semester: 2 },
  { date: '2026-03-02', semester: 1 },
  { date: '2026-07-27', semester: 2 },
  { date: '2027-03-01', semester: 1 },
  { date: '2027-07-26', semester: 2 },
].map((entry) => ({ ...entry, parsedDate: parseISO(entry.date) }));

function normalizeDate(dateLike) {
  if (!dateLike) return null;
  const value = dateLike instanceof Date
    ? dateLike
    : typeof dateLike === 'string'
      ? parseISO(dateLike)
      : new Date(dateLike);
  if (!isValid(value)) return null;
  return startOfDay(value);
}

export function isFlindersUser(user) {
  const email = String(user?.email || '').toLowerCase();
  const accountType = String(user?.account_type || user?.user_metadata?.account_type || '').toLowerCase();
  const university = String(user?.user_metadata?.university || '').toLowerCase();
  return accountType === 'flinders' || email.endsWith('@flinders.edu.au') || university.includes('flinders');
}

export function getStoredFlindersWeekOffset() {
  if (typeof window === 'undefined') return 0;
  const rawValue = window.localStorage.getItem(FLINDERS_WEEK_OFFSET_KEY);
  const parsed = Number.parseInt(rawValue || '0', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function setStoredFlindersWeekOffset(offset) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FLINDERS_WEEK_OFFSET_KEY, String(offset));
}

export function getFlindersWeekInfo(dateLike, options = {}) {
  const target = normalizeDate(dateLike);
  if (!target) return null;
  const weekOffset = Number.isFinite(options.weekOffset) ? options.weekOffset : getStoredFlindersWeekOffset();

  for (let index = 0; index < FLINDERS_SEMESTER_STARTS.length; index += 1) {
    const current = FLINDERS_SEMESTER_STARTS[index];
    const next = FLINDERS_SEMESTER_STARTS[index + 1];
    const start = current.parsedDate;
    const nextStart = next?.parsedDate ?? null;

    if (target < start) continue;
    if (nextStart && target >= nextStart) continue;

    const week = Math.max(1, Math.floor(differenceInCalendarDays(target, start) / 7) + 1 + weekOffset);
    return {
      semester: current.semester,
      week,
      isBreak: false,
      label: `Week ${week}`,
      shortLabel: `Wk ${week}`,
    };
  }

  return null;
}

export function getFlindersWeekLabel(dateLike, options = {}) {
  const info = getFlindersWeekInfo(dateLike, options);
  if (!info) return null;
  return options.short ? info.shortLabel : info.label;
}

export function getFlindersWeekLabelForDates(dates, options = {}) {
  const labels = dates
    .map((date) => ({ date, info: getFlindersWeekInfo(date, options) }))
    .filter((entry) => entry.info);

  const weekdayTeachingWeek = labels.find((entry) => {
    const normalized = normalizeDate(entry.date);
    const day = normalized?.getDay();
    return day >= 1 && day <= 5;
  });
  if (weekdayTeachingWeek) {
    return options.short ? weekdayTeachingWeek.info.shortLabel : weekdayTeachingWeek.info.label;
  }

  const fallbackWeek = labels[0];
  if (fallbackWeek) return options.short ? fallbackWeek.info.shortLabel : fallbackWeek.info.label;

  return null;
}

export function formatFlindersWeekContext(dateLike) {
  const info = getFlindersWeekInfo(dateLike);
  if (!info) return null;
  return `${info.label} · Semester ${info.semester}`;
}

export const getFlindersWeekContext = formatFlindersWeekContext;

export function getFlindersWeekDebugDate(dateLike) {
  const normalized = normalizeDate(dateLike);
  return normalized ? format(normalized, 'yyyy-MM-dd') : null;
}
