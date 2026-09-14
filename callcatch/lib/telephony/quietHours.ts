/**
 * Quiet-hours logic.
 *
 * `accounts.quiet_start` / `accounts.quiet_end` (Postgres `time`, e.g. "08:00:00" / "21:00:00")
 * describe the local-time window during which CallCatch is ALLOWED to text customers.
 * Outside that window outbound messages are queued (`messages.status='queued'`,
 * `messages.send_after = next window start`) and released by /api/cron/ai-followups.
 *
 * All computations use the account's IANA timezone via Intl.DateTimeFormat — no date library.
 */

export type QuietHoursAccount = {
  timezone: string | null;
  quiet_start: string | null;
  quiet_end: string | null;
};

export const DEFAULT_TIMEZONE = "America/Chicago";
const DEFAULT_START_MINUTES = 8 * 60; // 08:00
const DEFAULT_END_MINUTES = 21 * 60; // 21:00
/**
 * Replies (owner or AI) within this many minutes of a customer text bypass quiet hours: the
 * customer is awake and asked (COMPLIANCE.md §4, Settings copy, /sms-terms §5). Unsolicited
 * sends never qualify because they have no recent inbound row.
 */
export const INBOUND_REPLY_GRACE_MINUTES = 15;

/** Returns a valid IANA timezone, falling back to the default when missing/invalid. */
export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export type LocalTime = {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  minutesOfDay: number;
  /** YYYY-MM-DD in the account's timezone */
  dateIso: string;
  /** Human label, e.g. "Tue 3:42 PM" */
  label: string;
  timeZone: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Wall-clock time of `now` in `timeZone`. */
export function localTime(now: Date, timeZone: string): LocalTime {
  const tz = safeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const weekday = Math.max(0, WEEKDAYS.indexOf(get("weekday")));
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday,
    minutesOfDay: hour * 60 + minute,
    dateIso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    label: `${WEEKDAYS[weekday]} ${h12}:${String(minute).padStart(2, "0")} ${ampm}`,
    timeZone: tz,
  };
}

/** "08:00:00" | "8:00" | "21:30" -> minutes since midnight. */
export function parseTimeOfDay(value: string | null | undefined, fallbackMinutes: number): number {
  if (!value) return fallbackMinutes;
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return fallbackMinutes;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return fallbackMinutes;
  return h * 60 + min;
}

export function quietWindow(account: QuietHoursAccount): { startMinutes: number; endMinutes: number } {
  // Belt and braces: owners may narrow the 8 AM - 9 PM window but never widen it (ToS), and an
  // inverted/legacy row falls back to the defaults instead of an overnight window.
  const start = Math.max(DEFAULT_START_MINUTES, parseTimeOfDay(account.quiet_start, DEFAULT_START_MINUTES));
  const end = Math.min(DEFAULT_END_MINUTES, parseTimeOfDay(account.quiet_end, DEFAULT_END_MINUTES));
  if (end <= start) return { startMinutes: DEFAULT_START_MINUTES, endMinutes: DEFAULT_END_MINUTES };
  return { startMinutes: start, endMinutes: end };
}

/**
 * True when `now` (in the account's timezone) is inside the allowed texting window
 * [quiet_start, quiet_end). Windows that cross midnight (start > end) are supported.
 * Equal start/end means "always allowed".
 */
export function isWithinQuietHours(account: QuietHoursAccount, now: Date = new Date()): boolean {
  const { startMinutes, endMinutes } = quietWindow(account);
  if (startMinutes === endMinutes) return true;
  const { minutesOfDay } = localTime(now, safeTimeZone(account.timezone));
  if (startMinutes < endMinutes) return minutesOfDay >= startMinutes && minutesOfDay < endMinutes;
  return minutesOfDay >= startMinutes || minutesOfDay < endMinutes; // overnight window
}

/** Readable alias used by the outbound path. */
export const isSendingAllowedNow = isWithinQuietHours;

/** Converts a wall-clock time in `timeZone` to the corresponding UTC instant (DST-safe, two-pass). */
export function zonedToUtc(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  timeZone: string
): Date {
  const tz = safeTimeZone(timeZone);
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  const wallMinusUtc = (ts: number) => {
    const p = localTime(new Date(ts), tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0) - Math.floor(ts / 60000) * 60000;
  };
  const off1 = wallMinusUtc(guess);
  let result = guess - off1;
  const off2 = wallMinusUtc(result);
  if (off2 !== off1) result = guess - off2;
  return new Date(result);
}

/**
 * The next instant at which texting is allowed. Returns `now` when already inside the window,
 * otherwise the next occurrence of `quiet_start` in the account's timezone.
 */
export function nextSendWindowStart(account: QuietHoursAccount, now: Date = new Date()): Date {
  if (isWithinQuietHours(account, now)) return now;
  const tz = safeTimeZone(account.timezone);
  const { startMinutes } = quietWindow(account);
  const lt = localTime(now, tz);
  const startH = Math.floor(startMinutes / 60);
  const startM = startMinutes % 60;
  let candidate = zonedToUtc(lt.year, lt.month, lt.day, startH, startM, tz);
  if (candidate.getTime() <= now.getTime()) {
    // Tomorrow (local): add a day to the local date, re-resolve.
    const tomorrow = new Date(Date.UTC(lt.year, lt.month - 1, lt.day + 1, 12, 0, 0));
    candidate = zonedToUtc(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), startH, startM, tz);
  }
  return candidate;
}

/** "8:00 AM–9:00 PM" style label for prompts and UI. */
export function quietHoursLabel(account: QuietHoursAccount): string {
  const { startMinutes, endMinutes } = quietWindow(account);
  const fmt = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  };
  return `${fmt(startMinutes)}–${fmt(endMinutes)}`;
}

/** Business days between two instants (Mon–Fri, whole days, ignores holidays). */
export function businessDaysBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let count = 0;
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}
