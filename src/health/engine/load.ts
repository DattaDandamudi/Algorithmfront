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
 *   Foster 2001, *J Strength Cond Res* 15(1):109–115.
 * - **cardio** — Edwards `Σ zoneMin_i · i` when zone minutes exist, else
 *   Banister TRIMP `dur · HRr · 0.64·e^{1.92·HRr}` (male) /
 *   `0.86·e^{1.67·HRr}` (female) with `HRr = (HR − HRrest)/(HRmax − HRrest)`,
 *   `HRmax = 208 − 0.7·age` (Tanaka 2001) unless `profile.maxHrMeasured` is
 *   set and `HRrest` = the 28-day median RHR, else 60. Failing both,
 *   `dur × RPE` (default RPE 6).
 * - **mobility / sport** — `dur × RPE × 0.6`.
 *
 * **Known unit caveat.** Foster sRPE, Edwards summated-zone and Banister TRIMP
 * are three different scales: the same 60-minute session reads ≈ 420 sRPE
 * units, ≈ 180 Edwards units and ≈ 120 TRIMP units. They are used
 * interchangeably in the daily series because the plan specifies them that
 * way, but a user who switches logging style mid-history sees a step change
 * that is an artefact of the unit, not of their training. `SessionLoad.method`
 * carries the branch so the UI can say which scale a day was measured on.
 *
 * ## WHOOP strain → load (`whoopStrainToLoad`, `fitWhoopScale`)
 *
 * WHOOP publishes only "logarithmic 0–21", so both constants in
 * `a·(2^(strain/b) − 1)` are **fitted to the user's own days**, not assumed:
 * least squares over days carrying both a strain and a logged sRPE/TRIMP load
 * (n ≥ 8). Until then `a = 25, b = 3.5` as a **prior**, and the caption says
 * the conversion is an estimate (`LOAD_NOTES.whoopPrior`). This is a labelled
 * heuristic, per the evidence-hygiene rule.
 *
 * What the fit identifies is the **curve over the strain range the user
 * actually lives in**, not the pair: `a` and `b` trade off along a ridge (a
 * synthetic user generated from a = 40 / b = 4.2 fits at a ≈ 53 / b ≈ 4.7 and
 * still predicts held-out days to a median 5.6 %). Report converted load, not
 * the constants.
 *
 * ## Banister (`banisterSeries`, `fitBanisterTau`)
 *
 *   fitness += (L − fitness)·(1 − e^{−1/τ₁})     τ₁ prior 42 d
 *   fatigue += (L − fatigue)·(1 − e^{−1/τ₂})     τ₂ prior 7 d
 *   form = fitness − fatigue
 *
 * Bands: fresh > +5%, neutral, productive −10…−30%, overreached < −30% (of
 * fitness). Clarke & Skiba 2013 (*Adv Physiol Educ* 37:134–152): the five
 * Banister parameters are athlete-specific and 42/7 are placeholders — so
 * τ₁/τ₂ are **fitted per user** once ≥ 12 weeks of load exist (grid search
 * over τ₁ ∈ [30, 60], τ₂ ∈ [4, 12] on the one-step prediction error of the
 * next session's sRPE load on today's form, reported as the
 * likelihood-weighted mean of the grid rather than its noisy argmin — see
 * `fitBanisterTau`), and `tauIsPrior` tells the UI which of the two it is
 * looking at. Measured on synthetic athletes at 16 weeks: median τ error
 * ≈ 10 % for both constants.
 *
 * ## ACWR is descriptive only
 *
 * Impellizzeri 2020 (*Br J Sports Med* 54:1451–1452) documents the ratio's
 * statistical pathologies and finds no causal identification — "manipulating
 * ACWR to change injury rates remains a conjecture". It is still computed
 * (EWMA λ = 2/8 over λ = 2/29, Williams 2017) and still charted with its
 * 0.8–1.3 / 1.3–1.5 / > 1.5 shading, but it carries a "descriptive, not a
 * causal injury predictor" note (`LOAD_NOTES.acwrDescriptive`) and **never
 * gates advice on its own**: decisions lead on absolute `acute7` and
 * `weekOverWeekPct` (soft cap +10%/wk). Foster monotony and strain are
 * computed (`fosterMonotony`) and shown, **never alerted on**
 * (duration-dominated, mixed evidence — `LOAD_NOTES.monotony`).
 *
 * ## VO₂max (`estimateVo2max`)
 *
 * Per-user least-squares regression of speed on HR fraction across steady runs
 * (≥ 8 sessions with distance, duration and avg HR at 70–90% HRmax, dropping
 * pace/HR pairs > 3 robust SD off), extrapolated to HRmax and converted with
 * the ACSM running equation `VO₂ = 0.2·(m/min) + 3.5`, then cross-checked
 * against Uth–Sørensen `15 × HRmax/HRrest` (14.5 male / 15.3 female) and
 * published as the mean of the two with a **±3.5 ml/kg/min** band.
 * **Suppressed entirely** when HRmax is age-estimated *and* fewer than 8 runs
 * exist — the number never appears without support. Written to `vo2` on the
 * day it is computed (by the context builder, not here) so it charts like any
 * other metric.
 *
 * ## Per-muscle recovery (`muscleFatigueSeries`, `muscleReadiness`)
 *
 * Each working set adds `sets × RIR-weighted intensity` to its primary muscle
 * (0.5 to each secondary), decaying with a **60 h half-life**. Fitbod ships a
 * per-muscle readiness whose formula is unpublished; this one is **ours**,
 * derived from the 24–48 h muscle-protein-synthesis window and labelled a
 * heuristic in code and in the caption (`LOAD_NOTES.muscleRecovery`).
 *
 * Muscle attribution needs an exercise → muscles map, which lives in
 * `exerciseDb.ts`. It is **injected** (`MuscleFatigueOpts.lookup`) rather than
 * imported, so this module stays independent of the library's contents; with
 * no lookup nothing is attributed and every muscle reads 100 % (rested), which
 * is what a fresh install genuinely is.
 */
import type {
  AcwrBand,
  DailyRecord,
  Exercise,
  FormBand,
  ISODate,
  Muscle,
  Profile,
  SetEntry,
  TrainingContext,
  Workout,
} from '../data/types';
import { addDays, diffDays, hhmmToMinutes, lastNDates } from '../lib/dates';
import { clamp, mean, round, stddev } from '../lib/format';
import { ewma, linreg, median, robustSd } from './stats';

