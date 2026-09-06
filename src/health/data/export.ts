/**
 * §10 Export / import. JSON is the full-fidelity primary format; CSV is a
 * flattened secondary format for spreadsheets (UTF-8 BOM for Excel).
 *
 * - The Anthropic API key never leaves the browser: exports omit `ai.apiKey`
 *   and say so in `exportNote` (R4-2). Everything else round-trips.
 * - Imported records are normalised (R4-3): meals get ids, missing macros
 *   become 0, numeric strings become numbers, chat messages get id/role/ts.
 * - CSV text cells starting with = + - @ TAB CR are prefixed with a quote so a
 *   meal name or note can't run as a spreadsheet formula (R4-8).
 */
import type {
  AppSettings,
  CardioDetail,
  ChatMessage,
  DailyRecord,
  ISODate,
  Meal,
  SetEntry,
  Workout,
  WorkoutExercise,
  WorkoutKind,
  WorkoutSource,
} from './types';
import { SCHEMA_VERSION } from './types';
import { mergeSettings } from './defaults';
import { uid } from '../lib/format';

export const EXPORT_NOTE = 'ai.apiKey is omitted: the Anthropic API key never leaves the browser that stored it. Re-enter it under Settings → Coach after importing on another device.';

export interface ExportBundle {
  app: 'hx';
  version: number;
  exportedAt: string;
  /** What this file deliberately leaves out (the API key). */
  exportNote: string;
  settings: AppSettings;
  days: DailyRecord[];
  /** Training sessions (schema v2+). A v1 build ignores this key. */
  workouts: Workout[];
  chat: ChatMessage[];
}

/** Settings as they may leave the browser: identical, minus the API key. */
export function stripSecrets(settings: AppSettings): AppSettings {
  const ai = { ...settings.ai };
  delete ai.apiKey;
  return { ...settings, ai };
}

export function buildExportBundle(
  settings: AppSettings,
  days: Record<ISODate, DailyRecord>,
  chat: ChatMessage[],
  workouts: Record<string, Workout> = {},
): ExportBundle {
  return {
    app: 'hx',
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    exportNote: EXPORT_NOTE,
    settings: stripSecrets(settings),
    days: Object.values(days).sort((a, b) => (a.d < b.d ? -1 : 1)),
    workouts: Object.values(workouts).sort((a, b) => (a.d === b.d ? (a.start < b.start ? -1 : 1) : a.d < b.d ? -1 : 1)),
    chat,
  };
}

export function buildExportJSON(
  settings: AppSettings,
  days: Record<ISODate, DailyRecord>,
  chat: ChatMessage[],
  workouts: Record<string, Workout> = {},
): string {
  return JSON.stringify(buildExportBundle(settings, days, chat, workouts), null, 1);
}

