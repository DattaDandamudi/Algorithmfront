/**
 * One-line live summaries shown under each Settings section title (so the
 * collapsed list still tells the user what is set). Pure functions of state;
 * every number is read from settings / storage, never invented.
 */
import { isAIConfigured, MODEL_OPTIONS } from '../../ai/config';
import type { AppSettings, DailyRecord, ISODate, StorageStatus } from '../../data/types';
import { QUOTA_BYTES } from '../../data/storage';
import { fmt, fmtWeight } from '../../lib/format';
import { APP_VERSION } from './AboutSection';
import { CUISINE_OPTIONS, SESSION_OPTIONS, bloodworkAttention, formatBytes, isLiftSession, relativeTime, restLabel } from './util';

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
  const { due, undated } = bloodworkAttention(markers, today);
  const overdue = due.filter((r) => r.overdue).length;
  const parts = [`${markers.length} marker${markers.length === 1 ? '' : 's'}`, `${flagged} flagged`];
  if (overdue) parts.push(`${overdue} retest${overdue === 1 ? '' : 's'} overdue`);
  else if (due.length) parts.push(`${due.length} retest${due.length === 1 ? '' : 's'} due soon`);
  else if (undated.length) parts.push(`${undated.length} need${undated.length === 1 ? 's' : ''} a test date`);
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

export function trainingCaption(s: AppSettings): string {
  const t = s.training;
  const p = t.progression;
  const custom = t.customExercises.length;
  const parts = [t.units, `rest ${restLabel(t.restTimerSec)}`, `RPE ${p.targetRpe[0]}–${p.targetRpe[1]}`, `+${p.loadStepPctUpper}/${p.loadStepPctLower}%`];
  if (custom) parts.push(`${custom} custom`);
  return parts.join(' · ');
}

export function checkInCaption(s: AppSettings): string {
  const c = s.checkIn;
  if (!c.enabled) return 'Prompt off — nothing is asked';
  const extra = [c.weeklySrss ? 'SRSS' : null, c.monthlyPss ? 'PSS-4' : null].filter(Boolean).join(' + ');
  return `${c.items.length} item${c.items.length === 1 ? '' : 's'} from ${c.promptAfter}${extra ? ` · ${extra}` : ''}`;
}

/** `count` is the number of sessions stored — the honest measure of an import. */
export function importsCaption(s: AppSettings, count: number, now: number): string {
  const last = Math.max(s.training.imports?.whoopAt ?? 0, s.training.imports?.stravaAt ?? 0, s.training.imports?.appleAt ?? 0);
  const sessions = `${count} session${count === 1 ? '' : 's'}`;
  return last ? `${sessions} · last import ${relativeTime(last, now)}` : `${sessions} · WHOOP, Strava, Apple Health`;
}

export function aboutCaption(): string {
  return `Pulse v${APP_VERSION} · evidence anchors · disclaimer`;
}
