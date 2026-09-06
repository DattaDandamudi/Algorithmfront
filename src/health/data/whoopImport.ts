/**
 * WHOOP data-export CSV import (Settings → WHOOP connection → "Import CSV").
 *
 * WHOOP's export ZIP contains `physiological_cycles.csv`, one row per
 * physiological cycle with columns such as "Cycle start time", "Recovery
 * score %", "Resting heart rate (bpm)", "Heart rate variability (ms)",
 * "Day Strain", "Asleep duration (min)", "Sleep need (min)", "Sleep debt
 * (min)", "Sleep onset", "Wake onset". Header matching is tolerant (case,
 * spaces and punctuation are ignored) because WHOOP has renamed columns
 * between export versions.
 *
 * Day attribution: a WHOOP cycle starts when you fall asleep in the evening
 * and its recovery / sleep / strain describe the *following* waking day. The
 * app's DailyRecord `d` is that waking day (rec + last night's sleep + bt/wk
 * all live on the morning you woke), so we key rows by the local date of
 * "Wake onset" when present and fall back to the "Cycle start time" date.
 *
 * Timestamps in the export are local wall-clock (a separate "Cycle timezone"
 * column carries the offset), so we read HH:MM straight from the text and
 * never round-trip through Date — unless the value carries an explicit Z /
 * offset, in which case it is converted to the browser's local time.
 *
 * Units: minutes → hours for slh/sln (2 dp); rec/rhr/hrv/dbt/nap rounded to
 * integers; strain to 1 dp. Missing or non-numeric cells are simply omitted.
 */
import type { DailyRecord, HHMM, ISODate } from './types';
import { round } from '../lib/format';

export type WhoopRecord = Partial<DailyRecord> & { d: ISODate };

export interface WhoopParseResult {
  /** One record per day, ascending by date. Only WHOOP-owned fields are ever set. */
  records: WhoopRecord[];
  /** Rows dropped because the date was missing/invalid or no metric could be read. */
  skipped: number;
  errors: string[];
  /** Original header names that were recognised, in file order. */
  columnsFound: string[];
}

/** Fields the import may write — everything else on a day (meals, weight, tobacco…) is user data. */
export const WHOOP_FIELDS = ['rec', 'hrv', 'rhr', 'strn', 'slh', 'sln', 'dbt', 'bt', 'wk', 'nap'] as const;
export type WhoopField = (typeof WHOOP_FIELDS)[number];

type MetricField = Exclude<WhoopField, 'bt' | 'wk'>;
type ColumnKey = 'date' | 'wake' | 'onset' | MetricField;

/** Canonical key → accepted header spellings (normalised: lower-case, only [a-z0-9%] kept). */
const ALIASES: Record<ColumnKey, string[]> = {
  date: ['cyclestarttime', 'cyclestart', 'date', 'day'],
  wake: ['wakeonset', 'waketime', 'wake'],
  onset: ['sleeponset', 'sleepstart', 'bedtime'],
  rec: ['recoveryscore%', 'recoveryscore', 'recovery%', 'recovery'],
  rhr: ['restingheartratebpm', 'restingheartrate', 'rhrbpm', 'rhr'],
  hrv: ['heartratevariabilityms', 'heartratevariability', 'hrvms', 'hrv'],
  strn: ['daystrain', 'strain'],
  slh: ['asleepdurationmin', 'asleepduration', 'sleepdurationmin', 'sleepduration', 'asleepmin'],
  sln: ['sleepneedmin', 'sleepneed'],
  dbt: ['sleepdebtmin', 'sleepdebt'],
  nap: ['napdurationmin', 'napduration', 'napmin', 'nap'],
};

const MAX_ERRORS = 20;

export function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9%]/g, '');
}

/**
 * Minimal RFC 4180 parser: quoted fields, doubled quotes, embedded commas /
 * newlines, CRLF or LF line endings, optional UTF-8 BOM. Returns rows of
 * cells; blank lines are dropped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

/**
 * Parse a WHOOP timestamp ('2026-09-05 23:10:00', ISO 'T' form, with or
 * without offset). Wall-clock values are read verbatim; values with an
 * explicit zone are converted to local time.
 */
export function parseWhoopDateTime(raw: string | undefined): { date: ISODate; time: HHMM | null } | null {
  if (!raw) return null;
  const s = raw.trim();
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const [, y, mo, d, hh, mm, , zone] = m;
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (zone && hh !== undefined) {
    const dt = new Date(s.replace(' ', 'T'));
    if (Number.isNaN(dt.getTime())) return null;
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return { date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`, time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}` };
  }
  if (hh !== undefined) {
    const h = Number(hh);
    const min = Number(mm);
    if (h > 23 || min > 59) return null;
    return { date: `${y}-${mo}-${d}`, time: `${h < 10 ? '0' : ''}${h}:${mm}` };
  }
  return { date: `${y}-${mo}-${d}`, time: null };
}

