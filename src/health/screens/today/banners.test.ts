import { describe, expect, it } from 'vitest';
import type { BloodMarker } from '../../data/types';
import { QUOTA_BYTES } from '../../data/storage';
import { DEFAULT_BLOODWORK } from '../../data/defaults';
import { BACKUP_SNOOZE_DAYS, MAX_VISIBLE_BANNERS, allTodayBanners, escalationKey, retestPhrase, selectTodayBanners, type TodayBannerInputs } from './banners';

const DAY_MS = 86_400_000;
const TODAY = '2026-09-06';
const NOW = Date.UTC(2026, 8, 6, 12, 0, 0);

const LEAD: BloodMarker = { key: 'lead', label: 'Lead (blood)', value: 4.3, unit: 'µg/dL', status: 'elevated' };
const VITD: BloodMarker = { key: 'vitd', label: 'Vitamin D', value: 19, unit: 'ng/mL', status: 'low' };

const okStorage: TodayBannerInputs['storage'] = { quotaWarning: false, integrity: null, bytesUsed: 1000 };

function inputs(patch: Partial<TodayBannerInputs> = {}): TodayBannerInputs {
  return {
    bloodwork: [],
    today: TODAY,
    storage: okStorage,
    lastExportAt: NOW - DAY_MS, // exported yesterday → no backup nag
    recordCount: 30,
    nowMs: NOW,
    ...patch,
  };
}

describe('escalation banner (R1-14)', () => {
  it('fires red for a marker whose guidance escalates, links to Bloodwork, and is never a self-care tip', () => {
    const [b] = selectTodayBanners(inputs({ bloodwork: [LEAD] }));
    expect(b.kind).toBe('escalation');
    expect(b.tone).toBe('error');
    expect(b.message).toBe('Lead 4.3 µg/dL is elevated — this needs a physician follow-up, not app management.');
    expect(b.action).toEqual({ label: 'Open Bloodwork', target: 'bloodwork' });
    expect(b.message).not.toMatch(/cook|home|supplement|try /i);
    expect(b.dismiss).toEqual({ type: 'escalation', key: escalationKey(LEAD) });
  });

  it('does not fire for non-escalating markers, even when flagged', () => {
    expect(allTodayBanners(inputs({ bloodwork: [VITD, { ...LEAD, status: 'normal', value: 1.2 }] })).some((b) => b.kind === 'escalation')).toBe(false);
  });

  it('is dismissed per marker + value and re-surfaces for a new result', () => {
    const acked = [escalationKey(LEAD)];
    expect(allTodayBanners(inputs({ bloodwork: [LEAD], acknowledgedEscalations: acked })).some((b) => b.kind === 'escalation')).toBe(false);
    const retest = { ...LEAD, value: 5.1 };
    expect(allTodayBanners(inputs({ bloodwork: [retest], acknowledgedEscalations: acked })).some((b) => b.kind === 'escalation')).toBe(true);
  });

  it('fires on the default persona bloodwork (lead 4.3)', () => {
    expect(selectTodayBanners(inputs({ bloodwork: DEFAULT_BLOODWORK }))[0]?.kind).toBe('escalation');
  });
});