export interface ParsedImport {
  ok: boolean;
  days: DailyRecord[];
  workouts: Workout[];
  settings: AppSettings | null;
  chat: ChatMessage[] | null;
  errors: string[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isFoodItem(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false;
  const f = x as { id?: unknown; name?: unknown; per100?: unknown; defaultGrams?: unknown };
  return typeof f.id === 'string' && typeof f.name === 'string' && !!f.per100 && typeof f.per100 === 'object' && typeof f.defaultGrams === 'number';
}

/** Drop malformed collections so a hand-edited file can't crash favourites/recents/bloodwork code paths. */
function sanitizeSettings(raw: Record<string, unknown>, errors: string[]): Partial<AppSettings> {
  const out: Record<string, unknown> = { ...raw };
  for (const key of ['favorites', 'recents'] as const) {
    const v = out[key];
    if (v === undefined) continue;
    if (!Array.isArray(v)) {
      errors.push(`Settings.${key} was not a list and was ignored.`);
      delete out[key];
      continue;
    }
    const kept = v.filter(isFoodItem);
    if (kept.length !== v.length) errors.push(`${v.length - kept.length} malformed ${key} entr(ies) were skipped.`);
    out[key] = kept;
  }
  const profile = out.profile;
  if (profile && typeof profile === 'object') {
    const p = { ...(profile as Record<string, unknown>) };
    if (p.bloodwork !== undefined && !Array.isArray(p.bloodwork)) {
      errors.push('Settings.profile.bloodwork was not a list and was ignored.');
      delete p.bloodwork;
    }
    if (p.split !== undefined && (typeof p.split !== 'object' || p.split === null)) delete p.split;
    out.profile = p;
  } else if (profile !== undefined) {
    delete out.profile;
  }
  for (const key of ['targets', 'ai', 'whoop', 'training', 'checkIn', 'insightHistory'] as const) {
    if (out[key] !== undefined && (typeof out[key] !== 'object' || out[key] === null)) delete out[key];
  }
  // A hand-edited `training` block must not hand the engine a broken landmark
  // table or a non-array program list; mergeTraining fills whatever we drop.
  const training = out.training;
  if (training && typeof training === 'object') {
    const t = { ...(training as Record<string, unknown>) };
    for (const key of ['customExercises', 'programs'] as const) {
      if (t[key] !== undefined && !Array.isArray(t[key])) {
        errors.push(`Settings.training.${key} was not a list and was ignored.`);
        delete t[key];
      }
    }
    for (const key of ['volumeLandmarks', 'progression'] as const) {
      if (t[key] !== undefined && (typeof t[key] !== 'object' || t[key] === null || Array.isArray(t[key]))) delete t[key];
    }
    out.training = t;
  }
  const checkIn = out.checkIn;
  if (checkIn && typeof checkIn === 'object') {
    const c = { ...(checkIn as Record<string, unknown>) };
    if (c.items !== undefined && !Array.isArray(c.items)) delete c.items;
    out.checkIn = c;
  }
  return out as Partial<AppSettings>;
}

function isRecord(x: unknown): x is DailyRecord {
  return !!x && typeof x === 'object' && typeof (x as DailyRecord).d === 'string' && DATE_RE.test((x as DailyRecord).d);
}

// --- Normalisation (R4-3) ---------------------------------------------------

/** DailyRecord fields that must be numbers when present. */
const NUMERIC_DAY_KEYS = [
  'w', 'wt', 'kc', 'p', 'f', 'c', 'fi', 'st', 'rec', 'hrv', 'rhr', 'slh', 'sln', 'dbt', 'strn', 'nap', 'tob', 'h2o',
  // engine v3: Kalman weight state, training load, and the stress stack
  'kl', 'ks', 'kv', 'ld', 'wko',
  'qs', 'qf', 'qt', 'qo', 'rr', 'skt', 'spo', 'alc', 'osi', 'vo2',
] as const;
/** Meal fields that must always be numbers (the spec's compact schema may omit f/c/fi). */
const MEAL_NUMERIC_KEYS = ['g', 'kc', 'p', 'f', 'c', 'fi'] as const;

/** number → itself; numeric string → number; anything else → undefined. */
function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

interface NormStats {
  droppedFields: number;
  droppedMeals: number;
  mealIds: number;
  workoutIds: number;
  droppedExercises: number;
}

/**
 * The store deletes/edits meals by `id` and lists key on it, so an id-less meal
 * (the spec's compact example has none) must get one here — otherwise deleting
 * one removes every id-less meal of the day.
 */
function normalizeMeal(raw: unknown, stats: NormStats): Meal | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...m };
  if (typeof m.id !== 'string' || !m.id) {
    out.id = uid('m');
    stats.mealIds++;
  }
  out.t = typeof m.t === 'string' ? m.t : '';
  out.n = typeof m.n === 'string' ? m.n : String(m.n ?? '');
  for (const k of MEAL_NUMERIC_KEYS) out[k] = toNumber(m[k]) ?? 0;
  return out as unknown as Meal;
}

function normalizeRecord(rec: DailyRecord, stats: NormStats): DailyRecord {
  const r = { ...rec } as Record<string, unknown>;
  for (const k of NUMERIC_DAY_KEYS) {
    const v = r[k];
    if (v === undefined || v === null) {
      delete r[k];
      continue;
    }
    const n = toNumber(v);
    if (n === undefined) {
      delete r[k];
      stats.droppedFields++;
    } else {
      r[k] = n;
    }
  }
  if (r.meals !== undefined) {
    if (!Array.isArray(r.meals)) {
      delete r.meals;
      stats.droppedFields++;
    } else {
      const meals = (r.meals as unknown[]).map((m) => normalizeMeal(m, stats)).filter((m): m is Meal => m !== null);
      stats.droppedMeals += (r.meals as unknown[]).length - meals.length;
      if (meals.length) r.meals = meals;
      else delete r.meals;
    }
  }
  return r as unknown as DailyRecord;
}

const WORKOUT_KINDS: WorkoutKind[] = ['strength', 'cardio', 'mobility', 'sport'];
const WORKOUT_SOURCES: WorkoutSource[] = ['manual', 'whoop', 'strava', 'apple', 'demo'];
const SET_NUMERIC_KEYS = ['w', 'r', 'rpe', 'rir'] as const;
const CARDIO_NUMERIC_KEYS = ['distanceKm', 'avgHr', 'maxHr', 'elevM', 'kcal'] as const;

