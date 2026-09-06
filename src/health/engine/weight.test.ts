import { describe, expect, it } from 'vitest';
import type { DailyRecord } from '../data/types';
import { addDays } from '../lib/dates';
import {
  clampAlpha,
  computeEwmaTrend,
  isWeight,
  latestWeight,
  rateBand,
  targetLbPerWeek,
  trendAt,
  weeklyRate,
  weighInsInWeek,
  weeksOutsideBand,
} from './weight';

const D0 = '2026-08-01';
const day = (i: number) => addDays(D0, i);
const rec = (i: number, w?: number, extra: Partial<DailyRecord> = {}): DailyRecord => ({
  d: day(i),
  ...(w !== undefined ? { w } : {}),
  ...extra,
});

/**
 * Weights that make the α=0.10 EWMA trend fall EXACTLY linearly:
 * trend_t = T0 − s·t  ⇐  w_0 = T0, w_t = T0 − s·(t + 9)  (since Δtrend = α·(w − trend)).
 */
function linearRamp(days: number, lbPerWeek: number, T0 = 172): DailyRecord[] {
  const s = lbPerWeek / 7;
  return Array.from({ length: days }, (_, t) => rec(t, t === 0 ? T0 : T0 - s * (t + 9)));
}

describe('computeEwmaTrend (§6.1, α=0.10)', () => {
  // Hand-computed: 170 → 172 → (skip) → 168
  //   d0 = 170
  //   d1 = 170 + 0.1×(172 − 170) = 170.2
  //   d2 = 170.2 (no weigh-in — carries forward)
  //   d3 = 170.2 + 0.1×(168 − 170.2) = 169.98
  const recs = [rec(0, 170), rec(1, 172), rec(2, undefined, { kc: 1900 }), rec(3, 168)];

  it('matches hand-computed values and carries skipped days forward', () => {
    const t = computeEwmaTrend(recs, 0.1);
    expect(t.get(day(0))).toBe(170);
    expect(t.get(day(1))).toBeCloseTo(170.2, 2);
    expect(t.get(day(2))).toBeCloseTo(170.2, 2);
    expect(t.get(day(3))).toBeCloseTo(169.98, 2);
    expect(t.size).toBe(4);
  });

  it('seeds on the first weigh-in even when earlier records have no weight', () => {
    const t = computeEwmaTrend([rec(0, undefined, { kc: 1800 }), rec(1, 170), rec(2, 172)]);
    expect(t.has(day(0))).toBe(false);
    expect(t.get(day(1))).toBe(170);
    expect(t.get(day(2))).toBeCloseTo(170.2, 2);
  });

  it('extends to the last record and to `through` when that is later', () => {
    const withTail = [...recs, rec(5, undefined, { st: 8000 })];
    const t = computeEwmaTrend(withTail);
    expect(t.get(day(4))).toBeCloseTo(169.98, 2);
    expect(t.get(day(5))).toBeCloseTo(169.98, 2);
    const t2 = computeEwmaTrend(recs, 0.1, day(8));
    expect(t2.size).toBe(9);
    expect(t2.get(day(8))).toBeCloseTo(169.98, 2);
    // `through` earlier than the last record does not truncate
    expect(computeEwmaTrend(recs, 0.1, day(1)).size).toBe(4);
  });

  it('is order-independent (the store passes unsorted values)', () => {
    const shuffled = [recs[3], recs[0], recs[2], recs[1]];
    expect([...computeEwmaTrend(shuffled)]).toEqual([...computeEwmaTrend(recs)]);
  });

  it('returns an empty map with no weigh-ins', () => {
    expect(computeEwmaTrend([]).size).toBe(0);
    expect(computeEwmaTrend([rec(0, undefined, { kc: 1900 })]).size).toBe(0);
  });

  it('ignores non-usable weights (0, negative, NaN)', () => {
    const t = computeEwmaTrend([rec(0, 170), rec(1, 0), rec(2, NaN), rec(3, -5), rec(4, 172)]);
    expect(t.get(day(3))).toBe(170);
    expect(t.get(day(4))).toBeCloseTo(170.2, 2);
  });

  it('honours α and clamps it to a sane range', () => {
    expect(computeEwmaTrend(recs, 0.25).get(day(1))).toBeCloseTo(170.5, 2);
    expect(clampAlpha(NaN)).toBe(0.1);
    expect(clampAlpha(0)).toBe(0.01);
    expect(clampAlpha(5)).toBe(0.9);
    // α=0 would freeze the trend; clamped to 0.01 it still moves
    expect(computeEwmaTrend(recs, 0).get(day(1))).toBeCloseTo(170.02, 2);
  });

  it('produces an exactly linear trend on the constructed ramp', () => {
    const t = computeEwmaTrend(linearRamp(15, 1));
    expect(t.get(day(7))).toBeCloseTo(171, 2);
    expect(t.get(day(14))).toBeCloseTo(170, 2);
  });
});

