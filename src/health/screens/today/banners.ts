/**
 * Today header banners — pure selection so the rules are unit-testable.
 *
 * Sources, in priority order (the header shows at most MAX_VISIBLE_BANNERS so
 * the hero stays above the fold):
 *  1. escalation — a bloodwork marker whose `markerGuidance().escalate` is true
 *     (elevated lead, SPEC Caveats: "warrants physician follow-up, not app
 *     management … an escalation card rather than a self-care tip", R1-14).
 *     Red, dismissible per marker+value (`escalationKey`) so a new result
 *     re-surfaces it; the copy never suggests a habit.
 *  2. storage — the §10 durability layer: a failed write (error), quota above
 *     the warn ratio, or integrity problems found on load.
 *  3. backup — SPEC §10 "prompt periodic JSON export": records exist and the
 *     last export is missing or older than EXPORT_REMINDER_DAYS (R2-6). Info,
 *     snoozable for BACKUP_SNOOZE_DAYS. Skipped while a storage banner already
 *     points at Settings › Data.
 *  4. retest — §6.7 retest reminders due within REMIND_WITHIN_DAYS (R2-5).
 *     Markers without a test date produce nothing here; Settings owns the
 *     "add your test date" nudge.
 *
 * Nothing here reads the clock: `today` / `nowMs` are the caller's.
 */
import { QUOTA_BYTES } from '../../data/storage';
import type { BloodMarker, ISODate, StorageStatus } from '../../data/types';
import { markerGuidance, type RetestReminder } from '../../engine/micronutrients';
import { addDays } from '../../lib/dates';
import { fmt } from '../../lib/format';
import type { SettingsSection } from '../../nav';
import { backupOverdue, bloodworkAttention, daysSince, markerValueText } from '../settings/util';

/** Header real estate is scarce on a 390 px frame: two banners at most. */
export const MAX_VISIBLE_BANNERS = 2;
/** "Remind me later" on the backup banner. */
export const BACKUP_SNOOZE_DAYS = 7;

export type TodayBannerKind = 'escalation' | 'storage' | 'backup' | 'retest';

export interface TodayBanner {
  id: string;
  kind: TodayBannerKind;
  tone: 'error' | 'warn' | 'info';
  message: string;
  action: { label: string; target: SettingsSection };
  /** Present when the banner can be dismissed; tells the screen what to persist. */
  dismiss?: { type: 'escalation'; key: string } | { type: 'backup'; until: ISODate };
}

export interface TodayBannerInputs {
  bloodwork: BloodMarker[];
  today: ISODate;
  acknowledgedEscalations?: string[];
  storage: Pick<StorageStatus, 'quotaWarning' | 'lastError' | 'integrity' | 'bytesUsed'>;
  lastExportAt?: number;
  backupReminderSnoozedUntil?: ISODate;
  recordCount: number;
  /** Epoch ms, for the export age. */
  nowMs: number;
}

/** One acknowledgement per marker AND value — a re-test with a new number re-surfaces the banner. */
export function escalationKey(m: BloodMarker): string {
  return `${m.key}@${m.value}${m.unit ? ` ${m.unit}` : ''}`;
}

/** "Lead (blood)" → "Lead": the parenthetical is Settings detail, not banner copy. */
function shortLabel(m: BloodMarker): string {
  const s = m.label.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  return s || m.label;
}

function escalationBanners(markers: BloodMarker[], acknowledged: string[]): TodayBanner[] {
  const out: TodayBanner[] = [];
  for (const m of markers) {
    let escalate = false;
    try {
      escalate = markerGuidance(m).escalate;
    } catch {
      escalate = false;
    }
    if (!escalate) continue;
    const key = escalationKey(m);
    if (acknowledged.includes(key)) continue;
    out.push({
      id: `escalation:${key}`,
      kind: 'escalation',
      tone: 'error',
      // No habit, no dose, no "try": a physician matter (SPEC Caveats).
      message: `${shortLabel(m)} ${markerValueText(m)} is elevated — this needs a physician follow-up, not app management.`,
      action: { label: 'Open Bloodwork', target: 'bloodwork' },
      dismiss: { type: 'escalation', key },
    });
  }
  return out;
}