function normalizeSet(raw: unknown): SetEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of SET_NUMERIC_KEYS) {
    const n = toNumber(s[k]);
    if (n !== undefined) out[k] = n;
  }
  // A set without reps is not a set; load may legitimately be 0 (bodyweight).
  if (out.r === undefined) return null;
  if (out.w === undefined) out.w = 0;
  if (s.k === 'wu' || s.k === 'dr' || s.k === 'am') out.k = s.k;
  if (s.x === true) out.x = true;
  return out as unknown as SetEntry;
}

function normalizeWorkoutExercise(raw: unknown): WorkoutExercise | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.exerciseId !== 'string' || !e.exerciseId) return null;
  const sets = Array.isArray(e.sets) ? e.sets.map(normalizeSet).filter((s): s is SetEntry => s !== null) : [];
  const out: WorkoutExercise = { exerciseId: e.exerciseId, sets };
  if (typeof e.note === 'string') out.note = e.note;
  if (typeof e.superset === 'string') out.superset = e.superset;
  return out;
}

function normalizeCardio(raw: unknown): CardioDetail | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const c = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof c.sport === 'string') out.sport = c.sport;
  for (const k of CARDIO_NUMERIC_KEYS) {
    const n = toNumber(c[k]);
    if (n !== undefined) out[k] = n;
  }
  if (Array.isArray(c.zoneMin) && c.zoneMin.length === 6) {
    const zones = c.zoneMin.map((z) => toNumber(z) ?? 0);
    out.zoneMin = zones;
  }
  return Object.keys(out).length ? (out as CardioDetail) : undefined;
}

/**
 * A workout must survive a hand-edited file: unknown kinds/sources fall back to
 * safe defaults, ids are backfilled (the store keys on them), and every numeric
 * field is coerced. Returns null when the session has no usable date.
 */
export function normalizeWorkout(raw: unknown, stats: NormStats): Workout | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const w = raw as Record<string, unknown>;
  if (typeof w.d !== 'string' || !DATE_RE.test(w.d)) return null;
  const kind = WORKOUT_KINDS.includes(w.kind as WorkoutKind) ? (w.kind as WorkoutKind) : 'strength';
  const source = WORKOUT_SOURCES.includes(w.source as WorkoutSource) ? (w.source as WorkoutSource) : 'manual';
  const out: Workout = {
    id: typeof w.id === 'string' && w.id ? w.id : uid('w'),
    d: w.d,
    start: typeof w.start === 'string' && /^\d{2}:\d{2}$/.test(w.start) ? w.start : '12:00',
    durationMin: Math.max(0, toNumber(w.durationMin) ?? 0),
    kind,
    source,
  };
  if (typeof w.id !== 'string' || !w.id) stats.workoutIds++;
  if (typeof w.title === 'string') out.title = w.title;
  if (typeof w.note === 'string') out.note = w.note;
  if (typeof w.session === 'string') out.session = w.session as Workout['session'];
  if (typeof w.externalId === 'string') out.externalId = w.externalId;
  if (typeof w.programId === 'string') out.programId = w.programId;
  const srpe = toNumber(w.srpe);
  if (srpe !== undefined) out.srpe = srpe;
  const load = toNumber(w.load);
  if (load !== undefined) out.load = load;
  if (Array.isArray(w.exercises)) {
    const exercises = w.exercises.map(normalizeWorkoutExercise).filter((e): e is WorkoutExercise => e !== null);
    stats.droppedExercises += w.exercises.length - exercises.length;
    if (exercises.length) out.exercises = exercises;
  }
  const cardio = normalizeCardio(w.cardio);
  if (cardio) out.cardio = cardio;
  return out;
}

