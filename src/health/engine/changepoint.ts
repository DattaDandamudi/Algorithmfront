/**
 * §1i Regime shifts — Bayesian online changepoint detection (Adams & MacKay
 * 2007).
 *
 * No consumer product ships this, and it is the cheapest route to being
 * genuinely ahead rather than merely transparent. Its purpose is
 * decision-relevant, not decorative: it tells a **dip** from a **new
 * baseline**. When someone's resting HR settles 4 bpm higher for good, a
 * 60-day rolling reference spends six weeks averaging across the step and
 * calls every day "elevated"; a confirmed changepoint truncates the reference
 * instead.
 *
 * ## The model
 *
 * Run-length posterior with a constant hazard `H = 1/60` (an expected regime
 * of two months), a Normal-Inverse-Gamma prior on (μ, σ²) and the Student-t
 * predictive that conjugacy gives:
 *
 *   P(r_t | x_{1:t}) ∝ Σ_{r_{t−1}} P(x_t | r_{t−1}) · P(r_t | r_{t−1}) · P(r_{t−1})
 *
 * with growth `(1 − H)` and changepoint `H` branches, renormalised every step
 * (Phase 3 checks the normalisation explicitly). Sufficient statistics are
 * updated per run length, so the pass is O(days²) in the worst case and is
 * pruned below a mass threshold.
 *
 * ## Reporting rule — deliberately conservative
 *
 * A shift is reported only when **all three** hold:
 * 1. run-length posterior mass on a "recent restart" exceeds `minProb` (0.5)
 * 2. …on **3 consecutive days** (`minRunDays`)
 * 3. the pre/post means differ by more than `minShiftSd` (0.5) robust SD
 *
 * Sim (1i): < 1 false shift per 200 stationary days, and a real shift detected
 * within 5 days in ≥ 90% of seeds.
 *
 * ## Consumers
 *
 * Run over ln rMSSD, RHR, the Kalman weight level and OSI. `hrv.ts` accepts an
 * optional `referenceStart`, so a confirmed shift truncates its 60-day
 * reference — **that is the one cross-module dependency in Phase 1, and it is
 * a parameter, not an import**, so 1c and 1i stay independently ownable.
 * Insight template #26 renders the newest confirmed shift.
 *
 * Pure and clock-free: the series carries its own dates.
 */
import type { Changepoint } from '../data/types';
import type { SeriesPoint } from './baseline';

/** Constant hazard: an expected regime length of 60 days. */
export const BOCPD_HAZARD = 1 / 60;
/** Run-length mass on a recent restart needed to count a day as a candidate. */
export const BOCPD_MIN_PROB = 0.5;
/** Consecutive candidate days before a shift is confirmed. */
export const BOCPD_MIN_RUN_DAYS = 3;
/** Minimum pre/post separation, in robust SDs of the pre-shift segment. */
export const BOCPD_MIN_SHIFT_SD = 0.5;

/** Normal-Inverse-Gamma prior on (μ, σ²) — weak by default. */
export interface NigPrior {
  /** Prior mean. Defaults to the series median. */
  mu0?: number;
  /** Prior strength on the mean, in pseudo-observations. */
  kappa0?: number;
  /** Shape. */
  alpha0?: number;
  /** Scale. Defaults from the series' robust SD. */
  beta0?: number;
}

export interface ChangepointOpts {
  /** Metric id carried into the result, e.g. 'rhr'. */
  metric?: string;
  /** Human label, e.g. 'resting heart rate'. */
  label?: string;
  hazard?: number;
  minProb?: number;
  minRunDays?: number;
  minShiftSd?: number;
  prior?: NigPrior;
  /** Days either side used for the reported pre/post means; default 14. */
  meanWindow?: number;
}

/** Keeps stub parameters live for `noUnusedParameters`; delete with the TODOs. */
function pending(...args: unknown[]): void {
  void args;
}

/**
 * Confirmed regime shifts in `series`, oldest first. Takes the same
 * `SeriesPoint { d, v }` shape `baseline.metricSeries` produces — including
 * its nulls, which are skipped rather than imputed (an unlogged day is not
 * evidence of stability).
 *
 * Returns `[]` for a short or empty series: below ~20 observations the
 * run-length posterior is dominated by the prior and any "shift" it reports
 * would be an artefact of the hazard rate.
 */
export function detectChangepoints(
  series: SeriesPoint[],
  opts?: ChangepointOpts,
): Changepoint[] {
  // TODO(phase-1i): implement per plan §1i.
  pending(series, opts);
  return [];
}