/** Banister time constants used until ≥ 12 weeks of load allow a personal fit. */
export const TAU_PRIOR: { tau1: number; tau2: number } = { tau1: 42, tau2: 7 };
/** WHOOP strain→load prior: `25·(2^(strain/3.5) − 1)`. A labelled heuristic. */
export const WHOOP_SCALE_PRIOR: { a: number; b: number } = { a: 25, b: 3.5 };
/** Muscle-fatigue decay half-life, hours (the 48–72 h MPS window). Heuristic. */
export const MUSCLE_HALF_LIFE_H = 60;
/** Week-on-week acute-load guidance line, % (soft, never a block). */
export const WEEKLY_LOAD_SOFT_CAP_PCT = 10;

/** Grid the personal Banister fit searches (plan §1e). */
export const TAU_FIT_BOUNDS: { tau1: [number, number]; tau2: [number, number] } = {
  tau1: [30, 60],
  tau2: [4, 12],
};
/** Days of load a personal τ fit needs — 12 weeks. */
export const TAU_FIT_MIN_DAYS = 84;
/** Days with both a strain and a logged load a WHOOP fit needs. */
export const WHOOP_FIT_MIN_DAYS = 8;
/** Steady runs a VO₂max regression needs. */
export const VO2MAX_MIN_RUNS = 8;
/** Published half-width of the VO₂max estimate, ml/kg/min. */
export const VO2MAX_BAND = 3.5;
/** Default history the daily series walks when the caller gives no window. */
export const DEFAULT_LOAD_WINDOW_DAYS = 180;
/** Days of series before ACWR and the form band mean anything. */
export const MIN_ACWR_DAYS = 28;
/** EWMA smoothing constants — Williams 2017 (λ = 2/(N+1), N = 7 and 27). */
export const ACWR_LAMBDA: { acute: number; chronic: number } = {
  acute: 2 / 8,
  chronic: 2 / 29,
};

/**
 * Caption-ready evidence notes. Exported so the UI never has to re-state (or
 * mis-state) what these numbers are: every hedge the engine owes the user is
 * reachable from here.
 */
export const LOAD_NOTES = {
  acwrDescriptive:
    'Descriptive, not a causal injury predictor: Impellizzeri 2020 found the ' +
    'acute:chronic ratio has fundamental statistical pitfalls and no causal ' +
    'identification, so nothing in this app changes a recommendation on ACWR alone.',
  weekOverWeek:
    'Week-on-week change in absolute load leads the decision; +10%/wk is a soft ' +
    'guidance line, not a limit.',
  whoopPrior:
    'WHOOP publishes only that strain is "logarithmic 0–21", so this conversion ' +
    'starts from an assumed a = 25, b = 3.5 and is fitted to your own logged ' +
    'sessions once 8 days carry both a strain and a logged workout. Until then ' +
    'treat WHOOP-only days as an estimate, not a measurement.',
  whoopFitted:
    'Fitted to your own days: both constants come from least squares over days ' +
    'that carried both a WHOOP strain and a logged session.',
  tauPrior:
    'Fitness and fatigue time constants are the textbook 42/7-day placeholders. ' +
    'Clarke & Skiba 2013: the Banister parameters are athlete-specific, so these ' +
    'are a starting point and get replaced by your own fit after 12 weeks of load.',
  tauFitted:
    'Fitness and fatigue time constants were fitted to your own load history by ' +
    'minimising one-step prediction error.',
  monotony:
    "Foster monotony and strain are shown because they are part of the classic " +
    'load picture, but nothing alerts on them: monotony is dominated by how many ' +
    'days you train rather than how hard, and the evidence behind it is mixed.',
  muscleRecovery:
    'Per-muscle recovery is ours, not a vendor formula (Fitbod does not publish ' +
    'theirs). Each set adds effort-weighted stimulus to the muscles it trains, ' +
    'decaying with a 60-hour half-life — the middle of the 48–72 h window in which ' +
    'muscle protein synthesis is elevated after training.',
  vo2max:
    'Estimated from the speeds you hold at given heart rates, extrapolated to your ' +
    'maximum heart rate and cross-checked against the resting-HR method. The ±3.5 ' +
    'ml/kg/min band is the typical error of field estimates like these.',
  unitMix:
    'Sessions logged with heart-rate zones score on a different scale from sessions ' +
    'logged with RPE, so a change of logging style can look like a change of load.',
} as const;

/**
 * The 15 volume buckets in the order the UI renders them. Deliberately a local
 * copy of `exerciseDb.MUSCLES` — this module needs a canonical iteration order
 * but must not depend on the exercise library, whose contents are injected —
 * kept in the same order so the two lists render identically. Written as a
 * total `Record<Muscle, …>` so a new muscle in `data/types` is a compile error
 * here rather than a silently missing row.
 */
const MUSCLE_ORDER: Record<Muscle, number> = {
  chest: 0,
  'front-delts': 1,
  'side-delts': 2,
  'rear-delts': 3,
  triceps: 4,
  back: 5,
  traps: 6,
  biceps: 7,
  forearms: 8,
  quads: 9,
  hamstrings: 10,
  glutes: 11,
  calves: 12,
  abs: 13,
  'lower-back': 14,
};

const ALL_MUSCLES: readonly Muscle[] = (Object.keys(MUSCLE_ORDER) as Muscle[]).sort(
  (a, b) => MUSCLE_ORDER[a] - MUSCLE_ORDER[b],
);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Ascending by `d`, without mutating the caller's array. */
function byDate<T extends { d: ISODate }>(xs: readonly T[]): T[] {
  return [...xs].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
}

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

/** Foster sRPE when a strength session logged no effort at all. */
const STRENGTH_SRPE_DEFAULT = 7;
/** RPE assumed for a cardio/mobility session that logged no effort at all. */
const CARDIO_RPE_DEFAULT = 6;
/** Mobility and sport discount on `dur × RPE` (plan §1e). */
const MOBILITY_FACTOR = 0.6;
/** Fallback resting HR when 28 days of RHR are not available, bpm. */
const REST_HR_DEFAULT = 60;

/** A set that counts: completed, not a warm-up. */
function isWorkingSet(s: SetEntry): boolean {
  return s.x !== true && s.k !== 'wu';
}

/** Every working set of a workout, in logged order. */
function workingSets(w: Workout): SetEntry[] {
  const out: SetEntry[] = [];
  for (const ex of w.exercises ?? []) {
    for (const s of ex.sets ?? []) if (isWorkingSet(s)) out.push(s);
  }
  return out;
}

/**
 * Foster sRPE for a session: logged → mean working-set RPE → mean `10 − RIR`
 * → 7. Returns the value and whether it was logged or derived.
 */
