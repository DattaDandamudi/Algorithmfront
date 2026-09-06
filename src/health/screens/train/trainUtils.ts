/**
 * Pure helpers for the Train tab (plan §2a). No React, no clock reads, no
 * store access — every function takes what it needs so it can be unit-tested.
 *
 * ## Units
 * Every load the engine and the store handle is **kilograms** (`SetEntry.w`,
 * `PlannedExercise.loadKg`, e1RM). The screen shows `settings.training.units`,
 * so `toDisplayLoad` converts on the way out and `toKgLoad` on the way back
 * in; nothing else in `screens/train` is allowed to touch `kgToLb`. The pair
 * round-trips to the tenth a user can actually see (135 lb → 61.235 kg → 135
 * lb), so typing a number and reading it back never drifts.
 *
 * ## Words, never colour alone
 * `volumeStatusWord`, `formBandWord`, `acwrBandWord` and `modeWord` exist so
 * every tone in the UI is carried by text as well. Two of them are load-
 * bearing beyond styling:
 * - a volume landmark is **advisory** (`VOLUME_ADVISORY_NOTE`): `high` reads
 *   "more than most need" and never "too much", and nothing here derives a
 *   cap, a limit or a prohibition from a status;
 * - the acute:chronic ratio is **descriptive** (`LOAD_NOTES.acwrDescriptive`),
 *   so `acwrBandWord` names the band and stops — no advice comes out of it.
 */
import type {
  AcwrBand,
  Equipment,
  Exercise,
  FormBand,
  ISODate,
  Muscle,
  PlannedExercise,
  SessionType,
  SetEntry,
  VolumeStatus,
  Workout,
  WorkoutExercise,
  WorkoutKind,
} from '../../data/types';
import { LOAD_INCREMENT_KG, LOAD_INCREMENT_LB, exerciseById, exerciseHistory, setE1rm } from '../../engine';
import { fmt, kgToLb, lbToKg, round } from '../../lib/format';
import type { Tone } from '../../ui';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export type Units = 'lb' | 'kg';

/**
 * A copy of `obj` without `keys`. The logger needs this constantly — clearing
 * an RPE, un-marking a warm-up, dropping a superset tag — and the compact
 * `SetEntry` shape means "no RPE" has to be an *absent* key, not `undefined`:
 * `{ w, r, rpe: undefined }` would serialise a null into every stored set.
 */
export function withoutKeys<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const drop = new Set<string>(keys.map(String));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (!drop.has(k)) out[k] = v;
  return out as Omit<T, K>;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** Muscle → the word the grid, the picker and the reasons all use. */
export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest',
  back: 'Back',
  'front-delts': 'Front delts',
  'side-delts': 'Side delts',
  'rear-delts': 'Rear delts',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  traps: 'Traps',
  'lower-back': 'Lower back',
  abs: 'Abs',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
};

export function muscleLabel(m: Muscle | string): string {
  return (MUSCLE_LABEL as Record<string, string>)[m] ?? String(m);
}

export const SESSION_LABEL: Record<SessionType, string> = {
  upper: 'Upper body',
  lower: 'Lower body',
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  full: 'Full body',
  cardio: 'Cardio',
  rest: 'Rest',
};

export function sessionLabel(s: SessionType | null | undefined): string {
  return s ? SESSION_LABEL[s] ?? String(s) : 'Session';
}

export const KIND_LABEL: Record<WorkoutKind, string> = {
  strength: 'Strength',
  cardio: 'Cardio',
  mobility: 'Mobility',
  sport: 'Sport',
};

export function kindLabel(k: WorkoutKind): string {
  return KIND_LABEL[k] ?? 'Session';
}

/**
 * What a logged session is called in a list: its own title, else the split
 * slot it filled, else its kind. Shared by Today, History and the detail
 * sheet so one session is never named two things.
 */
export function sessionTitle(w: Pick<Workout, 'title' | 'kind' | 'session' | 'cardio'>): string {
  if (w.title) return w.title;
  if (w.kind === 'strength') return w.session ? `${sessionLabel(w.session)} session` : 'Strength session';
  return `${kindLabel(w.kind)}${w.cardio?.sport ? ` · ${w.cardio.sport}` : ''}`;
}

/** The three progression modes, in the user's words. */
export function modeWord(mode: PlannedExercise['mode']): string {
  if (mode === 'progress') return 'Progress';
  if (mode === 'reduce') return 'Back off';
  return 'Hold';
}

