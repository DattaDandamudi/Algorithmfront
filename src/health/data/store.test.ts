import { describe, expect, it } from 'vitest';
import { applyTrend, findDuplicateWorkout, withTotals, withTrainingDerived, workoutLoad } from './store';
import type { DailyRecord, Meal, Workout } from './types';

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
    // Records that already carry every derived field (EWMA *and* Kalman) must
    // come back untouched: the dirty-shard diff is a reference comparison, so a
    // recompute that rebuilt equal-but-new objects would rewrite every month.
    const days = applyTrend(
      {
        '2026-09-01': { d: '2026-09-01', w: 172 },
        '2026-09-02': { d: '2026-09-02', w: 174 },
      } as Record<string, DailyRecord>,
      0.1,
    );
    expect(days['2026-09-01'].wt).toBe(172);
    expect(days['2026-09-01'].kl).toBe(172);
    const out = applyTrend(days, 0.1);
    expect(out).toBe(days);
    expect(out['2026-09-01']).toBe(days['2026-09-01']);
  });

  it('removes a stale trend when no weigh-ins exist', () => {
    const days = {
      '2026-09-01': { d: '2026-09-01', wt: 170, kl: 170, ks: 0, kv: 0.81, ws: true },
    } as Record<string, DailyRecord>;
    const out = applyTrend(days, 0.1);
    expect(out['2026-09-01']).toEqual({ d: '2026-09-01' });
  });
});