function resolveSrpe(w: Workout, fallback: number): { srpe: number; logged: boolean } {
  if (isNum(w.srpe) && w.srpe > 0 && w.srpe <= 10) return { srpe: w.srpe, logged: true };
  const sets = workingSets(w);
  const rpes = sets.map((s) => s.rpe).filter((v): v is number => isNum(v) && v > 0 && v <= 10);
  if (rpes.length) return { srpe: mean(rpes) as number, logged: false };
  const rirs = sets.map((s) => s.rir).filter((v): v is number => isNum(v) && v >= 0 && v <= 10);
  if (rirs.length) return { srpe: mean(rirs.map((r) => 10 - r)) as number, logged: false };
  return { srpe: fallback, logged: false };
}

/** Σ w·r over working sets; null when the session logged no sets at all. */
function volumeLoad(w: Workout): number | null {
  const sets = workingSets(w);
  if (!sets.length) return null;
  let total = 0;
  for (const s of sets) {
    if (isNum(s.w) && isNum(s.r) && s.w > 0 && s.r > 0) total += s.w * s.r;
  }
  return round(total, 1);
}

/** Tanaka 2001 unless a measured max is on file. */
export function maxHeartRate(profile: Pick<Profile, 'age' | 'maxHrMeasured'>): {
  maxHr: number | null;
  estimated: boolean;
} {
  const m = profile.maxHrMeasured;
  if (isNum(m) && m >= 120 && m <= 230) return { maxHr: m, estimated: false };
  const age = profile.age;
  if (!isNum(age) || age < 5 || age > 100) return { maxHr: null, estimated: true };
  return { maxHr: 208 - 0.7 * age, estimated: true };
}

/** Banister's sex-specific TRIMP weighting factor for a HR reserve fraction. */
function trimpWeight(hrr: number, sex: Profile['sex']): number {
  if (sex === 'female') return 0.86 * Math.exp(1.67 * hrr);
  if (sex === 'male') return 0.64 * Math.exp(1.92 * hrr);
  // 'other': the mean of the two published forms rather than defaulting to
  // one sex. Our choice, not a published constant.
  return (0.64 * Math.exp(1.92 * hrr) + 0.86 * Math.exp(1.67 * hrr)) / 2;
}

/** Load for one workout. Never throws on a partial or imported session. */
export function sessionLoad(w: Workout, opts: SessionLoadOpts): SessionLoad {
  const dur = isNum(w.durationMin) && w.durationMin > 0 ? w.durationMin : 0;
  const volumeKg = w.kind === 'strength' ? volumeLoad(w) : null;
  const none: SessionLoad = { load: 0, method: 'none', volumeKg, srpe: null };
  if (dur <= 0) return none;

  if (w.kind === 'strength') {
    const { srpe } = resolveSrpe(w, STRENGTH_SRPE_DEFAULT);
    return { load: round(srpe * dur, 1), method: 'srpe', volumeKg, srpe: round(srpe, 2) };
  }

  if (w.kind === 'cardio') {
    // Edwards summated heart-rate zones: Σ minutes in zone i × i.
    const zones = w.cardio?.zoneMin;
    if (Array.isArray(zones)) {
      let edwards = 0;
      for (let i = 0; i < zones.length && i < 6; i++) {
        const m = zones[i];
        if (isNum(m) && m > 0) edwards += m * i;
      }
      if (edwards > 0) {
        return { load: round(edwards, 1), method: 'edwards', volumeKg: null, srpe: null };
      }
    }
    // Banister TRIMP on the heart-rate reserve.
    const avgHr = w.cardio?.avgHr;
    const { maxHr } = maxHeartRate(opts.profile);
    const rest = isNum(opts.restHr) && opts.restHr >= 25 && opts.restHr <= 100
      ? opts.restHr
      : REST_HR_DEFAULT;
    if (isNum(avgHr) && avgHr > 0 && maxHr !== null && maxHr > rest) {
      const hrr = clamp((avgHr - rest) / (maxHr - rest), 0, 1);
      if (hrr > 0) {
        const load = dur * hrr * trimpWeight(hrr, opts.profile.sex);
        return { load: round(load, 1), method: 'trimp', volumeKg: null, srpe: null };
      }
    }
    const rpe = isNum(w.srpe) && w.srpe > 0 && w.srpe <= 10 ? w.srpe : CARDIO_RPE_DEFAULT;
    return { load: round(dur * rpe, 1), method: 'duration', volumeKg: null, srpe: round(rpe, 2) };
  }

  // Mobility and sport: dur × RPE × 0.6.
  const { srpe } = resolveSrpe(w, CARDIO_RPE_DEFAULT);
  return {
    load: round(dur * srpe * MOBILITY_FACTOR, 1),
    method: 'duration',
    volumeKg: null,
    srpe: round(srpe, 2),
  };
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
  /** Caption text — the prior's uncertainty, or the fit's provenance. */
  note: string;
}

/** WHOOP's published strain scale. */
const STRAIN_MAX = 21;

/**
 * `a·(2^(strain/b) − 1)` with the user's fit when one exists, else the prior.
 * `null` for a non-finite or out-of-range strain (WHOOP's scale is 0–21).
 */
export function whoopStrainToLoad(strain: number, fit?: WhoopScaleFit | null): number | null {
  if (!isNum(strain) || strain < 0 || strain > STRAIN_MAX) return null;
  const a = fit && isNum(fit.a) && fit.a > 0 ? fit.a : WHOOP_SCALE_PRIOR.a;
  const b = fit && isNum(fit.b) && fit.b > 0 ? fit.b : WHOOP_SCALE_PRIOR.b;
  const load = a * (Math.pow(2, strain / b) - 1);
  if (!isNum(load) || load < 0) return null;
  return round(load, 1);
}

/** The unfitted prior, as returned whenever a personal fit is not supported. */
function whoopPrior(n: number): WhoopScaleFit {
  return { ...WHOOP_SCALE_PRIOR, n, fitted: false, rmse: null, note: LOAD_NOTES.whoopPrior };
}

/**
 * Two-parameter least-squares fit of `a`/`b` over days carrying both a WHOOP
 * day strain (`record.strn`) and a load computed from logged workouts.
 * Requires n ≥ 8; returns the prior with `fitted: false` below that.
 *
 * For a fixed `b` the model is linear in `a` (`x = 2^{s/b} − 1`, `a = ΣxL/Σx²`),
 * so the search is a one-dimensional grid over `b` with `a` in closed form —
 * exact rather than an iterative optimiser that could stall on a flat ridge.
 */