export function modeTone(mode: PlannedExercise['mode']): Tone {
  if (mode === 'progress') return 'green';
  if (mode === 'reduce') return 'yellow';
  return 'neutral';
}

// ---------------------------------------------------------------------------
// Loads and units
// ---------------------------------------------------------------------------

/** Kilograms → the number shown in the user's units, to the tenth. */
export function toDisplayLoad(kg: number | null | undefined, units: Units): number {
  if (!finite(kg)) return 0;
  return round(units === 'lb' ? kgToLb(kg) : kg, 1);
}

/** A number typed in the user's units → kilograms for storage. */
export function toKgLoad(display: number | null | undefined, units: Units): number {
  if (!finite(display)) return 0;
  return round(units === 'lb' ? lbToKg(display) : display, 3);
}

/** "135 lb" / "61.5 kg" — 0 dp when the display value is whole, else 1. */
export function formatLoad(kg: number | null | undefined, units: Units): string {
  const v = toDisplayLoad(kg, units);
  return `${fmt(v, Number.isInteger(v) ? 0 : 1)} ${units}`;
}

/**
 * The smallest step the weight Stepper takes, in display units: the smallest
 * real increment for that equipment (a 5 lb / 2.5 kg plate pair on a bar,
 * 2 kg dumbbells, a 5 kg stack) rather than an abstract 1. `roundLoad` in the
 * engine rounds suggestions to the same grid, so a suggested load is always a
 * load the stepper can land on.
 */
export function loadStepDisplay(equipment: Equipment | null | undefined, units: Units): number {
  const eq: Equipment = equipment ?? 'other';
  return units === 'lb'
    ? LOAD_INCREMENT_LB[eq] ?? LOAD_INCREMENT_LB.other
    : LOAD_INCREMENT_KG[eq] ?? LOAD_INCREMENT_KG.other;
}

/** Total volume, kg·reps, over working sets only (warm-ups and skips excluded). */
export function sessionVolumeKg(exercises: readonly WorkoutExercise[] | undefined): number {
  let total = 0;
  for (const we of exercises ?? []) {
    for (const s of we?.sets ?? []) {
      if (!isWorkingSet(s)) continue;
      total += s.w * s.r;
    }
  }
  return round(total, 1);
}

/** Working sets performed in a session (the number the finish sheet reports). */
export function countWorkingSets(exercises: readonly WorkoutExercise[] | undefined): number {
  let n = 0;
  for (const we of exercises ?? []) for (const s of we?.sets ?? []) if (isWorkingSet(s)) n += 1;
  return n;
}

/** A set that counts: logged numbers, not a warm-up, not skipped. */
export function isWorkingSet(s: SetEntry | null | undefined): s is SetEntry {
  return !!s && s.k !== 'wu' && s.x !== true && finite(s.w) && finite(s.r) && s.r > 0;
}

/** Session volume in the user's units, e.g. "12,480 lb". */
export function formatVolume(kg: number, units: Units): string {
  const v = units === 'lb' ? kgToLb(kg) : kg;
  return `${fmt(Math.round(v), 0)} ${units}`;
}

// ---------------------------------------------------------------------------
// Distance
// ---------------------------------------------------------------------------

export const KM_PER_MILE = 1.609344;

/**
 * Distance rides on the same imperial/metric switch as load: there is no
 * separate distance setting, and a lifter who works in pounds does not think
 * in kilometres. `CardioDetail.distanceKm` stays metric in storage.
 */
export function distanceUnit(units: Units): 'mi' | 'km' {
  return units === 'lb' ? 'mi' : 'km';
}

export function toDisplayDistance(km: number | null | undefined, units: Units): number {
  if (!finite(km)) return 0;
  return round(units === 'lb' ? km / KM_PER_MILE : km, 2);
}

export function toKmDistance(display: number | null | undefined, units: Units): number {
  if (!finite(display)) return 0;
  return round(units === 'lb' ? display * KM_PER_MILE : display, 3);
}

/** "5.2 mi" / "8.4 km"; null distance renders nothing. */
export function formatDistance(km: number | null | undefined, units: Units): string | null {
  if (!finite(km) || km <= 0) return null;
  const v = toDisplayDistance(km, units);
  return `${fmt(v, Number.isInteger(v) ? 0 : 1)} ${distanceUnit(units)}`;
}

// ---------------------------------------------------------------------------
// Ghost text ("what you did last time")
// ---------------------------------------------------------------------------

