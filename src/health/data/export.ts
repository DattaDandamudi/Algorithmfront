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
import type { AppSettings, ChatMessage, DailyRecord, ISODate, Meal } from './types';
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
  chat: ChatMessage[];
}

/** Settings as they may leave the browser: identical, minus the API key. */
export function stripSecrets(settings: AppSettings): AppSettings {
  const ai = { ...settings.ai };
  delete ai.apiKey;
  return { ...settings, ai };
}

export function buildExportBundle(settings: AppSettings, days: Record<ISODate, DailyRecord>, chat: ChatMessage[]): ExportBundle {
  return {
    app: 'hx',
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    exportNote: EXPORT_NOTE,
    settings: stripSecrets(settings),
    days: Object.values(days).sort((a, b) => (a.d < b.d ? -1 : 1)),
    chat,
  };
}

export function buildExportJSON(settings: AppSettings, days: Record<ISODate, DailyRecord>, chat: ChatMessage[]): string {
  return JSON.stringify(buildExportBundle(settings, days, chat), null, 1);
}

export interface ParsedImport {
  ok: boolean;
  days: DailyRecord[];
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
  for (const key of ['targets', 'ai', 'whoop'] as const) {
    if (out[key] !== undefined && (typeof out[key] !== 'object' || out[key] === null)) delete out[key];
  }
  return out as Partial<AppSettings>;
}

function isRecord(x: unknown): x is DailyRecord {
  return !!x && typeof x === 'object' && typeof (x as DailyRecord).d === 'string' && DATE_RE.test((x as DailyRecord).d);
}

// --- Normalisation (R4-3) ---------------------------------------------------

/** DailyRecord fields that must be numbers when present. */
const NUMERIC_DAY_KEYS = ['w', 'wt', 'kc', 'p', 'f', 'c', 'fi', 'st', 'rec', 'hrv', 'rhr', 'slh', 'sln', 'dbt', 'strn', 'nap', 'tob', 'h2o'] as const;
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
    return { ok: false, days: [], settings: null, chat: null, errors: [`Not valid JSON: ${e instanceof Error ? e.message : 'parse error'}`] };
  }

  let rawDays: unknown[] = [];
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
    if (Array.isArray(obj.chat)) chat = normalizeChat(obj.chat, errors);
  } else {
    return { ok: false, days: [], settings: null, chat: null, errors: ['Unrecognised file shape.'] };
  }

  const days: DailyRecord[] = [];
  const stats: NormStats = { droppedFields: 0, droppedMeals: 0, mealIds: 0 };
  let dropped = 0;
  for (const r of rawDays) {
    if (isRecord(r)) days.push(normalizeRecord(r, stats));
    else dropped++;
  }
  if (dropped) errors.push(`${dropped} record(s) had no valid date and were skipped.`);
  if (stats.droppedFields) errors.push(`${stats.droppedFields} field(s) with non-numeric values were dropped.`);
  if (stats.droppedMeals) errors.push(`${stats.droppedMeals} malformed meal(s) were skipped.`);

  return { ok: days.length > 0 || settings !== null, days, settings, chat, errors };
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
      r.meals?.length ?? '',
      meals,
      r.note,
    ].map(csvCell);
    rows.push(row.join(','));
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

export function exportFilename(ext: 'json' | 'csv', date = new Date()): string {
  const iso = date.toISOString().slice(0, 10);
  return `health-log-${iso}.${ext}`;
}
