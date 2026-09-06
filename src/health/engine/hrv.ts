/**
 * §6.3 HRV baseline & status — Plews/Buchheit method with Garmin-style bands.
 *
 * Why ln(rMSSD): daily rMSSD is right-skewed; its natural log is ~normal, so
 * means and SDs behave, and a fixed ln difference is a fixed % change
 * (20 × Δln ≈ % change for small Δ — the "20×lnRMSSD" scale). So we:
 *   • take the 7-day rolling mean of ln(rMSSD) ending `asOf` (today included when logged);
 *   • take the sample SD of daily ln values over the last `sdWindowDays` (28) — need ≥ 7;
 *   • SWC ("smallest worthwhile change") = mean7 ± 0.5 × SD;
 *   • band today's ln (or mean7 when today is missing) against the SWC:
 *       insufficient  < 7 readings in the SD window, or nothing in the last 7 days
 *       low           below the lower SWC
 *       unbalanced    above the upper SWC, or day-to-day CV rising (cv7 > 1.5 × cvPrev7)
 *       poor          28-day geometric mean below the age norm — suppresses "balanced" only
 *       balanced      otherwise
 *   • bigDrop: 20×ln fell ≥ 1.5 points vs yesterday's 7-day mean (≈ 7.5 % rMSSD)
 *     → suggest low intensity (Plews/Buchheit).
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
  /** 7-day rolling mean of ln(rMSSD) ending asOf. */
  mean7Ln: number | null;
  /** exp(mean7Ln) — the geometric mean in ms. */
  mean7Ms: number | null;
  /** Sample SD of daily ln values over the SD window. */
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

/** SWC = mean ± SWC_K × SD (Plews/Buchheit use 0.5). */
export const SWC_K = 0.5;
/** Minimum ln readings in the SD window before a range can be set. */
export const MIN_SD_READINGS = 7;
/** Baseline is "established" at ≥ 21 readings within the last 30 days. */
export const BASELINE_READINGS = 21;
export const BASELINE_WINDOW_DAYS = 30;
export const DEFAULT_SD_WINDOW_DAYS = 28;
/** A 1.5-point drop in 20×lnRMSSD ≈ 7.5 % rMSSD → switch to low intensity. */
export const BIG_DROP_20LN = 1.5;
/** CV must move ≥ 20 % relative to the prior week to count as rising/falling. */
export const CV_TREND_PCT = 20;
/** Unbalanced when this week's CV exceeds last week's by this factor. */
export const CV_RISING_FACTOR = 1.5;
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
  sdLn: number | null;
  nWindow: number;
  /** Mean ln over the SD window (long-term baseline). */
  meanWindowLn: number | null;
}

