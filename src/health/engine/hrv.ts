/**
 * §6.3 HRV baseline & status — Plews/Buchheit method with Garmin-style bands.
 *
 * Why ln(rMSSD): daily rMSSD is right-skewed; its natural log is ~normal, so
 * means and SDs behave, and a fixed ln difference is a fixed % change
 * (20 × Δln ≈ % change for small Δ — the "20×lnRMSSD" scale).
 *
 * Construction (the band is a *trend* test, never a one-day z-test — R3-1):
 *   • mean7Ln — the 7-day rolling mean of ln(rMSSD) ending `asOf` (today included
 *     when logged). This is the quantity that gets banded.
 *   • baselineLn — the long-term reference the SWC is centred on: the mean of the
 *     daily ln values in the `sdWindowDays` (28) window, preferring the readings
 *     OLDER than the current 7 days when ≥ 14 of them exist (so a genuine shift
 *     cannot drag its own baseline along with it), else every reading in the
 *     window (≥ 7 needed).
 *   • sdLn — sample SD of the daily ln values in that same reference set
 *     ("SD of recent daily readings").
 *   • SWC ("smallest worthwhile change") = baselineLn ± 0.5 × sdLn.
 *   • Band the 7-DAY MEAN against the SWC:
 *       insufficient  < 7 readings in the window, or nothing in the last 7 days
 *       low           mean7 below the lower SWC
 *       unbalanced    mean7 above the upper SWC, or the overreaching flag is up
 *       poor          28-day geometric mean below the age norm — suppresses "balanced" only
 *       balanced      otherwise
 *     Centring the SWC on the 7-day mean itself (the old construction) made the
 *     band a |z| > 0.5 test of a single reading, which fires on ~60 % of ordinary
 *     days; banding the rolling mean against a longer baseline is what
 *     Plews/Buchheit (and Garmin) actually do.
 *   • bigDrop — the ONE rule driven by today's single reading: 20×ln fell ≥ 1.5
 *     points vs yesterday's 7-day mean (≈ 7.5 % rMSSD) → suggest low intensity.
 *   • overreachingFlag (R3-8) — day-to-day CV of the last 7 ln values vs the 7
 *     before: rising (cv7 > 1.5 × cvPrev7) OR collapsing (cv7 < cvPrev7 / 1.5),
 *     each with ≥ 4 readings per week. "A rising or collapsing CV flags
 *     non-functional overreaching" (§6.3).
 *
 * Pure & deterministic: records in, plain numbers/nulls out; never NaN, never
 * throws. Millisecond outputs are geometric (exp of ln means) so they match the
 * SWC arithmetic; ln values are kept at full precision for downstream scoring.
 */
import type { DailyRecord, HrvBand, ISODate } from '../data/types';
import { mean, round, stddev } from '../lib/format';
import { metricSeries } from './baseline';

export interface HrvStatus {
  todayMs: number | null;
  todayLn: number | null;
  /** 7-day rolling mean of ln(rMSSD) ending asOf — the banded quantity. */
  mean7Ln: number | null;
  /** exp(mean7Ln) — the geometric mean in ms. */
  mean7Ms: number | null;
  /** Long-term ln(rMSSD) mean the SWC is centred on (see module header). */
  baselineLn: number | null;
  /** exp(baselineLn), 1 dp. */
  baselineMs: number | null;
  /** Readings in the reference set behind baselineLn / sdLn. */
  nBaseline: number;
  /** Sample SD of daily ln values over the reference set. */
  sdLn: number | null;
  swcLowerLn: number | null;
  swcUpperLn: number | null;
  swcLowerMs: number | null;
  swcUpperMs: number | null;
  band: HrvBand;
  /** CV (%) of the last 7 daily ln values; the 7 before that. */
  cv7: number | null;
  cvPrev7: number | null;
  cvTrend: 'rising' | 'falling' | 'stable' | null;
  /** Rising or collapsing day-to-day CV (§6.3 non-functional overreaching). */
  overreachingFlag: boolean;
  /** Sentence explaining the flag, null when it is down. */
  overreachingNote: string | null;
  /** 20×ln dropped ≥ 1.5 vs yesterday's 7-day mean (≈ 7.5 % rMSSD). */
  bigDrop: boolean;
  /** Days with an HRV reading in the last 30 days. */
  daysOfData: number;
  /** ≥ 21 readings in the last 30 days (~3 weeks, Garmin/WHOOP guidance). */
  baselineEstablished: boolean;
  note: string;
}