export interface LastPerformed {
  /** Top working set's load, kg. 0 means bodyweight. */
  loadKg: number;
  /** Reps of every working set, in order. */
  reps: number[];
  /** Hardest RPE logged in that session. */
  rpe?: number;
  d?: ISODate;
}

/**
 * The ghost line under a set row: `last: 135 lb × 8,8,7 @8`. Bodyweight work
 * reads `BW`, and a session with no RPE simply drops the `@`. Null when there
 * is nothing to show — the row then renders no ghost at all rather than an
 * empty one.
 */
export function ghostText(last: LastPerformed | null | undefined, units: Units): string | null {
  if (!last) return null;
  const reps = (last.reps ?? []).filter(finite).map((r) => String(Math.round(r)));
  if (reps.length === 0) return null;
  const load = finite(last.loadKg) && last.loadKg > 0 ? formatLoad(last.loadKg, units) : 'BW';
  const rpe = finite(last.rpe) ? ` @${fmt(last.rpe, Number.isInteger(last.rpe) ? 0 : 1)}` : '';
  return `last: ${load} × ${reps.join(',')}${rpe}`;
}

/** RPE of a set, from `rpe` or converted from `rir` (10 − RIR). */
export function setRpe(s: SetEntry | null | undefined): number | null {
  if (!s) return null;
  if (finite(s.rpe)) return s.rpe;
  if (finite(s.rir)) return round(10 - s.rir, 1);
  return null;
}

/**
 * The most recent session that contained `exerciseId`, as the ghost line needs
 * it. Mirrors `strength.suggestProgression`'s private `lastPerformance` (top
 * set by load then reps, hardest RPE, working sets only) so the plan's ghost
 * and the logger's ghost can never disagree; `excludeId` drops the session
 * currently being edited so it does not become its own "last time".
 */
