/**
 * §1e Training load — session load, Banister fitness/fatigue/form, ACWR,
 * VO₂max and per-muscle recovery.
 *
 * Every number here is descriptive of *work done*; the decisions that follow
 * from it live in `strength.ts` (progression) and `readiness.ts` (modifiers).
 * Pure and clock-free — `asOf` is always a parameter.
 *
 * ## Session load (`sessionLoad`)
 *
 * - **strength** — Foster session-RPE: `sRPE × minutes`. The sRPE fallback
 *   chain is logged sRPE → mean working-set RPE → `10 − RIR` → 7. Volume load
 *   `Σ w·r` is kept alongside as a cross-check, never as the load itself
 *   (it scales with body size and exercise selection, not with effort).
 * - **cardio** — Edwards `Σ zoneMin_i · i` when zone minutes exist, else
 *   Banister TRIMP `dur · HRr · 0.64·e^{1.92·HRr}` (male) /
 *   `0.86·e^{1.67·HRr}` (female) with `HRr = (HR − HRrest)/(HRmax − HRrest)`,
 *   `HRmax = 208 − 0.7·age` (Tanaka) unless `profile.maxHrMeasured` is set and
 *   `HRrest` = the 28-day median RHR, else 60. Failing both, `dur × RPE`
 *   (default RPE 6).
 * - **mobility / sport** — `dur × RPE × 0.6`.
 *
 * ## WHOOP strain → load (`whoopStrainToLoad`, `fitWhoopScale`)
 *
 * WHOOP publishes only "logarithmic 0–21", so both constants in
 * `a·(2^(strain/b) − 1)` are **fitted to the user's own days**, not assumed:
 * least squares over days carrying both a strain and a logged sRPE/TRIMP load
 * (n ≥ 8). Until then `a = 25, b = 3.5` as a **prior**, and the caption says
 * the conversion is an estimate. This is a labelled heuristic, per the
 * evidence-hygiene rule.
 *
 * ## Banister (`banisterSeries`, `fitBanisterTau`)
 *
 *   fitness += (L − fitness)·(1 − e^{−1/τ₁})     τ₁ prior 42 d
 *   fatigue += (L − fatigue)·(1 − e^{−1/τ₂})     τ₂ prior 7 d
 *   form = fitness − fatigue
 *
 * Bands: fresh > +5%, neutral, productive −10…−30%, overreached < −30% (of
 * fitness). Clarke & Skiba 2013: the five Banister parameters are
 * athlete-specific and 42/7 are placeholders — so τ₁/τ₂ are **fitted per user**
 * once ≥ 12 weeks of load exist (grid search over τ₁ ∈ [30, 60], τ₂ ∈ [4, 12]
 * minimising one-step prediction error of sRPE on form), and `tauIsPrior`
 * tells the UI which of the two it is looking at.
 *
 * ## ACWR is descriptive only
 *
 * Impellizzeri 2020 documents the ratio's statistical pathologies and finds no
 * causal identification — "manipulating ACWR to change injury rates remains a
 * conjecture". It is still computed (EWMA λ = 2/8 over λ = 2/29, Williams 2017)
 * and still charted with its 0.8–1.3 / 1.3–1.5 / > 1.5 shading, but it carries
 * a "descriptive, not a causal injury predictor" note and **never gates advice
 * on its own**: decisions lead on absolute `acute7` and `weekOverWeekPct`
 * (soft cap +10%/wk). Foster monotony and strain are computed and shown,
 * **never alerted on** (duration-dominated, mixed evidence).
 *
 * ## VO₂max (`estimateVo2max`)
 *
 * Per-user least-squares regression of pace on HR fraction across steady runs
 * (≥ 8 sessions with distance, duration and avg HR at 70–90% HRmax, dropping
 * pace/HR pairs > 3 robust SD off), extrapolated to HRmax, then cross-checked
 * against Uth–Sørensen `15 × HRmax/HRrest` (14.5 male / 15.3 female) and
 * published as the mean of the two with a **±3.5 ml/kg/min** band.
 * **Suppressed entirely** when HRmax is age-estimated *and* fewer than 8 runs
 * exist — the number never appears without support. Written to `vo2` on the
 * day it is computed so it charts like any other metric.
 *
 * ## Per-muscle recovery (`muscleFatigueSeries`, `muscleReadiness`)
 *
 * Each working set adds `sets × RIR-weighted intensity` to its primary muscle
 * (0.5 to each secondary), decaying with a **60 h half-life**. Fitbod ships a
 * per-muscle readiness whose formula is unpublished; this one is **ours**,
 * derived from the 24–48 h muscle-protein-synthesis window and labelled a
 * heuristic in code and in the caption.
 */
