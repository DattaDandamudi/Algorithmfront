/**
 * §1e Strength analysis — e1RM, PRs, plateaus, weekly volume, balance and
 * progression.
 *
 * No wearable analyses lifting, which is where this app can be plainly better
 * than WHOOP/Oura/Fitbit for the persona. Everything is pure and clock-free
 * (`asOf` is a parameter) and all loads are **kilograms** internally —
 * display conversion belongs to the screens, never to the engine.
 *
 * ## e1RM, chosen by rep range (LeSuer 1997)
 *
 *   Epley    `w·(1 + r/30)`            best 7–10 reps
 *   Brzycki  `36w/(37 − r)`            best ≤ 6 reps
 *   Wathan   `100w/(48.8 + 53.8·e^{−0.075r})`   best 11–15 reps
 *
 * LeSuer et al. (1997) measured the error of each formula against a tested 1RM
 * and it grows materially past 10 reps, so **`setE1rm` returns null above 15**
 * — a 20-rep back-off set no longer drags the strength trend. When RPE or RIR
 * is logged, the formula estimate is blended 50/50 with the RPE-table estimate
 * (`w / (RPE_TABLE[reps + RIR − 1] / 100)`, Zourdos 2016 / Helms), and the
 * chosen formula is named so the set's tooltip can show it.
 *
 * ## Volume: advisory bands, never caps
 *
 * The 2025 *Sports Medicine* meta-regression found hypertrophy keeps rising
 * with weekly sets with no clear plateau, and MRV has no RCT support. So
 * `volumeStatus` returns `below-mev | building | productive | high` — there is
 * deliberately **no "exceeded — cut" state**, the copy reads "more than most
 * people need to grow" rather than a prohibition, and nothing in this module
 * removes a set because a landmark was crossed. `suggestProgression` does not
 * even take the landmarks as an argument, which is the cheapest possible proof
 * of that rule; only fatigue signals (readiness, form, muscle readiness,
 * plateau) reduce anything.
 *
 * ## Progression (`suggestProgression`)
 *
 * Double progression on the session's target rep range and RPE window:
 * - all sets at the top of the range and RPE ≤ target → **+2.5% upper body,
 *   +5% lower body** (a single 2.5% notch under-loads squats and deadlifts),
 *   floored at the equipment's smallest real increment by `roundLoad`;
 * - RPE ≥ 9.5 or ≥ 2 missed sets → −5%;
 * - otherwise hold the load and add a rep;
 * - red readiness → −7.5% **and** one fewer set; yellow → hold;
 * - `muscleReadiness < 60%` → hold, with the hours since that muscle's last
 *   stimulus in the reason;
 * - `formBand === 'overreached'` → hold. **ACWR alone never triggers this**
 *   (Impellizzeri 2020; see `load.ts`).
 * Every suggestion carries a `reason` written in the user's terms — the point
 * is a lifter who can argue with the app, not one who obeys it.
 *
 * ## Deloads stay reactive
 *
 * Coleman 2024 (PeerJ) found a scheduled mid-program deload produced no
 * hypertrophy benefit, so `deloadCheck` never puts one on the calendar: it
 * fires only on ≥ 2 of {overreached form, plateau with rising RPE, red-readiness
 * streak, ≥ 4 accumulation weeks} and recommends −40% sets / −10% load for a
 * week. The copy cites Coleman when it declines to schedule one.
 *
 * ## Constants that are ours, not the literature's
 *
 * `RED_STREAK_DAYS` (3), `PLATEAU_RPE_RISE` (0.5) and the `LOAD_INCREMENT_*`
 * tables are **heuristics** — plausible gym numbers with no trial behind them.
 * They are exported so the copy can say so.
 */
import { addDays, weekdayOf } from '../lib/dates';
import { kgToLb, lbToKg } from '../lib/format';
import type {
  Band,
  Equipment,
  Exercise,
  FormBand,
  ISODate,
  Muscle,
  MuscleVolume,
  PersonalRecord,
  PlannedExercise,
  Plateau,
  Program,
  SessionType,
  SetEntry,
  TrainingSettings,
  VolumeLandmark,
  VolumeStatus,
  Workout,
} from '../data/types';
import { MUSCLES, exerciseById } from './exerciseDb';
import { ewma, linreg } from './stats';

/**
 * %1RM by `reps + RIR − 1` (0-indexed): a 1-rep set at RIR 0 is 100%, an
 * 8-rep set at RPE 8 (RIR 2) reads `RPE_TABLE[9] = 73.9%`. The standard
 * RPE/RIR chart, exported so the UI can show the same numbers the engine used.
 */
export const RPE_TABLE: readonly number[] = [
  100, 95.5, 92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9, 71.7, 69.4, 67.3, 65.3, 63.4, 61.5,
];

/** Above this rep count every e1RM formula is unreliable (LeSuer 1997). */
export const E1RM_MAX_REPS = 15;
/** A PR must beat the previous best by more than this (1%) to count as one. */
export const PR_THRESHOLD = 1.01;

/** Rep-range boundaries of the formula auto-selection (LeSuer 1997). */
export const BRZYCKI_MAX_REPS = 6;
export const EPLEY_MAX_REPS = 10;

/** Progression steps, % of the working load. Upper/lower come from settings. */
export const REDUCE_PCT_HARD = 5;
/** Red readiness cuts harder than a failed session and drops a set as well. */
export const REDUCE_PCT_RED = 7.5;
/** Below this muscle-readiness % the exercise holds instead of progressing. */
export const MUSCLE_READY_MIN_PCT = 60;
/** RPE at or above this on the last session means back off, not hold. */
export const RPE_BACKOFF = 9.5;
/** Missed sets that force a back-off. */
export const MISSED_SETS_BACKOFF = 2;

