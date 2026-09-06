/**
 * §6.4 Sleep — WHOOP model.
 *
 *   Sleep Need = Baseline + f(strain) + f(debt) − naps
 *
 * - f(strain) is a logistic curve in minutes: 60 / (1 + e^(−(strain − 12)/2.5))
 *   → ≈2 min at strain 4, 30 at 12, ≈58 at 21. A rest day barely moves need;
 *   an all-out day adds most of an hour.
 * - f(debt) pays debt back gradually (WHOOP never asks for it all in one
 *   night): debt/3, capped at 45 min per night. It is a pay-back *ask* that
 *   only appears in the displayed need — debt itself accrues against
 *   baseline + f(strain) − naps, and sleep above that pays it down (R3-2).
 *   Folding f(debt) into the accrual made debt compound by ×4/3 every night
 *   a user slept exactly their baseline, so one short night reached the
 *   300 min cap within a week.
 * - Debt accumulates over the last 14 nights, clamped to 0–300 min.
 * - Consistency = rolling 7-night SD of bedtime and sleep midpoint on the
 *   "minutes since noon" axis (`minutesSinceNoon`) so 23:30 and 00:15 are 45
 *   minutes apart, not ~23 hours. The 30–60 min flag thresholds live with the
 *   insight templates (§7 #11), not here.
 * - Bedtime countdown nudge: active from 60 min before the target bedtime to
 *   90 min after it.
 * - Caffeine cutoff (default 14:00 in the profile, ≥8–10 h before bed).
 *
 * Record semantics (see data/types.ts): on a record dated D, `slh`/`sln`/`bt`/
 * `wk` describe the sleep that ENDED on the morning of D, while `strn` and
 * `nap` belong to day D itself. The need for the night ending on D therefore
 * uses the strain and naps of D − 1.
 *
 * Everything here is pure: records in (any order — we index by date), plain
 * numbers or null out, never NaN, never throws, never reads the clock.
 */
import type { DailyRecord, HHMM, ISODate, Profile } from '../data/types';
import { addDays, hhmmToMinutes, lastNDates, minutesSinceNoon, minutesSinceNoonToHHMM, minutesToHHMM, nowHHMM } from '../lib/dates';
import { clamp, mean, round, stddev } from '../lib/format';

/** Logistic midpoint / scale for the strain → sleep-need curve. */
const STRAIN_MIDPOINT = 12;
const STRAIN_SCALE = 2.5;
const STRAIN_MAX_ADD_MIN = 60;
/** Debt is repaid at 1/3 per night, at most 45 min/night. */
const DEBT_PAYBACK_DIVISOR = 3;
const DEBT_ADD_CAP_MIN = 45;
/** Need never drops below 5 h even after a long nap. */
export const SLEEP_NEED_FLOOR_HRS = 5;
/** Accumulated debt is capped at 5 h — beyond that the number stops being actionable. */
export const SLEEP_DEBT_CAP_MIN = 300;
export const SLEEP_DEBT_WINDOW_NIGHTS = 14;
/** Same as DEFAULT_PROFILE.sleepBaselineHrs; used only if a profile has no usable baseline. */
const FALLBACK_BASELINE_HRS = 7.75;
/** Countdown window around the target bedtime (§6.4 "from 60 min before"). */
export const COUNTDOWN_BEFORE_MIN = 60;
export const COUNTDOWN_AFTER_MIN = 90;

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function indexByDate(records: DailyRecord[]): Map<ISODate, DailyRecord> {
  const m = new Map<ISODate, DailyRecord>();
  for (const r of records) m.set(r.d, r);
  return m;
}

/** Minutes of extra sleep need from the day's WHOOP strain (0–21). 0 when unknown. */
export function strainSleepAddMin(strain: number | null | undefined): number {
  const s = num(strain);
  if (s === null) return 0;
  return STRAIN_MAX_ADD_MIN / (1 + Math.exp(-(s - STRAIN_MIDPOINT) / STRAIN_SCALE));
}

/** Minutes of extra need to start repaying accumulated debt: min(debt/3, 45). 0 when unknown. */
export function debtSleepAddMin(debtMin: number | null | undefined): number {
  const d = num(debtMin);
  if (d === null || d <= 0) return 0;
  return Math.min(d / DEBT_PAYBACK_DIVISOR, DEBT_ADD_CAP_MIN);
}