import type {
  AcwrBand,
  DailyRecord,
  Exercise,
  FormBand,
  ISODate,
  Muscle,
  Profile,
  TrainingContext,
  Workout,
} from '../data/types';
import { MUSCLES } from './exerciseDb';

/** Banister time constants used until ≥ 12 weeks of load allow a personal fit. */
export const TAU_PRIOR: { tau1: number; tau2: number } = { tau1: 42, tau2: 7 };
/** WHOOP strain→load prior: `25·(2^(strain/3.5) − 1)`. A labelled heuristic. */
export const WHOOP_SCALE_PRIOR: { a: number; b: number } = { a: 25, b: 3.5 };
/** Muscle-fatigue decay half-life, hours (the 48–72 h MPS window). Heuristic. */
export const MUSCLE_HALF_LIFE_H = 60;
/** Week-on-week acute-load guidance line, % (soft, never a block). */
export const WEEKLY_LOAD_SOFT_CAP_PCT = 10;

// ---------------------------------------------------------------------------
// Session load
// ---------------------------------------------------------------------------

export interface SessionLoadOpts {
  profile: Pick<Profile, 'age' | 'sex' | 'maxHrMeasured'>;
  /** 28-day median RHR, bpm; falls back to 60 when absent. */
  restHr?: number | null;
}

export interface SessionLoad {
  /** Load units. Comparable across kinds by construction, not by unit. */
  load: number;
  /** Which branch produced it — surfaced in the session detail sheet. */
  method: 'srpe' | 'edwards' | 'trimp' | 'duration' | 'none';
  /** Σ w·r in kg·reps for strength sessions; a cross-check, never the load. */
  volumeKg: number | null;
  /** The sRPE actually used (logged or derived). */
  srpe: number | null;
}

/** Keeps stub parameters live for `noUnusedParameters`; delete with the TODOs. */
function pending(...args: unknown[]): void {
  void args;
}

/** Load for one workout. Never throws on a partial or imported session. */
export function sessionLoad(w: Workout, opts: SessionLoadOpts): SessionLoad {
  // TODO(phase-1e): implement per plan §1e.
  pending(w, opts);
  return { load: 0, method: 'none', volumeKg: null, srpe: null };
}

// ---------------------------------------------------------------------------
// WHOOP strain conversion
// ---------------------------------------------------------------------------

export interface WhoopScaleFit {
  a: number;
  b: number;
  /** Days that carried both a strain and a logged load. */
  n: number;
  /** False while `a`/`b` are the 25/3.5 prior rather than a personal fit. */
  fitted: boolean;
  /** Fit residual in load units; null when unfitted. */
  rmse: number | null;
}

/**
 * `a·(2^(strain/b) − 1)` with the user's fit when one exists, else the prior.
 * `null` for a non-finite or out-of-range strain (WHOOP's scale is 0–21).
 */
export function whoopStrainToLoad(strain: number, fit?: WhoopScaleFit | null): number | null {
  // TODO(phase-1e): implement per plan §1e.
  pending(strain, fit);
  return null;
}

/**
 * Two-parameter least-squares fit of `a`/`b` over days carrying both a WHOOP
 * day strain (`record.strn`) and a load computed from logged workouts.
 * Requires n ≥ 8; returns the prior with `fitted: false` below that.
 */
export function fitWhoopScale(
  records: DailyRecord[],
  workouts: Workout[],
  opts: SessionLoadOpts,
): WhoopScaleFit {
  // TODO(phase-1e): implement per plan §1e.
  pending(records, workouts, opts);
  return { ...WHOOP_SCALE_PRIOR, n: 0, fitted: false, rmse: null };
}

// ---------------------------------------------------------------------------
// Daily load series
// ---------------------------------------------------------------------------