describe('isWeight', () => {
  it('accepts finite positive numbers only', () => {
    expect(isWeight(170)).toBe(true);
    expect(isWeight(0.1)).toBe(true);
    expect(isWeight(0)).toBe(false);
    expect(isWeight(-1)).toBe(false);
    expect(isWeight(NaN)).toBe(false);
    expect(isWeight(Infinity)).toBe(false);
    expect(isWeight('170')).toBe(false);
    expect(isWeight(undefined)).toBe(false);
  });
});

describe('trendAt', () => {
  const t = computeEwmaTrend([rec(2, 170), rec(3, 172)]);

  it('returns exact values, carries forward past the end, undefined before the seed', () => {
    expect(trendAt(t, day(2))).toBe(170);
    expect(trendAt(t, day(3))).toBeCloseTo(170.2, 2);
    expect(trendAt(t, day(30))).toBeCloseTo(170.2, 2);
    expect(trendAt(t, day(1))).toBeUndefined();
    expect(trendAt(new Map(), day(1))).toBeUndefined();
  });
});

describe('weeklyRate (§6.1: Trend_today − Trend_7d_ago)', () => {
  it('is negative when losing, with %BW relative to the trend 7 days ago', () => {
    const t = computeEwmaTrend(linearRamp(15, 1)); // trend 172 → 170 over 14 days
    const r = weeklyRate(t, day(14));
    expect(r).not.toBeNull();
    expect(r!.lbPerWk).toBeCloseTo(-1, 2);
    expect(r!.trendToday).toBeCloseTo(170, 2);
    expect(r!.trend7dAgo).toBeCloseTo(171, 2);
    expect(r!.pctPerWk).toBeCloseTo(-0.58, 2); // −1 / 171 × 100
  });

  it('is positive when gaining', () => {
    const t = computeEwmaTrend(linearRamp(15, -1));
    expect(weeklyRate(t, day(14))!.lbPerWk).toBeCloseTo(1, 2);
  });

  it('is zero when the trend has not moved', () => {
    const t = computeEwmaTrend([rec(0, 170), rec(10, 170)]);
    expect(weeklyRate(t, day(10))!.lbPerWk).toBe(0);
  });

  it('is null until there is a trend on both endpoints', () => {
    const t = computeEwmaTrend(linearRamp(5, 1));
    expect(weeklyRate(t, day(4))).toBeNull(); // 7 days ago is before the first weigh-in
    expect(weeklyRate(t, day(-1))).toBeNull();
    expect(weeklyRate(new Map(), day(0))).toBeNull();
  });

  it('carries the trend forward across unlogged days (asOf later than the last weigh-in)', () => {
    const t = computeEwmaTrend(linearRamp(15, 1), 0.1, day(20));
    const r = weeklyRate(t, day(20));
    // trend frozen at 170 from day 14 on, and day 13 was 170.14 → −0.14
    expect(r!.lbPerWk).toBeCloseTo(-0.14, 2);
  });
});

describe('targetLbPerWeek / rateBand (§6.1 0.5–1.0 %BW/wk)', () => {
  it('converts the %BW band to lb/wk: 172 lb → [0.86, 1.72]', () => {
    expect(targetLbPerWeek(172, [0.5, 1])).toEqual([0.86, 1.72]);
    expect(targetLbPerWeek(200, [0.5, 1])).toEqual([1, 2]);
  });

  it('classifies signed rates (negative = losing) against the band', () => {
    const band: [number, number] = [0.5, 1];
    expect(rateBand(-0.5, 172, band)).toBe('below'); // losing too slowly
    expect(rateBand(0.3, 172, band)).toBe('below'); // gaining
    expect(rateBand(0, 172, band)).toBe('below');
    expect(rateBand(-1.2, 172, band)).toBe('in');
    expect(rateBand(-0.86, 172, band)).toBe('in'); // inclusive edges
    expect(rateBand(-1.72, 172, band)).toBe('in');
    expect(rateBand(-2, 172, band)).toBe('above'); // losing too fast
  });

  it('returns null with no usable rate', () => {
    expect(rateBand(null, 172, [0.5, 1])).toBeNull();
    expect(rateBand(NaN, 172, [0.5, 1])).toBeNull();
  });
});