export interface SleepNeedInput {
  baselineHrs: number;
  strain?: number | null;
  debtMin?: number | null;
  napMin?: number | null;
}

export interface SleepNeed {
  /** Hours, floored at SLEEP_NEED_FLOOR_HRS, 2 dp. */
  needHrs: number;
  strainAddMin: number;
  debtAddMin: number;
  napCreditMin: number;
}

/** need = baseline + f(strain) + f(debt) − naps, floor 5 h. */
export function sleepNeed(input: SleepNeedInput): SleepNeed {
  const baseRaw = num(input.baselineHrs);
  const baseline = baseRaw !== null && baseRaw > 0 ? baseRaw : FALLBACK_BASELINE_HRS;
  const strainAddMin = strainSleepAddMin(input.strain);
  const debtAddMin = debtSleepAddMin(input.debtMin);
  const napRaw = num(input.napMin);
  const napCreditMin = napRaw !== null && napRaw > 0 ? napRaw : 0;
  const raw = baseline + (strainAddMin + debtAddMin - napCreditMin) / 60;
  return {
    needHrs: round(Math.max(SLEEP_NEED_FLOOR_HRS, raw), 2),
    strainAddMin: round(strainAddMin, 1),
    debtAddMin: round(debtAddMin, 1),
    napCreditMin: round(napCreditMin, 1),
  };
}

interface SleepNight {
  d: ISODate;
  /** Displayed need for the night: baseline + f(strain) + f(debt before it) − naps (or imported sln). */
  needHrs: number;
  /** Need the debt accrued against: baseline + f(strain) − naps (or imported sln). */
  accrualNeedHrs: number;
  sleptHrs: number;
  debtAfterMin: number;
}

/**
 * Walk the last 14 nights oldest → newest. Nights without `slh` are skipped
 * (debt carries, night not counted). The accrual need is record.sln when
 * imported (WHOOP's own figure is authoritative and usually arrives with a
 * `dbt` that wins anyway), else baseline + f(strain of D−1) − naps of D−1 —
 * never including f(debt), which is the pay-back ask (R3-2). The displayed
 * need does include f(debt so far).
 */
function walkDebt(byDate: Map<ISODate, DailyRecord>, asOf: ISODate, profile: Profile): { nights: SleepNight[]; debtMin: number } {
  const nights: SleepNight[] = [];
  let debt = 0;
  for (const d of lastNDates(asOf, SLEEP_DEBT_WINDOW_NIGHTS)) {
    const r = byDate.get(d);
    const slept = num(r?.slh);
    if (!r || slept === null || slept < 0) continue;
    const prev = byDate.get(addDays(d, -1));
    const imported = num(r.sln);
    const base = { baselineHrs: profile.sleepBaselineHrs, strain: prev?.strn, napMin: prev?.nap };
    const accrualNeed = imported ?? sleepNeed({ ...base, debtMin: 0 }).needHrs;
    const need = imported ?? sleepNeed({ ...base, debtMin: debt }).needHrs;
    debt = clamp(debt + (accrualNeed - slept) * 60, 0, SLEEP_DEBT_CAP_MIN);
    nights.push({ d, needHrs: need, accrualNeedHrs: accrualNeed, sleptHrs: slept, debtAfterMin: debt });
  }
  return { nights, debtMin: debt };
}

export interface SleepDebt {
  /** Whole minutes, 0–300 (an imported WHOOP `dbt` on `asOf` is used verbatim, ≥ 0). */
  debtMin: number;
  /** Nights with sleep data that contributed to the walk. */
  nights: number;
}

export function sleepDebt(records: DailyRecord[], asOf: ISODate, profile: Profile): SleepDebt {
  const byDate = indexByDate(records);
  const walk = walkDebt(byDate, asOf, profile);
  const imported = num(byDate.get(asOf)?.dbt);
  const debtMin = imported !== null ? Math.max(0, imported) : walk.debtMin;
  return { debtMin: round(debtMin), nights: walk.nights.length };
}

/**
 * Sleep duration in minutes for the midpoint: wake − bed on the noon axis
 * when a wake time is present (wrapping past noon, sanity-capped at 16 h),
 * else `slh` hours. Null when neither is usable.
 */
