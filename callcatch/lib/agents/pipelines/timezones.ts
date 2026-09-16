/**
 * State → IANA timezone map and the outreach send window (Mon–Fri, 08:00–17:59 prospect local time).
 * Pure functions; the outreach agent and the send_outreach_email executor both use them.
 *
 * States that span two zones use the zone where most of the population lives (documented inline).
 */

export const STATE_TIMEZONES: Readonly<Record<string, string>> = {
  AL: "America/Chicago",
  AK: "America/Anchorage",
  AZ: "America/Phoenix", // no DST
  AR: "America/Chicago",
  CA: "America/Los_Angeles",
  CO: "America/Denver",
  CT: "America/New_York",
  DE: "America/New_York",
  DC: "America/New_York",
  FL: "America/New_York", // panhandle is Central; Tampa/Orlando/Jacksonville/Miami are Eastern
  GA: "America/New_York",
  HI: "Pacific/Honolulu",
  ID: "America/Boise", // north Idaho is Pacific; Boise metro is Mountain
  IL: "America/Chicago",
  IN: "America/Indiana/Indianapolis", // Chicago suburbs and Evansville are Central
  IA: "America/Chicago",
  KS: "America/Chicago",
  KY: "America/New_York", // western KY is Central
  LA: "America/Chicago",
  ME: "America/New_York",
  MD: "America/New_York",
  MA: "America/New_York",
  MI: "America/Detroit",
  MN: "America/Chicago",
  MS: "America/Chicago",
  MO: "America/Chicago",
  MT: "America/Denver",
  NE: "America/Chicago", // panhandle is Mountain
  NV: "America/Los_Angeles",
  NH: "America/New_York",
  NJ: "America/New_York",
  NM: "America/Denver",
  NY: "America/New_York",
  NC: "America/New_York",
  ND: "America/Chicago", // southwest is Mountain
  OH: "America/New_York",
  OK: "America/Chicago",
  OR: "America/Los_Angeles",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  SD: "America/Chicago", // west river is Mountain
  TN: "America/Chicago", // Nashville/Memphis Central; Knoxville/Chattanooga Eastern
  TX: "America/Chicago", // El Paso is Mountain
  UT: "America/Denver",
  VT: "America/New_York",
  VA: "America/New_York",
  WA: "America/Los_Angeles",
  WV: "America/New_York",
  WI: "America/Chicago",
  WY: "America/Denver",
  PR: "America/Puerto_Rico",
};

export const SEND_WINDOW = { startHour: 8, endHourExclusive: 18, days: [1, 2, 3, 4, 5] as const } as const;

/** IANA zone for a 2-letter state; null when unknown (the caller must not guess). */
export function timezoneForState(state: string | null | undefined): string | null {
  if (!state) return null;
  return STATE_TIMEZONES[state.trim().toUpperCase()] ?? null;
}

export type LocalClock = { hour: number; minute: number; weekday: number; date: string; timezone: string };

/** Local wall clock for an instant in a timezone (weekday 0 = Sunday). */
export function localClock(at: Date, timezone: string): LocalClock {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hour = Number(parts.hour) % 24; // some ICU builds print "24" for midnight
  return {
    hour,
    minute: Number(parts.minute),
    weekday: weekdays.indexOf(parts.weekday),
    date: `${parts.year}-${parts.month}-${parts.day}`,
    timezone,
  };
}

/** True when `at` falls Mon–Fri 08:00–17:59 in the prospect's local time. Unknown state → false (never guess). */
export function isSendWindow(state: string | null | undefined, at: Date): boolean {
  const tz = timezoneForState(state);
  if (!tz) return false;
  const c = localClock(at, tz);
  return (SEND_WINDOW.days as readonly number[]).includes(c.weekday) && c.hour >= SEND_WINDOW.startHour && c.hour < SEND_WINDOW.endHourExclusive;
}

/** UTC offset (minutes east of UTC) of `timezone` at instant `at`. */
export function utcOffsetMinutes(at: Date, timezone: string): number {
  const c = localClock(at, timezone);
  const asUtc = Date.UTC(Number(c.date.slice(0, 4)), Number(c.date.slice(5, 7)) - 1, Number(c.date.slice(8, 10)), c.hour, c.minute);
  const truncated = Math.floor(at.getTime() / 60000) * 60000;
  return Math.round((asUtc - truncated) / 60000);
}

/**
 * Next instant at or after `from` that is inside the send window for `state`, optionally at least
 * `minDaysAhead` calendar days later (sequence spacing). Returns null when the state is unknown.
 * The returned instant is `preferredHour` local (default 10:00) on the first eligible weekday.
 */
export function nextSendSlot(state: string | null | undefined, from: Date, minDaysAhead = 0, preferredHour = 10): Date | null {
  const tz = timezoneForState(state);
  if (!tz) return null;
  const hour = Math.min(Math.max(preferredHour, SEND_WINDOW.startHour), SEND_WINDOW.endHourExclusive - 1);
  const base = new Date(from.getTime() + minDaysAhead * 86_400_000);
  if (minDaysAhead === 0 && isSendWindow(state, base)) return base;
  // Walk forward day by day (max 10) and return the preferred hour on the first weekday.
  for (let i = 0; i < 10; i++) {
    const candidateDay = new Date(base.getTime() + i * 86_400_000);
    const c = localClock(candidateDay, tz);
    if (!(SEND_WINDOW.days as readonly number[]).includes(c.weekday)) continue;
    // Same local day but the preferred hour already passed (only relevant on day 0).
    if (i === 0 && minDaysAhead === 0 && c.hour >= SEND_WINDOW.endHourExclusive) continue;
    const targetHour = i === 0 && minDaysAhead === 0 && c.hour >= hour ? Math.max(c.hour, hour) : hour;
    if (i === 0 && minDaysAhead === 0 && c.hour >= hour && c.hour < SEND_WINDOW.endHourExclusive) return candidateDay;
    const local = Date.UTC(Number(c.date.slice(0, 4)), Number(c.date.slice(5, 7)) - 1, Number(c.date.slice(8, 10)), targetHour, 0);
    // Convert local wall time to UTC using the offset in effect at that moment (two-pass for DST edges).
    let guess = new Date(local - utcOffsetMinutes(candidateDay, tz) * 60000);
    guess = new Date(local - utcOffsetMinutes(guess, tz) * 60000);
    if (guess.getTime() >= from.getTime()) return guess;
  }
  return null;
}
