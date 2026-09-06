/**
 * §1e Exercise database, default program and volume landmarks.
 *
 * The only place that knows what an exercise *is*: which muscles it trains,
 * what pattern it belongs to and what equipment it needs. `strength.ts` maps
 * sets onto muscles through this table, and the Train screen's picker searches
 * it. Everything here is static data — no clock, no state, no I/O.
 *
 * ## `EXERCISES` (Phase 1e)
 *
 * ~122 entries spanning every `MovementPattern`, each with
 * `muscles.primary` / `muscles.secondary`, `equipment`, `unilateral` where it
 * applies, and `aliases` for search ("bench", "bp", "flat bench"). Ids are
 * stable, lower-kebab and never reused — a workout logged in 2026 must still
 * resolve in 2030. User-created exercises live in
 * `settings.training.customExercises` and are passed in, never merged here.
 *
 * ## `searchExercises` (Phase 1e)
 *
 * Token prefix match plus a one-edit typo tolerance (Levenshtein ≤ 1 on a
 * token), custom exercises first, then exact-prefix, then alias, then fuzzy.
 * Ranking is deterministic and case/diacritic-insensitive.
 *
 * ## `DEFAULT_PROGRAM` (Phase 1e)
 *
 * The built-in 4-day upper/lower A/B split matching `DEFAULT_SPLIT`
 * (Mon upper, Tue lower, Thu upper, Fri lower), each session a list of
 * `ProgramExercise { exerciseId, sets, reps: [lo, hi], rpe? }`. It lives here
 * rather than in `data/defaults.ts` so the data layer never imports the
 * engine; `settings.training.programs` ships empty and the Train screen falls
 * back to this one until the user edits a copy.
 *
 * ## Volume landmarks — advisory bands, not caps
 *
 * The 2025 *Sports Medicine* meta-regression found hypertrophy keeps rising
 * with weekly sets (diminishing returns, no clear plateau) and that strength is
 * largely volume-insensitive; **MRV has no RCT support**. So these numbers are
 * a starting point for a conversation, never a limit: `volumeStatus` in
 * `strength.ts` returns `high`, never "exceeded — cut", and nothing in the
 * engine removes sets because a landmark was crossed. Only fatigue signals
 * (readiness, form, muscle readiness, plateau) reduce anything.
 *
 * Beginner values follow the commonly published Israetel-style tables; the
 * intermediate (×1.4) and advanced (×1.7) multipliers are **our heuristic**,
 * not a measured progression, and the Settings copy says so beside the reset
 * button. Users override any cell in `settings.training.volumeLandmarks`.
 */
import type {
  Exercise,
  Muscle,
  Profile,
  Program,
  VolumeLandmark,
} from '../data/types';

/**
 * The 15 volume buckets, in the order the UI renders them (push, pull, legs,
 * midline). Exported because every `Record<Muscle, …>` in the engine needs a
 * canonical iteration order, and a second copy of this list would drift.
 */
export const MUSCLES: readonly Muscle[] = [
  'chest',
  'front-delts',
  'side-delts',
  'rear-delts',
  'triceps',
  'back',
  'traps',
  'biceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'abs',
  'lower-back',
];

/**
 * The built-in exercise library. **Empty in the Phase 0 stub** — Phase 1e
 * fills it with ~122 entries. Consumers must already handle "id not found"
 * (a workout can reference a custom or deleted exercise), so an empty library
 * degrades to "no name, no muscle mapping" rather than throwing.
 */
export const EXERCISES: readonly Exercise[] = [];

/** Beginner weekly-set landmarks per muscle (see the module header). */
const BEGINNER_LANDMARKS: Record<Muscle, VolumeLandmark> = {
  chest: { mev: 6, mav: 10, mrv: 16 },
  back: { mev: 8, mav: 12, mrv: 18 },
  'front-delts': { mev: 0, mav: 4, mrv: 8 },
  'side-delts': { mev: 4, mav: 8, mrv: 14 },
  'rear-delts': { mev: 4, mav: 8, mrv: 14 },
  biceps: { mev: 4, mav: 8, mrv: 14 },
  triceps: { mev: 4, mav: 8, mrv: 14 },
  forearms: { mev: 0, mav: 4, mrv: 8 },
  traps: { mev: 0, mav: 4, mrv: 10 },
  'lower-back': { mev: 0, mav: 4, mrv: 8 },
  abs: { mev: 0, mav: 6, mrv: 12 },
  quads: { mev: 6, mav: 10, mrv: 16 },
  hamstrings: { mev: 4, mav: 8, mrv: 14 },
  glutes: { mev: 2, mav: 6, mrv: 12 },
  calves: { mev: 4, mav: 8, mrv: 12 },
};

/** Training-level multipliers on the beginner table — a labelled heuristic. */
const LEVEL_MULTIPLIER: Record<Profile['trainingLevel'], number> = {
  beginner: 1,
  intermediate: 1.4,
  advanced: 1.7,
};

/**
 * Default landmarks for a training level, as a complete `Record<Muscle, …>`.
 *
 * Implemented in Phase 0 (not stubbed) because `TrainingSettings.
 * volumeLandmarks` is a *total* record: a placeholder of zeros would typecheck
 * and then quietly tell every user they are below MEV. Phase 1e owns any
 * retuning and the citations in this header.
 */
export function landmarkDefaults(
  level: Profile['trainingLevel'] = 'beginner',
): Record<Muscle, VolumeLandmark> {
  const k = LEVEL_MULTIPLIER[level] ?? 1;
  const out = {} as Record<Muscle, VolumeLandmark>;
  for (const m of MUSCLES) {
    const b = BEGINNER_LANDMARKS[m];
    out[m] = {
      mev: Math.round(b.mev * k),
      mav: Math.round(b.mav * k),
      mrv: Math.round(b.mrv * k),
    };
  }
  return out;
}

/**
 * The built-in 4-day upper/lower program. **Sessions are empty in the Phase 0
 * stub** — they reference exercise ids that only exist once `EXERCISES` is
 * populated in Phase 1e. Callers treat a missing session as "no plan today",
 * which is also what a rest day looks like.
 */
export const DEFAULT_PROGRAM: Program = {
  id: 'builtin-ul4',
  name: 'Upper / Lower — 4 day',
  sessions: {},
  builtIn: true,
};

/** Keeps stub parameters live for `noUnusedParameters`; delete with the TODOs. */
function pending(...args: unknown[]): void {
  void args;
}

/**
 * Look up one exercise by id, searching the user's custom list first so an
 * override with a built-in id wins. `null` when nothing matches — a workout
 * may reference an exercise the user has since deleted.
 */
export function exerciseById(id: string, custom?: readonly Exercise[]): Exercise | null {
  // TODO(phase-1e): implement per plan §1e.
  pending(id, custom);
  return null;
}

export interface ExerciseSearchOpts {
  /** `settings.training.customExercises` — ranked above built-ins. */
  custom?: readonly Exercise[];
  /** Max results (default 20). */
  limit?: number;
}

/**
 * Search by name or alias: token prefix match with a one-edit typo tolerance,
 * custom exercises first. An empty query returns the most useful default list
 * (customs, then compounds) rather than nothing, so the picker is never blank.
 */
export function searchExercises(query: string, opts?: ExerciseSearchOpts): Exercise[] {
  // TODO(phase-1e): implement per plan §1e.
  pending(query, opts);
  return [];
}