describe('storage + backup banners (§10, R2-6)', () => {
  it('nags for a JSON backup when records exist and no export was ever made', () => {
    const [b] = selectTodayBanners(inputs({ lastExportAt: undefined }));
    expect(b.kind).toBe('backup');
    expect(b.tone).toBe('info');
    expect(b.message).toContain("localStorage isn't guaranteed durable — export a JSON backup");
    expect(b.message).toContain('never exported');
    expect(b.action.target).toBe('data');
    expect(b.dismiss).toEqual({ type: 'backup', until: '2026-09-13' });
    expect(BACKUP_SNOOZE_DAYS).toBe(7);
  });

  it('nags when the last export is 14+ days old and cites the age', () => {
    expect(allTodayBanners(inputs({ lastExportAt: NOW - 13 * DAY_MS })).some((b) => b.kind === 'backup')).toBe(false);
    const b = allTodayBanners(inputs({ lastExportAt: NOW - 20 * DAY_MS })).find((x) => x.kind === 'backup');
    expect(b?.message).toContain('Last export 20 days ago');
  });

  it('stays quiet with no records, or while snoozed (snooze expires on its date)', () => {
    expect(allTodayBanners(inputs({ lastExportAt: undefined, recordCount: 0 }))).toEqual([]);
    expect(allTodayBanners(inputs({ lastExportAt: undefined, backupReminderSnoozedUntil: '2026-09-10' }))).toEqual([]);
    expect(allTodayBanners(inputs({ lastExportAt: undefined, backupReminderSnoozedUntil: TODAY })).some((b) => b.kind === 'backup')).toBe(true);
  });

  it('storage error > quota > integrity, and a storage banner replaces the backup nag', () => {
    const err = allTodayBanners(inputs({ lastExportAt: undefined, storage: { ...okStorage, lastError: 'QuotaExceededError: write failed', quotaWarning: true } }));
    expect(err.map((b) => b.id)).toEqual(['storage:error']);
    expect(err[0].tone).toBe('error');
    expect(err[0].message).toBe('QuotaExceededError: write failed');

    const quota = allTodayBanners(inputs({ storage: { ...okStorage, quotaWarning: true, bytesUsed: QUOTA_BYTES * 0.8 } }));
    expect(quota[0].id).toBe('storage:quota');
    expect(quota[0].message).toContain('80% full');

    const integ = allTodayBanners(inputs({ storage: { ...okStorage, integrity: { version: 1, shards: 2, records: 30, problems: ['a', 'b'], checkedAt: NOW } } }));
    expect(integ[0].id).toBe('storage:integrity');
    expect(integ[0].message).toContain('2 data integrity problems');
  });
});

describe('retest banner (§6.7, R2-5)', () => {
  it('shows nothing when no marker has a test or retest date (Settings owns that nudge)', () => {
    expect(allTodayBanners(inputs({ bloodwork: [VITD] }))).toEqual([]);
  });

  it('lists retests due within 30 days, soonest first, linking to Bloodwork', () => {
    const markers: BloodMarker[] = [
      { ...VITD, retestOn: '2026-09-18' },
      { key: 'ferritin', label: 'Ferritin', value: 23, unit: 'ng/mL', status: 'low', retestOn: '2026-09-10' },
      { key: 'omega3', label: 'Omega-3 index', value: 3, unit: '%', status: 'low', retestOn: '2026-12-01' },
    ];
    const [b] = selectTodayBanners(inputs({ bloodwork: markers }));
    expect(b.kind).toBe('retest');
    expect(b.tone).toBe('info');
    expect(b.message).toBe('Retest due: Ferritin in 4 days, Vitamin D in 12 days');
    expect(b.action).toEqual({ label: 'Open Bloodwork', target: 'bloodwork' });
    expect(b.dismiss).toBeUndefined();
  });

  it('suggests testedOn + 90 days for flagged markers and says overdue when past', () => {
    const [b] = selectTodayBanners(inputs({ bloodwork: [{ ...VITD, testedOn: '2026-06-01' }] }));
    expect(b.message).toBe('Retest overdue: Vitamin D 7 days overdue');
    expect(retestPhrase({ marker: VITD, dueInDays: 0, overdue: false, suggestedRetest: TODAY })).toBe('Vitamin D today');
    expect(retestPhrase({ marker: VITD, dueInDays: 1, overdue: false, suggestedRetest: '2026-09-07' })).toBe('Vitamin D in 1 day');
  });
});

describe('ordering and cap', () => {
  it('orders escalation → storage/backup → retest and shows at most two', () => {
    const all = allTodayBanners(inputs({ bloodwork: [LEAD, { ...VITD, retestOn: '2026-09-18' }], lastExportAt: undefined }));
    expect(all.map((b) => b.kind)).toEqual(['escalation', 'backup', 'retest']);
    const shown = selectTodayBanners(inputs({ bloodwork: [LEAD, { ...VITD, retestOn: '2026-09-18' }], lastExportAt: undefined }));
    expect(MAX_VISIBLE_BANNERS).toBe(2);
    expect(shown.map((b) => b.kind)).toEqual(['escalation', 'backup']);
  });

  it('never throws on a malformed bloodwork value', () => {
    expect(() => allTodayBanners(inputs({ bloodwork: undefined as unknown as BloodMarker[] }))).not.toThrow();
  });
});