function sleepDurationMin(r: DailyRecord, bedNoon: number): number | null {
  const wake = minutesSinceNoon(r.wk);
  if (wake !== null) {
    let d = wake - bedNoon;
    if (d <= 0) d += 1440;
    if (d <= 16 * 60) return d;
  }
  const slh = num(r.slh);
  return slh !== null && slh > 0 ? slh * 60 : null;
}

export interface BedtimeConsistency {
  /** Sample SD of bedtime, minutes, 1 dp; null with < 2 nights. */
  bedtimeSdMin: number | null;
  midpointSdMin: number | null;
  meanBedtime: HHMM | null;
  meanMidpoint: HHMM | null;
  /** Nights in the window with a logged bedtime. */
  n: number;
}

/** Rolling SD of bedtime and sleep midpoint over the `nights` nights ending at `asOf`. */
export function bedtimeConsistency(records: DailyRecord[], asOf: ISODate, nights = 7): BedtimeConsistency {
  const n = Math.max(1, Math.floor(nights));
  const start = addDays(asOf, -(n - 1));
  const beds: number[] = [];
  const mids: number[] = [];
  for (const r of records) {
    if (r.d < start || r.d > asOf) continue;
    const bed = minutesSinceNoon(r.bt);
    if (bed === null) continue;
    beds.push(bed);
    const dur = sleepDurationMin(r, bed);
    if (dur !== null) mids.push(bed + dur / 2);
  }
  const bedSd = stddev(beds);
  const midSd = stddev(mids);
  const bedMean = mean(beds);
  const midMean = mean(mids);
  return {
    bedtimeSdMin: bedSd === null ? null : round(bedSd, 1),
    midpointSdMin: midSd === null ? null : round(midSd, 1),
    meanBedtime: bedMean === null ? null : minutesSinceNoonToHHMM(bedMean),
    meanMidpoint: midMean === null ? null : minutesSinceNoonToHHMM(midMean),
    n: beds.length,
  };
}

export interface BedtimeCountdown {
  /** Positive before the target bedtime, negative after it. */
  minutesToBed: number;
  message: string;
  phase: 'wind-down' | 'past';
  /** Hours of sleep still available if lights go out now (wake target − now). */
  achievableHrs: number;
}

function fmtHrs(h: number): string {
  return `${round(h, 1)} h`;
}

/**
 * Bedtime nudge, active from 60 min before `bedTarget` to 90 min after; null
 * outside that window or on malformed input. The wind-down message quotes the
 * hours you get by hitting the target (wake − bed target); `achievableHrs`
 * carries wake − now for callers who want the live figure.
 */
export function bedtimeCountdown(now: Date, bedTarget: HHMM, wakeTarget: HHMM): BedtimeCountdown | null {
  const bedNoon = minutesSinceNoon(bedTarget);
  const wakeNoon = minutesSinceNoon(wakeTarget);
  const nowNoon = Number.isNaN(now.getTime()) ? null : minutesSinceNoon(nowHHMM(now));
  if (bedNoon === null || wakeNoon === null || nowNoon === null) return null;

  // Shortest signed distance on the 24 h circle so a bedtime near noon still works.
  let toBed = bedNoon - nowNoon;
  if (toBed > 720) toBed -= 1440;
  else if (toBed <= -720) toBed += 1440;
  if (toBed > COUNTDOWN_BEFORE_MIN || toBed < -COUNTDOWN_AFTER_MIN) return null;

  const forward = (m: number) => ((m % 1440) + 1440) % 1440;
  const achievableHrs = round(forward(wakeNoon - nowNoon) / 60, 2);
  const atTargetHrs = forward(wakeNoon - bedNoon) / 60;
  const wake = minutesToHHMM(hhmmToMinutes(wakeTarget) as number);
  const bed = minutesToHHMM(hhmmToMinutes(bedTarget) as number);

  if (toBed > 0) {
    return {
      minutesToBed: toBed,
      phase: 'wind-down',
      achievableHrs,
      message: `Wind-down: ${toBed} min to bed for ${fmtHrs(atTargetHrs)} before your ${wake} alarm`,
    };
  }
  if (toBed === 0) {
    return {
      minutesToBed: 0,
      phase: 'wind-down',
      achievableHrs,
      message: `Bedtime: lights out now for ${fmtHrs(atTargetHrs)} before your ${wake} alarm`,
    };
  }
  return {
    minutesToBed: toBed,
    phase: 'past',
    achievableHrs,
    message: `You're ${-toBed} min past your ${bed} bedtime — lights out protects tomorrow's recovery`,
  };
}

