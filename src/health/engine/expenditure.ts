import type { DailyRecord, ISODate, Targets } from '../data/types';
import { addDays } from '../lib/dates';
import { clamp, fmt, mean, round, stddev } from '../lib/format';
import {
  clampAlpha,
  computeEwmaTrend,
  isWeight,
  rateBand,
  targetLbPerWeek,
  trendAt,
  weighInsInWeek,
} from './weight';

/**
 * §6.2 Expenditure & calorie adjustment (MacroFactor pattern).
 *
 *   TDEE ≈ mean daily intake − (trend Δweight × 3,500 kcal/lb ÷ 7 days)
 *
 * The reverse calculation runs over consecutive, non-overlapping 7-day blocks
 * ending at `asOf`. Each block is gated (≥5 weigh-ins AND ≥5 intake days) so a
 * sparse week can't produce a wild estimate, and the valid blocks are then
 * smoothed with a second EWMA (default α=0.3) so one week's fluid swing can't
 * over-correct — adjustments deliberately do *not* scale 1:1 with expenditure.
 *
 * Pure & deterministic: records in (any order), plain numbers or null out —
 * never NaN, never throws, never reads the clock.
 */

/** Energy density of body-weight change used for the reverse calc (§6.2). */
export const KCAL_PER_LB = 3500;
/** Half-width of the water-noise band when there are too few residuals to measure it. */
export const DEFAULT_NOISE_BAND_LB = 1.5;

export interface WeekEstimate {
  /** First day of the 7-day block (inclusive). */
  start: ISODate;
  /** Last day of the block (inclusive). The most recent block ends at `asOf`. */
  end: ISODate;
  weighIns: number;
  /** Days in the block with kc > 0. */
  intakeDays: number;
  /** Mean kcal over intake days, whole kcal; null with no intake days. */
  meanIntake: number | null;
  /** EWMA trend on the day before `start` (falls back to `start` when that's before the first weigh-in). */
  trendStart: number | null;
  /** EWMA trend on `end`. */
  trendEnd: number | null;
  /** trendEnd − trendStart (lb). Negative = losing. */
  deltaLb: number | null;
  /** Raw reverse-calc TDEE for this block, whole kcal (computed even when the gates fail, for tooltips). */
  tdee: number | null;
  /**
   * Smoothed TDEE after folding this block into the EWMA over valid blocks —
   * the value the Trends chart plots at `end`. Null for invalid blocks.
   * (Extra field beyond the shared contract; see report notes.)
   */
  smoothedTdee: number | null;
  valid: boolean;
  /** Short diagnostic, e.g. "Only 3 of 5 weigh-ins" — for chart tooltips. */
  reason: string;
}

export interface ExpenditureResult {
  /**
   * The estimate to display right now: equals `smoothedTdee` when the most
   * recent block passed its gates, otherwise null so the empty state shows.
   */
  tdee: number | null;
  /** Last calibrated (smoothed) estimate, even if this week's gate failed — null when no block has ever been valid. */
  smoothedTdee: number | null;
  /** True when the most recent block (ending at `asOf`) produced a valid estimate. */
  valid: boolean;
  /** Empty-state copy when invalid ("Weigh in 5+ days this week…"), otherwise a short calibration summary. */
  reason: string;
  /** One entry per block, OLDEST FIRST; `weeks[weeks.length − 1]` is the block ending at `asOf`. */
  weeks: WeekEstimate[];
  weighInsThisWeek: number;
  intakeDaysThisWeek: number;
}

export interface ExpenditureOpts {
  /** EWMA α for the weight trend (default 0.10, §6.1). */
  alpha?: number;
  /** Weigh-ins required per block (default 5, §6.2). */
  minWeighIns?: number;
  /** Intake days (kc > 0) required per block (default 5). */
  minIntakeDays?: number;
  /** Number of 7-day blocks to evaluate (default 6). */
  weeks?: number;
  /** EWMA α across valid weekly estimates (default 0.3). 1 = no smoothing. */
  smoothing?: number;
}

/** Days with a logged intake: a finite kc strictly above zero. */
function intakeOf(r: DailyRecord): number | null {
  return typeof r.kc === 'number' && Number.isFinite(r.kc) && r.kc > 0 ? r.kc : null;
}