export interface HrvOpts {
  /** Age in years — enables the "poor" (below age norm) check. Omit to skip it. */
  age?: number;
  /** Window for the SD / long-term geometric mean (default 28 days). */
  sdWindowDays?: number;
}

/** SWC = baseline ± SWC_K × SD (Plews/Buchheit use 0.5). */
export const SWC_K = 0.5;
/** Minimum ln readings in the reference set before a range can be set. */
export const MIN_SD_READINGS = 7;
/** Prefer a reference set that excludes the current 7 days once this many older readings exist. */
export const MIN_OLDER_READINGS = 14;
/** Baseline is "established" at ≥ 21 readings within the last 30 days. */
export const BASELINE_READINGS = 21;
export const BASELINE_WINDOW_DAYS = 30;
export const DEFAULT_SD_WINDOW_DAYS = 28;
/** A 1.5-point drop in 20×lnRMSSD ≈ 7.5 % rMSSD → switch to low intensity. */
export const BIG_DROP_20LN = 1.5;
/** CV must move ≥ 20 % relative to the prior week to count as rising/falling. */
export const CV_TREND_PCT = 20;
/** Overreaching flag when this week's CV exceeds last week's by this factor… */
export const CV_RISING_FACTOR = 1.5;
/** …or falls below last week's by the same factor (a collapsing CV). */
export const CV_COLLAPSE_FACTOR = 1.5;
/** Need most of a week's readings before trusting a CV (avoids 2-point noise). */
export const MIN_CV_READINGS = 4;

/**
 * Age norms for the long-term (28-day) geometric mean; below → "poor".
 * Small population table (Garmin-style), not a diagnosis.
 */
export const HRV_AGE_NORM_MS: ReadonlyArray<{ maxAge: number; ms: number }> = [
  { maxAge: 29, ms: 35 },
  { maxAge: 39, ms: 30 },
  { maxAge: 49, ms: 25 },
  { maxAge: Infinity, ms: 20 },
];

export function ageNormMs(age: number | undefined): number | null {
  if (age === undefined || !Number.isFinite(age) || age < 0) return null;
  const row = HRV_AGE_NORM_MS.find((r) => age <= r.maxAge);
  return row ? row.ms : null;
}

/** A usable rMSSD: finite and > 0 (ln requires it). */
export function isHrv(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

export interface LnPoint {
  d: ISODate;
  ln: number | null;
  ms: number | null;
}

/** One entry per calendar day (ascending, null gaps) with both ms and ln(rMSSD). */
export function lnSeries(records: DailyRecord[], asOf: ISODate, days: number): LnPoint[] {
  return metricSeries(records, 'hrv', asOf, days).map((p) => ({
    d: p.d,
    ms: isHrv(p.v) ? p.v : null,
    ln: isHrv(p.v) ? Math.log(p.v) : null,
  }));
}

/** Non-null values of `arr` in the inclusive index range, clamped to the array. */
function valuesIn(arr: Array<number | null>, from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = Math.max(0, from); i <= Math.min(arr.length - 1, to); i++) {
    const v = arr[i];
    if (v !== null && Number.isFinite(v)) out.push(v);
  }
  return out;
}

/** Coefficient of variation (%) of ln values; null when too few or mean ≤ 0. */
function cvOf(values: number[]): number | null {
  if (values.length < MIN_CV_READINGS) return null;
  const m = mean(values);
  const sd = stddev(values);
  if (m === null || sd === null || m <= 0) return null;
  return (sd / m) * 100;
}

interface Core {
  mean7Ln: number | null;
  n7: number;
  /** Reference baseline and SD (null until the reference set has ≥ 7 readings). */
  baselineLn: number | null;
  sdLn: number | null;
  nBaseline: number;
  nWindow: number;
  /** Mean ln over the whole window (the 28-day geometric mean, for the age-norm check). */
  meanWindowLn: number | null;
}

/**
 * 7-day mean plus the SWC reference set ending at index `i` of an ln array.
 * The reference set is the window minus the current 7 days when that leaves
 * ≥ MIN_OLDER_READINGS readings, otherwise the whole window.
 */
function coreAt(ln: Array<number | null>, i: number, sdWindow: number): Core {
  const last7 = valuesIn(ln, i - 6, i);
  const win = valuesIn(ln, i - sdWindow + 1, i);
  const older = valuesIn(ln, i - sdWindow + 1, i - 7);
  const ref = older.length >= MIN_OLDER_READINGS ? older : win;
  const hasRef = ref.length >= MIN_SD_READINGS;
  return {
    mean7Ln: mean(last7),
    n7: last7.length,
    baselineLn: hasRef ? mean(ref) : null,
    sdLn: hasRef ? stddev(ref) : null,
    nBaseline: ref.length,
    nWindow: win.length,
    meanWindowLn: mean(win),
  };
}