describe('weighInsInWeek / latestWeight', () => {
  const recs = [rec(0, 170), rec(3, 171), rec(4, 0), rec(6, 169.5), rec(9, 169), rec(10, undefined, { kc: 1900 })];

  it('counts usable weigh-ins in the 7 days ending at asOf (inclusive)', () => {
    expect(weighInsInWeek(recs, day(9))).toBe(3); // day3..day9 → day3, day6, day9 (day4 is 0)
    expect(weighInsInWeek(recs, day(6))).toBe(3); // day0..day6 → day0, day3, day6
    expect(weighInsInWeek(recs, day(20))).toBe(0);
    expect(weighInsInWeek([], day(0))).toBe(0);
  });

  it('finds the latest weigh-in on or before asOf', () => {
    expect(latestWeight(recs, day(10))).toEqual({ d: day(9), w: 169 });
    expect(latestWeight(recs, day(5))).toEqual({ d: day(3), w: 171 });
    expect(latestWeight(recs, day(-1))).toBeNull();
    expect(latestWeight([], day(0))).toBeNull();
  });
});

describe('weeksOutsideBand (R3-3 — a full week outside before intake changes)', () => {
  /** Trend map whose weekly rate on day i is exactly rates[i] (recursive: trend(i) = trend(i − 7) + rate). */
  function trendWithRates(rates: Array<number | null>, start = '2026-06-01'): Map<string, number> {
    const m = new Map<string, number>();
    for (let i = 0; i < rates.length; i++) {
      const rate = rates[i];
      const prior = m.get(addDays(start, i - 7));
      m.set(addDays(start, i), i < 7 || rate === null || prior === undefined ? 172 : prior + rate);
    }
    return m;
  }
  const band: [number, number] = [0.5, 1.0]; // 0.86–1.72 lb/wk at 172 lb
  const last = (rates: Array<number | null>) => addDays('2026-06-01', rates.length - 1);

  it('is 0 while the rate has been outside for fewer than 7 daily evaluations', () => {
    const rates = [...Array(7).fill(null), ...Array(18).fill(-1.2), ...Array(6).fill(-0.5)]; // in ×18, below ×6
    expect(weeksOutsideBand(trendWithRates(rates), last(rates), 172, band)).toBe(0);
  });

  it('counts whole weeks of consecutive daily evaluations outside in the same direction', () => {
    const one = [...Array(7).fill(null), ...Array(18).fill(-1.2), ...Array(7).fill(-0.5)];
    expect(weeksOutsideBand(trendWithRates(one), last(one), 172, band)).toBe(1);
    const two = [...one, ...Array(7).fill(-0.4)];
    expect(weeksOutsideBand(trendWithRates(two), last(two), 172, band)).toBe(2);
    // A day inside the band breaks the run; a switch of direction does too.
    const broken = [...one, -1.0, ...Array(6).fill(-0.5)];
    expect(weeksOutsideBand(trendWithRates(broken), last(broken), 172, band)).toBe(0);
    const flipped = [...one.slice(0, -1), -2.5];
    expect(weeksOutsideBand(trendWithRates(flipped), last(flipped), 172, band)).toBe(0);
  });

  it('is 0 when the rate is inside the band or unknown, and is capped', () => {
    const inBand = [...Array(7).fill(null), ...Array(20).fill(-1.2)];
    expect(weeksOutsideBand(trendWithRates(inBand), last(inBand), 172, band)).toBe(0);
    expect(weeksOutsideBand(new Map(), '2026-06-30', 172, band)).toBe(0);
    const long = [...Array(7).fill(null), ...Array(100).fill(-0.3)];
    expect(weeksOutsideBand(trendWithRates(long), last(long), 172, band)).toBe(8);
    expect(weeksOutsideBand(trendWithRates(long), last(long), 172, band, 3)).toBe(3);
  });
});

describe('R7-13 computeEwmaTrend — `through` caps the window at max(last weigh-in, through)', () => {
  const recs = [rec(0, 170), rec(1, 172), rec(2, undefined, { kc: 1900 }), rec(3, 168)];

  it('a record dated after `through` (a bedtime logged for tomorrow) gets no trend entry', () => {
    const withTomorrow = [...recs, rec(5, undefined, { bt: '23:10' })];
    const t = computeEwmaTrend(withTomorrow, 0.1, day(4));
    expect(t.has(day(5))).toBe(false);
    expect(t.get(day(4))).toBeCloseTo(169.98, 2); // today still carries the trend forward
    expect(t.size).toBe(5);
  });

  it('a weigh-in dated after `through` still extends the window (it is real data)', () => {
    const t = computeEwmaTrend([...recs, rec(6, 168)], 0.1, day(4));
    expect(t.has(day(6))).toBe(true);
    expect(t.has(day(5))).toBe(true);
  });

  it('without `through` the window still runs to the last record (legacy callers)', () => {
    const withTail = [...recs, rec(5, undefined, { bt: '23:10' })];
    expect(computeEwmaTrend(withTail).has(day(5))).toBe(true);
  });
});