function storageBanner(storage: TodayBannerInputs['storage']): TodayBanner | null {
  const problems = storage.integrity?.problems.length ?? 0;
  if (storage.lastError) {
    return { id: 'storage:error', kind: 'storage', tone: 'error', message: storage.lastError, action: { label: 'Open Settings', target: 'data' } };
  }
  if (storage.quotaWarning) {
    return {
      id: 'storage:quota',
      kind: 'storage',
      tone: 'warn',
      message: `Storage is ${fmt((storage.bytesUsed / QUOTA_BYTES) * 100)}% full — export a backup before it fills.`,
      action: { label: 'Open Settings', target: 'data' },
    };
  }
  if (problems > 0) {
    return {
      id: 'storage:integrity',
      kind: 'storage',
      tone: 'warn',
      message: `${problems} data integrity ${problems === 1 ? 'problem' : 'problems'} found on load — review in Settings.`,
      action: { label: 'Open Settings', target: 'data' },
    };
  }
  return null;
}

function backupBanner(inp: TodayBannerInputs): TodayBanner | null {
  if (!backupOverdue(inp.lastExportAt, inp.recordCount, inp.nowMs)) return null;
  // ISO dates compare lexicographically; a snooze ending today has expired.
  if (inp.backupReminderSnoozedUntil && inp.backupReminderSnoozedUntil > inp.today) return null;
  const since = daysSince(inp.lastExportAt, inp.nowMs);
  const age = since === null ? 'You have never exported.' : `Last export ${since} day${since === 1 ? '' : 's'} ago.`;
  return {
    id: 'backup',
    kind: 'backup',
    tone: 'info',
    message: `localStorage isn't guaranteed durable — export a JSON backup. ${age}`,
    action: { label: 'Open Data', target: 'data' },
    dismiss: { type: 'backup', until: addDays(inp.today, BACKUP_SNOOZE_DAYS) },
  };
}

/** "Vitamin D in 12 days" / "Ferritin today" / "Vitamin D 3 days overdue". */
export function retestPhrase(r: RetestReminder): string {
  const d = r.dueInDays ?? 0;
  const name = shortLabel(r.marker);
  if (d < 0) return `${name} ${fmt(-d)} day${d === -1 ? '' : 's'} overdue`;
  if (d === 0) return `${name} today`;
  return `${name} in ${fmt(d)} day${d === 1 ? '' : 's'}`;
}

function retestBanner(markers: BloodMarker[], today: ISODate): TodayBanner | null {
  const { due } = bloodworkAttention(markers, today);
  if (!due.length) return null;
  const overdue = due.some((r) => r.overdue);
  return {
    id: 'retest',
    kind: 'retest',
    tone: 'info',
    message: `${overdue ? 'Retest overdue' : 'Retest due'}: ${due.map(retestPhrase).join(', ')}`,
    action: { label: 'Open Bloodwork', target: 'bloodwork' },
  };
}

/** Every banner that qualifies, in priority order (uncapped — for tests and counts). */
export function allTodayBanners(inp: TodayBannerInputs): TodayBanner[] {
  const markers = Array.isArray(inp.bloodwork) ? inp.bloodwork : [];
  const acknowledged = inp.acknowledgedEscalations ?? [];
  const out: TodayBanner[] = [...escalationBanners(markers, acknowledged)];
  const storage = storageBanner(inp.storage);
  if (storage) out.push(storage);
  else {
    const backup = backupBanner(inp);
    if (backup) out.push(backup);
  }
  const retest = retestBanner(markers, inp.today);
  if (retest) out.push(retest);
  return out;
}

/** The banners the Today header actually renders: priority order, capped. */
export function selectTodayBanners(inp: TodayBannerInputs): TodayBanner[] {
  return allTodayBanners(inp).slice(0, MAX_VISIBLE_BANNERS);
}
