import { describe, expect, it } from 'vitest';
import { applyTrend, withTotals } from './store';
import type { DailyRecord, Meal } from './types';

const meal = (over: Partial<Meal>): Meal => ({
  id: 'm1',
  t: '12:00',
  n: 'x',
  g: 100,
  kc: 100,
  p: 10,
  f: 5,
  c: 8,
  fi: 1.2,
  ...over,
});

describe('withTotals', () => {
  it('sums itemised meals into the day totals', () => {
    const rec: DailyRecord = { d: '2026-09-01', meals: [meal({ id: 'a' }), meal({ id: 'b', kc: 250, p: 30, f: 10, c: 20, fi: 2.5 })] };
    const out = withTotals(rec);
    expect(out).toMatchObject({ kc: 350, p: 40, f: 15, c: 28, fi: 3.7 });
  });

  it('returns the same object when totals already match', () => {
    const rec: DailyRecord = { d: '2026-09-01', kc: 100, p: 10, f: 5, c: 8, fi: 1.2, meals: [meal({})] };
    expect(withTotals(rec)).toBe(rec);
  });

  it('clears totals and the empty meals array when all meals are removed', () => {
    const rec: DailyRecord = { d: '2026-09-01', kc: 100, p: 10, f: 5, c: 8, fi: 1.2, meals: [] };
    const out = withTotals(rec);
    expect(out.meals).toBeUndefined();
    expect(out.kc).toBeUndefined();
    expect(out.p).toBeUndefined();
  });

  it('leaves manually entered totals alone when there are no meals', () => {
    const rec: DailyRecord = { d: '2026-09-01', kc: 1900, p: 180 };
    expect(withTotals(rec)).toBe(rec);
  });
});

describe('applyTrend', () => {
  it('writes the EWMA trend onto every record from the first weigh-in', () => {
    const days = {
      '2026-09-01': { d: '2026-09-01', w: 172 },
      '2026-09-02': { d: '2026-09-02', w: 174 },
      '2026-09-03': { d: '2026-09-03' },
    } as Record<string, DailyRecord>;
    const out = applyTrend(days, 0.1);
    expect(out['2026-09-01'].wt).toBe(172);
    expect(out['2026-09-02'].wt).toBe(172.2);
    // No weigh-in → trend carries forward
    expect(out['2026-09-03'].wt).toBe(172.2);
  });

  it('preserves object identity for unchanged records and the map when nothing changes', () => {
    const a: DailyRecord = { d: '2026-09-01', w: 172, wt: 172 };
    const b: DailyRecord = { d: '2026-09-02', w: 174, wt: 172.2 };
    const days = { [a.d]: a, [b.d]: b };
    const out = applyTrend(days, 0.1);
    expect(out).toBe(days);
    expect(out[a.d]).toBe(a);
  });

  it('removes a stale trend when no weigh-ins exist', () => {
    const days = { '2026-09-01': { d: '2026-09-01', wt: 170 } } as Record<string, DailyRecord>;
    const out = applyTrend(days, 0.1);
    expect(out['2026-09-01'].wt).toBeUndefined();
  });
});

describe('R7-13 applyTrend — never stamps a trend on a future-dated record', () => {
  it('a bedtime logged for tomorrow keeps its bedtime but gets no `wt`; today still does', () => {
    const days = {
      '2026-09-05': { d: '2026-09-05', w: 172 },
      '2026-09-06': { d: '2026-09-06', w: 171.8 },
      '2026-09-07': { d: '2026-09-07', bt: '23:10' },
    } as Record<string, DailyRecord>;
    const out = applyTrend(days, 0.1, '2026-09-06');
    expect(out['2026-09-06'].wt).toBe(171.98);
    expect(out['2026-09-07']).toEqual({ d: '2026-09-07', bt: '23:10' });
  });

  it('heals a stale trend already persisted on a future record', () => {
    const days = {
      '2026-09-06': { d: '2026-09-06', w: 171.8, wt: 171.8 },
      '2026-09-07': { d: '2026-09-07', bt: '23:10', wt: 171.8 },
    } as Record<string, DailyRecord>;
    const out = applyTrend(days, 0.1, '2026-09-06');
    expect(out['2026-09-07'].wt).toBeUndefined();
    expect(out['2026-09-06']).toBe(days['2026-09-06']); // unchanged record keeps identity
  });

  it('a weigh-in dated after `through` is still trended (real data, not a stub)', () => {
    const days = {
      '2026-09-06': { d: '2026-09-06', w: 172 },
      '2026-09-07': { d: '2026-09-07', w: 171 },
    } as Record<string, DailyRecord>;
    expect(applyTrend(days, 0.1, '2026-09-06')['2026-09-07'].wt).toBe(171.9);
  });
});