function num(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.trim().replace(/%$/, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Map header cells to canonical keys; first match wins per key. */
function mapColumns(header: string[]): { index: Partial<Record<ColumnKey, number>>; found: string[] } {
  const index: Partial<Record<ColumnKey, number>> = {};
  const found: string[] = [];
  header.forEach((h, i) => {
    const norm = normalizeHeader(h);
    if (!norm) return;
    for (const key of Object.keys(ALIASES) as ColumnKey[]) {
      if (index[key] === undefined && ALIASES[key].includes(norm)) {
        index[key] = i;
        found.push(h.trim());
        break;
      }
    }
  });
  return { index, found };
}

export function parseWhoopCsv(text: string): WhoopParseResult {
  const errors: string[] = [];
  const rows = parseCsv(text ?? '');
  if (rows.length === 0) return { records: [], skipped: 0, errors: ['File is empty.'], columnsFound: [] };
  const { index, found } = mapColumns(rows[0]);
  if (index.date === undefined && index.wake === undefined) {
    return { records: [], skipped: rows.length - 1, errors: ['No "Cycle start time" (or "Wake onset") column found — is this physiological_cycles.csv?'], columnsFound: found };
  }
  const metricKeys = WHOOP_FIELDS.filter((f): f is MetricField => f !== 'bt' && f !== 'wk');
  if (!metricKeys.some((f) => index[f] !== undefined) && index.onset === undefined && index.wake === undefined) {
    return { records: [], skipped: rows.length - 1, errors: ['No recovery, HRV, RHR, strain or sleep columns found.'], columnsFound: found };
  }

  const byDate = new Map<ISODate, WhoopRecord>();
  let skipped = 0;
  const fail = (line: number, why: string) => {
    skipped++;
    if (errors.length < MAX_ERRORS) errors.push(`Row ${line}: ${why}`);
  };

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const cell = (key: ColumnKey) => (index[key] === undefined ? undefined : cells[index[key] as number]);
    const wake = parseWhoopDateTime(cell('wake'));
    const start = parseWhoopDateTime(cell('date'));
    const d = wake?.date ?? start?.date;
    if (!d) {
      fail(r + 1, `unreadable date "${(cell('date') ?? cell('wake') ?? '').trim()}"`);
      continue;
    }
    const rec: WhoopRecord = { d };
    const v = {
      rec: num(cell('rec')),
      rhr: num(cell('rhr')),
      hrv: num(cell('hrv')),
      strn: num(cell('strn')),
      slh: num(cell('slh')),
      sln: num(cell('sln')),
      dbt: num(cell('dbt')),
      nap: num(cell('nap')),
    };
    if (v.rec !== null) rec.rec = Math.round(Math.min(100, Math.max(0, v.rec)));
    if (v.rhr !== null && v.rhr > 0) rec.rhr = Math.round(v.rhr);
    if (v.hrv !== null && v.hrv > 0) rec.hrv = Math.round(v.hrv);
    if (v.strn !== null) rec.strn = round(Math.min(21, Math.max(0, v.strn)), 1);
    if (v.slh !== null && v.slh > 0) rec.slh = round(v.slh / 60, 2);
    if (v.sln !== null && v.sln > 0) rec.sln = round(v.sln / 60, 2);
    if (v.dbt !== null) rec.dbt = Math.round(Math.max(0, v.dbt));
    if (v.nap !== null && v.nap > 0) rec.nap = Math.round(v.nap);
    const onset = parseWhoopDateTime(cell('onset'));
    if (onset?.time) rec.bt = onset.time;
    if (wake?.time) rec.wk = wake.time;

    if (Object.keys(rec).length === 1) {
      fail(r + 1, `no WHOOP metrics for ${d}`);
      continue;
    }
    // Several cycles can land on one day (e.g. a broken sleep) — later rows fill/override.
    const prev = byDate.get(d);
    byDate.set(d, prev ? { ...prev, ...rec } : rec);
  }

  const records = Array.from(byDate.values()).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  if (records.length === 0 && skipped > 0) errors.push('No usable rows found.');
  return { records, skipped, errors, columnsFound: found };
}

export interface WhoopMergeResult {
  /** Records that actually changed (existing days patched, new days created), ascending by date. */
  merged: DailyRecord[];
  updated: number;
  created: number;
}

/**
 * Overlay imported WHOOP fields onto existing days. Only `WHOOP_FIELDS` are
 * ever written; meals, weight, tobacco and notes are untouched. Days whose
 * WHOOP values are already identical are not returned, so callers can pass
 * `merged` straight to `patchDay` without dirtying unchanged shards.
 */
export function mergeWhoopRecords(existing: Record<ISODate, DailyRecord>, incoming: WhoopRecord[]): WhoopMergeResult {
  const merged: DailyRecord[] = [];
  let updated = 0;
  let created = 0;
  for (const inc of incoming) {
    if (!inc?.d) continue;
    const cur = existing[inc.d];
    const next: DailyRecord = { ...(cur ?? { d: inc.d }) };
    let changed = false;
    for (const f of WHOOP_FIELDS) {
      const val = inc[f];
      if (val === undefined || val === null) continue;
      if (next[f] !== val) {
        Object.assign(next, { [f]: val });
        changed = true;
      }
    }
    if (!changed) continue;
    merged.push(next);
    if (cur) updated++;
    else created++;
  }
  merged.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  return { merged, updated, created };
}