function cvTrendOf(cv7: number | null, cvPrev7: number | null): HrvStatus['cvTrend'] {
  if (cv7 === null || cvPrev7 === null) return null;
  if (cvPrev7 === 0) return cv7 === 0 ? 'stable' : 'rising';
  const relPct = ((cv7 - cvPrev7) / cvPrev7) * 100;
  if (relPct >= CV_TREND_PCT) return 'rising';
  if (relPct <= -CV_TREND_PCT) return 'falling';
  return 'stable';
}

/** §6.3 overreaching flag: CV rising > 1.5× or collapsing < 1/1.5× vs the prior week. */
function overreaching(cvTrend: HrvStatus['cvTrend'], cv7: number | null, cvPrev7: number | null): string | null {
  if (cv7 === null || cvPrev7 === null) return null;
  const cvText = `(CV ${round(cv7, 1)}% vs ${round(cvPrev7, 1)}%)`;
  if (cvTrend === 'rising' && cv7 > CV_RISING_FACTOR * cvPrev7) {
    return `Day-to-day HRV variability is rising ${cvText} — an overreaching flag.`;
  }
  if (cvTrend === 'falling' && cv7 < cvPrev7 / CV_COLLAPSE_FACTOR) {
    return `Day-to-day HRV variability is collapsing ${cvText} — an overreaching flag.`;
  }
  return null;
}

const ms1 = (ln: number | null): number | null => (ln === null ? null : round(Math.exp(ln), 1));
const fmtMs = (ms: number | null): string => (ms === null ? '—' : String(Math.round(ms)));

/**
 * Today's HRV status vs the user's own SWC range. `records` may be unsorted;
 * only readings on or before `asOf` are considered.
 */
export function hrvStatus(records: DailyRecord[], asOf: ISODate, opts: HrvOpts = {}): HrvStatus {
  const sdWindow = Math.max(
    MIN_SD_READINGS,
    Math.floor(Number.isFinite(opts.sdWindowDays as number) ? (opts.sdWindowDays as number) : DEFAULT_SD_WINDOW_DAYS),
  );
  // Enough history for the SD window, the 30-day baseline count and cvPrev7 (14 days).
  const span = Math.max(sdWindow, BASELINE_WINDOW_DAYS, 14);
  const series = lnSeries(records, asOf, span);
  const ln = series.map((p) => p.ln);
  const i = ln.length - 1;
  const today = series[i];
  const core = coreAt(ln, i, sdWindow);

  const cv7 = cvOf(valuesIn(ln, i - 6, i));
  const cvPrev7 = cvOf(valuesIn(ln, i - 13, i - 7));
  const cvTrend = cvTrendOf(cv7, cvPrev7);
  const overreachingNote = overreaching(cvTrend, cv7, cvPrev7);

  const daysOfData = valuesIn(ln, i - (BASELINE_WINDOW_DAYS - 1), i).length;
  const baselineEstablished = daysOfData >= BASELINE_READINGS;

  // bigDrop compares today with the 7-day mean that excludes today.
  const mean7Prev = mean(valuesIn(ln, i - 7, i - 1));
  const bigDrop =
    today.ln !== null && mean7Prev !== null && 20 * (mean7Prev - today.ln) >= BIG_DROP_20LN - 1e-9;

  const hasRange = core.baselineLn !== null && core.sdLn !== null && core.mean7Ln !== null;
  const swcLowerLn = hasRange ? (core.baselineLn as number) - SWC_K * (core.sdLn as number) : null;
  const swcUpperLn = hasRange ? (core.baselineLn as number) + SWC_K * (core.sdLn as number) : null;
  const norm = ageNormMs(opts.age);
  const longTermMs = core.meanWindowLn === null ? null : Math.exp(core.meanWindowLn);

  let band: HrvBand;
  let reason: string;
  const lo = fmtMs(ms1(swcLowerLn));
  const hi = fmtMs(ms1(swcUpperLn));
  const m7 = fmtMs(ms1(core.mean7Ln));
  if (!hasRange || swcLowerLn === null || swcUpperLn === null) {
    band = 'insufficient';
    reason =
      core.nWindow < MIN_SD_READINGS
        ? `Need ${MIN_SD_READINGS}+ HRV readings in the last ${sdWindow} days to set your range (have ${core.nWindow}).`
        : 'No HRV logged in the last 7 days — log a reading to place you in your range.';
  } else {
    const ref = core.mean7Ln as number;
    if (ref < swcLowerLn) {
      band = 'low';
      reason = `7-day average ${m7} ms is below your normal range (${lo}–${hi} ms) — favour low intensity.`;
    } else if (ref > swcUpperLn) {
      band = 'unbalanced';
      reason = `7-day average ${m7} ms is above your normal range (${lo}–${hi} ms) — unbalanced; watch for accumulated fatigue.`;
    } else if (overreachingNote !== null) {
      band = 'unbalanced';
      reason = overreachingNote;
    } else if (norm !== null && longTermMs !== null && longTermMs < norm) {
      band = 'poor';
      reason = `Your ${sdWindow}-day average (${Math.round(longTermMs)} ms) is below the age norm (${norm} ms) — protect sleep and keep strain moderate.`;
    } else {
      band = 'balanced';
      reason = `7-day average ${m7} ms is within your normal range (${lo}–${hi} ms).`;
    }
    if (overreachingNote !== null && reason !== overreachingNote) reason += ` ${overreachingNote}`;
  }
  if (bigDrop) reason += ' Today dropped ≥7.5% vs your 7-day mean — suggest low intensity.';
  if (!baselineEstablished) reason += ` Baseline still forming (${daysOfData}/${BASELINE_READINGS} days).`;

  return {
    todayMs: today.ms,
    todayLn: today.ln,
    mean7Ln: core.mean7Ln,
    mean7Ms: ms1(core.mean7Ln),
    baselineLn: core.baselineLn,
    baselineMs: ms1(core.baselineLn),
    nBaseline: core.nBaseline,
    sdLn: core.sdLn,
    swcLowerLn,
    swcUpperLn,
    swcLowerMs: ms1(swcLowerLn),
    swcUpperMs: ms1(swcUpperLn),
    band,
    cv7: cv7 === null ? null : round(cv7, 2),
    cvPrev7: cvPrev7 === null ? null : round(cvPrev7, 2),
    cvTrend,
    overreachingFlag: overreachingNote !== null,
    overreachingNote,
    bigDrop,
    daysOfData,
    baselineEstablished,
    note: reason,
  };
}

