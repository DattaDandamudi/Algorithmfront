/**
 * The live-session draft (plan §2a) — everything the logger holds while a
 * workout is in progress, persisted under `hx:wk:draft` so closing the app
 * mid-set loses nothing.
 *
 * Why a draft and not a `Workout` in the store: an unfinished session is not
 * history. If Start wrote to the store, a session abandoned at the water
 * fountain would show up in History, in the volume grid and in the load
 * series. So the draft lives in its own key, is the only thing that changes
 * while sets are being logged, and turns into a `Workout` exactly once — when
 * the finish sheet saves.
 *
 * The draft is written on every change and read back on mount (`readDraft`).
 * It is validated rather than trusted: a partly-written or hand-edited value
 * yields `null` and the tab simply starts fresh, because a crash on a corrupt
 * draft would lose the session it was meant to protect. Loads inside are
 * kilograms, exactly as `SetEntry` stores them — the display conversion in
 * `trainUtils` happens above this layer, never inside it.
 */
import type {
  CardioDetail,
  HHMM,
  ISODate,
  SessionType,
  SetEntry,
  Workout,
  WorkoutExercise,
  WorkoutKind,
} from '../../data/types';
import { readWorkoutDraft, writeWorkoutDraft } from '../../data/storage';
import { minutesToHHMM, hhmmToMinutes } from '../../lib/dates';
import { uid } from '../../lib/format';

/** Bumped when the shape changes; an older/newer draft is discarded, not guessed at. */
export const DRAFT_VERSION = 1;