export interface LoadPoint {
  d: ISODate;
  /** Total load for the day (0 on a rest day, never null). */
  load: number;
  /** Where it came from — `mixed` when a WHOOP strain topped up logged work. */
  source: 'logged' | 'whoop' | 'none';
  /** Sessions logged that day. */
  workouts: number;
}

/**
 * One entry per calendar day up to `asOf`, ascending, zero-filled on rest days
 * (the EWMAs below need an unbroken series). Logged workouts win; a WHOOP day
 * strain fills days with no logged session.
 */
export function dailyLoadSeries(
  records: DailyRecord[],
  workouts: Workout[],
  asOf: ISODate,
  opts: SessionLoadOpts & { whoopFit?: WhoopScaleFit | null; days?: number },
): LoadPoint[] {
  // TODO(phase-1e): implement per plan §1e.
  pending(records, workouts, asOf, opts);
  return [];
}

export interface BanisterTauFit {
  tau1: number;
  tau2: number;
  /** False while these are the 42/7 priors — the UI must say so. */
  fitted: boolean;
  /** Days of load the fit saw. */
  n: number;
}

/**
 * Grid-search τ₁ ∈ [30, 60], τ₂ ∈ [4, 12] minimising one-step prediction error
 * of session RPE on form. Needs ≥ 12 weeks (84 days) of load; returns the
 * priors with `fitted: false` below that.
 */
export function fitBanisterTau(series: LoadPoint[]): BanisterTauFit {
  // TODO(phase-1e): implement per plan §1e.
  pending(series);
  return { ...TAU_PRIOR, fitted: false, n: 0 };
}

export interface BanisterPoint {
  d: ISODate;
  fitness: number;
  fatigue: number;
  /** fitness − fatigue. */
  form: number;
  /** Null until there is enough history for the band to mean anything. */
  formBand: FormBand | null;
}

/** Banister impulse-response series over a zero-filled daily load series. */
export function banisterSeries(loads: LoadPoint[], tau?: BanisterTauFit | null): BanisterPoint[] {
  // TODO(phase-1e): implement per plan §1e.
  pending(loads, tau);
  return [];
}

export interface AcwrPoint {
  d: ISODate;
  /** EWMA λ = 2/8 of daily load. */
  acute: number;
  /** EWMA λ = 2/29 of daily load. */
  chronic: number;
  /** acute/chronic; null until the chronic EWMA is established. */
  acwr: number | null;
  band: AcwrBand | null;
}

/**
 * Exponentially weighted ACWR (Williams 2017). **Descriptive only** — see the
 * module header; nothing may branch on this alone.
 */
export function acwrSeries(loads: LoadPoint[]): AcwrPoint[] {
  // TODO(phase-1e): implement per plan §1e.
  pending(loads);
  return [];
}

export interface WeekOverWeekLoad {
  /** Load over the 7 days ending at `asOf`. */
  thisWeek: number;
  /** Load over the 7 days before that. */
  lastWeek: number;
  /** Change, %; null when last week has no load to compare against. */
  pct: number | null;
  /** Above the +10%/wk soft guidance line. Advice leads on this, not on ACWR. */
  exceedsSoftCap: boolean;
}

/** Week-on-week acute-load change — the headline ramp number. */
export function weekOverWeekLoad(loads: LoadPoint[], asOf: ISODate): WeekOverWeekLoad {
  // TODO(phase-1e): implement per plan §1e.
  pending(loads, asOf);
  return { thisWeek: 0, lastWeek: 0, pct: null, exceedsSoftCap: false };
}

export interface TrainingLoadOpts extends SessionLoadOpts {
  whoopFit?: WhoopScaleFit | null;
  tau?: BanisterTauFit | null;
}

/**
 * The `TrainingContext['load']` block, assembled from the series above so
 * screens, insights and the coach can never disagree about today's load.
 */