/** Push:pull and squat:hinge are called balanced inside this band. */
export const BALANCE_MIN = 0.67;
export const BALANCE_MAX = 1.5;

/** Plateau thresholds (plan §1e). */
export const PLATEAU_DAYS = 21;
export const PLATEAU_MIN_SESSIONS = 4;
export const PLATEAU_MAX_GAIN_PCT = 1;
export const PLATEAU_RPE_RISE = 0.5;

/**
 * Consecutive red-readiness days that count as one deload trigger. **Our
 * heuristic** — no trial defines "a red streak" — exposed so the copy can say
 * "three red days in a row" rather than implying a citation.
 */
export const RED_STREAK_DAYS = 3;
/** Accumulation weeks that count as one deload trigger (plan §1e). */
export const DELOAD_ACCUMULATION_WEEKS = 4;
/** What a reactive deload week looks like. */
export const DELOAD_SET_CUT_PCT = 40;
export const DELOAD_LOAD_CUT_PCT = 10;

/**
 * Why the app will never schedule a deload for you. Coleman et al. (2024,
 * PeerJ) ran a planned mid-program deload against straight-through training
 * and found no hypertrophy benefit, so a deload here is always a response to
 * something the data actually shows.
 */
export const DELOAD_SCHEDULE_NOTE =
  'No deload scheduled. A planned mid-program deload produced no extra muscle in Coleman 2024 (PeerJ), ' +
  'so this app only calls one when your own signals ask for it.';

// ---------------------------------------------------------------------------
// Estimated 1RM
// ---------------------------------------------------------------------------

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** A load/rep pair that can produce an e1RM at all. */
function usableSet(weightKg: number, reps: number): boolean {
  return finite(weightKg) && finite(reps) && weightKg > 0 && reps >= 1;
}

/** Epley: `w·(1 + r/30)`. Null for a non-positive load/rep count. */
export function e1rmEpley(weightKg: number, reps: number): number | null {
  if (!usableSet(weightKg, reps)) return null;
  const v = weightKg * (1 + reps / 30);
  return finite(v) ? v : null;
}

/** Brzycki: `36w/(37 − r)`. Null at r ≥ 37 (the formula's pole) or bad input. */
export function e1rmBrzycki(weightKg: number, reps: number): number | null {
  if (!usableSet(weightKg, reps)) return null;
  if (reps >= 37) return null;
  const v = (36 * weightKg) / (37 - reps);
  return finite(v) ? v : null;
}

/** Wathan: `100w/(48.8 + 53.8·e^{−0.075r})`. */
export function e1rmWathan(weightKg: number, reps: number): number | null {
  if (!usableSet(weightKg, reps)) return null;
  const v = (100 * weightKg) / (48.8 + 53.8 * Math.exp(-0.075 * reps));
  return finite(v) ? v : null;
}

export interface E1rmEstimate {
  /** kg; null for warm-ups, skipped sets, bodyweight or > 15 reps. */
  value: number | null;
  /** Which formula was chosen — named in the set's tooltip. */
  formula: 'brzycki' | 'epley' | 'wathan' | 'rpe' | 'blend' | null;
}

/** Human label for a formula, for the tooltip. */
export function formulaLabel(f: E1rmEstimate['formula']): string {
  switch (f) {
    case 'brzycki':
      return 'Brzycki';
    case 'epley':
      return 'Epley';
    case 'wathan':
      return 'Wathan';
    case 'rpe':
      return 'RPE chart';
    case 'blend':
      return 'formula + RPE chart';
    default:
      return '—';
  }
}

/** RIR implied by a set: explicit `rir` wins, else `10 − rpe`. */
function ripOf(set: SetEntry): number | null {
  if (finite(set.rir) && set.rir >= 0) return set.rir;
  if (finite(set.rpe) && set.rpe > 0 && set.rpe <= 10) return 10 - set.rpe;
  return null;
}

/** RPE implied by a set (the inverse of `ripOf`), for averages and rules. */
function rpeOf(set: SetEntry): number | null {
  if (finite(set.rpe) && set.rpe > 0) return set.rpe;
  if (finite(set.rir) && set.rir >= 0) return 10 - set.rir;
  return null;
}

/**
 * %1RM from the RPE table at a (possibly fractional) `reps + RIR − 1` index.
 * RPE is logged in half steps, so index 9.5 is real and is interpolated
 * linearly between the two neighbouring rows rather than rounded away.
 */
export function rpeTablePct(reps: number, rir: number): number | null {
  if (!finite(reps) || !finite(rir) || reps < 1 || rir < 0) return null;
  const idx = reps + rir - 1;
  if (idx < 0) return null;
  if (idx > RPE_TABLE.length - 1) return null;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return RPE_TABLE[lo];
  return RPE_TABLE[lo] + (RPE_TABLE[hi] - RPE_TABLE[lo]) * (idx - lo);
}

/** True for sets that are evidence of strength (not warm-ups, not skipped). */
function isWorking(set: SetEntry): boolean {
  return set.k !== 'wu' && set.x !== true;
}

/**
 * e1RM for one set, auto-selecting the formula by rep range and blending with
 * the RPE table when RPE/RIR is logged. Warm-up (`k === 'wu'`) and skipped
 * (`x`) sets return null: they are not evidence of strength.
 */