/** 7-day mean and SD-window stats ending at index `i` of an ln array. */
function coreAt(ln: Array<number | null>, i: number, sdWindow: number): Core {
  const last7 = valuesIn(ln, i - 6, i);
  const win = valuesIn(ln, i - sdWindow + 1, i);
  return {
    mean7Ln: mean(last7),
    n7: last7.length,
    sdLn: win.length >= MIN_SD_READINGS ? stddev(win) : null,
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

  const daysOfData = valuesIn(ln, i - (BASELINE_WINDOW_DAYS - 1), i).length;
  const baselineEstablished = daysOfData >= BASELINE_READINGS;

  // bigDrop compares today with the 7-day mean that excludes today.
  const mean7Prev = mean(valuesIn(ln, i - 7, i - 1));
  const bigDrop =
    today.ln !== null && mean7Prev !== null && 20 * (mean7Prev - today.ln) >= BIG_DROP_20LN - 1e-9;

  const hasRange = core.nWindow >= MIN_SD_READINGS && core.sdLn !== null && core.mean7Ln !== null;
  const swcLowerLn = hasRange ? (core.mean7Ln as number) - SWC_K * (core.sdLn as number) : null;
  const swcUpperLn = hasRange ? (core.mean7Ln as number) + SWC_K * (core.sdLn as number) : null;
  const norm = ageNormMs(opts.age);
  const longTermMs = core.meanWindowLn === null ? null : Math.exp(core.meanWindowLn);

  let band: HrvBand;
  let reason: string;
  const lo = fmtMs(ms1(swcLowerLn));
  const hi = fmtMs(ms1(swcUpperLn));
  if (!hasRange || swcLowerLn === null || swcUpperLn === null) {
    band = 'insufficient';
    reason =
      core.nWindow < MIN_SD_READINGS
        ? `Need ${MIN_SD_READINGS}+ HRV readings in the last ${sdWindow} days to set your range (have ${core.nWindow}).`
        : 'No HRV logged in the last 7 days — log a reading to place you in your range.';
  } else {
    const ref = today.ln ?? (core.mean7Ln as number);
    const cvRising = cvTrend === 'rising' && cv7 !== null && cvPrev7 !== null && cv7 > CV_RISING_FACTOR * cvPrev7;
    if (ref < swcLowerLn) {
      band = 'low';
      reason = `Below your normal range (${lo}–${hi} ms) — favour low intensity today.`;
    } else if (ref > swcUpperLn) {
      band = 'unbalanced';
      reason = `Above your normal range (${lo}–${hi} ms) — unbalanced; watch for accumulated fatigue.`;
    } else if (cvRising) {
      band = 'unbalanced';
      reason = `Day-to-day HRV variability is rising (CV ${round(cv7 as number, 1)}% vs ${round(cvPrev7 as number, 1)}%) — an overreaching flag.`;
    } else if (norm !== null && longTermMs !== null && longTermMs < norm) {
      band = 'poor';
      reason = `Your ${sdWindow}-day average (${Math.round(longTermMs)} ms) is below the age norm (${norm} ms) — protect sleep and keep strain moderate.`;
    } else {
      band = 'balanced';
      reason = `Within your normal range (${lo}–${hi} ms).`;
    }
  }
  if (bigDrop) reason += ' Today dropped ≥7.5% vs your 7-day mean — suggest low intensity.';
  if (!baselineEstablished) reason += ` Baseline still forming (${daysOfData}/${BASELINE_READINGS} days).`;

  return {
    todayMs: today.ms,
    todayLn: today.ln,
    mean7Ln: core.mean7Ln,
    mean7Ms: ms1(core.mean7Ln),
    sdLn: core.sdLn,
    swcLowerLn,
    swcUpperLn,
    swcLowerMs: ms1(swcLowerLn),
    swcUpperMs: ms1(swcUpperLn),
    band,
    cv7: cv7 === null ? null : round(cv7, 2),
    cvPrev7: cvPrev7 === null ? null : round(cvPrev7, 2),
    cvTrend,
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
 * the 7-day geometric mean and mean ± 0.5 SD (SD over the trailing
 * `sdWindowDays`, same ≥ 7-reading rule as hrvStatus). lower/upper are null
 * until a range exists; mean7Ms is null when the last 7 days have no reading.
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
    const hasRange = core.nWindow >= MIN_SD_READINGS && core.sdLn !== null && core.mean7Ln !== null;
    out.push({
      d: series[i].d,
      mean7Ms: ms1(core.mean7Ln),
      lowerMs: hasRange ? ms1((core.mean7Ln as number) - SWC_K * (core.sdLn as number)) : null,
      upperMs: hasRange ? ms1((core.mean7Ln as number) + SWC_K * (core.sdLn as number)) : null,
    });
  }
  return out;
}

/**
 * Position of today's ln (or mean7 when today is missing) within the SWC band
 * in band-widths: 0 at the lower edge, 1 at the upper, < 0 below, > 1 above.
 * Null without a range; 0.5 when the band has zero width (SD = 0).
 */
export function swcPosition(hrv: HrvStatus): number | null {
  const v = hrv.todayLn ?? hrv.mean7Ln;
  if (v === null || hrv.swcLowerLn === null || hrv.swcUpperLn === null) return null;
  const width = hrv.swcUpperLn - hrv.swcLowerLn;
  if (width <= 0) return 0.5;
  return (v - hrv.swcLowerLn) / width;
}