export function fitWhoopScale(
  records: DailyRecord[],
  workouts: Workout[],
  opts: SessionLoadOpts,
): WhoopScaleFit {
  const logged = loggedLoadByDate(workouts, opts);
  const strains: number[] = [];
  const loads: number[] = [];
  for (const r of byDate(records)) {
    const s = r.strn;
    if (!isNum(s) || s <= 0 || s > STRAIN_MAX) continue;
    const l = logged.get(r.d);
    if (!isNum(l) || l <= 0) continue;
    strains.push(s);
    loads.push(l);
  }
  const n = strains.length;
  if (n < WHOOP_FIT_MIN_DAYS) return whoopPrior(n);
  // With no spread in strain, `b` is not identified: every b has an `a` that
  // fits the single point equally well. Refuse rather than report a fit.
  const spread = Math.max(...strains) - Math.min(...strains);
  if (spread < 2) return whoopPrior(n);

  let best: { a: number; b: number; sse: number } | null = null;
  for (let b = 1.5; b <= 8.0001; b += 0.05) {
    let sxx = 0;
    let sxl = 0;
    for (let i = 0; i < n; i++) {
      const x = Math.pow(2, strains[i] / b) - 1;
      sxx += x * x;
      sxl += x * loads[i];
    }
    if (!(sxx > 0)) continue;
    const a = sxl / sxx;
    if (!isNum(a) || a <= 0) continue;
    let sse = 0;
    for (let i = 0; i < n; i++) {
      const resid = a * (Math.pow(2, strains[i] / b) - 1) - loads[i];
      sse += resid * resid;
    }
    if (!isNum(sse)) continue;
    if (!best || sse < best.sse) best = { a, b, sse };
  }
  if (!best) return whoopPrior(n);
  return {
    a: round(best.a, 3),
    b: round(best.b, 3),
    n,
    fitted: true,
    rmse: round(Math.sqrt(best.sse / n), 1),
    note: LOAD_NOTES.whoopFitted,
  };
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
 * Load units for one session including a stamped `load` fallback: an imported
 * session can carry a vendor load and nothing else to recompute it from.
 */
function workoutUnits(w: Workout, opts: SessionLoadOpts): number {
  const s = sessionLoad(w, opts);
  if (s.method !== 'none') return s.load;
  return isNum(w.load) && w.load > 0 ? w.load : 0;
}

/** Day → summed logged load, over every workout supplied. */
function loggedLoadByDate(workouts: Workout[], opts: SessionLoadOpts): Map<ISODate, number> {
  const out = new Map<ISODate, number>();
  for (const w of workouts) {
    if (!w || typeof w.d !== 'string') continue;
    out.set(w.d, (out.get(w.d) ?? 0) + workoutUnits(w, opts));
  }
  return out;
}

/**
 * One entry per calendar day up to `asOf`, ascending, zero-filled on rest days
 * (the EWMAs below need an unbroken series). Logged workouts win; a stamped
 * daily total (`record.ld`, written by the store or an import) fills days with
 * no session objects; a WHOOP day strain fills what is still empty.
 */
export function dailyLoadSeries(
  records: DailyRecord[],
  workouts: Workout[],
  asOf: ISODate,
  opts: SessionLoadOpts & { whoopFit?: WhoopScaleFit | null; days?: number },
): LoadPoint[] {
  const days = isNum(opts.days) && opts.days > 0 ? Math.floor(opts.days) : DEFAULT_LOAD_WINDOW_DAYS;
  const dates = lastNDates(asOf, days);
  const first = dates[0];
  const counts = new Map<ISODate, number>();
  const logged = new Map<ISODate, number>();
  for (const w of workouts) {
    if (!w || typeof w.d !== 'string') continue;
    if (w.d < first || w.d > asOf) continue;
    logged.set(w.d, (logged.get(w.d) ?? 0) + workoutUnits(w, opts));
    counts.set(w.d, (counts.get(w.d) ?? 0) + 1);
  }
  const rec = new Map<ISODate, DailyRecord>();
  for (const r of byDate(records)) {
    if (!r || typeof r.d !== 'string') continue;
    if (r.d < first || r.d > asOf) continue;
    rec.set(r.d, r);
  }
  return dates.map((d) => {
    const n = counts.get(d) ?? 0;
    const fromWorkouts = logged.get(d);
    if (isNum(fromWorkouts) && fromWorkouts > 0) {
      return { d, load: round(fromWorkouts, 1), source: 'logged' as const, workouts: n };
    }
    const r = rec.get(d);
    if (r && isNum(r.ld) && r.ld > 0) {
      return { d, load: round(r.ld, 1), source: 'logged' as const, workouts: n || (r.wko ?? 0) };
    }
    if (r && isNum(r.strn)) {
      const converted = whoopStrainToLoad(r.strn, opts.whoopFit);
      if (converted !== null && converted > 0) {
        return { d, load: converted, source: 'whoop' as const, workouts: n };
      }
    }
    return { d, load: 0, source: 'none' as const, workouts: n };
  });
}

export interface BanisterTauFit {
  tau1: number;
  tau2: number;
  /** False while these are the 42/7 priors — the UI must say so. */
  fitted: boolean;
  /** Days of load the fit saw. */
  n: number;
  /** Sessions the one-step prediction was scored on; 0 when unfitted. */
  scored?: number;
  /** Variance of next-session load the fitted form explains; null unfitted. */
  r2?: number | null;
  /** Caption text — prior or fitted. */
  note?: string;
}

/** Scored days are skipped while fitness/fatigue are still filling from zero. */
const TAU_FIT_WARMUP_DAYS = 7;
/** Sessions the grid search needs before its argmin means anything. */
const TAU_FIT_MIN_SESSIONS = 20;
/**
 * Minimum share of next-session load variance the fitted form must explain.
 * Below it the grid's argmin is noise — a user whose session size is unrelated
 * to their form gives no information about τ, and the priors are the honest
 * answer. Our threshold, not a published one.
 */
const TAU_FIT_MIN_R2 = 0.02;

/** The 42/7 prior, as returned whenever a personal fit is not supported. */
function tauPrior(n: number): BanisterTauFit {
  return { ...TAU_PRIOR, fitted: false, n, scored: 0, r2: null, note: LOAD_NOTES.tauPrior };
}

/**
 * Grid-search τ₁ ∈ [30, 60], τ₂ ∈ [4, 12] on the one-step prediction error of
 * the next session's sRPE load on today's form. Needs ≥ 12 weeks (84 days) of
 * load; returns the priors with `fitted: false` below that.
 *
 * Only days that carried a session are scored: a rest day's zero says
 * something about the calendar, not about how form sizes a session, and
 * including them lets the rest cadence dominate the residual. The first week
 * is warm-up — fitness and fatigue both start at zero, so `form` carries no
 * information until the filters have seen something.
 *
 * **Reported value is the likelihood-weighted mean of the grid, not its
 * argmin.** The residual surface over (τ₁, τ₂) is shallow and noisy — nearby
 * time constants produce nearly identical form series — so the argmin hops
 * between distant cells (and onto the grid's edges) from one seed to the next.
 * Weighting every cell by its profile likelihood `∝ SSE^{−m/2}` and taking the
 * mean is the posterior mean under a flat prior on the grid: a little bias
 * toward the middle of the plausible range in exchange for a large drop in
 * variance. Measured on synthetic athletes at 16 weeks, this cuts the median
 * τ error from ≈ 25 % (argmin) to ≈ 10 %.
 */
export function fitBanisterTau(series: LoadPoint[]): BanisterTauFit {
  const loads = byDate(series).map((p) => (isNum(p.load) && p.load > 0 ? p.load : 0));
  const n = loads.length;
  if (n < TAU_FIT_MIN_DAYS) return tauPrior(n);

  // Days whose *next* day carried a session, past the warm-up. The set does
  // not depend on τ, so SSE is comparable across the grid.
  const idx: number[] = [];
  for (let t = TAU_FIT_WARMUP_DAYS; t < n - 1; t++) if (loads[t + 1] > 0) idx.push(t);
  if (idx.length < TAU_FIT_MIN_SESSIONS) return tauPrior(n);

  let sy = 0;
  let syy = 0;
  for (const t of idx) {
    sy += loads[t + 1];
    syy += loads[t + 1] * loads[t + 1];
  }
  const m = idx.length;
  const totalSS = syy - (sy * sy) / m;
  if (!(totalSS > 0)) return tauPrior(n);

  const cells: Array<{ tau1: number; tau2: number; sse: number }> = [];
  let bestSse = Infinity;
  for (let tau1 = TAU_FIT_BOUNDS.tau1[0]; tau1 <= TAU_FIT_BOUNDS.tau1[1] + 1e-9; tau1 += 1) {
    const k1 = 1 - Math.exp(-1 / tau1);
    for (let tau2 = TAU_FIT_BOUNDS.tau2[0]; tau2 <= TAU_FIT_BOUNDS.tau2[1] + 1e-9; tau2 += 0.5) {
      const k2 = 1 - Math.exp(-1 / tau2);
      let fitness = 0;
      let fatigue = 0;
      const form: number[] = new Array(n);
      for (let t = 0; t < n; t++) {
        fitness += (loads[t] - fitness) * k1;
        fatigue += (loads[t] - fatigue) * k2;
        form[t] = fitness - fatigue;
      }
      let sx = 0;
      let sxx = 0;
      let sxy = 0;
      for (const t of idx) {
        const x = form[t];
        sx += x;
        sxx += x * x;
        sxy += x * loads[t + 1];
      }
      const varX = sxx - (sx * sx) / m;
      if (!(varX > 0)) continue;
      const cov = sxy - (sx * sy) / m;
      const sse = totalSS - (cov * cov) / varX;
      if (!isNum(sse) || sse <= 0) continue;
      cells.push({ tau1, tau2, sse });
      if (sse < bestSse) bestSse = sse;
    }
  }
  if (!cells.length || !isNum(bestSse)) return tauPrior(n);
  // The best cell decides *whether* to fit; the whole surface decides *what*.
  const r2 = 1 - bestSse / totalSS;
  if (!isNum(r2) || r2 < TAU_FIT_MIN_R2) return tauPrior(n);
  let wsum = 0;
  let t1 = 0;
  let t2 = 0;
  for (const c of cells) {
    // Profile likelihood, scaled by the best cell so the exponent stays ≤ 0.
    const w = Math.exp((-m / 2) * Math.log(c.sse / bestSse));
    if (!isNum(w) || w <= 0) continue;
    wsum += w;
    t1 += w * c.tau1;
    t2 += w * c.tau2;
  }
  if (!(wsum > 0)) return tauPrior(n);
  return {
    tau1: round(t1 / wsum, 2),
    tau2: round(t2 / wsum, 2),
    fitted: true,
    n,
    scored: m,
    r2: round(clamp(r2, 0, 1), 3),
    note: LOAD_NOTES.tauFitted,
  };
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

/** Band `form` as a percentage of `fitness` (plan §1e). */
export function formBandOf(fitness: number, form: number): FormBand | null {
  if (!isNum(fitness) || !isNum(form) || fitness <= 0) return null;
  const pct = (form / fitness) * 100;
  if (pct > 5) return 'fresh';
  if (pct < -30) return 'overreached';
  if (pct <= -10) return 'productive';
  return 'neutral';
}

/** Banister impulse-response series over a zero-filled daily load series. */
export function banisterSeries(loads: LoadPoint[], tau?: BanisterTauFit | null): BanisterPoint[] {
  const pts = byDate(loads);
  const tau1 = tau && isNum(tau.tau1) && tau.tau1 > 0 ? tau.tau1 : TAU_PRIOR.tau1;
  const tau2 = tau && isNum(tau.tau2) && tau.tau2 > 0 ? tau.tau2 : TAU_PRIOR.tau2;
  const k1 = 1 - Math.exp(-1 / tau1);
  const k2 = 1 - Math.exp(-1 / tau2);
  let fitness = 0;
  let fatigue = 0;
  return pts.map((p, i) => {
    const l = isNum(p.load) && p.load > 0 ? p.load : 0;
    fitness += (l - fitness) * k1;
    fatigue += (l - fatigue) * k2;
    const form = fitness - fatigue;
    return {
      d: p.d,
      fitness: round(fitness, 1),
      fatigue: round(fatigue, 1),
      form: round(form, 1),
      formBand: i + 1 >= MIN_ACWR_DAYS ? formBandOf(fitness, form) : null,
    };
  });
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

/** Sweet 0.8–1.3 / high 1.3–1.5 / spike > 1.5, low below (Williams 2017). */
export function acwrBandOf(acwr: number | null): AcwrBand | null {
  if (acwr === null || !isNum(acwr)) return null;
  if (acwr > 1.5) return 'spike';
  if (acwr > 1.3) return 'high';
  if (acwr >= 0.8) return 'sweet';
  return 'low';
}

/**
 * Exponentially weighted ACWR (Williams 2017). **Descriptive only** — see the
 * module header; nothing may branch on this alone.
 */
export function acwrSeries(loads: LoadPoint[]): AcwrPoint[] {
  const pts = byDate(loads);
  const xs = pts.map((p) => (isNum(p.load) ? p.load : 0));
  const acute = ewma(xs, ACWR_LAMBDA.acute);
  const chronic = ewma(xs, ACWR_LAMBDA.chronic);
  return pts.map((p, i) => {
    const a = acute[i] ?? 0;
    const c = chronic[i] ?? 0;
    const ready = i + 1 >= MIN_ACWR_DAYS && c > 0;
    const ratio = ready ? round(a / c, 3) : null;
    return {
      d: p.d,
      acute: round(a, 1),
      chronic: round(c, 1),
      acwr: ratio,
      band: acwrBandOf(ratio),
    };
  });
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

/** Sum of `load` over the 7 days ending `end` (inclusive). */
function weekSum(byDay: Map<ISODate, number>, end: ISODate): number {
  let total = 0;
  for (const d of lastNDates(end, 7)) total += byDay.get(d) ?? 0;
  return round(total, 1);
}

/** Week-on-week acute-load change — the headline ramp number. */
export function weekOverWeekLoad(loads: LoadPoint[], asOf: ISODate): WeekOverWeekLoad {
  const byDay = new Map<ISODate, number>();
  for (const p of loads) {
    if (p && typeof p.d === 'string' && isNum(p.load)) byDay.set(p.d, p.load);
  }
  const thisWeek = weekSum(byDay, asOf);
  const lastWeek = weekSum(byDay, addDays(asOf, -7));
  const pct = lastWeek > 0 ? round(((thisWeek - lastWeek) / lastWeek) * 100, 1) : null;
  return {
    thisWeek,
    lastWeek,
    pct,
    exceedsSoftCap: pct !== null && pct > WEEKLY_LOAD_SOFT_CAP_PCT,
  };
}

export interface FosterMonotony {
  /** mean(daily load) / SD(daily load) over the 7 days ending `asOf`. */
  monotony: number | null;
  /** weekly load × monotony (Foster 1998). */
  strain: number | null;
  /** Sum of the week's daily loads. */
  weeklyLoad: number;
  /** Always true — see `LOAD_NOTES.monotony`. Nothing alerts on these. */
  descriptiveOnly: true;
}

/**
 * Foster monotony and strain over the 7 days ending `asOf`.
 *
 * Exposed because they are part of the classic load picture, and **never
 * alerted on**: monotony is dominated by training-day count rather than
 * intensity, and a perfectly even week divides by a zero SD (we return null
 * rather than the infinity that "maximum monotony" would print).
 */
export function fosterMonotony(loads: LoadPoint[], asOf: ISODate): FosterMonotony {
  const byDay = new Map<ISODate, number>();
  for (const p of loads) {
    if (p && typeof p.d === 'string' && isNum(p.load)) byDay.set(p.d, p.load);
  }
  const week = lastNDates(asOf, 7).map((d) => byDay.get(d) ?? 0);
  const weekly = round(week.reduce((s, v) => s + v, 0), 1);
  const m = mean(week);
  const sd = stddev(week);
  if (m === null || sd === null || sd <= 0) {
    return { monotony: null, strain: null, weeklyLoad: weekly, descriptiveOnly: true };
  }
  const monotony = round(m / sd, 2);
  return {
    monotony,
    strain: round(weekly * monotony, 1),
    weeklyLoad: weekly,
    descriptiveOnly: true,
  };
}

export interface TrainingLoadOpts extends SessionLoadOpts {
  whoopFit?: WhoopScaleFit | null;
  tau?: BanisterTauFit | null;
}

/**
 * The `TrainingContext['load']` block, assembled from the series above so
 * screens, insights and the coach can never disagree about today's load.
 *
 * `acute7` / `chronic28` are the two EWMAs the ratio is built from (so the
 * ratio the UI shows is exactly `acute7 / chronic28`), and `weeklyLoad` is the
 * plain 7-day total the caption leads with.
 */
export function trainingLoadSummary(
  records: DailyRecord[],
  workouts: Workout[],
  asOf: ISODate,
  opts: TrainingLoadOpts,
): TrainingContext['load'] {
  const series = dailyLoadSeries(records, workouts, asOf, opts);
  const tau = opts.tau ?? fitBanisterTau(series);
  const ban = banisterSeries(series, tau);
  const acwr = acwrSeries(series);
  const wow = weekOverWeekLoad(series, asOf);
  const foster = fosterMonotony(series, asOf);
  const last = series.length ? series[series.length - 1] : null;
  const lastBan = ban.length ? ban[ban.length - 1] : null;
  const lastAcwr = acwr.length ? acwr[acwr.length - 1] : null;

  // Source over the last 28 days: what the numbers above were actually built
  // from, so the caption can hedge a WHOOP-derived week.
  const recent = series.slice(-MIN_ACWR_DAYS);
  const hasLogged = recent.some((p) => p.source === 'logged' && p.load > 0);
  const hasWhoop = recent.some((p) => p.source === 'whoop' && p.load > 0);
  const source: TrainingContext['load']['source'] = hasLogged && hasWhoop
    ? 'mixed'
    : hasLogged
      ? 'logged'
      : hasWhoop
        ? 'whoop'
        : 'none';

  return {
    today: last ? last.load : 0,
    acute7: lastAcwr ? lastAcwr.acute : 0,
    chronic28: lastAcwr ? lastAcwr.chronic : 0,
    acwr: lastAcwr ? lastAcwr.acwr : null,
    acwrBand: lastAcwr ? lastAcwr.band : null,
    weekOverWeekPct: wow.pct,
    fitness: lastBan ? lastBan.fitness : 0,
    fatigue: lastBan ? lastBan.fatigue : 0,
    form: lastBan ? lastBan.form : 0,
    formBand: lastBan ? lastBan.formBand : null,
    monotony: foster.monotony,
    weeklyLoad: wow.thisWeek,
    source,
    tauIsPrior: !tau.fitted,
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
 * "descriptive, not a causal injury predictor" note
 * (`LOAD_NOTES.acwrDescriptive`).
 */
export function loadChartSeries(
  loads: LoadPoint[],
  banister: BanisterPoint[],
  acwr: AcwrPoint[],
  asOf: ISODate,
  days: number,
): LoadChartPoint[] {
  const n = isNum(days) && days > 0 ? Math.floor(days) : DEFAULT_LOAD_WINDOW_DAYS;
  const window = new Set(lastNDates(asOf, n));
  const ban = new Map(banister.map((p) => [p.d, p]));
  const ac = new Map(acwr.map((p) => [p.d, p]));
  return byDate(loads)
    .filter((p) => window.has(p.d))
    .map((p) => {
      const b = ban.get(p.d);
      const a = ac.get(p.d);
      return {
        d: p.d,
        load: isNum(p.load) ? p.load : 0,
        acute: a ? a.acute : 0,
        chronic: a ? a.chronic : 0,
        acwr: a ? a.acwr : null,
        fitness: b ? b.fitness : 0,
        fatigue: b ? b.fatigue : 0,
        form: b ? b.form : 0,
      };
    });
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
  /** The regression arm on its own, ml/kg/min; null when not computable. */
  regression?: number | null;
  /** The Uth–Sørensen arm on its own; null when RHR is missing. */
  uthSorensen?: number | null;
}

/** HR fraction window a "steady run" must sit in (plan §1e). */
const VO2_HR_FRACTION = { lo: 0.7, hi: 0.9 };
/** Days of run history the regression looks back over. Our choice. */
const VO2_LOOKBACK_DAYS = 180;
/** Uth–Sørensen coefficients: 14.5 male / 15.3 female (plan §1e). */
const UTH_COEFF = { male: 14.5, female: 15.3, other: 14.9 };
/** Plausible human range for the published value, ml/kg/min. */
const VO2_RANGE = { lo: 15, hi: 90 };

/** A cardio session that looks like a run (or does not say what it is). */
function isRunLike(w: Workout): boolean {
  const sport = w.cardio?.sport;
  if (typeof sport !== 'string' || !sport.trim()) return true;
  return /run|jog|treadmill|trail/i.test(sport);
}

/** ACSM level-running equation: VO₂ (ml/kg/min) = 0.2·(m/min) + 3.5. */
function acsmVo2(metresPerMin: number): number {
  return 0.2 * metresPerMin + 3.5;
}

/** See the module header; returns a suppressed estimate rather than a guess. */
export function estimateVo2max(
  workouts: Workout[],
  profile: Profile,
  records: DailyRecord[],
  asOf: ISODate,
): Vo2maxEstimate {
  const { maxHr, estimated } = maxHeartRate(profile);
  const suppressed = (method: string, nRuns: number): Vo2maxEstimate => ({
    value: null,
    lo: null,
    hi: null,
    method,
    nRuns,
    hrMaxEstimated: estimated,
    regression: null,
    uthSorensen: null,
  });
  if (maxHr === null) return suppressed('no max heart rate and no age on file', 0);

  // Steady runs in the window, as (HR fraction, speed in m/min) pairs.
  const first = addDays(asOf, -(VO2_LOOKBACK_DAYS - 1));
  const xs: number[] = [];
  const ys: number[] = [];
  for (const w of byDate(workouts)) {
    if (!w || w.kind !== 'cardio' || !isRunLike(w)) continue;
    if (w.d < first || w.d > asOf) continue;
    const km = w.cardio?.distanceKm;
    const hr = w.cardio?.avgHr;
    if (!isNum(km) || km <= 0) continue;
    if (!isNum(w.durationMin) || w.durationMin <= 0) continue;
    if (!isNum(hr) || hr <= 0) continue;
    const frac = hr / maxHr;
    if (frac < VO2_HR_FRACTION.lo || frac > VO2_HR_FRACTION.hi) continue;
    const speed = (km * 1000) / w.durationMin;
    if (!isNum(speed) || speed <= 0) continue;
    xs.push(frac);
    ys.push(speed);
  }

  // Uth–Sørensen cross-check: 15 × HRmax/HRrest, coefficient by sex.
  const rhrs = byDate(records)
    .filter((r) => r.d <= asOf && r.d > addDays(asOf, -29))
    .map((r) => r.rhr);
  const restHr = median(rhrs);
  const coeff = UTH_COEFF[profile.sex] ?? UTH_COEFF.other;
  const uth = isNum(restHr) && restHr > 25 ? coeff * (maxHr / restHr) : null;

  if (xs.length < VO2MAX_MIN_RUNS && estimated) {
    // The suppression rule: no measured HRmax and not enough runs = no number.
    return suppressed(
      `needs ${VO2MAX_MIN_RUNS} steady runs or a measured max HR (have ${xs.length} runs)`,
      xs.length,
    );
  }

  // Regression arm, with one robust outlier pass.
  let regression: number | null = null;
  let nUsed = xs.length;
  if (xs.length >= VO2MAX_MIN_RUNS) {
    let fit = linreg(xs, ys);
    if (fit) {
      const { slope, intercept } = fit;
      const resid = xs.map((x, i) => ys[i] - intercept - slope * x);
      const sd = robustSd(resid);
      if (sd !== null && sd > 0) {
        const keptX: number[] = [];
        const keptY: number[] = [];
        for (let i = 0; i < xs.length; i++) {
          if (Math.abs(resid[i]) <= 3 * sd) {
            keptX.push(xs[i]);
            keptY.push(ys[i]);
          }
        }
        if (keptX.length >= VO2MAX_MIN_RUNS && keptX.length < xs.length) {
          const refit = linreg(keptX, keptY);
          if (refit) {
            fit = refit;
            nUsed = keptX.length;
          }
        }
      }
      // A negative slope means speed *fell* as HR rose — not a steady-state
      // relationship we can extrapolate. Fall back to the cross-check alone.
      if (fit.slope > 0) {
        const speedAtMax = fit.intercept + fit.slope * 1;
        if (isNum(speedAtMax) && speedAtMax > 0) regression = acsmVo2(speedAtMax);
      }
    }
  }

  const arms = [regression, uth].filter((v): v is number => isNum(v) && v > 0);
  if (!arms.length) {
    return suppressed(
      nUsed >= VO2MAX_MIN_RUNS
        ? 'runs do not show a usable speed–heart-rate relationship'
        : 'no resting heart rate to cross-check against',
      nUsed,
    );
  }
  const raw = arms.reduce((s, v) => s + v, 0) / arms.length;
  const value = round(clamp(raw, VO2_RANGE.lo, VO2_RANGE.hi), 1);
  const method = regression !== null && uth !== null
    ? `pace-on-HR regression (${nUsed} runs) + Uth–Sørensen`
    : regression !== null
      ? `pace-on-HR regression (${nUsed} runs)`
      : 'Uth–Sørensen (measured max HR, resting HR)';
  return {
    value,
    lo: round(value - VO2MAX_BAND, 1),
    hi: round(value + VO2MAX_BAND, 1),
    method,
    nRuns: nUsed,
    hrMaxEstimated: estimated,
    regression: regression === null ? null : round(regression, 1),
    uthSorensen: uth === null ? null : round(uth, 1),
  };
}

// ---------------------------------------------------------------------------
// Per-muscle recovery
// ---------------------------------------------------------------------------

/** Resolve an exercise id to its definition; injected, never imported. */
export type ExerciseLookup = (exerciseId: string) => Exercise | undefined;

export interface MuscleFatigueOpts {
  /**
   * The exercise library, injected: `exerciseDb.EXERCISES` in the app, a stub
   * in tests. Defaults to attributing nothing, so a caller that has no library
   * gets "rested" rather than a wrong muscle.
   */
  lookup?: ExerciseLookup;
  /** `settings.training.customExercises`, for exercises not in `EXERCISES`. */
  custom?: readonly Exercise[];
  /** Decay half-life in hours; default `MUSCLE_HALF_LIFE_H` (60). */
  halfLifeH?: number;
  /** Days of history to walk back; default 21. */
  days?: number;
  /**
   * Hour of day (0–24) each day is evaluated at; default 24 (end of day). The
   * engine never reads a clock, so a caller that wants "right now" passes it.
   */
  atHour?: number;
}

export interface MuscleFatiguePoint {
  d: ISODate;
  /** Accumulated, decayed stimulus per muscle on that day. */
  fatigue: Record<Muscle, number>;
}

/**
 * Decayed stimulus units at which a muscle reads 0 % ready. Sized so a hard
 * six-set session (≈ RPE 8 → 0.67 units per set → 4.0 units) reads ≈ 33 %
 * immediately and passes back through 60 % at ≈ 48 h — the lower edge of the
 * MPS window. **Ours, a heuristic**: no published formula fixes it.
 */
export const MUSCLE_FATIGUE_FULL = 6;
/** Default history the muscle walk covers, days. */
const MUSCLE_WINDOW_DAYS = 21;
/** Effort assumed for a working set with no RPE and no RIR. */
const SET_EFFORT_DEFAULT = 8;

/**
 * RIR-weighted intensity of one set: RPE 10 (RIR 0) = 1.0, RPE 8 = 0.67,
 * RPE 6 = 0.33, RPE ≤ 4 = 0. Linear in proximity to failure.
 */
function setIntensity(s: SetEntry): number {
  const rpe = isNum(s.rpe) && s.rpe > 0 && s.rpe <= 10
    ? s.rpe
    : isNum(s.rir) && s.rir >= 0 && s.rir <= 10
      ? 10 - s.rir
      : SET_EFFORT_DEFAULT;
  return clamp((rpe - 4) / 6, 0, 1);
}

interface StimulusEvent {
  /** Hours before the evaluation instant of the *last* day in the window. */
  hoursBeforeEnd: number;
  muscle: Muscle;
  amount: number;
}

/** Empty per-muscle record with every key present. */
function emptyMuscleMap(): Record<Muscle, number> {
  const out = {} as Record<Muscle, number>;
  for (const m of ALL_MUSCLES) out[m] = 0;
  return out;
}

/**
 * Every muscle stimulus in the window, expressed as hours before the
 * evaluation instant on `asOf`. Negative offsets (a session logged later than
 * the evaluation hour) are clamped to 0 so a workout can never be "in the
 * future" for the decay.
 */
function stimulusEvents(
  workouts: Workout[],
  asOf: ISODate,
  opts: MuscleFatigueOpts | undefined,
): StimulusEvent[] {
  const days = isNum(opts?.days) && opts.days > 0 ? Math.floor(opts.days) : MUSCLE_WINDOW_DAYS;
  const atHour = isNum(opts?.atHour) ? clamp(opts.atHour, 0, 24) : 24;
  const first = addDays(asOf, -(days - 1));
  const custom = opts?.custom ?? [];
  const lookup = opts?.lookup;
  const resolve = (id: string): Exercise | undefined => {
    for (const e of custom) if (e.id === id) return e;
    return lookup ? lookup(id) : undefined;
  };
  const out: StimulusEvent[] = [];
  for (const w of byDate(workouts)) {
    if (!w || w.d < first || w.d > asOf) continue;
    const startMin = hhmmToMinutes(w.start);
    const startHour = startMin === null ? 12 : startMin / 60;
    // Hours from the session start to the evaluation instant on `asOf`.
    const hours = Math.max(0, diffDays(w.d, asOf) * 24 + (atHour - startHour));
    for (const ex of w.exercises ?? []) {
      const def = resolve(ex.exerciseId);
      if (!def) continue;
      const primary = def.muscles?.primary ?? [];
      const secondary = def.muscles?.secondary ?? [];
      if (!primary.length && !secondary.length) continue;
      let stimulus = 0;
      for (const s of ex.sets ?? []) {
        if (!isWorkingSet(s)) continue;
        stimulus += setIntensity(s);
      }
      if (stimulus <= 0) continue;
      for (const m of primary) out.push({ hoursBeforeEnd: hours, muscle: m, amount: stimulus });
      for (const m of secondary) {
        out.push({ hoursBeforeEnd: hours, muscle: m, amount: stimulus * 0.5 });
      }
    }
  }
  return out;
}

/** Daily decayed stimulus per muscle, ascending to `asOf`. */
export function muscleFatigueSeries(
  workouts: Workout[],
  asOf: ISODate,
  opts?: MuscleFatigueOpts,
): MuscleFatiguePoint[] {
  const days = isNum(opts?.days) && opts.days > 0 ? Math.floor(opts.days) : MUSCLE_WINDOW_DAYS;
  const halfLife = isNum(opts?.halfLifeH) && opts.halfLifeH > 0
    ? opts.halfLifeH
    : MUSCLE_HALF_LIFE_H;
  const events = stimulusEvents(workouts, asOf, opts);
  const dates = lastNDates(asOf, days);
  return dates.map((d, i) => {
    // Hours from this day's evaluation instant back to `asOf`'s.
    const lag = (dates.length - 1 - i) * 24;
    const fatigue = emptyMuscleMap();
    for (const e of events) {
      const age = e.hoursBeforeEnd - lag;
      if (age < 0) continue; // Session had not happened yet on this day.
      fatigue[e.muscle] += e.amount * Math.pow(0.5, age / halfLife);
    }
    for (const m of ALL_MUSCLES) fatigue[m] = round(fatigue[m], 3);
    return { d, fatigue };
  });
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
 * which is what a fresh install genuinely is. The same is true when no
 * exercise `lookup` is injected: nothing can be attributed, so nothing is.
 */
export function muscleReadiness(
  workouts: Workout[],
  asOf: ISODate,
  opts?: MuscleFatigueOpts,
): MuscleReadiness[] {
  const halfLife = isNum(opts?.halfLifeH) && opts.halfLifeH > 0
    ? opts.halfLifeH
    : MUSCLE_HALF_LIFE_H;
  const events = stimulusEvents(workouts, asOf, opts);
  const fatigue = emptyMuscleMap();
  const last: Partial<Record<Muscle, number>> = {};
  for (const e of events) {
    fatigue[e.muscle] += e.amount * Math.pow(0.5, e.hoursBeforeEnd / halfLife);
    const prev = last[e.muscle];
    if (prev === undefined || e.hoursBeforeEnd < prev) last[e.muscle] = e.hoursBeforeEnd;
  }
  return ALL_MUSCLES.map((muscle) => {
    const pct = clamp(100 * (1 - fatigue[muscle] / MUSCLE_FATIGUE_FULL), 0, 100);
    const h = last[muscle];
    return {
      muscle,
      pct: Math.round(pct),
      hoursSince: h === undefined ? null : round(h, 1),
    };
  });
}