describe('applyTrend — Kalman state (§1a: kl/ks/kv/ws)', () => {
  it('stamps the filtered level, slope, level variance and the outlier flag', () => {
    const days = {
      '2026-09-01': { d: '2026-09-01', w: 172 },
      '2026-09-02': { d: '2026-09-02', w: 171 },
      '2026-09-03': { d: '2026-09-03' },
    } as Record<string, DailyRecord>;
    const out = applyTrend(days, 0.1);
    // Anchor day: x₀ = [w₀, 0], P₀ = diag(0.81, 0.09).
    expect(out['2026-09-01'].kl).toBe(172);
    expect(out['2026-09-01'].ks).toBe(0);
    expect(out['2026-09-01'].kv).toBe(0.81);
    // Hand-worked first update (see kalman.test.ts): level 171.4709, P₀₀ 0.4285.
    expect(out['2026-09-02'].kl).toBe(171.47);
    expect(out['2026-09-02'].ks).toBeCloseTo(-0.05233, 5);
    expect(out['2026-09-02'].kv).toBeCloseTo(0.4285, 4);
    // A day without a weigh-in still gets a (predicted) level.
    expect(out['2026-09-03'].kl).toBeCloseTo(171.42, 2);
    expect(out['2026-09-03'].kv as number).toBeGreaterThan(out['2026-09-02'].kv as number);
    expect(out['2026-09-03'].ws).toBeUndefined();
  });

  it('flags a typo with `ws` and keeps the level where it was', () => {
    const days: Record<string, DailyRecord> = {};
    for (let i = 1; i <= 10; i++) {
      const d = `2026-09-${String(i).padStart(2, '0')}`;
      days[d] = { d, w: 172 };
    }
    days['2026-09-11'] = { d: '2026-09-11', w: 272 };
    const out = applyTrend(days, 0.1);
    expect(out['2026-09-11'].ws).toBe(true);
    expect(out['2026-09-11'].kl).toBeCloseTo(172, 1);
    // EWMA has no gate, so the display trend does move — that is the difference
    // the two trends exist for.
    expect(out['2026-09-11'].wt as number).toBeGreaterThan(180);
  });

  it('leaves records with no Kalman state clean rather than stamping nulls', () => {
    const out = applyTrend(
      {
        '2026-09-01': { d: '2026-09-01', kc: 1900 },
        '2026-09-02': { d: '2026-09-02', w: 172 },
      } as Record<string, DailyRecord>,
      0.1,
    );
    expect(out['2026-09-01']).toEqual({ d: '2026-09-01', kc: 1900 });
    expect(out['2026-09-02'].kl).toBe(172);
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
      '2026-09-06': { d: '2026-09-06', w: 171.8, wt: 171.8, kl: 171.8, ks: 0, kv: 0.81 },
      '2026-09-07': { d: '2026-09-07', bt: '23:10', wt: 171.8, kl: 171.8, ks: 0, kv: 0.81, ws: true },
    } as Record<string, DailyRecord>;
    const out = applyTrend(days, 0.1, '2026-09-06');
    expect(out['2026-09-07']).toEqual({ d: '2026-09-07', bt: '23:10' });
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

// ---------------------------------------------------------------------------
// Training-derived day fields
// ---------------------------------------------------------------------------

const W = (over: Partial<Workout> & { id: string; d: string }): Workout => ({
  start: '18:00',
  durationMin: 60,
  kind: 'strength',
  source: 'manual',
  ...over,
});

describe('workoutLoad', () => {
  it('prefers the stamped load so history never shifts when the model is retuned', () => {
    expect(workoutLoad(W({ id: 'a', d: '2026-09-01', load: 400, srpe: 9, durationMin: 60 }))).toBe(400);
  });

  it('falls back to Foster session RPE × minutes', () => {
    expect(workoutLoad(W({ id: 'a', d: '2026-09-01', srpe: 7, durationMin: 55 }))).toBe(385);
  });

  it('is undefined — not 0 — when there is nothing to compute from', () => {
    expect(workoutLoad(W({ id: 'a', d: '2026-09-01' }))).toBeUndefined();
    expect(workoutLoad(W({ id: 'a', d: '2026-09-01', srpe: 7, durationMin: 0 }))).toBeUndefined();
  });
});

describe('withTrainingDerived', () => {
  it('sums load, counts sessions and marks a lifting day', () => {
    const out = withTrainingDerived({ d: '2026-09-01' }, [
      W({ id: 'a', d: '2026-09-01', load: 420 }),
      W({ id: 'b', d: '2026-09-01', kind: 'cardio', load: 180 }),
    ]);
    expect(out).toMatchObject({ ld: 600, wko: 2, lift: true });
  });

  it('does not claim a lift day for cardio or mobility alone', () => {
    const out = withTrainingDerived({ d: '2026-09-01' }, [W({ id: 'a', d: '2026-09-01', kind: 'cardio', load: 180 })]);
    expect(out.wko).toBe(1);
    expect(out.lift).toBeUndefined();
  });

  it('clears the fields when the last session of a day is deleted', () => {
    const out = withTrainingDerived({ d: '2026-09-01', ld: 600, wko: 2, lift: true }, []);
    expect(out.ld).toBeUndefined();
    expect(out.wko).toBeUndefined();
    expect(out.lift).toBeUndefined();
  });

  it("keeps a user's explicit rest-day override", () => {
    const out = withTrainingDerived({ d: '2026-09-01', lift: false }, []);
    expect(out.lift).toBe(false);
  });

  it('preserves identity when nothing changed', () => {
    const rec: DailyRecord = { d: '2026-09-01', ld: 420, wko: 1, lift: true };
    expect(withTrainingDerived(rec, [W({ id: 'a', d: '2026-09-01', load: 420 })])).toBe(rec);
  });

  it('ignores a session with no computable load when summing', () => {
    const out = withTrainingDerived({ d: '2026-09-01' }, [W({ id: 'a', d: '2026-09-01', load: 300 }), W({ id: 'b', d: '2026-09-01' })]);
    expect(out).toMatchObject({ ld: 300, wko: 2 });
  });
});

describe('findDuplicateWorkout', () => {
  const existing = [
    W({ id: 'w1', d: '2026-09-01', start: '18:00', externalId: 'whoop:2026-09-01T18:00' }),
    W({ id: 'w2', d: '2026-09-03', start: '07:15', kind: 'cardio' }),
  ];

  it('matches on externalId first', () => {
    const hit = findDuplicateWorkout(W({ id: 'x', d: '2026-01-01', start: '05:00', externalId: 'whoop:2026-09-01T18:00' }), existing);
    expect(hit?.id).toBe('w1');
  });

  it('matches the same day and kind within 10 minutes', () => {
    expect(findDuplicateWorkout(W({ id: 'x', d: '2026-09-01', start: '18:09' }), existing)?.id).toBe('w1');
    expect(findDuplicateWorkout(W({ id: 'x', d: '2026-09-01', start: '17:51' }), existing)?.id).toBe('w1');
  });

  it('does not match past the window, a different kind, or a different day', () => {
    expect(findDuplicateWorkout(W({ id: 'x', d: '2026-09-01', start: '18:11' }), existing)).toBeNull();
    expect(findDuplicateWorkout(W({ id: 'x', d: '2026-09-01', start: '18:00', kind: 'cardio' }), existing)).toBeNull();
    expect(findDuplicateWorkout(W({ id: 'x', d: '2026-09-02', start: '18:00' }), existing)).toBeNull();
  });

  it('never matches on an unparseable start time', () => {
    expect(findDuplicateWorkout(W({ id: 'x', d: '2026-09-01', start: 'nope' }), existing)).toBeNull();
  });
});
