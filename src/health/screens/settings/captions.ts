/**
 * One-line live summaries shown under each Settings section title (so the
 * collapsed list still tells the user what is set). Pure functions of state;
 * every number is read from settings / storage, never invented.
 */
import { isAIConfigured, MODEL_OPTIONS } from '../../ai/client';
import type { AppSettings, DailyRecord, ISODate, StorageStatus } from '../../data/types';
import { QUOTA_BYTES } from '../../data/storage';
import { retestReminders } from '../../engine/micronutrients';
import { fmt, fmtWeight } from '../../lib/format';
import { APP_VERSION } from './AboutSection';
import { CUISINE_OPTIONS, SESSION_OPTIONS, dueReminders, formatBytes, isLiftSession, relativeTime } from './util';

const PHASE_LABEL: Record<AppSettings['profile']['goalPhase'], string> = {
  'fat-loss': 'fat loss',
  maintenance: 'maintenance',
  'muscle-gain': 'muscle gain',
};

export function profileCaption(s: AppSettings): string {
  const p = s.profile;
  return `${p.name || 'You'} · ${p.age} · ${fmtWeight(p.weightLb, p.units)} · ${PHASE_LABEL[p.goalPhase]}`;
}

export function targetsCaption(s: AppSettings): string {
  const t = s.targets;
  return `${fmt(t.kcal)} kcal · ${t.protein} g protein · ${t.fatFloor} g fat floor · α ${t.ewmaAlpha.toFixed(2)}`;
}

export function splitCaption(s: AppSettings): string {
  const split = s.profile.split;
  const days = ([0, 1, 2, 3, 4, 5, 6] as const).map((w) => split[w]);
  const lifts = days.filter(isLiftSession).length;
  const kinds = Array.from(new Set(days.filter(isLiftSession))).map((k) => SESSION_OPTIONS.find((o) => o.value === k)?.label.toLowerCase() ?? k);
  return lifts === 0 ? 'No lift days set' : `${lifts} lift day${lifts === 1 ? '' : 's'}/wk · ${kinds.join('/')}`;
}

export function bloodworkCaption(s: AppSettings, today: ISODate): string {
  const markers = s.profile.bloodwork;
  if (!markers.length) return 'No markers on file';
  const flagged = markers.filter((m) => m.status !== 'normal').length;
  const due = dueReminders(retestReminders(markers, today));
  const overdue = due.filter((r) => r.overdue).length;
  const parts = [`${markers.length} marker${markers.length === 1 ? '' : 's'}`, `${flagged} flagged`];
  if (overdue) parts.push(`${overdue} retest${overdue === 1 ? '' : 's'} overdue`);
  else if (due.length) parts.push(`${due.length} retest${due.length === 1 ? '' : 's'} due soon`);
  return parts.join(' · ');
}

export function foodCaption(s: AppSettings): string {
  const cuisines = s.profile.cuisines.map((c) => CUISINE_OPTIONS.find((o) => o.value === c)?.label ?? c);
  const n = s.favorites.length;
  return `${cuisines.length ? cuisines.join(', ') : 'No cuisine priors'} · ${n} favorite${n === 1 ? '' : 's'}`;
}

export function whoopCaption(s: AppSettings, now: number): string {
  const w = s.whoop;
  if (!w.connected) return 'Not connected · CSV import or manual entry';
  const src = w.source === 'csv' ? 'CSV import' : 'manual entry';
  return w.lastImportAt ? `Connected · ${src} · ${relativeTime(w.lastImportAt, now)}` : `Connected · ${src}`;
}

export function coachCaption(s: AppSettings): string {
  const ai = s.ai;
  if (ai.provider === 'none') return 'Offline coach · local food DB';
  const model = MODEL_OPTIONS.find((m) => m.id === ai.model)?.label.replace(/\s*\(.*\)$/, '') ?? ai.model;
  const via = ai.provider === 'proxy' ? 'Proxy' : 'API key';
  return isAIConfigured(ai) ? `${via} · ${model} · ${ai.tone}` : `${via} not set — offline until configured`;
}

export function dataCaption(storage: StorageStatus, records: DailyRecord[], now: number): string {
  const pct = (storage.bytesUsed / QUOTA_BYTES) * 100;
  const used = `${formatBytes(storage.bytesUsed)} (${fmt(pct, pct < 1 ? 1 : 0)}%)`;
  if (!storage.available) return `${used} · storage unavailable`;
  if (storage.lastError) return `${used} · last write failed`;
  return `${records.length} day${records.length === 1 ? '' : 's'} · ${used} · saved ${relativeTime(storage.lastSavedAt, now)}`;
}

export function aboutCaption(): string {
  return `Pulse v${APP_VERSION} · evidence anchors · disclaimer`;
}