function clampSmoothing(s: number): number {
  if (!Number.isFinite(s)) return 0.3;
  return Math.min(1, Math.max(0.05, s));
}

function estimateWeek(
  records: DailyRecord[],
  trend: Map<ISODate, number>,
  start: ISODate,
  end: ISODate,
  minWeighIns: number,
  minIntakeDays: number,
): WeekEstimate {
  const intakes: number[] = [];
  for (const r of records) {
    if (r.d < start || r.d > end) continue;
    const kc = intakeOf(r);
    if (kc !== null) intakes.push(kc);
  }
  const weighIns = weighInsInWeek(records, end);
  const intakeDays = intakes.length;
  const meanRaw = mean(intakes);

  // Δ over 7 daily trend updates: end vs the day before the block starts.
  // Before the first weigh-in that day has no trend; the block start (the seed
  // weigh-in) is the documented fallback so the very first week can calibrate.
  const trendEnd = trendAt(trend, end) ?? null;
  const trendStart = trendAt(trend, addDays(start, -1)) ?? trendAt(trend, start) ?? null;
  const deltaRaw = trendStart !== null && trendEnd !== null ? trendEnd - trendStart : null;
  const tdeeRaw = meanRaw !== null && deltaRaw !== null ? meanRaw - (deltaRaw * KCAL_PER_LB) / 7 : null;

  let valid = true;
  let reason = 'Valid';
  if (weighIns < minWeighIns) {
    valid = false;
    reason = `Only ${weighIns} of ${minWeighIns} weigh-ins`;
  } else if (intakeDays < minIntakeDays) {
    valid = false;
    reason = `Only ${intakeDays} of ${minIntakeDays} intake days`;
  } else if (tdeeRaw === null) {
    valid = false;
    reason = 'No trend data for this week';
  }

  return {
    start,
    end,
    weighIns,
    intakeDays,
    meanIntake: meanRaw === null ? null : round(meanRaw),
    trendStart,
    trendEnd,
    deltaLb: deltaRaw === null ? null : round(deltaRaw, 2),
    tdee: tdeeRaw === null ? null : round(tdeeRaw),
    smoothedTdee: null,
    valid,
    reason,
  };
}

/**
 * Weekly reverse-calculated expenditure over the `weeks` consecutive 7-day
 * blocks ending at `asOf`. Blocks are returned oldest → newest, and the
 * smoothing EWMA runs in that order, seeded by the oldest valid block.
 */
export function weeklyExpenditure(
  records: DailyRecord[],
  asOf: ISODate,
  opts: ExpenditureOpts = {},
): ExpenditureResult {
  const alpha = clampAlpha(opts.alpha ?? 0.1);
  const minWeighIns = Math.max(1, Math.floor(opts.minWeighIns ?? 5));
  const minIntakeDays = Math.max(1, Math.floor(opts.minIntakeDays ?? 5));
  const nWeeks = Math.max(1, Math.floor(opts.weeks ?? 6));
  const smoothing = clampSmoothing(opts.smoothing ?? 0.3);

  // `through = asOf` so the current block has a trend value even on a day
  // without a weigh-in yet.
  const trend = computeEwmaTrend(records, alpha, asOf);

  const weeks: WeekEstimate[] = [];
  for (let k = nWeeks - 1; k >= 0; k--) {
    const end = addDays(asOf, -7 * k);
    const start = addDays(end, -6);
    weeks.push(estimateWeek(records, trend, start, end, minWeighIns, minIntakeDays));
  }

  let smoothed: number | null = null;
  let validCount = 0;
  for (const wk of weeks) {
    if (!wk.valid || wk.tdee === null) continue;
    smoothed = smoothed === null ? wk.tdee : smoothed + smoothing * (wk.tdee - smoothed);
    wk.smoothedTdee = round(smoothed);
    validCount++;
  }
  const smoothedTdee = smoothed === null ? null : round(smoothed);

  const current = weeks[weeks.length - 1];
  const valid = current.valid && smoothedTdee !== null;

  let reason: string;
  if (valid) {
    reason = `Calibrated from ${validCount} valid week${validCount === 1 ? '' : 's'} — ${current.weighIns} weigh-ins and ${current.intakeDays} intake days this week.`;
  } else if (current.weighIns < minWeighIns) {
    reason = `Weigh in ${minWeighIns}+ days this week so your trend and expenditure calibrate.`;
  } else if (current.intakeDays < minIntakeDays) {
    reason = `Log intake on ${minIntakeDays}+ days this week so your expenditure can calibrate.`;
  } else {
    reason = 'Keep weighing in — expenditure needs a full week of trend data.';
  }

  return {
    tdee: valid ? smoothedTdee : null,
    smoothedTdee,
    valid,
    reason,
    weeks,
    weighInsThisWeek: current.weighIns,
    intakeDaysThisWeek: current.intakeDays,
  };
}

