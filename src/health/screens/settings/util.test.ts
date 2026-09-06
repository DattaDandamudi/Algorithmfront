import { describe, expect, it } from 'vitest';
import type { BloodMarker } from '../../data/types';
import { retestReminders } from '../../engine/micronutrients';
import { DAY_MS, daysSince, dueReminders, formatBytes, isLiftSession, markerTone, markerValueText, normalizeHHMM, relativeTime, slugKey } from './util';

const NOW = Date.UTC(2026, 8, 6, 12, 0, 0);

describe('formatBytes', () => {
  it('scales B → KB → MB', () => {
    expect(formatBytes(812)).toBe('812 B');
    expect(formatBytes(3.5 * 1024)).toBe('3.5 KB'); // one decimal only below 10 KB
    expect(formatBytes(34.2 * 1024)).toBe('34 KB');
    expect(formatBytes(120 * 1024)).toBe('120 KB');
    expect(formatBytes(1.2 * 1024 * 1024)).toBe('1.20 MB');
    expect(formatBytes(-1)).toBe('—');
  });
});

describe('relativeTime / daysSince', () => {
  it('reads naturally at each scale', () => {
    expect(relativeTime(undefined, NOW)).toBe('never');
    expect(relativeTime(NOW - 10_000, NOW)).toBe('just now');
    expect(relativeTime(NOW - 4 * 60_000, NOW)).toBe('4 min ago');
    expect(relativeTime(NOW - 3 * 3_600_000, NOW)).toBe('3 h ago');
    expect(relativeTime(NOW - 12 * DAY_MS, NOW)).toBe('12 days ago');
    expect(relativeTime(NOW - 1 * DAY_MS, NOW)).toBe('1 day ago');
  });
  it('never goes negative for a future timestamp', () => {
    expect(relativeTime(NOW + 5_000, NOW)).toBe('just now');
    expect(daysSince(NOW + DAY_MS, NOW)).toBe(0);
    expect(daysSince(NOW - 14.9 * DAY_MS, NOW)).toBe(14);
    expect(daysSince(undefined, NOW)).toBeNull();
  });
});

describe('bloodwork helpers', () => {
  it('maps status to the semantic tone (red / yellow / green)', () => {
    expect(markerTone('low')).toBe('red');
    expect(markerTone('high')).toBe('red');
    expect(markerTone('elevated')).toBe('red');
    expect(markerTone('low-normal')).toBe('yellow');
    expect(markerTone('normal')).toBe('green');
  });
  it('formats values with the unit and hides the zinc placeholder', () => {
    const m = (value: number, unit: string): BloodMarker => ({ key: 'k', label: 'L', value, unit, status: 'normal' });
    expect(markerValueText(m(19, 'ng/mL'))).toBe('19 ng/mL');
    expect(markerValueText(m(3, '%'))).toBe('3.0%');
    expect(markerValueText(m(4.3, 'µg/dL'))).toBe('4.3 µg/dL');
    expect(markerValueText(m(0, ''))).toBe('—');
  });
  it('slugs labels uniquely', () => {
    expect(slugKey('Omega-3 index', [])).toBe('omega-3-index');
    expect(slugKey('HbA1c', ['hba1c'])).toBe('hba1c-2');
    expect(slugKey('!!!', [])).toBe('marker');
  });
  it('surfaces retests due within 30 days, overdue first', () => {
    const today = '2026-09-06';
    const markers: BloodMarker[] = [
      { key: 'vitd', label: 'Vitamin D', value: 19, unit: 'ng/mL', status: 'low', testedOn: '2026-05-01' }, // suggested 2026-07-30 → overdue
      { key: 'ferritin', label: 'Ferritin', value: 23, unit: 'ng/mL', status: 'low', retestOn: '2026-09-20' }, // due in 14 days
      { key: 'zinc', label: 'Zinc', value: 0, unit: '', status: 'low-normal', testedOn: '2026-05-01' }, // low-normal → no suggestion
      { key: 'lead', label: 'Lead', value: 4.3, unit: 'µg/dL', status: 'elevated', retestOn: '2027-01-01' }, // far out
    ];
    const due = dueReminders(retestReminders(markers, today));
    expect(due.map((r) => r.marker.key)).toEqual(['vitd', 'ferritin']);
    expect(due[0].overdue).toBe(true);
    expect(due[1].dueInDays).toBe(14);
  });
});

describe('misc', () => {
  it('lift-day sessions exclude rest and cardio', () => {
    expect(isLiftSession('upper')).toBe(true);
    expect(isLiftSession('cardio')).toBe(false);
    expect(isLiftSession('rest')).toBe(false);
  });
  it('normalises time inputs', () => {
    expect(normalizeHHMM('23:10:00')).toBe('23:10');
    expect(normalizeHHMM('')).toBeNull();
    expect(normalizeHHMM('25:00')).toBeNull();
  });
});