export interface SwcBandPoint {
  d: ISODate;
  mean7Ms: number | null;
  lowerMs: number | null;
  upperMs: number | null;
}

/**
 * Rolling SWC band for the Trends chart: for each of the last `days` days,
 * the 7-day geometric mean and the long-term baseline ± 0.5 SD — the same
 * construction as hrvStatus (reference set = the trailing `sdWindowDays`
 * window, minus the current 7 days when ≥ 14 older readings exist, ≥ 7
 * readings needed). lower/upper are null until a range exists; mean7Ms is
 * null when the last 7 days have no reading.
 */
export function swcBandSeries(
  records: DailyRecord[],
  asOf: ISODate,
  days: number,
  sdWindowDays = DEFAULT_SD_WINDOW_DAYS,
): SwcBandPoint[] {
  const n = Math.max(0, Math.floor(days));
  if (n === 0) return [];
  const sdWindow = Math.max(MIN_SD_READINGS, Math.floor(sdWindowDays));
  // Pull sdWindow − 1 extra days of history so the first output day has a full window.
  const series = lnSeries(records, asOf, n + sdWindow - 1);
  const ln = series.map((p) => p.ln);
  const offset = series.length - n;
  const out: SwcBandPoint[] = [];
  for (let k = 0; k < n; k++) {
    const i = offset + k;
    const core = coreAt(ln, i, sdWindow);
    const hasRange = core.baselineLn !== null && core.sdLn !== null && core.mean7Ln !== null;
    out.push({
      d: series[i].d,
      mean7Ms: ms1(core.mean7Ln),
      lowerMs: hasRange ? ms1((core.baselineLn as number) - SWC_K * (core.sdLn as number)) : null,
      upperMs: hasRange ? ms1((core.baselineLn as number) + SWC_K * (core.sdLn as number)) : null,
    });
  }
  return out;
}

/**
 * Position of the 7-day mean (the banded quantity) within the SWC band in
 * band-widths: 0 at the lower edge, 1 at the upper, < 0 below, > 1 above.
 * Null without a range; 0.5 when the band has zero width (SD = 0).
 */
export function swcPosition(hrv: HrvStatus): number | null {
  const v = hrv.mean7Ln;
  if (v === null || hrv.swcLowerLn === null || hrv.swcUpperLn === null) return null;
  const width = hrv.swcUpperLn - hrv.swcLowerLn;
  if (width <= 0) return 0.5;
  return (v - hrv.swcLowerLn) / width;
}
