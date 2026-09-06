/**
 * §10 Export / import. JSON is the full-fidelity primary format; CSV is a
 * flattened secondary format for spreadsheets (UTF-8 BOM for Excel).
 */
import type { AppSettings, ChatMessage, DailyRecord, ISODate } from './types';
import { SCHEMA_VERSION } from './types';
import { mergeSettings } from './defaults';

export interface ExportBundle {
  app: 'hx';
  version: number;
  exportedAt: string;
  settings: AppSettings;
  days: DailyRecord[];
  chat: ChatMessage[];
}

export function buildExportBundle(settings: AppSettings, days: Record<ISODate, DailyRecord>, chat: ChatMessage[]): ExportBundle {
  return {
    app: 'hx',
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
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
    if (Array.isArray(obj.chat)) chat = obj.chat.filter((m): m is ChatMessage => !!m && typeof m === 'object' && typeof (m as ChatMessage).text === 'string');
  } else {
    return { ok: false, days: [], settings: null, chat: null, errors: ['Unrecognised file shape.'] };
  }

  const days: DailyRecord[] = [];
  let dropped = 0;
  for (const r of rawDays) {
    if (isRecord(r)) days.push(r);
    else dropped++;
  }
  if (dropped) errors.push(`${dropped} record(s) had no valid date and were skipped.`);

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

function csvCell(v: unknown): string {
  if (v === undefined || v === null) return '';
  const s = String(v);
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
