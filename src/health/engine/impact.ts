/**
 * §1i N-of-1 behaviour impact — "on the 9 days you drank, next-day recovery
 * averaged 11 points lower (95% CI 4–18)".
 *
 * WHOOP's Journal is the closest shipping thing, and it reports a point
 * estimate with no interval, no multiplicity control and no shrinkage. This
 * module keeps WHOOP's gate and adds the three things that stop an N-of-1
 * engine inventing effects — which is the whole risk here, because a coach
 * that invents effects is worse than one that says nothing.
 *
 * ## Design
 *
 * - **Behaviours** (`BEHAVIOURS`): alcohol, tobacco, late caffeine, late
 *   eating, high load, short sleep, late bedtime. Each is a per-day yes/no
 *   derived from the record, thresholded against the user's own distribution
 *   where "high"/"short"/"late" is relative.
 * - **Outcomes** (`IMPACT_METRICS`): **next-day** readiness, HRV, RHR, sleep
 *   hours and OSI. The lag is deliberate: the behaviour happens today, the
 *   physiology answers tomorrow morning.
 * - **Gate**: ≥ 5 "yes" **and** ≥ 5 "no" days within 90 days — WHOOP's own bar,
 *   and we keep it. Behaviours that exist but miss the gate go to
 *   `ImpactContext.pending` so the UI can say "keep logging" instead of
 *   silently dropping them.
 * - **Estimate**: difference in means with a **Welch** standard error
 *   (unequal variances, unequal n — the usual case here), then **shrunk toward
 *   a published population prior**: `w = σ²_prior/(σ²_prior + se²)`, reported
 *   estimate `= w·observed + (1 − w)·prior`, with `shrunkToPrior = 1 − w`
 *   carried into the UI so an estimate pulled more than halfway to the prior
 *   says so. `w` is bounded to [0, 1] (a Phase 3 review dimension).
 * - **Multiplicity**: Benjamini–Hochberg across the **whole behaviour × metric
 *   grid**, never per behaviour, with the q-value carried into the UI.
 * - **Confounds**: when the "yes" days differ systematically in training load,
 *   the effect names the confound rather than hiding it.
 *
 * ## Priors
 *
 * Alcohol: HRV −7 ms and RHR +3 bpm (PLOS Digital Health, 20,968 users /
 * 5.1 M person-days; ≈ +1.3 bpm per drink). WHOOP's published journal figures
 * are a secondary prior. **Caffeine is modelled as acting through sleep**, not
 * directly on HRV, because that is what the evidence supports.
 *
 * ## Copy
 *
 * Association, never causation. The sim that guards this is the headline one:
 * a null behaviour must survive BH correction as "confirmed" in < 5% of 200
 * runs, and a true −10-point alcohol effect with 12 yes-days must be recovered
 * within ±4 points in ≥ 85% of seeds.
 *
 * Pure and clock-free: `asOf` is a parameter.
 */
import type { DailyRecord, ImpactContext, ISODate, Profile, Workout } from '../data/types';

/** Lookback for both the yes- and no-day counts, days. */
export const IMPACT_WINDOW_DAYS = 90;
/** WHOOP's gate, kept: at least this many days on each side. */
export const MIN_YES_DAYS = 5;
export const MIN_NO_DAYS = 5;

export type BehaviourKey =
  | 'alcohol'
  | 'tobacco'
  | 'lateCaffeine'
  | 'lateEating'
  | 'highLoad'
  | 'shortSleep'
  | 'lateBedtime';

export type ImpactMetricKey = 'readiness' | 'hrv' | 'rhr' | 'sleepHrs' | 'osi';

export const BEHAVIOURS: readonly BehaviourKey[] = [
  'alcohol',
  'tobacco',
  'lateCaffeine',
  'lateEating',
  'highLoad',
  'shortSleep',
  'lateBedtime',
];

export const IMPACT_METRICS: readonly ImpactMetricKey[] = [
  'readiness',
  'hrv',
  'rhr',
  'sleepHrs',
  'osi',
];

export interface BehaviourPrior {
  /** Published population effect on the metric, in the metric's own unit. */
  deltaMean: number;
  /** Prior sd — the shrinkage weight is `σ²/(σ² + se²)`. */
  sd: number;
  /** Citation, repeated in the caption when shrinkage dominates. */
  source: string;
}

/**
 * Population priors, keyed `behaviour:metric`. Sparse on purpose: a pair with
 * no published prior is not shrunk (`shrunkToPrior: 0`) and leans entirely on
 * the user's own days, which is the honest default.
 */
export const BEHAVIOUR_PRIORS: Partial<Record<string, BehaviourPrior>> = {
  'alcohol:hrv': {
    deltaMean: -7,
    sd: 4,
    source: 'PLOS Digital Health 2024, 20,968 users / 5.1 M person-days',
  },
  'alcohol:rhr': {
    deltaMean: 3,
    sd: 2,
    source: 'PLOS Digital Health 2024 (≈ +1.3 bpm per drink)',
  },
};

export interface ImpactOpts {
  profile?: Profile;
  /** Lookback; default `IMPACT_WINDOW_DAYS`. */
  windowDays?: number;
  /** Gate overrides — lowering these is a Phase 3 review finding, not a knob. */
  minYes?: number;
  minNo?: number;
  /** Daily readiness 0–100, since it is derived rather than stored. */
  readinessScores?: ReadonlyArray<{ d: ISODate; score: number | null }>;
  /** Daily training load, for the `highLoad` behaviour and the confound check. */
  loads?: ReadonlyArray<{ d: ISODate; load: number }>;
}

/** Keeps stub parameters live for `noUnusedParameters`; delete with the TODOs. */
function pending(...args: unknown[]): void {
  void args;
}

/**
 * Every behaviour × metric pair that clears the gate, shrunk, BH-corrected and
 * sorted by strength. `pending` lists the behaviours that exist in the log but
 * lack the 5/5 days to be reported. `context.ts` caps the list at the five
 * strongest survivors.
 */
export function behaviourImpact(
  records: DailyRecord[],
  workouts: Workout[],
  asOf: ISODate,
  opts?: ImpactOpts,
): ImpactContext {
  // TODO(phase-1i): implement per plan §1i.
  pending(records, workouts, asOf, opts);
  return { effects: [], pending: [] };
}