export interface WorkoutDraft {
  v: number;
  /** Stable id — the workout id when the draft edits a saved session. */
  id: string;
  d: ISODate;
  start: HHMM;
  kind: WorkoutKind;
  session?: SessionType;
  title?: string;
  exercises: WorkoutExercise[];
  cardio?: CardioDetail;
  srpe?: number;
  note?: string;
  programId?: string;
  /** Epoch ms the session (or this editing pass) began — the duration clock. */
  startedAt: number;
  /** Minutes already banked before this pass, so editing keeps the logged duration. */
  baseMinutes: number;
  /** True when this draft edits a session that is already in the store. */
  editing: boolean;
  /** Rest timer: epoch ms it fires at, and the preset it was started from. */
  restEndsAt?: number;
  restSec?: number;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const KINDS: readonly WorkoutKind[] = ['strength', 'cardio', 'mobility', 'sport'];

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export interface NewDraftInput {
  d: ISODate;
  start: HHMM;
  kind: WorkoutKind;
  nowMs: number;
  session?: SessionType;
  title?: string;
  exercises?: WorkoutExercise[];
  programId?: string;
}

/** A fresh draft for a session that has not been saved yet. */
export function newDraft(input: NewDraftInput): WorkoutDraft {
  return {
    v: DRAFT_VERSION,
    id: uid('w'),
    d: input.d,
    start: input.start,
    kind: input.kind,
    ...(input.session ? { session: input.session } : {}),
    ...(input.title ? { title: input.title } : {}),
    ...(input.programId ? { programId: input.programId } : {}),
    exercises: input.exercises ? input.exercises.map(cloneExercise) : [],
    startedAt: finite(input.nowMs) ? input.nowMs : 0,
    baseMinutes: 0,
    editing: false,
  };
}

/**
 * Pick a saved session back up in the logger (History → Edit). The duration
 * already logged is banked in `baseMinutes` so a two-minute correction does
 * not turn a 62-minute session into a 2-minute one.
 */
export function draftFromWorkout(w: Workout, nowMs: number): WorkoutDraft {
  return {
    v: DRAFT_VERSION,
    id: w.id,
    d: w.d,
    start: w.start,
    kind: KINDS.includes(w.kind) ? w.kind : 'strength',
    ...(w.session ? { session: w.session } : {}),
    ...(w.title ? { title: w.title } : {}),
    ...(w.programId ? { programId: w.programId } : {}),
    ...(w.cardio ? { cardio: { ...w.cardio } } : {}),
    ...(finite(w.srpe) ? { srpe: w.srpe } : {}),
    ...(w.note ? { note: w.note } : {}),
    exercises: (w.exercises ?? []).map(cloneExercise),
    startedAt: finite(nowMs) ? nowMs : 0,
    baseMinutes: finite(w.durationMin) ? Math.max(0, Math.round(w.durationMin)) : 0,
    editing: true,
  };
}

function cloneExercise(we: WorkoutExercise): WorkoutExercise {
  return {
    exerciseId: we.exerciseId,
    sets: (we.sets ?? []).map((s) => ({ ...s })),
    ...(we.note ? { note: we.note } : {}),
    ...(we.superset ? { superset: we.superset } : {}),
  };
}

/**
 * Minutes the session has run: what was already banked plus the time since
 * this pass started. The finish sheet seeds its stepper with this and the
 * user can overrule it — a phone that slept through the last three sets
 * should not dictate the number that ends up in the load model.
 */
export function draftDurationMin(draft: WorkoutDraft, nowMs: number): number {
  const base = finite(draft.baseMinutes) ? Math.max(0, draft.baseMinutes) : 0;
  if (!finite(draft.startedAt) || !finite(nowMs)) return base;
  return base + Math.max(0, Math.floor((nowMs - draft.startedAt) / 60_000));
}

/** Clock time the session ends at, for `finishWorkout`'s `end`. */
export function draftEndTime(draft: WorkoutDraft, durationMin: number): HHMM {
  const startMin = hhmmToMinutes(draft.start);
  if (startMin === null) return draft.start;
  const dur = finite(durationMin) ? Math.max(0, Math.round(durationMin)) : 0;
  return minutesToHHMM((startMin + dur) % (24 * 60));
}

export interface FinishInput {
  durationMin: number;
  srpe?: number;
}

/**
 * The draft as the `Workout` the store will hold. Empty collections are
 * dropped rather than stored as `[]` / `{}` so a 6 × 4 session stays around a
 * kilobyte of JSON (the storage budget in the plan's risk table).
 */
export function draftToWorkout(draft: WorkoutDraft, done: FinishInput): Workout {
  const exercises = (draft.exercises ?? [])
    .filter((we) => we && we.exerciseId && (we.sets ?? []).length > 0)
    .map(cloneExercise);
  const w: Workout = {
    id: draft.id,
    d: draft.d,
    start: draft.start,
    durationMin: finite(done.durationMin) ? Math.max(0, Math.round(done.durationMin)) : 0,
    kind: draft.kind,
    source: 'manual',
  };
  if (draft.session) w.session = draft.session;
  if (draft.title) w.title = draft.title;
  if (draft.programId) w.programId = draft.programId;
  if (exercises.length) w.exercises = exercises;
  if (draft.cardio && Object.keys(draft.cardio).length > 0) w.cardio = { ...draft.cardio };
  if (finite(done.srpe)) w.srpe = done.srpe;
  else if (finite(draft.srpe)) w.srpe = draft.srpe;
  if (draft.note) w.note = draft.note;
  return w;
}

// ---------------------------------------------------------------------------
// Validation + persistence
// ---------------------------------------------------------------------------

function parseSet(value: unknown): SetEntry | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as Record<string, unknown>;
  if (!finite(s.w) || !finite(s.r)) return null;
  const out: SetEntry = { w: s.w, r: s.r };
  if (finite(s.rpe)) out.rpe = s.rpe;
  if (finite(s.rir)) out.rir = s.rir;
  if (s.k === 'wu' || s.k === 'dr' || s.k === 'am') out.k = s.k;
  if (s.x === true) out.x = true;
  return out;
}