export function setE1rm(set: SetEntry): E1rmEstimate {
  const none: E1rmEstimate = { value: null, formula: null };
  if (!set || !isWorking(set)) return none;
  const w = set.w;
  const r = set.r;
  if (!usableSet(w, r)) return none;
  // LeSuer 1997: past 15 reps every formula's error swamps the signal, so a
  // 20-rep back-off set contributes nothing rather than dragging the trend.
  if (r > E1RM_MAX_REPS) return none;

  let formula: E1rmEstimate['formula'];
  let base: number | null;
  if (r <= BRZYCKI_MAX_REPS) {
    formula = 'brzycki';
    base = e1rmBrzycki(w, r);
  } else if (r <= EPLEY_MAX_REPS) {
    formula = 'epley';
    base = e1rmEpley(w, r);
  } else {
    formula = 'wathan';
    base = e1rmWathan(w, r);
  }
  if (base === null) return none;

  const rir = ripOf(set);
  if (rir !== null) {
    const pct = rpeTablePct(r, rir);
    if (pct !== null && pct > 0) {
      const fromRpe = (w * 100) / pct;
      if (finite(fromRpe)) return { value: round((base + fromRpe) / 2, 1), formula: 'blend' };
    }
  }
  return { value: round(base, 1), formula };
}

// ---------------------------------------------------------------------------
// Shared workout walking
// ---------------------------------------------------------------------------

