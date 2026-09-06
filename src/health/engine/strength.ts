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
 *   Epley    `w·(1 + r/30)`            best 6–10 reps
 *   Brzycki  `36w/(37 − r)`            best ≤ 6 reps
 *   Wathan   `100w/(48.8 + 53.8·e^{−0.075r})`   best 11–15 reps
 *
 * All three degrade badly past 15 reps, so **`setE1rm` returns null above 15**
 * — a 20-rep back-off set no longer drags the strength trend. When RPE or RIR
 * is logged, the formula estimate is blended 50/50 with the RPE-table estimate
 * (`w / (RPE_TABLE[reps + RIR − 1] / 100)`), and the chosen formula is named
 * so the set's tooltip can show it.
 *
 * ## Volume: advisory bands, never caps
 *
 * The 2025 *Sports Medicine* meta-regression found hypertrophy keeps rising
 * with weekly sets with no clear plateau, and MRV has no RCT support. So
 * `volumeStatus` returns `below-mev | building | productive | high` — there is
 * deliberately **no "exceeded — cut" state**, the copy reads "more than most
 * people need to grow" rather than a prohibition, and nothing in this module
 * removes a set because a landmark was crossed. Only fatigue signals
 * (readiness, form, muscle readiness, plateau) reduce anything.
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
 */
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
import type { MuscleReadiness } from './load';

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

/** Keeps stub parameters live for `noUnusedParameters`; delete with the TODOs. */
function pending(...args: unknown[]): void {
  void args;
}

// ---------------------------------------------------------------------------
// Estimated 1RM
// ---------------------------------------------------------------------------

/** Epley: `w·(1 + r/30)`. Null for a non-positive load/rep count. */
export function e1rmEpley(weightKg: number, reps: number): number | null {
  // TODO(phase-1e): implement per plan §1e.
  pending(weightKg, reps);
  return null;
}

/** Brzycki: `36w/(37 − r)`. Null at r ≥ 37 (the formula's pole) or bad input. */
export function e1rmBrzycki(weightKg: number, reps: number): number | null {
  // TODO(phase-1e): implement per plan §1e.
  pending(weightKg, reps);
  return null;
}

/** Wathan: `100w/(48.8 + 53.8·e^{−0.075r})`. */
export function e1rmWathan(weightKg: number, reps: number): number | null {
  // TODO(phase-1e): implement per plan §1e.
  pending(weightKg, reps);
  return null;
}

export interface E1rmEstimate {
  /** kg; null for warm-ups, skipped sets, bodyweight or > 15 reps. */
  value: number | null;
  /** Which formula was chosen — named in the set's tooltip. */
  formula: 'brzycki' | 'epley' | 'wathan' | 'rpe' | 'blend' | null;
}

/**
 * e1RM for one set, auto-selecting the formula by rep range and blending with
 * the RPE table when RPE/RIR is logged. Warm-up (`k === 'wu'`) and skipped
 * (`x`) sets return null: they are not evidence of strength.
 */
export function setE1rm(set: SetEntry): E1rmEstimate {
  // TODO(phase-1e): implement per plan §1e.
  pending(set);
  return { value: null, formula: null };
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

/** Per-session bests for one exercise, ascending to `asOf`. */
export function exerciseHistory(
  workouts: Workout[],
  exerciseId: string,
  asOf: ISODate,
  opts?: ExerciseHistoryOpts,
): ExerciseHistory {
  // TODO(phase-1e): implement per plan §1e.
  pending(workouts, exerciseId, asOf, opts);
  return { exerciseId, name: exerciseId, points: [], latest: null, best: null, nSessions: 0 };
}

export interface PrOpts {
  custom?: readonly Exercise[];
  /** Window to report PRs from; default 7 days (Today's "PRs this week"). */
  days?: number;
  /** History searched for the previous best; default 365 days. */
  lookbackDays?: number;
}

/**
 * PRs set in the window: heaviest weight, most reps at a weight, and best
 * e1RM, each needing to beat the previous best by `PR_THRESHOLD` (1%) so
 * rounding noise never triggers a celebration.
 */
export function detectPRs(workouts: Workout[], asOf: ISODate, opts?: PrOpts): PersonalRecord[] {
  // TODO(phase-1e): implement per plan §1e.
  pending(workouts, asOf, opts);
  return [];
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
 */
export function detectPlateau(
  workouts: Workout[],
  asOf: ISODate,
  opts?: PlateauOpts,
): Plateau[] {
  // TODO(phase-1e): implement per plan §1e.
  pending(workouts, asOf, opts);
  return [];
}

// ---------------------------------------------------------------------------
// Volume and balance
// ---------------------------------------------------------------------------

export interface WeeklySetsOpts {
  custom?: readonly Exercise[];
  /** Week to count; default the Mon–Sun week containing `asOf`. */
  weekStart?: ISODate;
}

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
  // TODO(phase-1e): implement per plan §1e.
  pending(workouts, asOf, landmarks, opts);
  return [];
}

/**
 * Where a weekly set count sits against a muscle's landmarks:
 * `< mev` → below-mev, `< mav` → building, `≤ mrv` → productive, above → high.
 * There is deliberately no "too much" state — see the module header.
 */
export function volumeStatus(sets: number, landmark: VolumeLandmark): VolumeStatus {
  // TODO(phase-1e): implement per plan §1e.
  pending(sets, landmark);
  return 'below-mev';
}

/**
 * Push:pull and squat:hinge set ratios over the trailing 28 days, from the
 * movement patterns. Outside 0.67–1.5 is flagged by the caller as an
 * imbalance; null when either side has no sets (a ratio against zero is not a
 * finding).
 */
export function balanceRatios(
  workouts: Workout[],
  asOf: ISODate,
  opts?: WeeklySetsOpts & { days?: number },
): { pushPull: number | null; squatHinge: number | null } {
  // TODO(phase-1e): implement per plan §1e.
  pending(workouts, asOf, opts);
  return { pushPull: null, squatHinge: null };
}

// ---------------------------------------------------------------------------
// Progression and deloads
// ---------------------------------------------------------------------------

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
  muscleReadiness?: MuscleReadiness[];
}

/**
 * Today's planned exercises with a suggested load, a mode
 * (`progress | hold | reduce`) and the reason for each — the Train Today view
 * and the coach's "What should I lift today?" answer read the same list.
 */
export function suggestProgression(input: ProgressionInput): PlannedExercise[] {
  // TODO(phase-1e): implement per plan §1e.
  pending(input);
  return [];
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
  // TODO(phase-1e): implement per plan §1e.
  pending(input);
  return { recommended: false, reasons: [] };
}

/**
 * Round a suggested load to something the user can actually put on the bar:
 * the smallest real increment for that equipment in their display units
 * (2.5 kg / 5 lb barbell pairs, 2 kg dumbbells, machine stacks, …). A
 * suggestion of 61.3 kg is a suggestion nobody can follow.
 */
export function roundLoad(kg: number, equipment: Equipment, units: 'lb' | 'kg'): number {
  // TODO(phase-1e): implement per plan §1e.
  pending(kg, equipment, units);
  return kg;
}