export interface CaffeineCheck {
  /** Latest caffeine time after the cutoff, or null when none. */
  afterCutoff: HHMM | null;
  /** Latest caffeine time of the day (clock order, so an 00:30 log counts as early morning). */
  latest: HHMM | null;
  /** Hours between the latest caffeine and the target bedtime, 1 dp. */
  hoursBeforeBed: number | null;
}

export function caffeineCheck(caf: HHMM[] | undefined, bedTarget: HHMM, cutoff: HHMM): CaffeineCheck {
  const times = (caf ?? [])
    .map((t) => hhmmToMinutes(t))
    .filter((m): m is number => m !== null);
  if (!times.length) return { afterCutoff: null, latest: null, hoursBeforeBed: null };
  // Work on the eating-day axis (minutes since 04:00) so a 00:30 coffee counts as
  // late-evening — after a 14:00 cutoff and past a 23:00 bed target — instead of
  // as an early-morning one, and a bed target after midnight ('00:30') still
  // lands later than any evening time.
  const axis = (m: number) => (m - 4 * 60 + 1440) % 1440;
  const latestMin = times.reduce((best, m) => (axis(m) > axis(best) ? m : best), times[0]);
  const latest = minutesToHHMM(latestMin);
  const cutoffMin = hhmmToMinutes(cutoff);
  const afterCutoff = cutoffMin !== null && axis(latestMin) > axis(cutoffMin) ? latest : null;
  const bedMin = hhmmToMinutes(bedTarget);
  let hoursBeforeBed: number | null = null;
  if (bedMin !== null) {
    // A coffee at or after the bed target is 0 h before bed — never "23.5 h" (review R7-6).
    const diff = Math.max(0, axis(bedMin) - axis(latestMin));
    hoursBeforeBed = round(diff / 60, 1);
  }
  return { afterCutoff, latest, hoursBeforeBed };
}

export interface SleepSummary {
  /** Last night's sleep hours (record `slh` on asOf). */
  hours: number | null;
  /**
   * Need for last night when it was logged; otherwise the projected need for
   * tonight (today's strain and naps, current debt).
   */
  need: number | null;
  debtMin: number | null;
  /** (hours − need) × 60, whole minutes; negative = short. */
  deltaVsNeedMin: number | null;
  /** Most recent logged bedtime on or before asOf. */
  lastBedtime: HHMM | null;
  consistency: BedtimeConsistency;
  /** Mean sleep hours over the 30 nights before asOf (baseline convention: excludes today), 2 dp. */
  hours30dMean: number | null;
}

export function sleepSummary(records: DailyRecord[], asOf: ISODate, profile: Profile): SleepSummary {
  const byDate = indexByDate(records);
  const today = byDate.get(asOf);
  const hours = num(today?.slh);
  const walk = walkDebt(byDate, asOf, profile);
  const imported = num(today?.dbt);
  const debtMin = round(imported !== null ? Math.max(0, imported) : walk.debtMin);

  const lastNight = walk.nights.find((n) => n.d === asOf);
  let need: number;
  if (lastNight) {
    need = lastNight.needHrs;
  } else {
    need = sleepNeed({ baselineHrs: profile.sleepBaselineHrs, strain: today?.strn, debtMin, napMin: today?.nap }).needHrs;
  }
  const deltaVsNeedMin = hours === null ? null : round((hours - need) * 60);

  let lastBedtime: HHMM | null = null;
  let lastBedDate: ISODate | null = null;
  for (const r of records) {
    if (r.d <= asOf && hhmmToMinutes(r.bt) !== null && (lastBedDate === null || r.d > lastBedDate)) {
      lastBedDate = r.d;
      lastBedtime = minutesToHHMM(hhmmToMinutes(r.bt) as number);
    }
  }

  const hist = lastNDates(addDays(asOf, -1), 30)
    .map((d) => num(byDate.get(d)?.slh))
    .filter((v): v is number => v !== null);
  const hist30 = mean(hist);

  return {
    hours,
    need,
    debtMin,
    deltaVsNeedMin,
    lastBedtime,
    consistency: bedtimeConsistency(records, asOf, 7),
    hours30dMean: hist30 === null ? null : round(hist30, 2),
  };
}