// ---------------------------------------------------------------------------
// Calorie adjustment
// ---------------------------------------------------------------------------

export interface IntakeRecommendation {
  /** Recommended daily kcal target. */
  kcal: number;
  /** kcal − currentKcal. */
  delta: number;
  reason: string;
  /** protein×4 + fatFloor×9 + 50 g carbs×4 — the floor the target can never go under. */
  minimumKcal: number;
  changed: boolean;
}

export interface RecommendIntakeInput {
  result: ExpenditureResult;
  currentKcal: number;
  /** Signed weekly trend rate (lb/wk); negative = losing. Null when unknown. */
  weeklyRateLb: number | null;
  bodyWeightLb: number;
  targets: Targets;
  /**
   * How many consecutive weeks the rate has sat outside the band (default 1 =
   * this week). 0 holds — the spec adjusts only after a *full* week outside.
   * ≥2 escalates a 100-kcal step to 200 because the smaller step didn't land.
   */
  consecutiveWeeksOutside?: number;
}

/**
 * Lowest defensible intake: the protein target and the 60 g fat floor must
 * fit (§6.2/§6.5), plus a 50 g carb minimum so training fuel isn't zero.
 */
export function minimumIntakeKcal(targets: Targets): number {
  const protein = Math.max(0, targets.protein);
  const fat = Math.max(0, targets.fatFloor);
  return round(protein * 4 + fat * 9 + 50 * 4);
}

/** Largest single-week change, in kcal (§6.2 "~100–200 kcal steps"). */
const MAX_STEP = 200;
const SMALL_STEP = 100;

/**
 * Recommend next week's intake from the weekly trend rate vs the target band.
 *
 * Fat-loss framing (the band is a loss band). Only changes when the rate is
 * outside the band AND this week's expenditure is valid (an unreliable week
 * shouldn't move the target). Step sizes are coarse by design:
 *   - 100 kcal when just outside the band;
 *   - 200 kcal when the miss is wider than the edge itself — i.e. losing more
 *     than double the upper edge, or not losing at all (gaining) — or when the
 *     rate has been outside for ≥2 consecutive weeks;
 *   - never more than ±200 in one week.
 * Losing too slowly (or gaining) → subtract; losing too fast → add.
 * The result never goes below `minimumKcal`; if it would, it's capped there
 * and the reason says why.
 */
