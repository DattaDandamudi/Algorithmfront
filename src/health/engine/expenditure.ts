import type { DailyRecord, ISODate, Profile, Targets, Workout } from '../data/types';
import { addDays, dateRange, diffDays } from '../lib/dates';
import { clamp, fmt, kgToLb, lbToKg, mean, round, stddev } from '../lib/format';
import {
  KALMAN_Q_LEVEL,
  KALMAN_Q_SLOPE,
  KALMAN_R_DEFAULT,
  pOutsideBand,
  type KalmanResult,
} from './kalman';
import { robustSd } from './stats';
import {
  clampAlpha,
  computeEwmaTrend,
  isWeight,
  latestWeight,
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
 * Cadence (R3-4): the reverse calculation runs over 7-day blocks anchored to
 * the user's FIRST weigh-in — block k covers days [first + 7k, first + 7k + 6]
 * — and only a COMPLETED block (its last day strictly before `asOf`) can
 * publish. The estimate therefore changes once a week, the morning after a
 * block closes, never as a sliding window that moves every day. The block
 * containing `asOf` is "this week": its counts feed the empty-state nudge
 * ("Weigh in 5+ days this week…") but never the estimate.
 *
 * Gates: each block needs ≥ 5 weigh-ins AND ≥ 5 intake days so a sparse week
 * can't produce a wild estimate, and (R3-5) a block must START at least
 * CALIBRATION_DAYS (14) after the first weigh-in — the EWMA trend seeded on
 * that weigh-in lags a real loss for ~2 weeks, so the first two blocks would
 * under-read the deficit by hundreds of kcal (≈ −375 kcal on a 1 lb/wk loss).
 * The first estimate lands on day 22 ("Adaptation shows in 14–30 days").
 *
 * Smoothing: valid blocks are folded, oldest → newest, into a second EWMA
 * (default α = 0.3) that runs over EVERY completed block since the first
 * weigh-in — the smoothed value is carried forward as state between weeks,
 * so it never re-seeds when the chart window slides. One week's fluid swing
 * cannot over-correct: adjustments deliberately do *not* scale 1:1.
 *
 * Pure & deterministic: records in (any order), plain numbers or null out —
 * never NaN, never throws, never reads the clock.
 *
 * ---------------------------------------------------------------------------
 * ## v3 (§1b, after the state-of-the-art audit)
 *
 * Everything above is **v2** and is kept working for the Log block line; the
 * v3 API below is what decisions should use. Four things changed, each of
 * which was a measurable bias in v2:
 *
 * 1. **Energy density is not 3,500 kcal/lb.** `energyDensity` implements the
 *    Forbes/Hall composition rule: the lean fraction of the tissue exchanged
 *    is `p = C/(C + FM)` with `C = 10.4 kg`, and its energy density is
 *    `ρ = 1020·p + 9500·(1 − p)` kcal/kg — 2,348 kcal/lb at 10 kg of fat mass
 *    against 3,587 at 45 kg. A lean lifter's true factor is ~30% below 3,500,
 *    and that single constant is what made v2 read high.
 *    (Forbes 1987; Hall, *Int J Obes* 2008 "What is the required energy deficit
 *    per unit weight loss?"; Thomas et al., *J Acad Nutr Diet* 2013.)
 * 2. **An explicit glycogen–water state.** `glycogenSeries` runs
 *    `G(t) = G(t−1) + (G_ss(carb₇) − G(t−1))/τ` with τ = 6 d and
 *    `G_ss = 4 g water per g glycogen × 0.004 kg per g of daily carbohydrate`,
 *    capped at ±2.5 kg, and `Δlevel` is corrected by `−ΔG` before the TDEE
 *    observation is formed. Without it, week 1 of a carbohydrate cut reports a
 *    fake +700–1,000 kcal/d of expenditure. Zero when carbs are unlogged.
 *    (Olsson & Saltin 1970; Fernández-Elías 2015 measured 3:1–4:1 water:glycogen;
 *    Kreitzman 1992.)
 * 3. **Two observations, not one.** The weight-derived reverse calculation is
 *    joined by a steps/activity estimate
 *    `TDEE_steps = RMR·1.15 + 0.00044·kg·max(steps − 2500, 0) + Σ session kcal`
 *    (session kcal from the MET identity `(MET − 1)·3.5·kg/200·min`), variance
 *    250². The prior is Mifflin-St Jeor × an activity factor with **sd 450**
 *    (Mifflin's own RMSE ≈ 276 kcal plus 200–300 kcal of activity-factor
 *    error; 550 without a height), compressed 20% at high activity.
 *    (Mifflin-St Jeor 1990; Ten Haaf & Weijs 2014; Ainsworth 2011 Compendium
 *    for the METs; Pontzer 2016 constrained-expenditure for the compression.)
 * 4. **Two-tier coaching.** A fine ±50–100 kcal nudge after a *single* block at
 *    `P(outside) ≥ 0.7` with no freeze, and the coarse ≥ 150 kcal move still
 *    gated on `!frozen && valid && blocksOutside ≥ 2` at `p ≥ 0.8` with the
 *    14-day freeze after a target change. Fat floor `max(60 g, 0.15·kcal/9)`;
 *    protein is never cut. (MacroFactor updates weekly at ≈ 108 kcal/d error;
 *    RP adjusts 2–3×/wk and expresses the fat floor both ways.)
 *
 * The posterior is a 1-D Kalman across blocks (drift sd 40 kcal), so `tdee`
 * carries a real interval: `ci = 1.645·√V`, `valid` at ci ≤ 300,
 * `calibrating` above 250. The weight filter itself is **never** recomputed
 * here — `kalman` arrives as a parameter (§1a owns it).
 *
 * ### Three judgement calls the simulations forced, all documented at their site
 *
 * 1. `pOutside` is the **one-sided** probability `max(pAbove, pBelow)`, not the
 *    two-sided sum: the sum rises with uncertainty, so a rate sitting dead
 *    centre in the band would earn a calorie change simply for being poorly
 *    measured (measured: p ≈ 0.75 on every block of a noisy user).
 * 2. A block rate's sd is the larger of the filter's own uncertainty and the
 *    **user's measured week-to-week dispersion**. The filter's `P` answers "how
 *    well do we know the level", which is not "how much does a 7-day rate
 *    bounce"; water, sodium and gut fill move the latter several times more.
 * 3. The fine tier stands down when the **previous** block missed the band the
 *    other way and had not cleared — two weeks that disagree about which way
 *    you are off are water, not a signal. Without it a 2 lb weekly water bump
 *    produced a false nudge in 10% of simulated runs, against a 5% budget.
 */

/**
 * Energy density of body-weight change used for the v2 reverse calc (§6.2).
 * @deprecated v3 replaces this constant with `energyDensity(profile, weightLb)`
 * — the Forbes/Hall factor is 2,300–3,700 kcal/lb depending on fat mass, and
 * 3,500 is only correct near ~35 kg of fat mass.
 */
export const KCAL_PER_LB = 3500;
/** Half-width of the water-noise band when there are too few residuals to measure it. */
export const DEFAULT_NOISE_BAND_LB = 1.5;
/** A block must start this many days after the first weigh-in before it can publish (R3-5). */
export const CALIBRATION_DAYS = 14;
/** Days of weigh-ins before the first estimate can exist: the first eligible block closes on day 21. */
export const FIRST_ESTIMATE_DAYS = CALIBRATION_DAYS + 7;

export interface WeekEstimate {
  /** First day of the 7-day block (inclusive). */
  start: ISODate;
  /** Last day of the block (inclusive). Blocks are anchored to the first weigh-in (see module header). */
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
   */
  smoothedTdee: number | null;
  valid: boolean;
  /** Short diagnostic, e.g. "Only 3 of 5 weigh-ins" — for chart tooltips. */
  reason: string;
  /** Block starts < CALIBRATION_DAYS after the first weigh-in: computed, never published (R3-5). */
  calibrating: boolean;
}

export interface ExpenditureResult {
  /**
   * The estimate to display right now: equals `smoothedTdee` when the latest
   * completed block passed its gates, otherwise null so the empty state shows.
   */
  tdee: number | null;
  /** Last calibrated (smoothed) estimate, even if the latest block failed — null when no block has ever been valid. */
  smoothedTdee: number | null;
  /** True when the latest completed block produced a valid estimate. */
  valid: boolean;
  /** Empty-state copy when invalid ("Weigh in 5+ days this week…"), otherwise a short calibration summary. */
  reason: string;
  /**
   * The last `weeks` COMPLETED blocks, OLDEST FIRST; `weeks[weeks.length − 1]`
   * is the latest completed block. Fewer than `weeks` (down to none in the
   * first week) when that many have not completed yet — never padded with
   * blocks dated before the first weigh-in (R7-7).
   */
  weeks: WeekEstimate[];
  /** Weigh-ins so far in the in-progress block ("this week"). */
  weighInsThisWeek: number;
  intakeDaysThisWeek: number;
  /** Date of the first weigh-in — the block anchor; null before any weigh-in. */
  firstWeighIn: ISODate | null;
  /** True while no block starting ≥ CALIBRATION_DAYS after the first weigh-in has completed yet. */
  calibrating: boolean;
  /** The day the next estimate can publish (morning after the in-progress block closes); null before any weigh-in. */
  nextUpdate: ISODate | null;
}

export interface ExpenditureOpts {
  /** EWMA α for the weight trend (default 0.10, §6.1). */
  alpha?: number;
  /** Weigh-ins required per block (default 5, §6.2). */
  minWeighIns?: number;
  /** Intake days (kc > 0) required per block (default 5). */
  minIntakeDays?: number;
  /** Max completed 7-day blocks to return (default 6; fewer exist early on). The smoothing state always uses every block. */
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

/** Earliest weigh-in on or before `asOf` — the block anchor. */
function firstWeighInDate(records: DailyRecord[], asOf: ISODate): ISODate | null {
  let first: ISODate | null = null;
  for (const r of records) {
    if (r.d <= asOf && isWeight(r.w) && (first === null || r.d < first)) first = r.d;
  }
  return first;
}

function estimateWeek(
  records: DailyRecord[],
  trend: Map<ISODate, number>,
  start: ISODate,
  end: ISODate,
  minWeighIns: number,
  minIntakeDays: number,
  calibrating: boolean,
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
  // weigh-in) is the fallback so the raw number exists for tooltips — the
  // calibrating gate keeps such a block off the screen.
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
  } else if (calibrating) {
    valid = false;
    reason = `Calibrating — needs ${CALIBRATION_DAYS} days of weigh-in history before this block`;
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
    calibrating,
  };
}

/** Weigh-ins / intake days in the in-progress block, counted only through `asOf`. */
function progressCounts(records: DailyRecord[], start: ISODate, asOf: ISODate): { weighIns: number; intakeDays: number } {
  let weighIns = 0;
  let intakeDays = 0;
  for (const r of records) {
    if (r.d < start || r.d > asOf) continue;
    if (isWeight(r.w)) weighIns++;
    if (intakeOf(r) !== null) intakeDays++;
  }
  return { weighIns, intakeDays };
}

/**
 * Weekly reverse-calculated expenditure. Returns the last `weeks` completed
 * blocks (oldest → newest) plus the smoothed estimate carried over every
 * completed block since the first weigh-in. See the module header for the
 * cadence and gates.
 *
 * @deprecated v2. Kept because the Log block line and the Trends TDEE card
 * still render it. New callers want `weeklyExpenditureV3`, which uses the
 * per-user Forbes/Hall energy density, corrects for glycogen water, folds in a
 * steps observation and publishes a credible interval instead of a point.
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

  // `through = asOf` so the in-progress block has a trend value even on a day
  // without a weigh-in yet.
  const trend = computeEwmaTrend(records, alpha, asOf);
  const anchor = firstWeighInDate(records, asOf);
  const weighNudge = `Weigh in ${minWeighIns}+ days this week so your trend and expenditure calibrate.`;
  const intakeNudge = `Log intake on ${minIntakeDays}+ days this week so your expenditure can calibrate.`;

  if (anchor === null) {
    // No weigh-in yet: trailing blocks ending at asOf keep the shape (and the
    // nudge counts) meaningful; nothing can be valid.
    const weeks: WeekEstimate[] = [];
    for (let k = nWeeks - 1; k >= 0; k--) {
      const end = addDays(asOf, -7 * k);
      weeks.push(estimateWeek(records, trend, addDays(end, -6), end, minWeighIns, minIntakeDays, true));
    }
    const current = weeks[weeks.length - 1];
    return {
      tdee: null,
      smoothedTdee: null,
      valid: false,
      reason: weighNudge,
      weeks,
      weighInsThisWeek: current.weighIns,
      intakeDaysThisWeek: current.intakeDays,
      firstWeighIn: null,
      calibrating: false,
      nextUpdate: null,
    };
  }

  const daysSince = diffDays(anchor, asOf);
  /** Index of the in-progress block; blocks 0 … j − 1 are complete (their last day is before asOf). */
  const j = Math.floor(daysSince / 7);
  const blockStart = (k: number): ISODate => addDays(anchor, 7 * k);
  const estimate = (k: number): WeekEstimate => {
    const start = blockStart(k);
    return estimateWeek(records, trend, start, addDays(start, 6), minWeighIns, minIntakeDays, 7 * k < CALIBRATION_DAYS);
  };

  // Smoothing state over every completed block since the anchor.
  const byIndex = new Map<number, WeekEstimate>();
  let smoothed: number | null = null;
  let validCount = 0;
  for (let k = 0; k < j; k++) {
    const wk = estimate(k);
    if (wk.valid && wk.tdee !== null) {
      smoothed = smoothed === null ? wk.tdee : smoothed + smoothing * (wk.tdee - smoothed);
      wk.smoothedTdee = round(smoothed);
      validCount++;
    }
    byIndex.set(k, wk);
  }
  // R7-7: only blocks that exist — never pad back before the first weigh-in
  // (a phantom block would put a null point on the chart eight days before
  // the user ever weighed in and inflate the "N weekly estimates" caption).
  const weeks: WeekEstimate[] = [];
  for (let k = Math.max(0, j - nWeeks); k < j; k++) weeks.push(byIndex.get(k) as WeekEstimate);

  const last = j > 0 ? (byIndex.get(j - 1) as WeekEstimate) : null;
  const current = progressCounts(records, blockStart(j), asOf);
  const smoothedTdee = smoothed === null ? null : round(smoothed);
  const valid = last !== null && last.valid && smoothedTdee !== null;
  // No block starting ≥ CALIBRATION_DAYS after the anchor has closed until block 2 does (day 21).
  const calibrating = j < FIRST_ESTIMATE_DAYS / 7;
  const nextUpdate = blockStart(Math.max(j + 1, FIRST_ESTIMATE_DAYS / 7));

  let reason: string;
  if (valid && last !== null) {
    reason = `Calibrated from ${validCount} valid week${validCount === 1 ? '' : 's'} — ${last.weighIns} weigh-ins and ${last.intakeDays} intake days in your last full week.`;
  } else if (calibrating) {
    reason = `Calibrating — your first expenditure estimate lands after 3 weeks of weigh-ins (day ${daysSince + 1} of ${FIRST_ESTIMATE_DAYS}). Weigh in ${minWeighIns}+ days each week.`;
  } else if (last !== null && last.weighIns < minWeighIns) {
    reason = `Only ${last.weighIns} of ${minWeighIns} weigh-ins in your last full week. ${weighNudge}`;
  } else if (last !== null && last.intakeDays < minIntakeDays) {
    reason = `Only ${last.intakeDays} of ${minIntakeDays} intake days in your last full week. ${intakeNudge}`;
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
    firstWeighIn: anchor,
    calibrating,
    nextUpdate,
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
   * context.ts derives it with `weeksOutsideBand` (R3-3).
   */
  consecutiveWeeksOutside?: number;
}

/**
 * Lowest defensible intake: the protein target and the 60 g fat floor must
 * fit (§6.2/§6.5), plus a 50 g carb minimum so training fuel isn't zero.
 *
 * @deprecated v2. `minimumIntakeKcalV3` applies RP's floor expressed both ways
 * — `max(60 g, 0.15 × kcal/9)` — which binds above 60 g for anyone eating more
 * than 3,600 kcal.
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
 *
 * @deprecated v2. `recommendIntakeV3` is two-tier (a weekly ±50–100 nudge at
 * P(outside) ≥ 0.7 plus the coarse ≥ 150 move at ≥ 0.8 after two blocks), is
 * gated on the probability the *true* rate is outside the band rather than on
 * a point estimate crossing a line, and quotes its evidence.
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
 * Points for the TDEE line: one per valid completed week, plotted at the
 * block's end date with the smoothed value, oldest first.
 *
 * @deprecated v2. The v3 chart series is `weeklyExpenditureV3(...).blocks`,
 * where each block carries the posterior `tdee` **and** its `tdeeSd`, so the
 * line can be drawn with its band.
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

// ===========================================================================
// v3 — energy density (Forbes/Hall), glycogen water, Bayesian TDEE
// ===========================================================================

// --- energy density --------------------------------------------------------

/** Forbes' constant: the lean/fat exchange scales with `C/(C + FM)`, C = 10.4 kg. */
export const FORBES_C_KG = 10.4;
/** Energy density of the lean tissue exchanged, kcal/kg (Hall 2008). */
export const KCAL_PER_KG_LEAN = 1020;
/** Energy density of adipose tissue, kcal/kg (Hall 2008). */
export const KCAL_PER_KG_FAT = 9500;
/** ρ is clamped to this window — outside it the composition estimate is doing more work than the data. */
export const ENERGY_DENSITY_MIN_LB = 2300;
export const ENERGY_DENSITY_MAX_LB = 3700;
/**
 * Body fat % assumed when neither `bodyFatPct` nor a height is on file, by sex
 * — roughly the NHANES adult means. **Heuristic**: it is a population prior,
 * not this user's body, and `source: 'assumed'` says so in the caption.
 */
export const ASSUMED_BODY_FAT_PCT: Record<Profile['sex'], number> = { male: 22, female: 32, other: 27 };

export interface EnergyDensity {
  /** ρ in kcal per lb of weight change — the number the reverse calc divides by. */
  kcalPerLb: number;
  kcalPerKg: number;
  /** p = C/(C + FM): the lean fraction of the tissue exchanged. */
  leanFraction: number;
  fatMassKg: number;
  bodyFatPct: number;
  /** Where the fat mass came from — 'assumed' means a population prior, not this body. */
  source: 'profile' | 'deurenberg' | 'assumed';
  /** True when ρ hit one of the clamps. */
  clamped: boolean;
  /** Caption-ready: "3,320 kcal per lb at your body composition". */
  label: string;
}

/**
 * Forbes/Hall energy density of body-weight change for this body.
 *
 *   p = C/(C + FM),  C = 10.4 kg      ρ = 1020·p + 9500·(1 − p) kcal/kg
 *
 * Fat mass comes from `profile.bodyFatPct` when it is set, otherwise from
 * Deurenberg's BMI/age/sex equation (`BF% = 1.20·BMI + 0.23·age − 10.8·sex −
 * 5.4`, sex 1 = male), otherwise from a labelled population prior. ρ is
 * clamped to [2,300, 3,700] kcal/lb.
 *
 * Worked: 10 kg fat mass → 2,348 kcal/lb; 45 kg → 3,587 kcal/lb. The folk
 * 3,500 is only right near 35 kg of fat mass, which is why v2 read high for
 * every lean user.
 */
export function energyDensity(profile: Profile, weightLb?: number): EnergyDensity {
  const w = typeof weightLb === 'number' && Number.isFinite(weightLb) && weightLb > 0 ? weightLb : profile.weightLb;
  const kg = lbToKg(clamp(Number.isFinite(w) && w > 0 ? w : 150, 50, 800));
  const age = clamp(Number.isFinite(profile.age) ? profile.age : 30, 14, 100);
  const sexScore = profile.sex === 'male' ? 1 : profile.sex === 'female' ? 0 : 0.5;

  let bodyFatPct: number;
  let source: EnergyDensity['source'];
  const bf = profile.bodyFatPct;
  const cm = profile.heightCm;
  if (typeof bf === 'number' && Number.isFinite(bf) && bf > 0 && bf < 70) {
    bodyFatPct = bf;
    source = 'profile';
  } else if (typeof cm === 'number' && Number.isFinite(cm) && cm >= 100 && cm <= 250) {
    const bmi = kg / (cm / 100) ** 2;
    bodyFatPct = clamp(1.2 * bmi + 0.23 * age - 10.8 * sexScore - 5.4, 3, 70);
    source = 'deurenberg';
  } else {
    bodyFatPct = ASSUMED_BODY_FAT_PCT[profile.sex] ?? ASSUMED_BODY_FAT_PCT.other;
    source = 'assumed';
  }

  const fatMassKg = Math.max(0.5, (kg * bodyFatPct) / 100);
  const leanFraction = FORBES_C_KG / (FORBES_C_KG + fatMassKg);
  const kcalPerKg = KCAL_PER_KG_LEAN * leanFraction + KCAL_PER_KG_FAT * (1 - leanFraction);
  const raw = kcalPerKg / kgToLb(1);
  const kcalPerLb = clamp(raw, ENERGY_DENSITY_MIN_LB, ENERGY_DENSITY_MAX_LB);
  const suffix = source === 'assumed' ? 'at an assumed body composition' : 'at your body composition';
  return {
    kcalPerLb: round(kcalPerLb),
    kcalPerKg: round(kcalPerKg),
    leanFraction: round(leanFraction, 4),
    fatMassKg: round(fatMassKg, 2),
    bodyFatPct: round(bodyFatPct, 1),
    source,
    clamped: Math.abs(raw - kcalPerLb) > 0.5,
    label: `${fmt(round(kcalPerLb))} kcal per lb ${suffix}`,
  };
}

// --- glycogen–water state --------------------------------------------------

/** Time constant of the glycogen store's approach to its new steady state, days. */
export const GLYCOGEN_TAU_DAYS = 6;
/** Grams of water bound per gram of glycogen (Fernández-Elías 2015 measured 3:1–4:1). */
export const GLYCOGEN_WATER_PER_G = 4;
/** Steady-state glycogen mass per gram of daily carbohydrate, kg (Kreitzman 1992). */
export const GLYCOGEN_KG_PER_CARB_G = 0.004;
/** The model may never attribute more than this much weight change to water, kg. */
export const GLYCOGEN_CAP_KG = 2.5;

export interface GlycogenPoint {
  d: ISODate;
  /** Trailing 7-day mean carbohydrate (g); null when nothing was logged in the window. */
  carb7: number | null;
  /** Glycogen + bound water **relative to the first day**, kg, clamped to ±2.5. */
  kg: number;
  /** The same deviation in lb. */
  lb: number;
  /**
   * `lb` put through the same trend filter the weight level went through, so
   * `ΔlevelLb` can be subtracted from `Δlevel` without leading it. See
   * `glycogenSeries` for why this matters.
   */
  levelLb: number;
}

export interface GlycogenOpts {
  /** Last day of the series (default: the last record). */
  through?: ISODate;
  /** Lag-match against an EWMA trend of this α instead of the Kalman filter. */
  alpha?: number;
  /** Lag-match against a Kalman with this measurement variance (default 0.81). */
  measurementVar?: number;
}

/**
 * The glycogen–water state behind a carbohydrate change.
 *
 *   G_ss(carb₇) = 4 g water per g glycogen × 0.004 kg per g of daily carb
 *   G(t) = G(t−1) + (G_ss(carb₇(t)) − G(t−1)) / τ,  τ = 6 days
 *
 * reported as the **deviation from the first day's steady state**, clamped to
 * ±2.5 kg, so a 150 g/day carbohydrate cut is worth about −2.4 kg of water
 * approached over a fortnight. Zero everywhere when carbohydrate is never
 * logged, and held flat across a gap in carb logging rather than decaying to
 * a number nobody entered.
 *
 * **Why `levelLb` exists.** `Δlevel` comes out of a *filter*, so the water it
 * contains is the filtered water, not the raw water. Subtracting the raw ΔG
 * from a filtered Δlevel over-corrects week 1 by ~0.9 lb (≈ 400 kcal/d) and
 * then under-corrects week 2 by as much in the other direction — measured, not
 * assumed. `levelLb` is the same series pushed through the same steady-state
 * local-linear-trend filter (or the same EWMA, when there is no Kalman), which
 * drops that residual to under 100 kcal/d. It is a linear filter applied to a
 * noiseless signal, not a second weight filter: §1a still owns the only filter
 * that ever touches a scale reading.
 */
export function glycogenSeries(records: DailyRecord[], opts: GlycogenOpts = {}): GlycogenPoint[] {
  const carbOf = (r: DailyRecord): number | null =>
    typeof r.c === 'number' && Number.isFinite(r.c) && r.c >= 0 ? r.c : null;
  const sorted = [...records].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const inRange = opts.through === undefined ? sorted : sorted.filter((r) => r.d <= (opts.through as ISODate));
  if (inRange.length === 0) return [];

  const start = inRange[0].d;
  const end = opts.through ?? inRange[inRange.length - 1].d;
  if (end < start) return [];
  const days = dateRange(start, end);
  const carbByDate = new Map<ISODate, number>();
  for (const r of inRange) {
    const c = carbOf(r);
    if (c !== null) carbByDate.set(r.d, c);
  }

  const zero = (): GlycogenPoint[] => days.map((d) => ({ d, carb7: null, kg: 0, lb: 0, levelLb: 0 }));
  if (carbByDate.size === 0) return zero();

  // Trailing 7-day mean carbohydrate per day (null when the window is empty).
  const carb7: (number | null)[] = days.map((d) => {
    const from = addDays(d, -6);
    const vals: number[] = [];
    for (const [k, v] of carbByDate) if (k >= from && k <= d) vals.push(v);
    return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0) / vals.length;
  });

  const ss = (carb: number): number => GLYCOGEN_WATER_PER_G * GLYCOGEN_KG_PER_CARB_G * carb;
  const firstCarb = carb7.find((v) => v !== null) as number | undefined;
  if (firstCarb === undefined) return zero();
  let g = ss(firstCarb);
  const g0 = g;
  const kgs: number[] = [];
  for (let i = 0; i < days.length; i++) {
    const c = carb7[i];
    if (i > 0 && c !== null) g += (ss(c) - g) / GLYCOGEN_TAU_DAYS;
    kgs.push(clamp(g - g0, -GLYCOGEN_CAP_KG, GLYCOGEN_CAP_KG));
  }

  const lbs = kgs.map(kgToLb);
  const levels =
    opts.alpha !== undefined
      ? ewmaMatch(lbs, clampAlpha(opts.alpha))
      : trendMatch(lbs, opts.measurementVar ?? KALMAN_R_DEFAULT);
  return days.map((d, i) => ({
    d,
    carb7: carb7[i] === null ? null : round(carb7[i] as number, 1),
    kg: round(kgs[i], 4),
    lb: round(lbs[i], 4),
    levelLb: round(levels[i], 4),
  }));
}

/**
 * Steady-state gain of the §1a local-linear-trend filter for a given
 * measurement variance — the Riccati recursion iterated to its fixed point.
 * With R = 0.81 it is [0.202, 0.0172]: the level moves a fifth of the way to
 * each new reading, which is exactly the lag the glycogen correction has to
 * match.
 */
function steadyStateGain(measurementVar: number): [number, number] {
  const R = Math.max(1e-4, Number.isFinite(measurementVar) ? measurementVar : KALMAN_R_DEFAULT);
  let p00 = R;
  let p01 = 0;
  let p10 = 0;
  let p11 = KALMAN_Q_SLOPE;
  let k0 = 0;
  let k1 = 0;
  for (let i = 0; i < 300; i++) {
    const a00 = p00 + p01 + p10 + p11 + KALMAN_Q_LEVEL;
    const a01 = p01 + p11;
    const a10 = p10 + p11;
    const a11 = p11 + KALMAN_Q_SLOPE;
    const s = a00 + R;
    k0 = a00 / s;
    k1 = a10 / s;
    p00 = (1 - k0) * a00;
    p01 = (1 - k0) * a01;
    p10 = a10 - k1 * a00;
    p11 = a11 - k1 * a01;
  }
  return [k0, k1];
}

/** Apply the steady-state local-linear-trend filter to a noiseless series. */
function trendMatch(series: number[], measurementVar: number): number[] {
  if (series.length === 0) return [];
  const [k0, k1] = steadyStateGain(measurementVar);
  let level = series[0];
  let slope = 0;
  const out: number[] = [];
  for (let i = 0; i < series.length; i++) {
    if (i > 0) level += slope;
    const nu = series[i] - level;
    level += k0 * nu;
    slope += k1 * nu;
    out.push(level);
  }
  return out;
}

/** Apply an EWMA of the same α — the lag match for the v2 trend fallback. */
function ewmaMatch(series: number[], alpha: number): number[] {
  if (series.length === 0) return [];
  let level = series[0];
  const out: number[] = [];
  for (let i = 0; i < series.length; i++) {
    level += alpha * (series[i] - level);
    out.push(level);
  }
  return out;
}

// --- prior ------------------------------------------------------------------

/** Mifflin-St Jeor sex constants (kcal). 'other' takes the midpoint. */
const MIFFLIN_SEX: Record<Profile['sex'], number> = { male: 5, female: -161, other: -78 };
/** Height assumed when none is on file, cm — **heuristic** population means. */
const ASSUMED_HEIGHT_CM: Record<Profile['sex'], number> = { male: 175, female: 162, other: 168 };
/** Prior sd, kcal: Mifflin's RMSE (≈ 276) plus 200–300 of activity-factor error. */
export const PRIOR_SD_KCAL = 450;
/** …widened when the height (and so the RMR) is itself a guess. */
export const PRIOR_SD_NO_HEIGHT_KCAL = 550;
/** Above this activity factor the prior is compressed 20% (Pontzer's constrained expenditure). */
export const PRIOR_COMPRESS_ABOVE_AF = 1.6;
export const PRIOR_COMPRESSION = 0.8;

export interface TdeePrior {
  /** Mifflin RMR × activity factor, kcal/day. */
  kcal: number;
  sd: number;
  rmr: number;
  activityFactor: number;
  /** 30-day mean steps; null when steps were never logged. */
  steps30: number | null;
  liftDaysPerWk: number;
  /** True when the height (and so the RMR) came from a population mean. */
  heightEstimated: boolean;
  label: string;
}

/** Mean of a numeric field over `[asOf − days + 1, asOf]`, null when never logged. */
function meanField(records: DailyRecord[], asOf: ISODate, days: number, pick: (r: DailyRecord) => number | null): number | null {
  const from = addDays(asOf, -(days - 1));
  const vals: number[] = [];
  for (const r of records) {
    if (r.d < from || r.d > asOf) continue;
    const v = pick(r);
    if (v !== null) vals.push(v);
  }
  return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Lifting days per week over the trailing 30 days (a record counts once). */
function liftDaysPerWeek(records: DailyRecord[], asOf: ISODate, days = 30): number {
  const from = addDays(asOf, -(days - 1));
  const seen = new Set<ISODate>();
  for (const r of records) {
    if (r.d < from || r.d > asOf) continue;
    const lifted =
      (typeof r.wko === 'number' && r.wko > 0) ||
      r.lift === true ||
      (typeof r.ld === 'number' && Number.isFinite(r.ld) && r.ld > 0);
    if (lifted) seen.add(r.d);
  }
  return clamp((seen.size * 7) / days, 0, 7);
}

/**
 * Mifflin-St Jeor RMR × an activity factor, with the honest spread on it.
 *
 *   RMR = 10·kg + 6.25·cm − 5·age + (male ? +5 : −161)
 *   AF  = clamp(1.3 + 0.05·(steps30 − 4000)/1000, 1.3, 1.8) + 0.03·liftDays/wk
 *
 * sd 450 kcal (550 when the height is a guess), compressed 20% above an
 * activity factor of 1.6 — high-activity expenditure is *less* variable than
 * the multiplier suggests (Pontzer 2016), so a very active user's prior should
 * not be as loose as the multiplier's own error implies.
 */
export function priorTdee(
  profile: Profile,
  records: DailyRecord[],
  asOf: ISODate,
  weightLb?: number,
): TdeePrior {
  const w = typeof weightLb === 'number' && Number.isFinite(weightLb) && weightLb > 0 ? weightLb : profile.weightLb;
  const kg = lbToKg(clamp(Number.isFinite(w) && w > 0 ? w : 150, 50, 800));
  const age = clamp(Number.isFinite(profile.age) ? profile.age : 30, 14, 100);
  const heightEstimated = !(typeof profile.heightCm === 'number' && Number.isFinite(profile.heightCm) && profile.heightCm >= 100 && profile.heightCm <= 250);
  const cm = heightEstimated ? (ASSUMED_HEIGHT_CM[profile.sex] ?? ASSUMED_HEIGHT_CM.other) : (profile.heightCm as number);
  const rmr = 10 * kg + 6.25 * cm - 5 * age + (MIFFLIN_SEX[profile.sex] ?? MIFFLIN_SEX.other);

  const steps30 = meanField(records, asOf, 30, (r) =>
    typeof r.st === 'number' && Number.isFinite(r.st) && r.st >= 0 ? r.st : null,
  );
  const liftDays = liftDaysPerWeek(records, asOf);
  const stepFactor = clamp(1.3 + (0.05 * ((steps30 ?? 4000) - 4000)) / 1000, 1.3, 1.8);
  const activityFactor = stepFactor + 0.03 * liftDays;
  const sdBase = heightEstimated ? PRIOR_SD_NO_HEIGHT_KCAL : PRIOR_SD_KCAL;
  const sd = activityFactor >= PRIOR_COMPRESS_ABOVE_AF ? sdBase * PRIOR_COMPRESSION : sdBase;
  const kcal = rmr * activityFactor;
  return {
    kcal: round(kcal),
    sd: round(sd),
    rmr: round(rmr),
    activityFactor: round(activityFactor, 3),
    steps30: steps30 === null ? null : round(steps30),
    liftDaysPerWk: round(liftDays, 2),
    heightEstimated,
    label: `${fmt(round(kcal))} kcal ± ${fmt(round(sd))} from Mifflin-St Jeor × ${fmt(activityFactor, 2)}${heightEstimated ? ' (height estimated)' : ''}`,
  };
}

// --- steps observation ------------------------------------------------------

/** Non-exercise multiplier on RMR before steps are counted (Mifflin ×1.15 sedentary). */
export const NEAT_MULTIPLIER = 1.15;
/** kcal per step per kg above the floor — the walking-economy constant. */
export const STEP_KCAL_PER_KG_PER_STEP = 0.00044;
/** Steps already inside the 1.15 multiplier; only steps above this are counted. */
export const STEP_FLOOR = 2500;
/** Observation sd of the steps estimate, kcal. */
export const STEPS_OBS_SD = 250;
/** Resistance-training METs by session RPE (Ainsworth 2011 Compendium: 3.5 / 5.0 / 6.0). */
export const MET_LIFT = { light: 3.5, moderate: 5, vigorous: 6 };
/** Cardio METs by session RPE — the Compendium's walk / jog / run rows. */
export const MET_CARDIO = { light: 4, moderate: 7, vigorous: 10 };
/**
 * Session length assumed when a day is flagged as trained but no workout was
 * passed in, minutes. **Heuristic** — the median logged session, not a source.
 */
export const DEFAULT_SESSION_MIN = 45;

/** MET identity: `(MET − 1) · 3.5 · kg / 200 · minutes` kcal above rest. */
export function metKcal(met: number, kg: number, minutes: number): number {
  if (![met, kg, minutes].every((v) => Number.isFinite(v)) || minutes <= 0) return 0;
  return Math.max(0, ((met - 1) * 3.5 * kg) / 200) * minutes;
}

function intensityOf(srpe: number | undefined): 'light' | 'moderate' | 'vigorous' {
  if (typeof srpe !== 'number' || !Number.isFinite(srpe)) return 'moderate';
  if (srpe <= 4) return 'light';
  if (srpe <= 7) return 'moderate';
  return 'vigorous';
}

/**
 * Net kcal for one session: the logged cardio kcal when the import carried
 * one, otherwise the MET identity at a MET chosen by kind and session RPE.
 */
export function sessionKcal(workout: Workout, bodyKg: number): number {
  const kcal = workout.cardio?.kcal;
  if (typeof kcal === 'number' && Number.isFinite(kcal) && kcal > 0) return kcal;
  const min = Number.isFinite(workout.durationMin) && workout.durationMin > 0 ? workout.durationMin : DEFAULT_SESSION_MIN;
  const table = workout.kind === 'cardio' || workout.kind === 'sport' ? MET_CARDIO : MET_LIFT;
  return metKcal(table[intensityOf(workout.srpe)], bodyKg, min);
}

// --- blocks and the posterior ----------------------------------------------

/** Weigh-ins a block needs before its Δlevel is trusted. */
export const MIN_BLOCK_WEIGH_INS = 3;
/** Logged intake days a block needs before its mean intake is trusted. */
export const MIN_BLOCK_LOG_DAYS = 4;
/** Per-day sd of a logged intake, kcal (under-reporting is a bias, not this). */
export const INTAKE_LOG_SD = 150;
/** Per-day sd of an imputed intake day (assumed to hit the target), kcal. */
export const INTAKE_IMPUTED_SD = 400;
/** True TDEE drifts between blocks: the process sd of the posterior, kcal. */
export const TDEE_DRIFT_SD = 40;
/** z for the published 90% interval. */
export const TDEE_CI_Z = 1.645;
/** `valid` while the interval is no wider than this, kcal. */
export const TDEE_VALID_CI = 300;
/** `calibrating` while it is wider than this, kcal. */
export const TDEE_CALIBRATING_CI = 250;
/** Level variance assumed per endpoint when no Kalman result is supplied, lb². */
export const FALLBACK_LEVEL_VAR = 0.81;
/** Days a coarse suggestion is frozen after the calorie target changes. */
export const KCAL_CHANGE_FREEZE_DAYS = 14;
/**
 * Floor on a block rate's sd, lb/wk. **Heuristic** — the week-to-week water,
 * sodium and gut-fill variation a 7-day scale trend cannot resolve, used until
 * four blocks exist to measure the user's own. Set from the simulated false-cut
 * budget (E4), not from a published figure.
 */
export const RATE_SD_FLOOR_LB_PER_WK = 0.35;
/** Stateless hysteresis: a rate this far inside the band clears an outside run, lb/wk. */
export const RATE_HYSTERESIS_LB_PER_WK = 0.1;

/** Fine tier: a single block at this probability earns a nudge. */
export const FINE_TIER_P = 0.7;
/** Coarse tier: two blocks at this probability earn a real move. */
export const COARSE_TIER_P = 0.8;
export const FINE_STEP_SMALL = 50;
export const FINE_STEP_LARGE = 100;
export const COARSE_STEP = 150;
/** A miss wider than the band itself earns the bigger coarse step. */
export const COARSE_STEP_WIDE = 250;
/** Fat floor: RP's rule expressed both ways — 60 g, or 15% of calories. */
export const FAT_FLOOR_G = 60;
export const FAT_FLOOR_PCT_KCAL = 0.15;
/** Carbohydrate the floor always leaves room for, g. */
export const MIN_CARB_G = 50;

export interface ExpenditureV3Block {
  /** 0-based block index from the first weigh-in. */
  index: number;
  start: ISODate;
  end: ISODate;
  /** Days the energy balance covers — 7, except block 0's 6 (no level before the first weigh-in). */
  spanDays: number;
  weighIns: number;
  loggedDays: number;
  imputedDays: number;
  /** Mean daily intake over the span with unlogged days imputed at the target. */
  meanIntake: number | null;
  meanIntakeVar: number;
  /** Level change over the span, lb. */
  deltaLb: number | null;
  deltaVar: number | null;
  /** Filter-matched glycogen water change over the span, lb (subtracted from Δlevel). */
  glycogenLb: number;
  /** Reverse-calculated TDEE for the block, kcal. */
  tdeeObs: number | null;
  tdeeObsVar: number | null;
  /** Mean daily steps over the block; null when steps were not logged. */
  steps: number | null;
  /** Mean daily session kcal folded into the steps observation. */
  sessionKcal: number;
  tdeeSteps: number | null;
  /** Water-corrected weekly rate, lb/wk (negative = losing). */
  rateLbPerWk: number | null;
  /**
   * Sd of that rate: the larger of the filter's own `√Var(Δ)` and the user's
   * measured week-to-week dispersion (see the second pass in
   * `weeklyExpenditureV3`), never below `RATE_SD_FLOOR_LB_PER_WK`.
   */
  rateSdLbPerWk: number | null;
  /**
   * P(the true rate is outside the band **on the side a coach would act on**)
   * — `max(pAbove, pBelow)` from `pOutsideBand`, not the two-sided sum. The sum
   * is the wrong quantity to gate a decision on: widen the uncertainty enough
   * and it approaches 1 from a rate sitting dead centre, so ignorance would
   * earn a calorie change. The one-sided probability behaves the way evidence
   * should — it rises only when the rate really has moved to one side.
   */
  pOutside: number;
  pBelow: number;
  pAbove: number;
  /** Which side the mass is on, in signed lb/wk: 'above' = gaining more / losing less than the band. */
  miss: 'above' | 'below' | null;
  /** Counts toward `blocksOutside` (p ≥ 0.7 in a consistent direction). */
  outside: boolean;
  /** Breaks a run of outside blocks (inside by ≥ 0.1 lb/wk, or p < 0.5). */
  cleared: boolean;
  /**
   * The previous valid block missed the band on the OTHER side and had not
   * cleared (p ≥ 0.5). Two consecutive weeks that disagree about which way you
   * are off are noise, not a signal, so the fine tier waits — the same
   * hysteresis the coarse tier gets, applied to a single-block decision.
   */
  contradicted: boolean;
  /** Gates passed: the block produced a weight-derived observation. */
  valid: boolean;
  reason: string;
  /** Posterior mean and sd after folding this block in, kcal. */
  tdee: number;
  tdeeSd: number;
}

export interface ExpenditureV3Opts {
  profile: Profile;
  targets: Targets;
  /** §1a's filtered trend. Never recomputed here; without it the v2 EWMA trend stands in. */
  kalman?: KalmanResult;
  /** Overrides `targets.lastKcalChangeAt` (the coarse-tier freeze anchor). */
  lastKcalChangeAt?: ISODate;
  /** Sessions for the steps observation. Without them a trained day falls back to `DEFAULT_SESSION_MIN`. */
  workouts?: Workout[];
  /** Blocks to return, newest last (default 12). The posterior always runs over every block. */
  weeks?: number;
  /** EWMA α for the fallback trend when `kalman` is absent (default `targets.ewmaAlpha`). */
  alpha?: number;
}

export interface ExpenditureV3Result {
  /** Posterior mean expenditure, kcal/day. Equals the prior before any block closes — never null, never NaN. */
  tdee: number;
  /** Half-width of the 90% credible interval, kcal. */
  ci: number;
  lo: number;
  hi: number;
  /** ci ≤ 300 — the estimate is tight enough to move a calorie target on. */
  valid: boolean;
  /** ci > 250 — still settling; say so rather than implying precision. */
  calibrating: boolean;
  /** One line naming the interval, the coverage and the energy-density factor. */
  reason: string;
  /** Completed blocks, oldest first (at most `weeks`). */
  blocks: ExpenditureV3Block[];
  /** The Mifflin prior the posterior started from. */
  prior: TdeePrior;
  /** The Forbes/Hall factor in use — the caption must name it. */
  density: EnergyDensity;
  /** Latest block's coverage, for "5 of 7 days logged". */
  coverage: { logged: number; days: number };
  /** Signed target band in lb/wk (a loss band is negative) — what `pOutside` is measured against. */
  band: [number, number];
  /** The weight ρ, the band and the steps observation were built from, lb. */
  bodyWeightLb: number;
  /** One-sided P(outside band) on the latest completed block — see `ExpenditureV3Block.pOutside`. */
  pOutside: number;
  miss: 'above' | 'below' | null;
  /** Consecutive recent blocks outside the band, counted only after `lastKcalChangeAt`. */
  blocksOutside: number;
  /** `lastKcalChangeAt + 14 d`; null when the target has never changed. */
  frozenUntil: ISODate | null;
  frozen: boolean;
  weighInsThisWeek: number;
  loggedDaysThisWeek: number;
  firstWeighIn: ISODate | null;
  /** Morning the in-progress block closes and the estimate can move. */
  nextUpdate: ISODate | null;
}

/**
 * Signed target band in lb/wk for the phase. A loss band is negative, a gain
 * band positive, and maintenance straddles zero — so "the rate sits above the
 * band" always means *eat less* and "below" always means *eat more*, whichever
 * direction the user is going.
 */
export function signedRateBand(profile: Profile, targets: Targets, bodyWeightLb: number): [number, number] {
  const [lo, hi] = targetLbPerWeek(bodyWeightLb, targets.weeklyRatePct);
  if (profile.goalPhase === 'muscle-gain') return [lo, hi];
  if (profile.goalPhase === 'maintenance') return [-lo, lo];
  return [-hi, -lo];
}

/** Weekly rate as prose: "losing 1.24 lb/wk", "gaining 0.30 lb/wk", "holding". */
function describeRate(lbPerWk: number): string {
  if (Math.abs(lbPerWk) < 0.05) return 'holding steady';
  return `${lbPerWk < 0 ? 'losing' : 'gaining'} ${fmt(Math.abs(lbPerWk), 2)} lb/wk`;
}

function bandText(lo: number, hi: number): string {
  return `${fmt(lo, 2)} to ${fmt(hi, 2)} lb/wk`;
}

/**
 * Expenditure v3: a posterior over TDEE, not a smoothed point estimate.
 *
 * Per 7-day block anchored to the first weigh-in (block 0 covers 6 days — there
 * is no level the day before the first weigh-in):
 *
 *   ΔG          filter-matched glycogen water over the span (`glycogenSeries`)
 *   TDEE_obs    meanIntake − (Δlevel − ΔG)·ρ/span,  Var = ρ²·Var(Δ)/span² + Var(mean)
 *   TDEE_steps  RMR·1.15 + 0.00044·kg·max(steps − 2500, 0) + Σ session kcal,  Var = 250²
 *
 * folded, oldest first, into a 1-D Kalman that starts at the Mifflin prior
 * (sd 450) and drifts 40 kcal between blocks. The weight observation needs
 * ≥ 3 weigh-ins and ≥ 4 logged days; below that the block is predict-only and
 * only widens the interval. The steps observation has no such gate — it does
 * not depend on the scale — so a user who stops weighing in still gets a
 * number, with an interval that says how much to trust it.
 */
export function weeklyExpenditureV3(
  records: DailyRecord[],
  asOf: ISODate,
  opts: ExpenditureV3Opts,
): ExpenditureV3Result {
  const { profile, targets } = opts;
  const alpha = clampAlpha(opts.alpha ?? targets.ewmaAlpha ?? 0.1);
  const nWeeks = Math.max(1, Math.floor(opts.weeks ?? 12));
  const inRange = records.filter((r) => r.d <= asOf);

  const latest = latestWeight(inRange, asOf);
  const bodyWeightLb = latest?.w ?? profile.weightLb;
  const bodyKg = lbToKg(bodyWeightLb);
  const density = energyDensity(profile, bodyWeightLb);
  const prior = priorTdee(profile, inRange, asOf, bodyWeightLb);
  const rho = density.kcalPerLb;

  // Level series: the Kalman when §1a supplied one, else the v2 EWMA trend.
  const kal = opts.kalman;
  const usingKalman = kal !== undefined && kal.byDate.size > 0;
  const ewma = usingKalman ? null : computeEwmaTrend(inRange, alpha, asOf);
  const levelAt = (d: ISODate): { level: number; varLb2: number } | null => {
    if (usingKalman) {
      const p = (kal as KalmanResult).byDate.get(d);
      if (p === undefined || !Number.isFinite(p.level)) return null;
      const sd = Number.isFinite(p.levelSd) ? p.levelSd : Math.sqrt(FALLBACK_LEVEL_VAR);
      return { level: p.level, varLb2: Math.max(1e-6, sd * sd) };
    }
    const v = trendAt(ewma as Map<ISODate, number>, d);
    return v === undefined ? null : { level: v, varLb2: FALLBACK_LEVEL_VAR };
  };

  const glyc = glycogenSeries(inRange, {
    through: asOf,
    ...(usingKalman
      ? { measurementVar: (kal as KalmanResult).measurementSd ** 2 }
      : { alpha }),
  });
  const glycAt = new Map(glyc.map((g) => [g.d, g.levelLb]));
  const glycLevel = (d: ISODate): number => {
    const exact = glycAt.get(d);
    if (exact !== undefined) return exact;
    let best: number | undefined;
    let bestDate: ISODate | undefined;
    for (const g of glyc) if (g.d <= d && (bestDate === undefined || g.d > bestDate)) { bestDate = g.d; best = g.levelLb; }
    return best ?? 0;
  };

  const workoutsByDate = new Map<ISODate, number>();
  for (const w of opts.workouts ?? []) {
    if (w.d > asOf) continue;
    workoutsByDate.set(w.d, (workoutsByDate.get(w.d) ?? 0) + sessionKcal(w, bodyKg));
  }
  const haveWorkouts = (opts.workouts ?? []).length > 0;
  const daySessionKcal = (r: DailyRecord): number => {
    const logged = workoutsByDate.get(r.d);
    if (logged !== undefined) return logged;
    if (haveWorkouts) return 0;
    // No sessions passed in: a day the records flag as trained gets the
    // labelled default session rather than nothing at all.
    const n = typeof r.wko === 'number' && Number.isFinite(r.wko) && r.wko > 0 ? Math.min(3, Math.round(r.wko)) : r.lift === true ? 1 : 0;
    return n === 0 ? 0 : n * metKcal(MET_LIFT.moderate, bodyKg, DEFAULT_SESSION_MIN);
  };

  const anchor = firstWeighInDate(inRange, asOf);
  const [bandLo, bandHi] = signedRateBand(profile, targets, bodyWeightLb);
  const lastChange = opts.lastKcalChangeAt ?? targets.lastKcalChangeAt ?? null;
  const frozenUntil = lastChange === null ? null : addDays(lastChange, KCAL_CHANGE_FREEZE_DAYS);
  const frozen = frozenUntil !== null && asOf < frozenUntil;

  let theta = prior.kcal;
  let varTheta = prior.sd * prior.sd;
  const blocks: ExpenditureV3Block[] = [];

  const finish = (): ExpenditureV3Result => {
    const shown = blocks.slice(Math.max(0, blocks.length - nWeeks));
    const last = blocks.length > 0 ? blocks[blocks.length - 1] : null;
    const ci = TDEE_CI_Z * Math.sqrt(varTheta);
    const valid = ci <= TDEE_VALID_CI;
    const calibrating = ci > TDEE_CALIBRATING_CI;
    const coverage = last === null ? { logged: 0, days: 7 } : { logged: last.loggedDays, days: last.spanDays };

    // Consecutive outside blocks, in one direction, since the last target change.
    let blocksOutside = 0;
    let dir: 'above' | 'below' | null = null;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (lastChange !== null && b.start <= lastChange) break;
      if (b.cleared) break;
      // 0.5 ≤ p < 0.7 is the hysteresis gap, and a predict-only week is simply
      // silent: neither extends the run nor resets the evidence behind it.
      if (!b.outside) continue;
      if (dir === null) dir = b.miss;
      else if (b.miss !== dir) break;
      blocksOutside++;
    }

    const current = anchor === null ? { weighIns: 0, intakeDays: 0 } : progressCounts(inRange, addDays(anchor, 7 * Math.floor(Math.max(0, diffDays(anchor, asOf)) / 7)), asOf);
    let reason: string;
    if (blocks.length === 0) {
      reason = `Starting from your Mifflin estimate, ${prior.label}. Weigh in ${MIN_BLOCK_WEIGH_INS}+ days and log ${MIN_BLOCK_LOG_DAYS}+ days this week and the first measured block lands next week.`;
    } else {
      const cov = `${coverage.logged} of ${coverage.days} days logged`;
      const settle = calibrating ? 'Still calibrating — ' : '';
      reason = `${settle}${fmt(round(theta))} kcal ± ${fmt(round(ci))} (90%) from ${blocks.length} block${blocks.length === 1 ? '' : 's'}, ${cov} in the last one, using ${density.label}.`;
    }

    return {
      tdee: round(theta),
      ci: round(ci),
      lo: round(theta - ci),
      hi: round(theta + ci),
      valid,
      calibrating,
      reason,
      blocks: shown,
      prior,
      density,
      coverage,
      band: [bandLo, bandHi],
      bodyWeightLb: round(bodyWeightLb, 2),
      pOutside: last?.pOutside ?? 0,
      miss: last?.miss ?? null,
      blocksOutside,
      frozenUntil,
      frozen,
      weighInsThisWeek: current.weighIns,
      loggedDaysThisWeek: current.intakeDays,
      firstWeighIn: anchor,
      nextUpdate:
        anchor === null ? null : addDays(anchor, 7 * (Math.floor(Math.max(0, diffDays(anchor, asOf)) / 7) + 1)),
    };
  };

  if (anchor === null) return finish();

  const j = Math.floor(Math.max(0, diffDays(anchor, asOf)) / 7);
  for (let k = 0; k < j; k++) {
    const start = addDays(anchor, 7 * k);
    const end = addDays(start, 6);
    // The energy balance runs from the level the day BEFORE the block to the
    // level on its last day; block 0 has no such day, so it covers 6.
    const from = k === 0 ? start : addDays(start, -1);
    const spanDays = diffDays(from, end);
    const intakeFrom = addDays(from, 1);

    let logged = 0;
    let sumIntake = 0;
    let weighIns = 0;
    let stepDays = 0;
    let sumSteps = 0;
    let sumSession = 0;
    for (const r of inRange) {
      if (r.d < intakeFrom || r.d > end) continue;
      const kc = intakeOf(r);
      if (kc !== null) { logged++; sumIntake += kc; }
      if (isWeight(r.w)) weighIns++;
      if (typeof r.st === 'number' && Number.isFinite(r.st) && r.st >= 0) { stepDays++; sumSteps += r.st; }
      sumSession += daySessionKcal(r);
    }
    const imputed = Math.max(0, spanDays - logged);
    const meanIntake = (sumIntake + imputed * Math.max(0, targets.kcal)) / spanDays;
    const meanIntakeVar = (logged * INTAKE_LOG_SD ** 2 + imputed * INTAKE_IMPUTED_SD ** 2) / spanDays ** 2;

    const a = levelAt(from);
    const b = levelAt(end);
    const deltaLb = a === null || b === null ? null : b.level - a.level;
    const deltaVar = a === null || b === null ? null : a.varLb2 + b.varLb2;
    const glycogenLb = glycLevel(end) - glycLevel(from);
    const corrected = deltaLb === null ? null : deltaLb - glycogenLb;

    const gatesOk = weighIns >= MIN_BLOCK_WEIGH_INS && logged >= MIN_BLOCK_LOG_DAYS;
    const valid = gatesOk && corrected !== null && deltaVar !== null;
    const tdeeObs = corrected === null ? null : meanIntake - (corrected * rho) / spanDays;
    const tdeeObsVar =
      deltaVar === null ? null : (rho ** 2 * deltaVar) / spanDays ** 2 + meanIntakeVar;

    const meanSteps = stepDays === 0 ? null : sumSteps / stepDays;
    const meanSession = sumSession / spanDays;
    const tdeeSteps =
      meanSteps === null
        ? null
        : prior.rmr * NEAT_MULTIPLIER +
          STEP_KCAL_PER_KG_PER_STEP * bodyKg * Math.max(0, meanSteps - STEP_FLOOR) +
          meanSession;

    // Posterior: drift, then fold whichever observations this block produced.
    varTheta += TDEE_DRIFT_SD ** 2;
    if (valid && tdeeObs !== null && tdeeObsVar !== null && tdeeObsVar > 0) {
      const gain = varTheta / (varTheta + tdeeObsVar);
      theta += gain * (tdeeObs - theta);
      varTheta *= 1 - gain;
    }
    if (tdeeSteps !== null && stepDays >= 3) {
      const gain = varTheta / (varTheta + STEPS_OBS_SD ** 2);
      theta += gain * (tdeeSteps - theta);
      varTheta *= 1 - gain;
    }

    const rateLbPerWk = corrected === null ? null : (corrected * 7) / spanDays;
    const filterSd = deltaVar === null ? null : (Math.sqrt(deltaVar) * 7) / spanDays;

    let reason: string;
    if (!gatesOk) {
      reason =
        weighIns < MIN_BLOCK_WEIGH_INS
          ? `Only ${weighIns} of ${MIN_BLOCK_WEIGH_INS} weigh-ins — predict-only, the interval widened instead.`
          : `Only ${logged} of ${MIN_BLOCK_LOG_DAYS} logged days — predict-only, the interval widened instead.`;
    } else if (corrected === null) {
      reason = 'No trend level for this block — predict-only.';
    } else {
      reason = `${logged} of ${spanDays} days logged, ${weighIns} weigh-ins; ${describeRate(rateLbPerWk as number)}${
        Math.abs(glycogenLb) >= 0.1 ? ` after removing ${fmt(Math.abs(glycogenLb), 1)} lb of glycogen water` : ''
      }, using ${density.label}.`;
    }

    blocks.push({
      index: k,
      start,
      end,
      spanDays,
      weighIns,
      loggedDays: logged,
      imputedDays: imputed,
      meanIntake: round(meanIntake),
      meanIntakeVar: round(meanIntakeVar, 2),
      deltaLb: deltaLb === null ? null : round(deltaLb, 3),
      deltaVar: deltaVar === null ? null : round(deltaVar, 4),
      glycogenLb: round(glycogenLb, 3),
      tdeeObs: tdeeObs === null ? null : round(tdeeObs),
      tdeeObsVar: tdeeObsVar === null ? null : round(tdeeObsVar),
      steps: meanSteps === null ? null : round(meanSteps),
      sessionKcal: round(meanSession),
      tdeeSteps: tdeeSteps === null ? null : round(tdeeSteps),
      rateLbPerWk: rateLbPerWk === null ? null : round(rateLbPerWk, 3),
      rateSdLbPerWk: filterSd === null ? null : round(filterSd, 3),
      pOutside: 0,
      pBelow: 0,
      pAbove: 0,
      miss: null,
      outside: false,
      cleared: false,
      contradicted: false,
      valid,
      reason,
      tdee: round(theta),
      tdeeSd: round(Math.sqrt(varTheta)),
    });
  }

  // Second pass: how confident may we be that a block's rate is really outside
  // the band? The filter's own level variance answers "how well do we know the
  // level", not "how much does a week's rate bounce around" — water, sodium and
  // gut fill move a 7-day rate far more than the filter's uncertainty admits,
  // and a probability built on the filter alone reads 0.95 on pure noise. So
  // the rate's sd is the LARGER of the filter's uncertainty and the user's own
  // measured week-to-week dispersion (robust sd of successive block-rate
  // differences ÷ √2, which is blind to a slow real trend), never below
  // `RATE_SD_FLOOR_LB_PER_WK`.
  const rates = blocks.filter((b) => b.valid && b.rateLbPerWk !== null).map((b) => b.rateLbPerWk as number);
  const diffs: number[] = [];
  for (let i = 1; i < rates.length; i++) diffs.push(rates[i] - rates[i - 1]);
  const measured = diffs.length >= 3 ? robustSd(diffs) : null;
  const weekToWeekSd = Math.max(
    RATE_SD_FLOOR_LB_PER_WK,
    measured === null || !Number.isFinite(measured) ? 0 : measured / Math.SQRT2,
  );
  for (const b of blocks) {
    if (!b.valid || b.rateLbPerWk === null) continue;
    const sd = Math.max(b.rateSdLbPerWk ?? 0, weekToWeekSd);
    const prob = pOutsideBand({ lbPerWk: b.rateLbPerWk, sdLbPerWk: sd }, bandLo, bandHi);
    const directional = Math.max(prob.pAbove, prob.pBelow);
    const insideBy = Math.min(b.rateLbPerWk - bandLo, bandHi - b.rateLbPerWk);
    b.rateSdLbPerWk = round(sd, 3);
    b.pOutside = round(directional, 4);
    b.pBelow = round(prob.pBelow, 4);
    b.pAbove = round(prob.pAbove, 4);
    b.miss = prob.direction === null ? null : prob.pAbove >= prob.pBelow ? 'above' : 'below';
    b.outside = directional >= FINE_TIER_P;
    b.cleared = directional < 0.5 || insideBy >= RATE_HYSTERESIS_LB_PER_WK;
  }
  const scored = blocks.filter((b) => b.valid && b.rateLbPerWk !== null);
  for (let i = 1; i < scored.length; i++) {
    const prev = scored[i - 1];
    scored[i].contradicted = prev.miss !== null && prev.miss !== scored[i].miss && prev.pOutside >= 0.5;
  }

  return finish();
}

// --- two-tier intake coaching ----------------------------------------------

export interface IntakeRecommendationV3 {
  kcal: number;
  delta: number;
  /** 'fine' = a ±50–100 nudge from one block; 'coarse' = a ≥ 150 move; 'hold' = no change. */
  tier: 'fine' | 'coarse' | 'hold';
  reason: string;
  /** The floor this target may never go under, kcal. */
  minimumKcal: number;
  /** The fat floor at the recommended intake, g. */
  fatFloorG: number;
  changed: boolean;
}

export interface RecommendIntakeV3Input {
  result: ExpenditureV3Result;
  targets: Targets;
  /** Current daily target; defaults to `targets.kcal`. */
  currentKcal?: number;
  /** Defaults to the profile weight the result was built with. */
  bodyWeightLb?: number;
}

/**
 * The fat floor at a given intake: `max(60 g, 0.15 × kcal / 9)` — RP publishes
 * the rule both ways and the binding one wins.
 */
export function fatFloorGrams(kcal: number, targets?: Targets): number {
  const absolute = Math.max(FAT_FLOOR_G, targets?.fatFloor ?? 0);
  return round(Math.max(absolute, (FAT_FLOOR_PCT_KCAL * Math.max(0, kcal)) / 9), 1);
}

/**
 * Lowest defensible intake: protein (never cut) + the fat floor + 50 g of
 * carbohydrate. The percentage form of the fat floor makes this self-
 * referential, so it is solved rather than iterated: with fat at 15% of
 * calories, `K ≥ (4·protein + 4·50)/0.85`; with the absolute 60 g floor,
 * `K ≥ 4·protein + 200 + 9·60`. The floor is the larger.
 */
export function minimumIntakeKcalV3(targets: Targets): number {
  const protein = Math.max(0, targets.protein);
  const base = protein * 4 + MIN_CARB_G * 4;
  const absolute = Math.max(FAT_FLOOR_G, targets.fatFloor);
  return round(Math.max(base / (1 - FAT_FLOOR_PCT_KCAL), base + absolute * 9));
}

/**
 * Two-tier calorie coaching (audit: v2 was less responsive than every shipping
 * app, which update weekly).
 *
 * - **Fine tier** — one completed block with `P(outside band) ≥ 0.7`: ±50 kcal,
 *   or ±100 when the miss is wider than the band or `p ≥ 0.9`. Not frozen after
 *   a target change: a 50-kcal nudge cannot chase its own tail.
 * - **Coarse tier** — `≥ 150 kcal` still requires `!frozen && valid &&
 *   blocksOutside ≥ 2` at `p ≥ 0.8`, and re-arms the 14-day freeze.
 *
 * The signed band makes the direction phase-agnostic: above the band → eat
 * less, below → eat more, whether the user is cutting, holding or gaining.
 * Protein is never cut and the result never lands below `minimumIntakeKcalV3`.
 * Every reason quotes P(outside), the coverage and the energy-density factor
 * so the user can audit the advice.
 */
export function recommendIntakeV3(input: RecommendIntakeV3Input): IntakeRecommendationV3 {
  const { result, targets } = input;
  const currentKcal = input.currentKcal ?? targets.kcal;
  const minimumKcal = minimumIntakeKcalV3(targets);
  const last = result.blocks.length > 0 ? result.blocks[result.blocks.length - 1] : null;
  const evidence = `${result.coverage.logged} of ${result.coverage.days} days logged, using ${result.density.label}`;

  const finish = (candidate: number, tier: IntakeRecommendationV3['tier'], why: (kcal: number, delta: number) => string): IntakeRecommendationV3 => {
    const wanted = round(candidate);
    const kcal = Math.max(wanted, minimumKcal);
    const delta = kcal - currentKcal;
    let reason = why(kcal, delta);
    if (kcal !== wanted) {
      reason += ` Held at ${fmt(minimumKcal)} kcal — the floor that fits ${fmt(targets.protein)} g protein, ${fmt(fatFloorGrams(kcal, targets), 0)} g fat and ${fmt(MIN_CARB_G)} g carbs.`;
    }
    return {
      kcal,
      delta,
      tier: delta === 0 ? 'hold' : tier,
      reason,
      minimumKcal,
      fatFloorG: fatFloorGrams(kcal, targets),
      changed: delta !== 0,
    };
  };

  if (last === null || !last.valid || last.rateLbPerWk === null) {
    return finish(currentKcal, 'hold', () => `Holding at ${fmt(currentKcal)} kcal — ${last === null ? 'no completed block yet' : last.reason} ${evidence}.`);
  }

  const p = last.pOutside;
  const pct = `${fmt(p * 100)}%`;
  const rate = describeRate(last.rateLbPerWk);
  const [lo, hi] = result.band;
  const band = bandText(lo, hi);

  if (p < FINE_TIER_P) {
    return finish(
      currentKcal,
      'hold',
      () =>
        `Trend is ${rate} — only a ${pct} chance the true rate is outside your ${band} band, so hold at ${fmt(currentKcal)} kcal (${evidence}).`,
    );
  }

  if (last.contradicted && result.blocksOutside < 2) {
    return finish(
      currentKcal,
      'hold',
      () =>
        `Trend is ${rate} — a ${pct} chance of being outside your ${band} band, but last week missed the other way, so this is water rather than a signal. Holding at ${fmt(currentKcal)} kcal (${evidence}).`,
    );
  }

  const direction = last.miss === 'above' ? -1 : 1; // above the band → eat less
  // A miss wider than the band itself (or an all-but-certain one) earns the
  // bigger coarse step — the small one demonstrably will not close it.
  const edge = last.miss === 'above' ? hi : lo;
  const missBy = Math.abs(last.rateLbPerWk - edge);
  const wideMiss = p >= 0.95 || missBy > Math.max(hi - lo, 0.25);

  const coarseReady = !result.frozen && result.valid && result.blocksOutside >= 2 && p >= COARSE_TIER_P;
  if (coarseReady) {
    const step = wideMiss ? COARSE_STEP_WIDE : COARSE_STEP;
    return finish(currentKcal + direction * step, 'coarse', (kcal, delta) =>
      delta === 0
        ? `Trend is ${rate} with a ${pct} chance of being outside your ${band} band for ${result.blocksOutside} blocks running, but you are already at your floor (${evidence}).`
        : `Trend is ${rate} — ${pct} chance the true rate is outside your ${band} band, ${result.blocksOutside} blocks running, and your expenditure estimate is ${fmt(result.tdee)} ± ${fmt(result.ci)} kcal. ${delta < 0 ? 'Cut' : 'Add'} ${fmt(Math.abs(delta))} kcal to ${fmt(kcal)} kcal (${evidence}).`,
    );
  }

  // The fine tier is deliberately NOT frozen: a 50–100 kcal nudge cannot chase
  // its own tail, and holding one back for a fortnight is what made v2 less
  // responsive than every shipping app. The freeze only holds the coarse move,
  // and the reason says so rather than staying silent about it.
  const held = result.frozen
    ? ` A bigger move is frozen until ${result.frozenUntil as string} because your target changed recently.`
    : '';
  const step = p >= 0.9 ? FINE_STEP_LARGE : FINE_STEP_SMALL;
  return finish(currentKcal + direction * step, 'fine', (kcal, delta) =>
    delta === 0
      ? `Trend is ${rate} (${pct} outside your ${band} band) but you are already at your floor (${evidence}).`
      : `Trend is ${rate} — ${pct} chance the true rate is outside your ${band} band after one block. ${delta < 0 ? 'Trim' : 'Add'} ${fmt(Math.abs(delta))} kcal to ${fmt(kcal)} kcal as a nudge; a bigger move waits for a second block (${evidence}).${held}`,
  );
}