/** Transcript keys on `id` and updateChat matches by it; the coach needs a real role. */
function normalizeChat(raw: unknown[], errors: string[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  const now = Date.now();
  let dropped = 0;
  for (const m of raw) {
    if (!m || typeof m !== 'object' || typeof (m as ChatMessage).text !== 'string' || !(m as ChatMessage).text.trim()) {
      dropped++;
      continue;
    }
    const c = m as Partial<ChatMessage> & { text: string };
    const msg: ChatMessage = {
      ...c,
      id: typeof c.id === 'string' && c.id ? c.id : uid('c'),
      role: c.role === 'user' || c.role === 'assistant' ? c.role : 'assistant',
      text: c.text,
      ts: typeof c.ts === 'number' && Number.isFinite(c.ts) ? c.ts : now,
    };
    delete msg.streaming; // a persisted "still streaming" flag would spin forever
    out.push(msg);
  }
  if (dropped) errors.push(`${dropped} chat message(s) had no text and were skipped.`);
  return out;
}

/**
 * Accepts a full ExportBundle, a bare array of DailyRecord, or an object with a
 * `days` array/map. Invalid records are dropped and reported, never fatal.
 */
export function parseImport(json: string): ParsedImport {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { ok: false, days: [], workouts: [], settings: null, chat: null, errors: [`Not valid JSON: ${e instanceof Error ? e.message : 'parse error'}`] };
  }

  let rawDays: unknown[] = [];
  let rawWorkouts: unknown[] = [];
  let settings: AppSettings | null = null;
  let chat: ChatMessage[] | null = null;

  if (Array.isArray(parsed)) {
    rawDays = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Partial<ExportBundle> & { days?: unknown };
    if (obj.version !== undefined && typeof obj.version === 'number' && obj.version > SCHEMA_VERSION) {
      errors.push(`File is schema v${obj.version}; this app understands v${SCHEMA_VERSION}. Unknown fields are kept but may be ignored.`);
    }
    if (Array.isArray(obj.days)) rawDays = obj.days;
    else if (obj.days && typeof obj.days === 'object') rawDays = Object.values(obj.days as Record<string, unknown>);
    else errors.push('No `days` array found in file.');
    if (obj.settings && typeof obj.settings === 'object') {
      try {
        settings = mergeSettings(sanitizeSettings(obj.settings as unknown as Record<string, unknown>, errors));
      } catch {
        errors.push('Settings block could not be read; skipped.');
      }
    }
    if (Array.isArray(obj.workouts)) rawWorkouts = obj.workouts;
    else if (obj.workouts && typeof obj.workouts === 'object') rawWorkouts = Object.values(obj.workouts as Record<string, unknown>);
    if (Array.isArray(obj.chat)) chat = normalizeChat(obj.chat, errors);
  } else {
    return { ok: false, days: [], workouts: [], settings: null, chat: null, errors: ['Unrecognised file shape.'] };
  }

  const days: DailyRecord[] = [];
  const stats: NormStats = { droppedFields: 0, droppedMeals: 0, mealIds: 0, workoutIds: 0, droppedExercises: 0 };
  let dropped = 0;
  for (const r of rawDays) {
    if (isRecord(r)) days.push(normalizeRecord(r, stats));
    else dropped++;
  }

  const workouts: Workout[] = [];
  let droppedWorkouts = 0;
  const seenWorkoutIds = new Set<string>();
  for (const w of rawWorkouts) {
    const norm = normalizeWorkout(w, stats);
    if (!norm) {
      droppedWorkouts++;
      continue;
    }
    // Two sessions sharing an id would silently overwrite each other in the store.
    if (seenWorkoutIds.has(norm.id)) norm.id = uid('w');
    seenWorkoutIds.add(norm.id);
    workouts.push(norm);
  }

  if (dropped) errors.push(`${dropped} record(s) had no valid date and were skipped.`);
  if (stats.droppedFields) errors.push(`${stats.droppedFields} field(s) with non-numeric values were dropped.`);
  if (stats.droppedMeals) errors.push(`${stats.droppedMeals} malformed meal(s) were skipped.`);
  if (droppedWorkouts) errors.push(`${droppedWorkouts} workout(s) had no valid date and were skipped.`);
  if (stats.droppedExercises) errors.push(`${stats.droppedExercises} malformed exercise entr(ies) were skipped.`);

  return { ok: days.length > 0 || workouts.length > 0 || settings !== null, days, workouts, settings, chat, errors };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export const CSV_COLUMNS = [
  'date',
  'weight_lb',
  'trend_lb',
  'kcal',
  'protein_g',
  'fat_g',
  'carbs_g',
  'fiber_g',
  'steps',
  'recovery_pct',
  'hrv_ms',
  'rhr_bpm',
  'sleep_h',
  'sleep_need_h',
  'sleep_debt_min',
  'strain',
  'bedtime',
  'wake',
  'nap_min',
  'tobacco',
  'caffeine_times',
  'water_cups',
  'lift_day',
  'kalman_lb',
  'kalman_rate_lb_wk',
  'load',
  'workouts',
  'checkin_sleep',
  'checkin_fatigue',
  'checkin_stress',
  'checkin_soreness',
  'resp_rate',
  'skin_temp_c',
  'spo2',
  'alcohol',
  'stress_index',
  'vo2max',
  'meal_count',
  'meals',
  'note',
] as const;

/** Characters that make a spreadsheet treat a cell as a formula (OWASP CSV injection). */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

export function csvCell(v: unknown): string {
  if (v === undefined || v === null) return '';
  let s = String(v);
  // R4-8: only free text is at risk — numbers (incl. negatives) pass through untouched.
  if (typeof v === 'string' && FORMULA_LEAD.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCSV(days: DailyRecord[]): string {
  const rows = [CSV_COLUMNS.join(',')];
  const sorted = [...days].sort((a, b) => (a.d < b.d ? -1 : 1));
  for (const r of sorted) {
    const meals = (r.meals ?? [])
      .map((m) => `${m.t} ${m.n} ${m.g}g ${m.kc}kcal P${m.p} F${m.f} C${m.c}`)
      .join('; ');
    const row = [
      r.d,
      r.w,
      r.wt,
      r.kc,
      r.p,
      r.f,
      r.c,
      r.fi,
      r.st,
      r.rec,
      r.hrv,
      r.rhr,
      r.slh,
      r.sln,
      r.dbt,
      r.strn,
      r.bt,
      r.wk,
      r.nap,
      r.tob,
      (r.caf ?? []).join(' '),
      r.h2o,
      r.lift === undefined ? '' : r.lift ? 1 : 0,
      r.kl,
      r.ks === undefined ? '' : Math.round(r.ks * 7 * 100) / 100,
      r.ld,
      r.wko,
      r.qs,
      r.qf,
      r.qt,
      r.qo,
      r.rr,
      r.skt,
      r.spo,
      r.alc,
      r.osi,
      r.vo2,
      r.meals?.length ?? '',
      meals,
      r.note,
    ].map(csvCell);
    rows.push(row.join(','));
  }
  return '﻿' + rows.join('\r\n');
}

export const WORKOUT_CSV_COLUMNS = [
  'date',
  'start',
  'kind',
  'session',
  'title',
  'duration_min',
  'session_rpe',
  'load',
  'source',
  'exercise',
  'set_index',
  'set_kind',
  'weight_kg',
  'reps',
  'rpe',
  'rir',
  'sport',
  'distance_km',
  'avg_hr',
  'max_hr',
  'elevation_m',
  'kcal',
  'note',
] as const;

/**
 * One row per SET for strength sessions, one row per session for everything
 * else — the shape a lifter can pivot in a spreadsheet. Same BOM and
 * formula-injection guard as the daily CSV.
 */
export function buildWorkoutsCSV(workouts: Workout[]): string {
  const rows = [WORKOUT_CSV_COLUMNS.join(',')];
  const sorted = [...workouts].sort((a, b) => (a.d === b.d ? (a.start < b.start ? -1 : 1) : a.d < b.d ? -1 : 1));
  for (const w of sorted) {
    const head = [w.d, w.start, w.kind, w.session ?? '', w.title ?? '', w.durationMin, w.srpe, w.load, w.source];
    const c = w.cardio;
    const cardioCells = [c?.sport ?? '', c?.distanceKm, c?.avgHr, c?.maxHr, c?.elevM, c?.kcal];
    const exercises = w.exercises ?? [];
    if (!exercises.length) {
      rows.push([...head, '', '', '', '', '', '', '', ...cardioCells, w.note].map(csvCell).join(','));
      continue;
    }
    for (const ex of exercises) {
      if (!ex.sets.length) {
        rows.push([...head, ex.exerciseId, '', '', '', '', '', '', ...cardioCells, ex.note ?? w.note].map(csvCell).join(','));
        continue;
      }
      ex.sets.forEach((s, i) => {
        const kind = s.k === 'wu' ? 'warmup' : s.k === 'dr' ? 'drop' : s.k === 'am' ? 'amrap' : s.x ? 'skipped' : 'working';
        rows.push([...head, ex.exerciseId, i + 1, kind, s.w, s.r, s.rpe, s.rir, ...cardioCells, ex.note ?? ''].map(csvCell).join(','));
      });
    }
  }
  return '﻿' + rows.join('\r\n');
}

/** Trigger a client-side download via Blob + object URL. No server involved. */
export function downloadText(filename: string, content: string, mime = 'application/json'): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

export function exportFilename(ext: 'json' | 'csv', date = new Date(), kind: 'log' | 'workouts' = 'log'): string {
  const iso = date.toISOString().slice(0, 10);
  return `health-${kind}-${iso}.${ext}`;
}