export function lastPerformed(
  workouts: readonly Workout[],
  exerciseId: string,
  opts?: { excludeId?: string; onOrBefore?: ISODate },
): LastPerformed | null {
  if (!exerciseId) return null;
  const limit = opts?.onOrBefore;
  const sorted = (workouts ?? [])
    .filter((w) => !!w && typeof w.d === 'string' && w.id !== opts?.excludeId && (!limit || w.d <= limit))
    .slice()
    .sort((a, b) => (a.d !== b.d ? (a.d < b.d ? 1 : -1) : a.id < b.id ? 1 : -1)); // newest first
  for (const w of sorted) {
    for (const we of w.exercises ?? []) {
      if (!we || we.exerciseId !== exerciseId) continue;
      const working = (we.sets ?? []).filter(isWorkingSet);
      if (working.length === 0) continue;
      let top = working[0];
      for (const s of working) if (s.w > top.w || (s.w === top.w && s.r > top.r)) top = s;
      let rpe: number | null = null;
      for (const s of working) {
        const v = setRpe(s);
        if (v !== null && (rpe === null || v > rpe)) rpe = v;
      }
      return {
        loadKg: top.w,
        reps: working.map((s) => s.r),
        ...(rpe !== null ? { rpe } : {}),
        d: w.d,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Durations, rest timer, RPE
// ---------------------------------------------------------------------------

/** Rest-timer presets, seconds (plan §2a). */
export const REST_PRESETS: readonly number[] = [60, 90, 120, 180];

/** RPE chips: 6 → 10 in the half steps the RPE table is defined on. */
export const RPE_CHOICES: readonly number[] = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

/** Session-RPE choices for the finish sheet (Foster 1–10, whole numbers). */
export const SRPE_CHOICES: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** "1:30" / "0:45" — a countdown, never a bare number of seconds. */
export function formatRest(seconds: number): string {
  const s = Math.max(0, Math.round(finite(seconds) ? seconds : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "1h 12m" / "48m" — session duration in the finish sheet and history. */
export function formatDuration(minutes: number | null | undefined): string {
  if (!finite(minutes) || minutes < 0) return '—';
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

/** Whole minutes between two epoch stamps, floored at 0 (never NaN). */
export function elapsedMinutes(startedAt: number, nowMs: number): number {
  if (!finite(startedAt) || !finite(nowMs)) return 0;
  return Math.max(0, Math.floor((nowMs - startedAt) / 60_000));
}

// ---------------------------------------------------------------------------
// Status words (no state is ever carried by colour alone)
// ---------------------------------------------------------------------------

/**
 * The volume band in one word, for the grid title and the row. `high` is
 * deliberately not a warning: `VOLUME_ADVISORY_NOTE` is the reason, and this
 * function is where that promise is kept in the UI.
 */
export function volumeStatusWord(status: VolumeStatus): string {
  switch (status) {
    case 'below-mev':
      return 'below MEV';
    case 'building':
      return 'building';
    case 'productive':
      return 'productive';
    case 'high':
      return 'high';
    default:
      return 'no sets';
  }
}

/** Longer wording for the cell tooltip and the hidden table. */
export function volumeStatusPhrase(status: VolumeStatus): string {
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

/** Tone for a volume band — always paired with `volumeStatusWord` in the UI. */
export function volumeStatusTone(status: VolumeStatus): Tone {
  switch (status) {
    case 'below-mev':
      return 'yellow';
    case 'building':
      return 'blue';
    case 'productive':
      return 'green';
    case 'high':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function formBandWord(band: FormBand | null | undefined): string {
  switch (band) {
    case 'fresh':
      return 'Fresh';
    case 'productive':
      return 'Productive';
    case 'overreached':
      return 'Overreached';
    case 'neutral':
      return 'Neutral';
    default:
      return 'Not enough load history';
  }
}

export function formBandTone(band: FormBand | null | undefined): Tone {
  switch (band) {
    case 'fresh':
      return 'blue';
    case 'productive':
      return 'green';
    case 'overreached':
      return 'yellow';
    default:
      return 'neutral';
  }
}

/**
 * The acute:chronic band as a word. Descriptive only — Impellizzeri 2020
 * found the ratio has no causal identification, so nothing in this file turns
 * a band into advice, and every caller prints `LOAD_NOTES.acwrDescriptive`
 * next to it.
 */
export function acwrBandWord(band: AcwrBand | null | undefined): string {
  switch (band) {
    case 'low':
      return 'below your usual';
    case 'sweet':
      return 'near your usual';
    case 'high':
      return 'above your usual';
    case 'spike':
      return 'well above your usual';
    default:
      return 'not enough history';
  }
}

// ---------------------------------------------------------------------------
// Finish-sheet maths
// ---------------------------------------------------------------------------

export interface E1rmDelta {
  exerciseId: string;
  name: string;
  /** Best e1RM in the session just finished, kg. */
  bestKg: number | null;
  /** Best e1RM before it, kg; null when this is the first time. */
  previousKg: number | null;
  /** `bestKg − previousKg`, kg; null when either side is missing. */
  deltaKg: number | null;
}

/**
 * Estimated-max movement for every exercise in the finished session: the best
 * e1RM of the session against the best in the history that precedes it. A
 * first-ever session has no delta (null), which is the honest answer — the
 * baseline is not a gain.
 */
export function e1rmDeltas(
  session: { exercises?: WorkoutExercise[] } | null | undefined,
  history: readonly Workout[],
  asOf: ISODate,
  custom?: readonly Exercise[],
): E1rmDelta[] {
  const out: E1rmDelta[] = [];
  for (const we of session?.exercises ?? []) {
    if (!we?.exerciseId) continue;
    let best: number | null = null;
    for (const s of we.sets ?? []) {
      const v = setE1rm(s).value;
      if (v !== null && (best === null || v > best)) best = v;
    }
    const prior = exerciseHistory(history as Workout[], we.exerciseId, asOf, { custom, days: 365 });
    const previous = prior.best;
    out.push({
      exerciseId: we.exerciseId,
      name: exerciseById(we.exerciseId, custom)?.name ?? we.exerciseId,
      bestKg: best === null ? null : round(best, 1),
      previousKg: previous === null ? null : round(previous, 1),
      deltaKg: best === null || previous === null ? null : round(best - previous, 1),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Small formatting shared by the views
// ---------------------------------------------------------------------------

/** "+8%" / "−3%" / "—" for the week-on-week load readout. */
export function formatPct(pct: number | null | undefined, dp = 0): string {
  if (!finite(pct)) return '—';
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${fmt(Math.abs(pct), dp)}%`;
}

/** "4 × 6–10" — the planned set × rep-range line. */
export function setsRepsText(sets: number, reps: [number, number] | undefined): string {
  const lo = finite(reps?.[0]) ? reps[0] : null;
  const hi = finite(reps?.[1]) ? reps[1] : null;
  const n = finite(sets) ? Math.max(1, Math.round(sets)) : 1;
  if (lo === null || hi === null) return `${n} sets`;
  return lo === hi ? `${n} × ${lo}` : `${n} × ${lo}–${hi}`;
}