/** Workouts on or before `asOf` and on or after `from`, ascending by date. */
function inWindow(workouts: Workout[] | undefined, from: ISODate, asOf: ISODate): Workout[] {
  return (workouts ?? [])
    .filter((w) => !!w && typeof w.d === 'string' && w.d >= from && w.d <= asOf)
    .slice()
    .sort((a, b) => (a.d !== b.d ? (a.d < b.d ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

interface SetRef {
  d: ISODate;
  exerciseId: string;
  set: SetEntry;
}

/** Every working set in the window, ascending, warm-ups and skips removed. */
function workingSets(workouts: Workout[], from: ISODate, asOf: ISODate, exerciseId?: string): SetRef[] {
  const out: SetRef[] = [];
  for (const w of inWindow(workouts, from, asOf)) {
    for (const we of w.exercises ?? []) {
      if (!we || (exerciseId !== undefined && we.exerciseId !== exerciseId)) continue;
      for (const s of we.sets ?? []) {
        if (s && isWorking(s) && finite(s.w) && finite(s.r) && s.r > 0) {
          out.push({ d: w.d, exerciseId: we.exerciseId, set: s });
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-exercise history
// ---------------------------------------------------------------------------

export interface ExerciseSessionPoint {
  d: ISODate;
  /** Best e1RM of the session, kg. */
  best: number | null;
  /** EWMA of `best`, α = 0.3 — the trend the Analysis chart draws. */
  ewma: number | null;
  /** Σ w·r over working sets, kg·reps. */
  volumeKg: number;
  /** Mean RPE across working sets; null when none was logged. */
  meanRpe: number | null;
  /** Working sets performed. */
  sets: number;
  topSet: { w: number; r: number; rpe?: number } | null;
}

export interface ExerciseHistory {
  exerciseId: string;
  name: string;
  /** Ascending, one entry per session that contained the exercise. */
  points: ExerciseSessionPoint[];
  latest: ExerciseSessionPoint | null;
  /** All-time best e1RM in the window, kg. */
  best: number | null;
  nSessions: number;
}

export interface ExerciseHistoryOpts {
  /** `settings.training.customExercises`, for naming and muscle mapping. */
  custom?: readonly Exercise[];
  /** Days of history; default 180. */
  days?: number;
}

/** EWMA smoothing of the per-session best e1RM (plan §1e). */
export const E1RM_EWMA_ALPHA = 0.3;

/** Per-session bests for one exercise between `from` and `asOf`, ascending. */
function sessionPoints(
  workouts: Workout[],
  exerciseId: string,
  from: ISODate,
  asOf: ISODate,
): ExerciseSessionPoint[] {
  const byDay = new Map<ISODate, SetRef[]>();
  for (const ref of workingSets(workouts, from, asOf, exerciseId)) {
    const list = byDay.get(ref.d);
    if (list) list.push(ref);
    else byDay.set(ref.d, [ref]);
  }
  const days = [...byDay.keys()].sort();
  const points: ExerciseSessionPoint[] = days.map((d) => {
    const refs = byDay.get(d) ?? [];
    let best: number | null = null;
    let volumeKg = 0;
    let rpeSum = 0;
    let rpeN = 0;
    let top: { w: number; r: number; rpe?: number } | null = null;
    let topE1rm = -Infinity;
    for (const { set } of refs) {
      volumeKg += set.w * set.r;
      const rpe = rpeOf(set);
      if (rpe !== null) {
        rpeSum += rpe;
        rpeN += 1;
      }
      const est = setE1rm(set).value;
      if (est !== null && (best === null || est > best)) best = est;
      // The "top set" is the one that reads heaviest: by e1RM when we have it,
      // else by load then reps, so a bodyweight session still shows something.
      const rank = est ?? set.w * 1000 + set.r;
      if (rank > topE1rm) {
        topE1rm = rank;
        top = rpe !== null ? { w: set.w, r: set.r, rpe } : { w: set.w, r: set.r };
      }
    }
    return {
      d,
      best,
      ewma: null,
      volumeKg: round(volumeKg, 1),
      meanRpe: rpeN > 0 ? round(rpeSum / rpeN, 2) : null,
      sets: refs.length,
      topSet: top,
    };
  });
  const smoothed = ewma(points.map((p) => p.best), E1RM_EWMA_ALPHA);
  points.forEach((p, i) => {
    const v = smoothed[i];
    p.ewma = v === null ? null : round(v, 1);
  });
  return points;
}

/** Per-session bests for one exercise, ascending to `asOf`. */
export function exerciseHistory(
  workouts: Workout[],
  exerciseId: string,
  asOf: ISODate,
  opts?: ExerciseHistoryOpts,
): ExerciseHistory {
  const name = exerciseById(exerciseId, opts?.custom)?.name ?? exerciseId;
  const days = finite(opts?.days) && (opts?.days ?? 0) > 0 ? Math.floor(opts?.days as number) : 180;
  const from = addDays(asOf, -(days - 1));
  const points = sessionPoints(workouts ?? [], exerciseId, from, asOf);
  let best: number | null = null;
  for (const p of points) if (p.best !== null && (best === null || p.best > best)) best = p.best;
  return {
    exerciseId,
    name,
    points,
    latest: points.length ? points[points.length - 1] : null,
    best,
    nSessions: points.length,
  };
}

export interface PrOpts {
  custom?: readonly Exercise[];
  /** Window to report PRs from; default 7 days (Today's "PRs this week"). */
  days?: number;
  /** History searched for the previous best; default 365 days. */
  lookbackDays?: number;
}

const PR_KIND_ORDER: PersonalRecord['kind'][] = ['e1rm', 'weight', 'reps'];

/**
 * PRs set in the window: heaviest weight, most reps at a weight, and best
 * e1RM, each needing to beat the previous best by `PR_THRESHOLD` (1%) so
 * rounding noise never triggers a celebration.
 *
 * An exercise with no earlier history sets no PR — the first session is the
 * baseline, and "you PR'd 8 lifts" on day one is noise, not a celebration.
 */
export function detectPRs(workouts: Workout[], asOf: ISODate, opts?: PrOpts): PersonalRecord[] {
  const days = finite(opts?.days) && (opts?.days ?? 0) > 0 ? Math.floor(opts?.days as number) : 7;
  const lookback =
    finite(opts?.lookbackDays) && (opts?.lookbackDays ?? 0) > 0 ? Math.floor(opts?.lookbackDays as number) : 365;
  const windowStart = addDays(asOf, -(days - 1));
  const histStart = addDays(asOf, -(lookback - 1));
  const all = workingSets(workouts ?? [], histStart, asOf);

  const byExercise = new Map<string, SetRef[]>();
  for (const ref of all) {
    const list = byExercise.get(ref.exerciseId);
    if (list) list.push(ref);
    else byExercise.set(ref.exerciseId, [ref]);
  }

  const out: PersonalRecord[] = [];
  for (const [exerciseId, refs] of [...byExercise.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const prior = refs.filter((r) => r.d < windowStart);
    const recent = refs.filter((r) => r.d >= windowStart);
    if (prior.length === 0 || recent.length === 0) continue;
    const name = exerciseById(exerciseId, opts?.custom)?.name ?? exerciseId;

    // Heaviest weight.
    const priorWeight = Math.max(...prior.map((r) => r.set.w));
    let bestWeight: SetRef | null = null;
    for (const r of recent) if (!bestWeight || r.set.w > bestWeight.set.w) bestWeight = r;
    if (bestWeight && priorWeight > 0 && bestWeight.set.w > priorWeight * PR_THRESHOLD) {
      out.push({ exerciseId, name, kind: 'weight', value: round(bestWeight.set.w, 2), previous: round(priorWeight, 2), d: bestWeight.d });
    }

    // Best e1RM.
    const priorE1rm = prior.reduce<number>((m, r) => Math.max(m, setE1rm(r.set).value ?? 0), 0);
    let bestE1rm: { ref: SetRef; v: number } | null = null;
    for (const r of recent) {
      const v = setE1rm(r.set).value;
      if (v !== null && (!bestE1rm || v > bestE1rm.v)) bestE1rm = { ref: r, v };
    }
    if (bestE1rm && priorE1rm > 0 && bestE1rm.v > priorE1rm * PR_THRESHOLD) {
      out.push({ exerciseId, name, kind: 'e1rm', value: round(bestE1rm.v, 1), previous: round(priorE1rm, 1), d: bestE1rm.ref.d });
    }

    // Most reps at a weight the user has lifted before.
    const key = (w: number) => w.toFixed(2);
    const priorReps = new Map<string, number>();
    for (const r of prior) priorReps.set(key(r.set.w), Math.max(priorReps.get(key(r.set.w)) ?? 0, r.set.r));
    let repPr: { ref: SetRef; previous: number } | null = null;
    for (const r of recent) {
      const was = priorReps.get(key(r.set.w));
      if (was === undefined || was <= 0) continue;
      if (r.set.r <= was * PR_THRESHOLD) continue;
      // Report the heaviest rep PR; a tie goes to the bigger jump.
      if (
        !repPr ||
        r.set.w > repPr.ref.set.w ||
        (r.set.w === repPr.ref.set.w && r.set.r - was > repPr.ref.set.r - repPr.previous)
      ) {
        repPr = { ref: r, previous: was };
      }
    }
    if (repPr) {
      out.push({ exerciseId, name, kind: 'reps', value: repPr.ref.set.r, previous: repPr.previous, d: repPr.ref.d });
    }
  }

  return out.sort((a, b) => {
    if (a.d !== b.d) return a.d < b.d ? 1 : -1; // newest first
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return PR_KIND_ORDER.indexOf(a.kind) - PR_KIND_ORDER.indexOf(b.kind);
  });
}

export interface PlateauOpts {
  custom?: readonly Exercise[];
  /** Window; default 21 days. */
  days?: number;
  /** Sessions needed in the window before a plateau can be called; default 4. */
  minSessions?: number;
}

/**
 * Exercises trained ≥ 4× in 21 days whose e1RM EWMA gained ≤ 1% while mean RPE
 * rose ≥ 0.5 — working harder for the same result, which is the only version
 * of "stalled" worth telling someone about.
 *
 * The RPE trend is the least-squares rise across the whole window
 * (`slope × (n − 1)`), so one grumpy Tuesday does not call a plateau.
 */
export function detectPlateau(
  workouts: Workout[],
  asOf: ISODate,
  opts?: PlateauOpts,
): Plateau[] {
  const days = finite(opts?.days) && (opts?.days ?? 0) > 0 ? Math.floor(opts?.days as number) : PLATEAU_DAYS;
  const minSessions =
    finite(opts?.minSessions) && (opts?.minSessions ?? 0) > 0
      ? Math.floor(opts?.minSessions as number)
      : PLATEAU_MIN_SESSIONS;
  const from = addDays(asOf, -(days - 1));
  const ids = new Set(workingSets(workouts ?? [], from, asOf).map((r) => r.exerciseId));

  const out: Plateau[] = [];
  for (const exerciseId of [...ids].sort()) {
    const points = sessionPoints(workouts ?? [], exerciseId, from, asOf);
    if (points.length < minSessions) continue;
    const trend = points.map((p) => p.ewma).filter((v): v is number => v !== null);
    if (trend.length < 2) continue;
    const first = trend[0];
    const last = trend[trend.length - 1];
    if (!(first > 0)) continue;
    const gainPct = ((last - first) / first) * 100;
    if (gainPct > PLATEAU_MAX_GAIN_PCT) continue;

    const rpes = points.map((p) => p.meanRpe);
    const fit = linreg(points.map((_, i) => i), rpes);
    const n = rpes.filter((v) => v !== null).length;
    if (!fit || n < 2) continue;
    const rpeTrend = fit.slope * (points.length - 1);
    if (rpeTrend < PLATEAU_RPE_RISE) continue;

    out.push({
      exerciseId,
      name: exerciseById(exerciseId, opts?.custom)?.name ?? exerciseId,
      sessions: points.length,
      gainPct: round(gainPct, 2),
      rpeTrend: round(rpeTrend, 2),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Volume and balance
// ---------------------------------------------------------------------------

export interface WeeklySetsOpts {
  custom?: readonly Exercise[];
  /** Week to count; default the Mon–Sun week containing `asOf`. */
  weekStart?: ISODate;
}

/** Monday of the week containing `d` (weeks run Mon–Sun). */
export function weekStartMonday(d: ISODate): ISODate {
  const wd = weekdayOf(d); // 0 = Sunday
  return addDays(d, -((wd + 6) % 7));
}

/** A secondary muscle earns half a set (plan §1e). */
export const SECONDARY_SET_WEIGHT = 0.5;

/**
 * Weekly hard sets per muscle: **1 per primary muscle, 0.5 per secondary,
 * warm-ups excluded**, with each muscle's landmark band and status attached.
 * Returns all 15 muscles so the grid never has holes.
 */
export function weeklySetsByMuscle(
  workouts: Workout[],
  asOf: ISODate,
  landmarks: Record<Muscle, VolumeLandmark>,
  opts?: WeeklySetsOpts,
): MuscleVolume[] {
  const start = opts?.weekStart ?? weekStartMonday(asOf);
  const end = addDays(start, 6);
  const totals = new Map<Muscle, number>();
  for (const m of MUSCLES) totals.set(m, 0);

  for (const ref of workingSets(workouts ?? [], start, end)) {
    const e = exerciseById(ref.exerciseId, opts?.custom);
    if (!e) continue;
    for (const m of e.muscles?.primary ?? []) totals.set(m, (totals.get(m) ?? 0) + 1);
    for (const m of e.muscles?.secondary ?? []) totals.set(m, (totals.get(m) ?? 0) + SECONDARY_SET_WEIGHT);
  }

  return MUSCLES.map((muscle) => {
    const band = landmarks?.[muscle] ?? { mev: 0, mav: 0, mrv: 0 };
    const sets = round(totals.get(muscle) ?? 0, 1);
    return {
      muscle,
      sets,
      mev: band.mev,
      mav: band.mav,
      mrv: band.mrv,
      status: volumeStatus(sets, band),
    };
  });
}

/**
 * Where a weekly set count sits against a muscle's landmarks:
 * `< mev` → below-mev, `< mav` → building, `≤ mrv` → productive, above → high.
 * There is deliberately no "too much" state — see the module header. `high`
 * means "more than most people need to grow", not "cut it".
 */
export function volumeStatus(sets: number, landmark: VolumeLandmark): VolumeStatus {
  const s = finite(sets) ? sets : 0;
  const mev = finite(landmark?.mev) ? landmark.mev : 0;
  const mav = finite(landmark?.mav) ? landmark.mav : mev;
  const mrv = finite(landmark?.mrv) ? landmark.mrv : mav;
  // Zero sets is never "building", even for a muscle whose MEV is 0.
  if (s <= 0 || s < mev) return 'below-mev';
  if (s < mav) return 'building';
  if (s <= mrv) return 'productive';
  return 'high';
}

/**
 * Why a crossed landmark is never an instruction. Exported so the Train screen
 * and the coach say the same thing the engine does.
 */
export const VOLUME_ADVISORY_NOTE =
  'Volume landmarks are advisory bands, not caps. The 2025 Sports Medicine meta-regression found hypertrophy ' +
  'keeps rising with weekly sets with no clear plateau, and MRV has no trial support — so nothing here takes ' +
  'sets away because you crossed a line. Only fatigue does that.';

/** User-facing wording for a volume band. Note that `high` is not a warning. */
export function volumeStatusLabel(status: VolumeStatus): string {
  switch (status) {
    case 'below-mev':
      return 'below the volume most people need to grow';
    case 'building':
      return 'building';
    case 'productive':
      return 'productive';
    case 'high':
      return 'more than most people need to grow';
    default:
      return '';
  }
}

/**
 * Push:pull and squat:hinge set ratios over the trailing 28 days, from the
 * movement patterns. Outside 0.67–1.5 is flagged by the caller as an
 * imbalance; null when either side has no sets (a ratio against zero is not a
 * finding).
 *
 * Push is `push-h + push-v`, pull is `pull-h + pull-v`, and squat/hinge are
 * literal — lunges are single-leg work rather than the squat side of the
 * ratio the UI labels "squat : hinge".
 */
export function balanceRatios(
  workouts: Workout[],
  asOf: ISODate,
  opts?: WeeklySetsOpts & { days?: number },
): { pushPull: number | null; squatHinge: number | null } {
  const days = finite(opts?.days) && (opts?.days ?? 0) > 0 ? Math.floor(opts?.days as number) : 28;
  const from = addDays(asOf, -(days - 1));
  let push = 0;
  let pull = 0;
  let squat = 0;
  let hinge = 0;
  for (const ref of workingSets(workouts ?? [], from, asOf)) {
    const e = exerciseById(ref.exerciseId, opts?.custom);
    if (!e) continue;
    if (e.pattern === 'push-h' || e.pattern === 'push-v') push += 1;
    else if (e.pattern === 'pull-h' || e.pattern === 'pull-v') pull += 1;
    if (e.pattern === 'squat') squat += 1;
    else if (e.pattern === 'hinge') hinge += 1;
  }
  return {
    pushPull: push > 0 && pull > 0 ? round(push / pull, 2) : null,
    squatHinge: squat > 0 && hinge > 0 ? round(squat / hinge, 2) : null,
  };
}

/** True when a ratio sits inside the balanced band (or is unknown). */
export function isBalancedRatio(ratio: number | null): boolean {
  if (ratio === null || !finite(ratio)) return true;
  return ratio >= BALANCE_MIN && ratio <= BALANCE_MAX;
}

// ---------------------------------------------------------------------------
// Progression and deloads
// ---------------------------------------------------------------------------

/**
 * Smallest real load step per equipment, kg. **Heuristic** — it is what gyms
 * actually stock (a 1.25 kg plate pair on a bar, 2 kg dumbbell jumps, 5 kg
 * stack plates), not a measured constant.
 */
export const LOAD_INCREMENT_KG: Record<Equipment, number> = {
  barbell: 2.5,
  dumbbell: 2,
  machine: 5,
  cable: 2.5,
  kettlebell: 4,
  band: 1,
  bodyweight: 1,
  other: 1,
};

/** The same increments in pounds, for a gym that plates in lb. */
export const LOAD_INCREMENT_LB: Record<Equipment, number> = {
  barbell: 5,
  dumbbell: 5,
  machine: 10,
  cable: 5,
  kettlebell: 5,
  band: 2.5,
  bodyweight: 2.5,
  other: 2.5,
};

/** The smallest step for this equipment, expressed in kg. */
export function loadIncrementKg(equipment: Equipment, units: 'lb' | 'kg'): number {
  return units === 'lb'
    ? lbToKg(LOAD_INCREMENT_LB[equipment] ?? LOAD_INCREMENT_LB.other)
    : LOAD_INCREMENT_KG[equipment] ?? LOAD_INCREMENT_KG.other;
}

/**
 * Round a suggested load to something the user can actually put on the bar:
 * the smallest real increment for that equipment in their display units
 * (2.5 kg / 5 lb barbell pairs, 2 kg dumbbells, machine stacks, …). A
 * suggestion of 61.3 kg is a suggestion nobody can follow.
 */
export function roundLoad(kg: number, equipment: Equipment, units: 'lb' | 'kg'): number {
  if (!finite(kg) || kg <= 0) return 0;
  if (units === 'lb') {
    const step = LOAD_INCREMENT_LB[equipment] ?? LOAD_INCREMENT_LB.other;
    return round(lbToKg(Math.round(kgToLb(kg) / step) * step), 3);
  }
  const step = LOAD_INCREMENT_KG[equipment] ?? LOAD_INCREMENT_KG.other;
  return round(Math.round(kg / step) * step, 3);
}

/**
 * Apply a percentage step and land on a real load. The step is **floored at
 * one increment**: +2.5% of a 40 kg press rounds to nothing on a 2.5 kg grid,
 * and "same weight again" dressed up as progress is worse than an honest jump.
 */
function steppedLoad(base: number, pct: number, equipment: Equipment, units: 'lb' | 'kg'): number {
  const step = loadIncrementKg(equipment, units);
  const rounded = roundLoad(base * (1 + pct / 100), equipment, units);
  if (pct > 0 && rounded <= base) return roundLoad(base + step, equipment, units);
  if (pct < 0 && rounded >= base) return roundLoad(Math.max(0, base - step), equipment, units);
  return rounded;
}

const LOWER_PATTERNS = new Set(['squat', 'hinge', 'lunge']);
const LOWER_MUSCLES = new Set<Muscle>(['quads', 'hamstrings', 'glutes', 'calves']);

/**
 * Which load step an exercise takes. Lower body moves in 5% notches, upper in
 * 2.5%: a single small step under-loads squats and deadlifts, where 2.5% is
 * often less than the smallest plate pair anyway.
 */
export function bodyRegion(e: Exercise | null | undefined): 'upper' | 'lower' {
  if (!e) return 'upper';
  if (LOWER_PATTERNS.has(e.pattern)) return 'lower';
  const primary = e.muscles?.primary ?? [];
  if (primary.length > 0 && primary.every((m) => LOWER_MUSCLES.has(m))) return 'lower';
  return 'upper';
}

/**
 * Per-muscle recovery as `load.muscleReadiness` reports it. Declared here
 * structurally rather than imported so `strength` never depends on `load`
 * (cross-module contract, Phase 1 brief); `load.MuscleReadiness[]` is
 * assignable to it.
 */
export interface MuscleReadinessInput {
  muscle: Muscle;
  /** 0–100%: 100 = fully recovered / never trained in the window. */
  pct: number;
  /** Hours since the last stimulus; null when there is none in the window. */
  hoursSince: number | null;
}

export interface ProgressionInput {
  /** The program supplying today's session (the active one, or the built-in). */
  program: Program;
  /** Which split slot today is. `rest` yields an empty plan. */
  session: SessionType;
  workouts: Workout[];
  asOf: ISODate;
  training: TrainingSettings;
  /** Today's readiness band — red reduces, yellow holds. */
  readinessBand?: Band | null;
  /** `overreached` holds loads; ACWR alone never does. */
  formBand?: FormBand | null;
  /** From `load.muscleReadiness`; below 60% holds the affected exercises. */
  muscleReadiness?: readonly MuscleReadinessInput[];
}

interface LastPerformance {
  d: ISODate;
  loadKg: number;
  reps: number[];
  rpe: number | null;
  missed: number;
  sets: number;
}

/** The most recent session containing `exerciseId`, at or before `asOf`. */
function lastPerformance(workouts: Workout[], exerciseId: string, asOf: ISODate): LastPerformance | null {
  const sorted = (workouts ?? [])
    .filter((w) => !!w && typeof w.d === 'string' && w.d <= asOf)
    .slice()
    .sort((a, b) => (a.d !== b.d ? (a.d < b.d ? 1 : -1) : a.id < b.id ? 1 : -1)); // newest first
  for (const w of sorted) {
    for (const we of w.exercises ?? []) {
      if (!we || we.exerciseId !== exerciseId) continue;
      const all = we.sets ?? [];
      const working = all.filter((s) => s && isWorking(s) && finite(s.w) && finite(s.r));
      if (working.length === 0) continue;
      let top = working[0];
      for (const s of working) if (s.w > top.w || (s.w === top.w && s.r > top.r)) top = s;
      let rpe: number | null = null;
      for (const s of working) {
        const v = rpeOf(s);
        if (v !== null && (rpe === null || v > rpe)) rpe = v;
      }
      const skipped = all.filter((s) => s && s.k !== 'wu' && s.x === true).length;
      return {
        d: w.d,
        loadKg: top.w,
        reps: working.map((s) => s.r),
        rpe,
        missed: skipped,
        sets: working.length,
      };
    }
  }
  return null;
}

/**
 * Today's planned exercises with a suggested load, a mode
 * (`progress | hold | reduce`) and the reason for each — the Train Today view
 * and the coach's "What should I lift today?" answer read the same list.
 *
 * **No landmark is an input here.** `volumeLandmarks` never reaches a set
 * count or a load: only readiness, form, muscle readiness and the previous
 * session's performance move a number. Hypertrophy keeps rising with weekly
 * sets (2025 *Sports Medicine* meta-regression) and MRV has no RCT support, so
 * "you crossed MRV" is not a reason to take work away from someone.
 */
export function suggestProgression(input: ProgressionInput): PlannedExercise[] {
  const { program, session, asOf } = input ?? ({} as ProgressionInput);
  if (!program || session === 'rest') return [];
  const planned = program.sessions?.[session] ?? [];
  if (planned.length === 0) return [];

  const training = input.training;
  const custom = training?.customExercises;
  const units: 'lb' | 'kg' = training?.units === 'kg' ? 'kg' : 'lb';
  const stepUpper = finite(training?.progression?.loadStepPctUpper) ? training.progression.loadStepPctUpper : 2.5;
  const stepLower = finite(training?.progression?.loadStepPctLower) ? training.progression.loadStepPctLower : 5;
  const targetRpe = training?.progression?.targetRpe;
  const rpeCeiling = finite(targetRpe?.[1]) ? (targetRpe as [number, number])[1] : 8;
  const workouts = input.workouts ?? [];

  const readyByMuscle = new Map<Muscle, MuscleReadinessInput>();
  for (const m of input.muscleReadiness ?? []) if (m) readyByMuscle.set(m.muscle, m);

  return planned.map((pe): PlannedExercise => {
    const e = exerciseById(pe.exerciseId, custom);
    const name = e?.name ?? pe.exerciseId;
    const equipment: Equipment = e?.equipment ?? 'barbell';
    const region = bodyRegion(e);
    const stepPct = region === 'lower' ? stepLower : stepUpper;
    const repsTop = pe.reps?.[1] ?? 10;
    const repsLo = pe.reps?.[0] ?? 6;
    const sets = Math.max(1, Math.floor(finite(pe.sets) ? pe.sets : 3));
    const last = lastPerformance(workouts, pe.exerciseId, asOf);
    const lastBlock = last
      ? { loadKg: last.loadKg, reps: last.reps, ...(last.rpe !== null ? { rpe: last.rpe } : {}), d: last.d }
      : undefined;
    const base = { exerciseId: pe.exerciseId, name, reps: pe.reps ?? [repsLo, repsTop], last: lastBlock };

    // No history: nothing to progress from. Never guess a load.
    if (!last || last.loadKg <= 0) {
      return {
        ...base,
        sets,
        loadKg: null,
        mode: 'hold',
        reason: last
          ? `Logged as bodyweight last time — add reps in the ${repsLo}–${repsTop} range, or log the load you used.`
          : `First time logging this — pick a load you can control for ${repsLo}–${repsTop} reps and log the RPE.`,
      };
    }

    // --- Fatigue signals first. Nothing below reads a volume landmark. -----
    if (input.readinessBand === 'red') {
      return {
        ...base,
        sets: Math.max(1, sets - 1),
        loadKg: steppedLoad(last.loadKg, -REDUCE_PCT_RED, equipment, units),
        mode: 'reduce',
        reason: `Readiness is red — ${REDUCE_PCT_RED}% lighter and one set fewer today. This is fatigue, not your weekly volume.`,
      };
    }

    if (last.rpe !== null && last.rpe >= RPE_BACKOFF) {
      return {
        ...base,
        sets,
        loadKg: steppedLoad(last.loadKg, -REDUCE_PCT_HARD, equipment, units),
        mode: 'reduce',
        reason: `Last session went to RPE ${last.rpe} — down ${REDUCE_PCT_HARD}% so the reps come back.`,
      };
    }
    if (last.missed >= MISSED_SETS_BACKOFF) {
      return {
        ...base,
        sets,
        loadKg: steppedLoad(last.loadKg, -REDUCE_PCT_HARD, equipment, units),
        mode: 'reduce',
        reason: `${last.missed} sets missed last time — down ${REDUCE_PCT_HARD}% and rebuild from there.`,
      };
    }

    const tired = (e?.muscles?.primary ?? [])
      .map((m) => readyByMuscle.get(m))
      .filter((m): m is MuscleReadinessInput => !!m && finite(m.pct) && m.pct < MUSCLE_READY_MIN_PCT)
      .sort((a, b) => a.pct - b.pct)[0];
    if (tired) {
      const hrs = tired.hoursSince === null || !finite(tired.hoursSince) ? null : Math.round(tired.hoursSince);
      return {
        ...base,
        sets,
        loadKg: roundLoad(last.loadKg, equipment, units),
        mode: 'hold',
        reason:
          `${tired.muscle.replace('-', ' ')} is only ${Math.round(tired.pct)}% recovered` +
          (hrs === null ? '' : ` (${hrs} h since you last trained it)`) +
          ' — same load today.',
      };
    }

    // Form (fitness − fatigue) is the only training-load signal allowed to
    // hold a load. ACWR is descriptive and never reaches this function
    // (Impellizzeri 2020), and neither do the volume landmarks.
    if (input.formBand === 'overreached') {
      return {
        ...base,
        sets,
        loadKg: roundLoad(last.loadKg, equipment, units),
        mode: 'hold',
        reason: 'Training load has you overreached — repeat the load until form comes back up.',
      };
    }

    if (input.readinessBand === 'yellow') {
      return {
        ...base,
        sets,
        loadKg: roundLoad(last.loadKg, equipment, units),
        mode: 'hold',
        reason: 'Readiness is amber — repeat last session and see how the bar moves.',
      };
    }

    // --- Double progression -----------------------------------------------
    const allAtTop = last.reps.length > 0 && last.reps.every((r) => r >= repsTop);
    const rpeOk = last.rpe === null || last.rpe <= rpeCeiling;
    if (allAtTop && rpeOk) {
      return {
        ...base,
        sets,
        loadKg: steppedLoad(last.loadKg, stepPct, equipment, units),
        mode: 'progress',
        reason:
          `Every set hit ${repsTop} reps` +
          (last.rpe === null ? '' : ` at RPE ${last.rpe}`) +
          ` — up ${stepPct}% (${region}-body step).`,
      };
    }

    return {
      ...base,
      sets,
      loadKg: roundLoad(last.loadKg, equipment, units),
      mode: 'hold',
      reason: `Same load, one more rep — the top of the range (${repsTop}) isn't there on every set yet.`,
    };
  });
}

export interface DeloadInput {
  formBand: FormBand | null;
  plateaus: Plateau[];
  /** Consecutive red-readiness days ending at `asOf`. */
  redReadinessStreak: number;
  /** Weeks of accumulated load since the last deload or break. */
  accumulationWeeks: number;
}

/**
 * Reactive-only deload check (≥ 2 triggers). Never scheduled: Coleman 2024
 * found a planned mid-program deload gave no hypertrophy benefit, and the copy
 * cites it when declining to put one on the calendar.
 */
export function deloadCheck(input: DeloadInput): { recommended: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input?.formBand === 'overreached') {
    reasons.push('Training form is overreached — fatigue is outrunning fitness.');
  }
  const stalled = (input?.plateaus ?? []).filter((p) => p && p.rpeTrend >= PLATEAU_RPE_RISE);
  if (stalled.length > 0) {
    reasons.push(
      `${stalled.length === 1 ? stalled[0].name : `${stalled.length} lifts`} stalled while RPE climbed — ` +
        'harder sessions, same numbers.',
    );
  }
  const streak = finite(input?.redReadinessStreak) ? input.redReadinessStreak : 0;
  if (streak >= RED_STREAK_DAYS) {
    reasons.push(`${streak} red readiness days in a row.`);
  }
  const weeks = finite(input?.accumulationWeeks) ? input.accumulationWeeks : 0;
  if (weeks >= DELOAD_ACCUMULATION_WEEKS) {
    reasons.push(`${weeks} weeks of accumulated load without a break.`);
  }

  const recommended = reasons.length >= 2;
  if (recommended) {
    reasons.push(`Take a week at −${DELOAD_SET_CUT_PCT}% sets and −${DELOAD_LOAD_CUT_PCT}% load, then pick back up.`);
  } else {
    reasons.push(DELOAD_SCHEDULE_NOTE);
  }
  return { recommended, reasons };
}