export function trainingLoadSummary(
  records: DailyRecord[],
  workouts: Workout[],
  asOf: ISODate,
  opts: TrainingLoadOpts,
): TrainingContext['load'] {
  // TODO(phase-1e): implement per plan §1e.
  pending(records, workouts, asOf, opts);
  return {
    today: 0,
    acute7: 0,
    chronic28: 0,
    acwr: null,
    acwrBand: null,
    weekOverWeekPct: null,
    fitness: 0,
    fatigue: 0,
    form: 0,
    formBand: null,
    monotony: null,
    weeklyLoad: 0,
    source: 'none',
    tauIsPrior: true,
  };
}

export interface LoadChartPoint {
  d: ISODate;
  load: number;
  acute: number;
  chronic: number;
  acwr: number | null;
  fitness: number;
  fatigue: number;
  form: number;
}

/**
 * One row per day for the Trends load chart — absolute acute load and
 * week-on-week lead the card, with ACWR shaded *below* them and its
 * "descriptive, not a causal injury predictor" note.
 */
export function loadChartSeries(
  loads: LoadPoint[],
  banister: BanisterPoint[],
  acwr: AcwrPoint[],
  asOf: ISODate,
  days: number,
): LoadChartPoint[] {
  // TODO(phase-1e): implement per plan §1e.
  pending(loads, banister, acwr, asOf, days);
  return [];
}

// ---------------------------------------------------------------------------
// VO₂max
// ---------------------------------------------------------------------------

export interface Vo2maxEstimate {
  /** ml/kg/min; null when suppressed for want of support. */
  value: number | null;
  lo: number | null;
  hi: number | null;
  /** "pace-on-HR regression + Uth–Sørensen", or why it is unavailable. */
  method: string;
  /** Steady runs that survived the quality filter. */
  nRuns: number;
  /** True when HRmax is age-estimated — widens the caveat in the caption. */
  hrMaxEstimated: boolean;
}

/** See the module header; returns a suppressed estimate rather than a guess. */
export function estimateVo2max(
  workouts: Workout[],
  profile: Profile,
  records: DailyRecord[],
  asOf: ISODate,
): Vo2maxEstimate {
  // TODO(phase-1e): implement per plan §1e.
  pending(workouts, profile, records, asOf);
  return {
    value: null,
    lo: null,
    hi: null,
    method: 'not enough steady runs',
    nRuns: 0,
    hrMaxEstimated: true,
  };
}

// ---------------------------------------------------------------------------
// Per-muscle recovery
// ---------------------------------------------------------------------------

export interface MuscleFatigueOpts {
  /** `settings.training.customExercises`, for exercises not in `EXERCISES`. */
  custom?: readonly Exercise[];
  /** Decay half-life in hours; default `MUSCLE_HALF_LIFE_H` (60). */
  halfLifeH?: number;
  /** Days of history to walk back; default 21. */
  days?: number;
}

export interface MuscleFatiguePoint {
  d: ISODate;
  /** Accumulated, decayed stimulus per muscle on that day. */
  fatigue: Record<Muscle, number>;
}

/** Daily decayed stimulus per muscle, ascending to `asOf`. */
export function muscleFatigueSeries(
  workouts: Workout[],
  asOf: ISODate,
  opts?: MuscleFatigueOpts,
): MuscleFatiguePoint[] {
  // TODO(phase-1e): implement per plan §1e.
  pending(workouts, asOf, opts);
  return [];
}

export interface MuscleReadiness {
  muscle: Muscle;
  /** 0–100%: 100 = fully recovered / never trained in the window. */
  pct: number;
  /** Hours since the last stimulus; null when there is none in the window. */
  hoursSince: number | null;
}

/**
 * Readiness for **all 15 muscles**, in `MUSCLES` order — the shape
 * `TrainingContext.muscleReadiness` takes verbatim. A single-muscle lookup
 * (the plan's `muscleReadiness(muscle, asOf)` form) is a `.find` on the
 * result, so the expensive walk happens once per context build rather than
 * fifteen times.
 *
 * With no history every muscle reads 100% / `hoursSince: null` — "rested",
 * which is what a fresh install genuinely is.
 */
export function muscleReadiness(
  workouts: Workout[],
  asOf: ISODate,
  opts?: MuscleFatigueOpts,
): MuscleReadiness[] {
  // TODO(phase-1e): implement per plan §1e.
  pending(workouts, asOf, opts);
  return MUSCLES.map((muscle) => ({ muscle, pct: 100, hoursSince: null }));
}
