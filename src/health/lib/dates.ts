import type { HHMM, ISODate, Weekday } from '../data/types';

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

/** Local-time 'YYYY-MM-DD' for a Date (defaults to now). */
export function toISODate(date: Date = new Date()): ISODate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

/** Parse 'YYYY-MM-DD' into a local-midnight Date. */
export function parseISODate(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
}

export function addDays(d: ISODate, n: number): ISODate {
  const dt = parseISODate(d);
  dt.setDate(dt.getDate() + n);
  return toISODate(dt);
}

/** b − a in whole days. */
export function diffDays(a: ISODate, b: ISODate): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function weekdayOf(d: ISODate): Weekday {
  return parseISODate(d).getDay() as Weekday;
}

/** 'YYYY-MM' shard key for a date. */
export function yearMonthOf(d: ISODate): string {
  return d.slice(0, 7);
}

/** Inclusive list of dates from start to end. */
export function dateRange(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cur = start;
  let guard = 0;
  while (cur <= end && guard++ < 5000) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Last n dates ending at `end` (inclusive), ascending. */
export function lastNDates(end: ISODate, n: number): ISODate[] {
  return dateRange(addDays(end, -(n - 1)), end);
}

export function nowHHMM(date: Date = new Date()): HHMM {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 'HH:MM' → minutes since midnight (0–1439). Returns null if malformed. */
export function hhmmToMinutes(t: HHMM | undefined | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function minutesToHHMM(mins: number): HHMM {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/**
 * Bedtimes straddle midnight. Map 'HH:MM' onto a continuous axis of minutes
 * since 12:00 noon, so 23:00 → 660 and 00:30 → 750. Use this for means/SDs.
 */
export function minutesSinceNoon(t: HHMM | undefined | null): number | null {
  const m = hhmmToMinutes(t);
  if (m === null) return null;
  return m >= 720 ? m - 720 : m + 720;
}

export function minutesSinceNoonToHHMM(mins: number): HHMM {
  return minutesToHHMM(mins + 720);
}

/** Format 'HH:MM' → '11:00 pm' style. */
export function formatClock(t: HHMM | undefined | null, style: '12h' | '24h' = '12h'): string {
  const m = hhmmToMinutes(t);
  if (m === null) return '—';
  if (style === '24h') return minutesToHHMM(m);
  const h = Math.floor(m / 60);
  const min = m % 60;
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(min)} ${suffix}`;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDateShort(d: ISODate): string {
  const dt = parseISODate(d);
  return `${WEEKDAY_SHORT[dt.getDay()]} ${dt.getDate()} ${MONTH_SHORT[dt.getMonth()]}`;
}

export function formatDateLong(d: ISODate): string {
  const dt = parseISODate(d);
  return `${WEEKDAY_SHORT[dt.getDay()]}, ${dt.getDate()} ${MONTH_SHORT[dt.getMonth()]} ${dt.getFullYear()}`;
}

export function weekdayShort(w: Weekday): string {
  return WEEKDAY_SHORT[w];
}

export { WEEKDAY_SHORT, MONTH_SHORT };
