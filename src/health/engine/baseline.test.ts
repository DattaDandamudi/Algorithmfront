import { describe, expect, it } from 'vitest';
import type { DailyRecord } from '../data/types';
import { addDays } from '../lib/dates';
import { METRIC_DIRECTION, baselineDelta, metricSeries, metricValue, rollingMean, weightDirection } from './baseline';

const ASOF = '2026-09-06';

/** values[i] is the record for ASOF − (len − 1 − i); null → no record that day. */
function days(values: Array<Partial<DailyRecord> | null>, asOf = ASOF): DailyRecord[] {
  const out: DailyRecord[] = [];
  const n = values.length;
  values.forEach((v, i) => {
    if (v) out.push({ d: addDays(asOf, -(n - 1 - i)), ...v });
  });
  return out;
}

describe('baselineDelta', () => {
  it('uses the 30 days strictly before asOf and compares today against them', () => {
    const recs = days([...Array.from({ length: 10 }, () => ({ hrv: 50 })), { hrv: 60 }]);
    const r = baselineDelta(recs, 'hrv', ASOF);
    expect(r.today).toBe(60);
    expect(r.baseline).toBe(50);
    expect(r.delta).toBe(10);
    expect(r.pct).toBe(20);
    expect(r.n).toBe(10);
    expect(r.good).toBe(true); // hrv: up is good
  });

  it('includes today only when asked', () => {
    const recs = days([...Array.from({ length: 10 }, () => ({ hrv: 50 })), { hrv: 60 }]);
    const r = baselineDelta(recs, 'hrv', ASOF, 30, { includeToday: true });
    expect(r.n).toBe(11);
    expect(r.baseline).toBeCloseTo(560 / 11, 2);
  });

  it('respects the window boundary (day −30 in, day −31 out)', () => {
    const recs: DailyRecord[] = [
      { d: addDays(ASOF, -31), hrv: 100 },
      { d: addDays(ASOF, -30), hrv: 40 },
      { d: ASOF, hrv: 50 },
    ];
    const r = baselineDelta(recs, 'hrv', ASOF, 30);
    expect(r.baseline).toBe(40);
    expect(r.n).toBe(1);
    expect(r.delta).toBe(10);
  });

  it('ignores records after asOf', () => {
    const recs: DailyRecord[] = [
      { d: addDays(ASOF, -1), rhr: 50 },
      { d: ASOF, rhr: 52 },
      { d: addDays(ASOF, 1), rhr: 90 },
    ];
    const r = baselineDelta(recs, 'rhr', ASOF);
    expect(r.baseline).toBe(50);
    expect(r.n).toBe(1);
  });

  it('flags direction: rhr up is bad, tobacco down is good, kcal has no direction, zero delta is neutral', () => {
    const rhr = baselineDelta(days([{ rhr: 50 }, { rhr: 50 }, { rhr: 54 }]), 'rhr', ASOF);
    expect(rhr.good).toBe(false);
    const tob = baselineDelta(days([{ tob: 5 }, { tob: 5 }, { tob: 2 }]), 'tob', ASOF);
    expect(tob.good).toBe(true);
    expect(tob.delta).toBe(-3);
    const kc = baselineDelta(days([{ kc: 1900 }, { kc: 1900 }, { kc: 2100 }]), 'kc', ASOF);
    expect(kc.good).toBeNull();
    expect(kc.delta).toBe(200);
    const flat = baselineDelta(days([{ hrv: 55 }, { hrv: 55 }, { hrv: 55 }]), 'hrv', ASOF);
    expect(flat.delta).toBe(0);
    expect(flat.good).toBeNull();
  });

  it('allows a direction override (weight during muscle gain)', () => {
    const recs = days([{ w: 170 }, { w: 170 }, { w: 171 }]);
    expect(baselineDelta(recs, 'w', ASOF).good).toBe(false); // default fat-loss: down is good
    expect(baselineDelta(recs, 'w', ASOF, 30, { direction: 'up' }).good).toBe(true);
    expect(baselineDelta(recs, 'w', ASOF, 30, { direction: 'none' }).good).toBeNull();
  });

  it('returns a baseline but no delta when today is missing', () => {
    const recs = days([{ hrv: 50 }, { hrv: 54 }, null]);
    const r = baselineDelta(recs, 'hrv', ASOF);
    expect(r.today).toBeNull();
    expect(r.baseline).toBe(52);
    expect(r.delta).toBeNull();
    expect(r.pct).toBeNull();
    expect(r.good).toBeNull();
    expect(r.n).toBe(2);
  });

  it('returns nulls (never NaN) with no data at all', () => {
    const r = baselineDelta([], 'hrv', ASOF);
    expect(r).toEqual({ today: null, baseline: null, delta: null, pct: null, n: 0, good: null });
  });

  it('pct is null when the baseline is zero', () => {
    const r = baselineDelta(days([{ tob: 0 }, { tob: 0 }, { tob: 2 }]), 'tob', ASOF);
    expect(r.baseline).toBe(0);
    expect(r.delta).toBe(2);
    expect(r.pct).toBeNull();
    expect(r.good).toBe(false);
  });
});

describe('metricSeries', () => {
  it('yields one point per calendar day, ascending, with null gaps', () => {
    const recs = days([{ st: 8000 }, null, { st: 9000 }, { kc: 1900 }]);
    const s = metricSeries(recs, 'st', ASOF, 5);
    expect(s.map((p) => p.d)).toEqual([-4, -3, -2, -1, 0].map((k) => addDays(ASOF, k)));
    expect(s.map((p) => p.v)).toEqual([null, 8000, null, 9000, null]);
  });

  it('handles a zero-length window', () => {
    expect(metricSeries([], 'st', ASOF, 0)).toEqual([]);
  });

  it('metricValue treats non-finite values as missing', () => {
    expect(metricValue({ d: ASOF, hrv: Number.NaN }, 'hrv')).toBeNull();
    expect(metricValue({ d: ASOF, hrv: 55 }, 'hrv')).toBe(55);
    expect(metricValue(undefined, 'hrv')).toBeNull();
  });
});

describe('rollingMean', () => {
  it('averages the non-null values in the trailing window', () => {
    expect(rollingMean([1, 2, 3, null, 5], 3)).toEqual([1, 1.5, 2, 2.5, 4]);
  });
  it('returns null where fewer than minCount values are available', () => {
    expect(rollingMean([1, null, null, 4], 2, 2)).toEqual([null, null, null, null]);
    expect(rollingMean([1, 3, null, 4], 2, 2)).toEqual([null, 2, null, null]);
  });
});

describe('METRIC_DIRECTION', () => {
  it('encodes the spec directions', () => {
    expect(METRIC_DIRECTION.hrv).toBe('up');
    expect(METRIC_DIRECTION.rec).toBe('up');
    expect(METRIC_DIRECTION.rhr).toBe('down');
    expect(METRIC_DIRECTION.slh).toBe('up');
    expect(METRIC_DIRECTION.st).toBe('up');
    expect(METRIC_DIRECTION.tob).toBe('down');
    expect(METRIC_DIRECTION.w).toBe('down');
    expect(METRIC_DIRECTION.p).toBe('up');
    expect(METRIC_DIRECTION.fi).toBe('up');
    expect(METRIC_DIRECTION.kc).toBe('none');
  });
  it('weightDirection follows the goal phase', () => {
    expect(weightDirection('fat-loss')).toBe('down');
    expect(weightDirection('muscle-gain')).toBe('up');
    expect(weightDirection('maintenance')).toBe('none');
  });
});
