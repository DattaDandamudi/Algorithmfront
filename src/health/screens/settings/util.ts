/**
 * Small pure helpers shared by the Settings sections. Kept free of React so
 * they can be unit-tested and reused by the Data / WHOOP / Bloodwork panels.
 */
import type { BloodMarker, ISODate, MarkerStatus, SessionType } from '../../data/types';
import { retestReminders, type RetestReminder } from '../../engine/micronutrients';
import type { Tone } from '../../ui';

export const DAY_MS = 86_400_000;
/** SPEC §10: prompt a JSON backup when the last export is older than this. */
export const EXPORT_REMINDER_DAYS = 14;

/** "812 B" / "34.2 KB" / "1.20 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** "just now" / "4 min ago" / "3 h ago" / "12 days ago" / "1 Aug 2026". */
export function relativeTime(ts: number | undefined, now: number): string {
  if (!ts || !Number.isFinite(ts)) return 'never';
  const diff = Math.max(0, now - ts);
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 45) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Whole days since a timestamp (null when unknown). */
export function daysSince(ts: number | undefined, now: number): number | null {
  if (!ts || !Number.isFinite(ts)) return null;
  return Math.floor(Math.max(0, now - ts) / DAY_MS);
}

/**
 * SPEC §10 "prompt periodic JSON export": true when there is something to
 * back up and the last JSON export is missing or older than
 * EXPORT_REMINDER_DAYS. Shared by the Data card's banner and the Settings
 * screen's "open the Data card" condition (review R2-6) so they can't drift.
 */
export function backupOverdue(lastExportAt: number | undefined, recordCount: number, now: number): boolean {
  if (recordCount <= 0) return false;
  const since = daysSince(lastExportAt, now);
  return since === null || since >= EXPORT_REMINDER_DAYS;
}

/** Bloodwork status → semantic tone: low/high/elevated red, low-normal yellow, normal green. */
export function markerTone(status: MarkerStatus): Tone {
  switch (status) {
    case 'normal':
      return 'green';
    case 'low-normal':
      return 'yellow';
    default:
      return 'red';
  }
}

/** Retest reminders are surfaced from this many days out (a month's notice to book the draw). */
export const REMIND_WITHIN_DAYS = 30;

/** Retest reminders due within the window, overdue first, soonest next. */
export function dueReminders(reminders: RetestReminder[]): RetestReminder[] {
  return reminders
    .filter((r) => r.dueInDays !== null && r.dueInDays <= REMIND_WITHIN_DAYS)
    .sort((a, b) => (a.dueInDays as number) - (b.dueInDays as number));
}

/** Statuses that warrant a retest (mirrors engine/micronutrients NEEDS_RETEST). */
const RETEST_STATUSES: ReadonlySet<MarkerStatus> = new Set(['low', 'elevated', 'high']);

export interface BloodworkAttention {
  /** Retests due within REMIND_WITHIN_DAYS (overdue first). */
  due: RetestReminder[];
  /** Low / elevated markers with neither a test date nor a planned retest — no reminder can be scheduled yet. */
  undated: BloodMarker[];
}

/**
 * Everything the Bloodwork card (and a Today banner) should flag: retests
 * that are due, plus flagged markers that cannot be scheduled because the
 * user has not entered a test date. The app never invents a lab date
 * (review R2-5) — it asks for one instead, so reminders are visible from a
 * fresh install. Pure: `today` is the caller's clock.
 */
export function bloodworkAttention(bloodwork: BloodMarker[], today: ISODate): BloodworkAttention {
  const markers = Array.isArray(bloodwork) ? bloodwork : [];
  return {
    due: dueReminders(retestReminders(markers, today)),
    undated: markers.filter((m) => RETEST_STATUSES.has(m.status) && !m.testedOn && !m.retestOn),
  };
}

export const MARKER_STATUS_OPTIONS: Array<{ value: MarkerStatus; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'low-normal', label: 'Low-normal' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'elevated', label: 'Elevated' },
];

/** "3.0%", "19 ng/mL", "382 ng/dL"; a 0 value with no unit (zinc placeholder) renders "—". */
export function markerValueText(m: BloodMarker): string {
  if (!Number.isFinite(m.value) || (m.value === 0 && !m.unit)) return '—';
  const dp = m.unit === '%' || !Number.isInteger(m.value) ? 1 : 0;
  const n = m.value.toFixed(dp);
  if (!m.unit) return n;
  return m.unit === '%' ? `${n}%` : `${n} ${m.unit}`;
}

/** 'Omega-3 index' → 'omega-3-index', unique against existing keys. */
export function slugKey(label: string, existing: string[]): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'marker';
  let key = base;
  let n = 2;
  while (existing.includes(key)) key = `${base}-${n++}`;
  return key;
}

export const SESSION_OPTIONS: Array<{ value: SessionType; label: string }> = [
  { value: 'rest', label: 'Rest' },
  { value: 'upper', label: 'Upper' },
  { value: 'lower', label: 'Lower' },
  { value: 'push', label: 'Push' },
  { value: 'pull', label: 'Pull' },
  { value: 'legs', label: 'Legs' },
  { value: 'full', label: 'Full body' },
  { value: 'cardio', label: 'Cardio' },
];

/** Session types that count as a lift day for carb cycling (mirrors engine/nutrition NON_LIFT). */
export function isLiftSession(s: SessionType): boolean {
  return s !== 'rest' && s !== 'cardio';
}

export const CUISINE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'indian', label: 'Indian' },
  { value: 'middle-eastern', label: 'Middle Eastern' },
  { value: 'western', label: 'Western' },
  { value: 'generic', label: 'Generic' },
];

/** Clamp helper for HH:MM inputs: browsers can emit '' or 'HH:MM:SS'. */
export function normalizeHHMM(v: string): string | null {
  const m = /^(\d{2}):(\d{2})/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${m[1]}:${m[2]}`;
}

export function isISODate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}