export function recommendIntake(input: RecommendIntakeInput): IntakeRecommendation {
  const { result, currentKcal, weeklyRateLb, bodyWeightLb, targets } = input;
  const weeksOutside = Math.max(0, Math.floor(input.consecutiveWeeksOutside ?? 1));
  const minimumKcal = minimumIntakeKcal(targets);
  const [lo, hi] = targetLbPerWeek(bodyWeightLb, targets.weeklyRatePct);
  const bandText = `${fmt(lo, 2)}–${fmt(hi, 2)} lb/wk`;

  /** Apply the floor, then build the result; `why(kcal, delta)` sees the effective numbers. */
  const finish = (candidate: number, why: (kcal: number, delta: number) => string): IntakeRecommendation => {
    const wanted = round(candidate);
    const kcal = Math.max(wanted, minimumKcal);
    const delta = kcal - currentKcal;
    let reason = why(kcal, delta);
    if (kcal !== wanted) {
      reason += ` Held at ${fmt(minimumKcal)} kcal — the minimum that fits ${fmt(targets.protein)} g protein and the ${fmt(targets.fatFloor)} g fat floor.`;
    }
    return { kcal, delta, reason, minimumKcal, changed: delta !== 0 };
  };

  if (!result.valid) {
    return finish(currentKcal, () => result.reason);
  }

  const band = rateBand(weeklyRateLb, bodyWeightLb, targets.weeklyRatePct);
  if (band === null || weeklyRateLb === null) {
    return finish(currentKcal, () => 'Not enough trend data yet to judge your weekly rate — hold your current intake.');
  }

  const loss = -weeklyRateLb;
  const lossText = `${fmt(Math.abs(loss), 2)} lb/wk`;

  if (band === 'in') {
    return finish(
      currentKcal,
      (kcal) => `Trend is falling ${lossText} — inside your ${bandText} target. Hold at ${fmt(kcal)} kcal.`,
    );
  }

  if (weeksOutside < 1) {
    return finish(
      currentKcal,
      () =>
        `Rate is ${loss < 0 ? 'up' : 'at'} ${lossText}, outside your ${bandText} target — hold for a full week before changing intake.`,
    );
  }

  // A miss wider than the crossed edge itself earns the big step: for 'below'
  // that is loss ≤ 0 (not losing / gaining); for 'above' it is loss > 2 × hi.
  const wideMiss = band === 'below' ? lo - loss >= lo : loss - hi > hi;
  const step = Math.min(MAX_STEP, wideMiss || weeksOutside >= 2 ? MAX_STEP : SMALL_STEP);

  if (band === 'below') {
    const what =
      loss <= 0
        ? `Trend is up ${lossText} while you're in fat loss`
        : `Losing ${lossText}, slower than your ${fmt(lo, 2)} lb/wk floor`;
    return finish(currentKcal - step, (kcal, delta) =>
      delta === 0
        ? `${what}, but you're already at your minimum intake.`
        : `${what}. Cut ${fmt(-delta)} kcal to ${fmt(kcal)} kcal.`,
    );
  }

  // band === 'above': losing faster than the band — add to protect lean mass.
  return finish(
    currentKcal + step,
    (kcal, delta) =>
      `Losing ${lossText}, faster than your ${fmt(hi, 2)} lb/wk ceiling. Add ${fmt(delta)} kcal to ${fmt(kcal)} kcal to protect lean mass.`,
  );
}

// ---------------------------------------------------------------------------
// Chart helpers
// ---------------------------------------------------------------------------

/**
 * Half-width (lb) of the shaded "water weight noise" band on the Trends
 * weight chart: 1.5 × sample SD of (scale − trend) residuals over the last
 * `days` days, clamped to [0.5, 3.5] lb. With fewer than 5 residuals the
 * band falls back to 1.5 lb (§6.1: glycogen/sodium swings add 1–2+ kg).
 * Uses the record's cached `wt` when present so the band matches the drawn
 * trend line; otherwise recomputes the α=0.10 trend.
 */
export function waterNoiseBand(records: DailyRecord[], asOf: ISODate, days = 30): number {
  const n = Math.max(1, Math.floor(days));
  const start = addDays(asOf, -(n - 1));
  let computed: Map<ISODate, number> | null = null;
  const residuals: number[] = [];
  for (const r of records) {
    if (r.d < start || r.d > asOf) continue;
    const w = r.w;
    if (!isWeight(w)) continue;
    let wt = typeof r.wt === 'number' && Number.isFinite(r.wt) ? r.wt : undefined;
    if (wt === undefined) {
      if (computed === null) computed = computeEwmaTrend(records, 0.1, asOf);
      wt = computed.get(r.d);
    }
    if (wt !== undefined) residuals.push(w - wt);
  }
  if (residuals.length < 5) return DEFAULT_NOISE_BAND_LB;
  const sd = stddev(residuals);
  if (sd === null || !Number.isFinite(sd)) return DEFAULT_NOISE_BAND_LB;
  return round(clamp(1.5 * sd, 0.5, 3.5), 2);
}

/**
 * Points for the TDEE line: one per valid week, plotted at the week's end
 * date with the smoothed value, oldest first.
 */
export function expenditureSeries(
  records: DailyRecord[],
  asOf: ISODate,
  weeks = 6,
  opts: Omit<ExpenditureOpts, 'weeks'> = {},
): Array<{ d: ISODate; tdee: number }> {
  const out: Array<{ d: ISODate; tdee: number }> = [];
  for (const wk of weeklyExpenditure(records, asOf, { ...opts, weeks }).weeks) {
    if (wk.valid && wk.smoothedTdee !== null) out.push({ d: wk.end, tdee: wk.smoothedTdee });
  }
  return out;
}