function parseExercise(value: unknown): WorkoutExercise | null {
  if (!value || typeof value !== 'object') return null;
  const e = value as Record<string, unknown>;
  if (typeof e.exerciseId !== 'string' || !e.exerciseId) return null;
  const sets: SetEntry[] = [];
  for (const raw of Array.isArray(e.sets) ? e.sets : []) {
    const s = parseSet(raw);
    if (s) sets.push(s);
  }
  const out: WorkoutExercise = { exerciseId: e.exerciseId, sets };
  if (typeof e.note === 'string' && e.note) out.note = e.note;
  if (typeof e.superset === 'string' && e.superset) out.superset = e.superset;
  return out;
}

/**
 * Validate an unknown value into a draft. Anything unrecognisable — a version
 * bump, a truncated write, a hand-edited key — returns null, and the caller
 * starts clean instead of rendering a half-session.
 */
export function parseDraft(value: unknown): WorkoutDraft | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.v !== DRAFT_VERSION) return null;
  if (typeof v.id !== 'string' || !v.id) return null;
  if (typeof v.d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.d)) return null;
  if (typeof v.start !== 'string' || !/^\d{2}:\d{2}$/.test(v.start)) return null;
  const kind = KINDS.includes(v.kind as WorkoutKind) ? (v.kind as WorkoutKind) : null;
  if (!kind) return null;

  const exercises: WorkoutExercise[] = [];
  for (const raw of Array.isArray(v.exercises) ? v.exercises : []) {
    const e = parseExercise(raw);
    if (e) exercises.push(e);
  }

  const draft: WorkoutDraft = {
    v: DRAFT_VERSION,
    id: v.id,
    d: v.d,
    start: v.start,
    kind,
    exercises,
    startedAt: finite(v.startedAt) ? v.startedAt : 0,
    baseMinutes: finite(v.baseMinutes) ? Math.max(0, v.baseMinutes) : 0,
    editing: v.editing === true,
  };
  if (typeof v.session === 'string') draft.session = v.session as SessionType;
  if (typeof v.title === 'string' && v.title) draft.title = v.title;
  if (typeof v.programId === 'string' && v.programId) draft.programId = v.programId;
  if (typeof v.note === 'string' && v.note) draft.note = v.note;
  if (finite(v.srpe)) draft.srpe = v.srpe;
  if (finite(v.restEndsAt)) draft.restEndsAt = v.restEndsAt;
  if (finite(v.restSec)) draft.restSec = v.restSec;
  if (v.cardio && typeof v.cardio === 'object') {
    const c = v.cardio as Record<string, unknown>;
    const cardio: CardioDetail = {};
    if (typeof c.sport === 'string' && c.sport) cardio.sport = c.sport;
    if (finite(c.distanceKm)) cardio.distanceKm = c.distanceKm;
    if (finite(c.avgHr)) cardio.avgHr = c.avgHr;
    if (finite(c.maxHr)) cardio.maxHr = c.maxHr;
    if (finite(c.elevM)) cardio.elevM = c.elevM;
    if (finite(c.kcal)) cardio.kcal = c.kcal;
    if (Array.isArray(c.zoneMin) && c.zoneMin.length === 6 && c.zoneMin.every(finite)) {
      cardio.zoneMin = c.zoneMin as CardioDetail['zoneMin'];
    }
    if (Object.keys(cardio).length > 0) draft.cardio = cardio;
  }
  return draft;
}

/** The stored draft, or null. Never throws — an unreadable draft is no draft. */
export function readDraft(): WorkoutDraft | null {
  try {
    return parseDraft(readWorkoutDraft());
  } catch {
    return null;
  }
}

/**
 * Persist the draft. Swallows storage failures on purpose: a full or blocked
 * localStorage must not interrupt someone mid-set, and the session is still
 * fully present in memory — the quota banner elsewhere is what tells them.
 */
export function writeDraft(draft: WorkoutDraft | null): void {
  try {
    writeWorkoutDraft(draft);
  } catch {
    /* ignore — see the doc comment */
  }
}

export function clearDraft(): void {
  writeDraft(null);
}
