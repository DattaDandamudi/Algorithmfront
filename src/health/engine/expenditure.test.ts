import { describe, expect, it } from 'vitest';
import { DEFAULT_TARGETS } from '../data/defaults';
import type { DailyRecord } from '../data/types';
import { addDays } from '../lib/dates';
import {
  DEFAULT_NOISE_BAND_LB,
  expenditureSeries,
  minimumIntakeKcal,
  recommendIntake,
  waterNoiseBand,
  weeklyExpenditure,
  type ExpenditureResult,
} from './expenditure';

const D0 = '2026-06-01';
const day = (i: number) => addDays(D0, i);

/**
 * Synthetic dataset: constant intake and weights chosen so the α=0.10 EWMA
 * trend falls EXACTLY `lbPerWeek` per week (w_0 = T0, w_t = T0 − s·(t+9)).
 * Reverse calc ⇒ TDEE = kc + lbPerWeek × 3500 / 7 = 1900 + 500 = 2400.
 */
function ramp(days: number, opts: { kc?: number; lbPerWeek?: number; T0?: number } = {}): DailyRecord[] {
  const { kc = 1900, lbPerWeek = 1, T0 = 172 } = opts;
  const s = lbPerWeek / 7;
  return Array.from({ length: days }, (_, t) => ({ d: day(t), w: t === 0 ? T0 : T0 - s * (t + 9), kc }));
}

/** Strip a field from records on the given day indices. */
function without(recs: DailyRecord[], field: 'w' | 'kc', dayIdx: number[]): DailyRecord[] {
  const drop = new Set(dayIdx.map(day));
  return recs.map((r) => {
    if (!drop.has(r.d)) return r;
    const c = { ...r };
    delete c[field];
    return c;
  });
}

const LAST = 99; // ramp(100) runs day(0)..day(99)
const ASOF = day(LAST);

describe('weeklyExpenditure — windows', () => {
  it('returns `weeks` consecutive non-overlapping 7-day blocks ending at asOf, oldest first', () => {
    const r = weeklyExpenditure(ramp(100), ASOF);
    expect(r.weeks).toHaveLength(6);
    expect(r.weeks[5].end).toBe(ASOF);
    expect(r.weeks[5].start).toBe(day(LAST - 6));
    expect(r.weeks[0].end).toBe(day(LAST - 35));
    expect(r.weeks[0].start).toBe(day(LAST - 41));
    for (let i = 1; i < r.weeks.length; i++) {
      expect(r.weeks[i].start).toBe(addDays(r.weeks[i - 1].end, 1));
    }
  });

  it('honours the `weeks` option', () => {
    expect(weeklyExpenditure(ramp(100), ASOF, { weeks: 2 }).weeks).toHaveLength(2);
    expect(weeklyExpenditure(ramp(100), ASOF, { weeks: 0 }).weeks).toHaveLength(1);
  });
});

describe('weeklyExpenditure — TDEE math (§6.2)', () => {
  it('constant 1900 kcal with the trend falling 1 lb/wk → TDEE ≈ 2400', () => {
    const r = weeklyExpenditure(ramp(100), ASOF);
    expect(r.valid).toBe(true);
    expect(r.tdee).not.toBeNull();
    expect(Math.abs(r.tdee! - 2400)).toBeLessThanOrEqual(6);
    expect(r.smoothedTdee).toBe(r.tdee);
    expect(r.weighInsThisWeek).toBe(7);
    expect(r.intakeDaysThisWeek).toBe(7);
    for (const wk of r.weeks) {
      expect(wk.valid).toBe(true);
      expect(wk.weighIns).toBe(7);
      expect(wk.intakeDays).toBe(7);
      expect(wk.meanIntake).toBe(1900);
      expect(wk.deltaLb).toBeCloseTo(-1, 1);
      expect(Math.abs(wk.tdee! - 2400)).toBeLessThanOrEqual(6);
      expect(wk.smoothedTdee).not.toBeNull();
    }
    expect(r.reason).toMatch(/Calibrated from 6 valid weeks/);
  });

  it('uses trend(end) − trend(day before start) so Δ spans 7 trend updates', () => {
    const r = weeklyExpenditure(ramp(100), ASOF);
    const wk = r.weeks[5];
    // trend_t = 172 − t/7 → day 92 = 158.857, day 99 = 157.857
    expect(wk.trendStart).toBeCloseTo(172 - 92 / 7, 1);
    expect(wk.trendEnd).toBeCloseTo(172 - 99 / 7, 1);
  });

  it('a gaining trend lowers the TDEE estimate', () => {
    const r = weeklyExpenditure(ramp(100, { lbPerWeek: -1 }), ASOF);
    expect(Math.abs(r.tdee! - 1400)).toBeLessThanOrEqual(6);
  });

  it('falls back to the window start when the day before is before the first weigh-in', () => {
    const r = weeklyExpenditure(ramp(7), day(6), { weeks: 1 });
    const wk = r.weeks[0];
    expect(wk.trendStart).toBe(172); // seed weigh-in on day 0
    expect(wk.deltaLb).toBeCloseTo(-6 / 7, 2); // only 6 updates inside the window
    expect(wk.valid).toBe(true);
    expect(r.valid).toBe(true);
  });

  it('counts only kc > 0 as intake days', () => {
    const recs = ramp(100).map((r) => (r.d === day(LAST) ? { ...r, kc: 0 } : r));
    const r = weeklyExpenditure(recs, ASOF);
    expect(r.intakeDaysThisWeek).toBe(6);
    expect(r.weeks[5].meanIntake).toBe(1900);
  });
});

describe('weeklyExpenditure — gating', () => {
  it('<5 weigh-ins in the current week → invalid, tdee null, empty-state reason; last calibration kept', () => {
    const recs = without(ramp(100), 'w', [LAST - 6, LAST - 5, LAST - 4, LAST - 3]); // 3 weigh-ins left
    const r = weeklyExpenditure(recs, ASOF);
    expect(r.valid).toBe(false);
    expect(r.tdee).toBeNull();
    expect(r.reason).toBe('Weigh in 5+ days this week so your trend and expenditure calibrate.');
    expect(r.weighInsThisWeek).toBe(3);
    expect(r.weeks[5].valid).toBe(false);
    expect(r.weeks[5].reason).toBe('Only 3 of 5 weigh-ins');
    expect(r.weeks[5].smoothedTdee).toBeNull();
    // earlier weeks still calibrate
    expect(r.smoothedTdee).not.toBeNull();
    expect(Math.abs(r.smoothedTdee! - 2400)).toBeLessThanOrEqual(6);
    expect(r.weeks[4].valid).toBe(true);
  });

  it('<5 intake days in the current week → invalid with the intake nudge', () => {
    const recs = without(ramp(100), 'kc', [LAST - 6, LAST - 5, LAST - 4, LAST - 3]);
    const r = weeklyExpenditure(recs, ASOF);
    expect(r.valid).toBe(false);
    expect(r.tdee).toBeNull();
    expect(r.intakeDaysThisWeek).toBe(3);
    expect(r.weighInsThisWeek).toBe(7);
    expect(r.reason).toBe('Log intake on 5+ days this week so your expenditure can calibrate.');
    expect(r.weeks[5].reason).toBe('Only 3 of 5 intake days');
  });

  it('gates are configurable', () => {
    const recs = without(ramp(100), 'w', [LAST - 6, LAST - 5, LAST - 4, LAST - 3]);
    const r = weeklyExpenditure(recs, ASOF, { minWeighIns: 3 });
    expect(r.valid).toBe(true);
    expect(r.reason).toBe('Calibrated from 6 valid weeks — 3 weigh-ins and 7 intake days this week.');
    expect(weeklyExpenditure(recs, ASOF, { minWeighIns: 4 }).reason).toMatch(/^Weigh in 4\+ days/);
  });

  it('handles no data at all without throwing', () => {
    const r = weeklyExpenditure([], ASOF);
    expect(r.valid).toBe(false);
    expect(r.tdee).toBeNull();
    expect(r.smoothedTdee).toBeNull();
    expect(r.weeks).toHaveLength(6);
    expect(r.weighInsThisWeek).toBe(0);
    expect(r.intakeDaysThisWeek).toBe(0);
    expect(r.reason).toMatch(/^Weigh in 5\+ days/);
    for (const wk of r.weeks) {
      expect(wk.tdee).toBeNull();
      expect(wk.meanIntake).toBeNull();
      expect(wk.deltaLb).toBeNull();
      expect(Number.isNaN(wk.tdee as unknown as number)).toBe(false);
    }
  });

  it('weigh-ins without intake never produce NaN', () => {
    const recs = ramp(100).map((r) => ({ d: r.d, w: r.w }));
    const r = weeklyExpenditure(recs, ASOF);
    expect(r.valid).toBe(false);
    expect(r.weeks[5].meanIntake).toBeNull();
    expect(r.weeks[5].tdee).toBeNull();
    expect(r.weeks[5].deltaLb).toBeCloseTo(-1, 1);
  });
});

describe('weeklyExpenditure — smoothing', () => {
  it('dampens a one-week spike (α=0.3 over valid weeks, oldest → newest)', () => {
    // Last week eats 2500 instead of 1900 → raw week TDEE 3000 vs 2400 before.
    const recs = ramp(100).map((r) => (r.d >= day(LAST - 6) ? { ...r, kc: 2500 } : r));
    const r = weeklyExpenditure(recs, ASOF);
    const wk = r.weeks[5];
    expect(Math.abs(wk.tdee! - 3000)).toBeLessThanOrEqual(6);
    // smoothed = 2400 + 0.3 × (3000 − 2400) = 2580
    expect(Math.abs(r.smoothedTdee! - 2580)).toBeLessThanOrEqual(8);
    expect(wk.smoothedTdee).toBe(r.smoothedTdee);
    expect(r.tdee).toBe(r.smoothedTdee);
    // the spike moved the estimate by well under half its raw size
    expect(r.smoothedTdee! - 2400).toBeLessThan(300);
    // weeks before the spike sit at the baseline
    expect(Math.abs(r.weeks[4].smoothedTdee! - 2400)).toBeLessThanOrEqual(6);
  });

  it('smoothing = 1 disables smoothing; a custom α is honoured', () => {
    const recs = ramp(100).map((r) => (r.d >= day(LAST - 6) ? { ...r, kc: 2500 } : r));
    expect(Math.abs(weeklyExpenditure(recs, ASOF, { smoothing: 1 }).tdee! - 3000)).toBeLessThanOrEqual(6);
    expect(Math.abs(weeklyExpenditure(recs, ASOF, { smoothing: 0.5 }).tdee! - 2700)).toBeLessThanOrEqual(8);
  });

  it('skips invalid weeks in the EWMA instead of resetting it', () => {
    // Knock out week index 4 (the one before the spike); the spike still lands on a 2400 baseline.
    const spike = ramp(100).map((r) => (r.d >= day(LAST - 6) ? { ...r, kc: 2500 } : r));
    const recs = without(spike, 'w', [LAST - 13, LAST - 12, LAST - 11, LAST - 10]);
    const r = weeklyExpenditure(recs, ASOF);
    expect(r.weeks[4].valid).toBe(false);
    expect(Math.abs(r.smoothedTdee! - 2580)).toBeLessThanOrEqual(8);
    expect(r.reason).toMatch(/Calibrated from 5 valid weeks/);
  });
});

describe('expenditureSeries', () => {
  it('one point per valid week at the week end, smoothed value, oldest first', () => {
    const recs = ramp(100).map((r) => (r.d >= day(LAST - 6) ? { ...r, kc: 2500 } : r));
    const s = expenditureSeries(recs, ASOF);
    expect(s).toHaveLength(6);
    expect(s.map((p) => p.d)).toEqual([5, 4, 3, 2, 1, 0].map((k) => day(LAST - 7 * k)));
    expect(Math.abs(s[4].tdee - 2400)).toBeLessThanOrEqual(6);
    expect(Math.abs(s[5].tdee - 2580)).toBeLessThanOrEqual(8);
  });

  it('omits invalid weeks and honours `weeks`', () => {
    const recs = without(ramp(100), 'w', [LAST - 6, LAST - 5, LAST - 4, LAST - 3]);
    const s = expenditureSeries(recs, ASOF);
    expect(s).toHaveLength(5);
    expect(s[s.length - 1].d).toBe(day(LAST - 7));
    expect(expenditureSeries(ramp(100), ASOF, 2)).toHaveLength(2);
    expect(expenditureSeries([], ASOF)).toEqual([]);
  });
});

describe('waterNoiseBand', () => {
  const withResid = (resids: number[], base = 170): DailyRecord[] =>
    resids.map((res, i) => ({ d: day(i), w: base + res, wt: base }));

  it('defaults to 1.5 lb with fewer than 5 residuals', () => {
    expect(waterNoiseBand([], ASOF)).toBe(DEFAULT_NOISE_BAND_LB);
    expect(waterNoiseBand(withResid([1, -1, 1, -1]), day(3))).toBe(1.5);
  });

  it('is 1.5 × sample SD of (w − wt)', () => {
    // ±1 alternating over 10 days: SD = sqrt(10/9) = 1.054 → ×1.5 = 1.58
    const recs = withResid([1, -1, 1, -1, 1, -1, 1, -1, 1, -1]);
    expect(waterNoiseBand(recs, day(9))).toBeCloseTo(1.58, 2);
  });

  it('clamps to [0.5, 3.5]', () => {
    expect(waterNoiseBand(withResid([0, 0, 0, 0, 0, 0]), day(5))).toBe(0.5);
    expect(waterNoiseBand(withResid([5, -5, 5, -5, 5, -5]), day(5))).toBe(3.5);
  });

  it('only uses the trailing `days` window', () => {
    const recs = withResid([1, -1, 1, -1, 1, -1, 1, -1, 1, -1]);
    expect(waterNoiseBand(recs, day(9), 3)).toBe(1.5); // 3 points → default
    expect(waterNoiseBand(recs, day(9), 30)).toBeCloseTo(1.58, 2);
  });

  it('recomputes the trend when records lack a cached wt', () => {
    const flat: DailyRecord[] = Array.from({ length: 8 }, (_, i) => ({ d: day(i), w: 170 }));
    expect(waterNoiseBand(flat, day(7))).toBe(0.5); // zero residuals → lower clamp
    // a jittery scale without wt still yields a measured, finite band
    const jitter = flat.map((r, i) => ({ ...r, w: 170 + (i % 2 === 0 ? 2 : -2) }));
    const band = waterNoiseBand(jitter, day(7));
    expect(band).toBeGreaterThan(0.5);
    expect(band).toBeLessThanOrEqual(3.5);
  });
});

describe('recommendIntake (§6.2 calorie adjustment)', () => {
  const targets = DEFAULT_TARGETS; // 1950 kcal, 180 g protein, 60 g fat floor, band 0.5–1.0 %BW
  const valid: ExpenditureResult = {
    tdee: 2400,
    smoothedTdee: 2400,
    valid: true,
    reason: 'Calibrated',
    weeks: [],
    weighInsThisWeek: 7,
    intakeDaysThisWeek: 7,
  };
  const invalid: ExpenditureResult = {
    ...valid,
    tdee: null,
    valid: false,
    reason: 'Weigh in 5+ days this week so your trend and expenditure calibrate.',
    weighInsThisWeek: 3,
  };
  const run = (weeklyRateLb: number | null, extra: Partial<Parameters<typeof recommendIntake>[0]> = {}) =>
    recommendIntake({ result: valid, currentKcal: 1950, weeklyRateLb, bodyWeightLb: 172, targets, ...extra });

  it('minimumKcal = protein×4 + fatFloor×9 + 50×4', () => {
    expect(minimumIntakeKcal(targets)).toBe(180 * 4 + 60 * 9 + 200); // 1460
    expect(run(-1.2).minimumKcal).toBe(1460);
  });

  it('holds when the rate is inside the band', () => {
    const r = run(-1.2);
    expect(r.changed).toBe(false);
    expect(r.kcal).toBe(1950);
    expect(r.delta).toBe(0);
    expect(r.reason).toMatch(/inside your 0.86–1.72 lb\/wk target/);
  });

  it('losing too slowly → −100', () => {
    const r = run(-0.5);
    expect(r).toMatchObject({ kcal: 1850, delta: -100, changed: true });
    expect(r.reason).toMatch(/slower than your 0.86 lb\/wk floor/);
    expect(r.reason).toMatch(/Cut 100 kcal to 1,850 kcal/);
  });

  it('gaining while in fat loss → −200 (miss wider than the band edge)', () => {
    expect(run(0.3)).toMatchObject({ kcal: 1750, delta: -200 });
    expect(run(0)).toMatchObject({ kcal: 1750, delta: -200 });
    expect(run(0.3).reason).toMatch(/Trend is up 0.30 lb\/wk/);
  });

  it('losing too fast → +100; more than double the ceiling → +200; never more than ±200', () => {
    expect(run(-2.0)).toMatchObject({ kcal: 2050, delta: 100 });
    expect(run(-2.0).reason).toMatch(/faster than your 1.72 lb\/wk ceiling/);
    expect(run(-3.6)).toMatchObject({ kcal: 2150, delta: 200 }); // 3.6 > 2 × 1.72
    expect(run(-10)).toMatchObject({ kcal: 2150, delta: 200 });
    expect(run(5)).toMatchObject({ kcal: 1750, delta: -200 });
  });

  it('the change does not scale 1:1 with the gap', () => {
    expect(run(-0.8).delta).toBe(run(-0.1).delta); // both just-outside → same 100 step
    expect(Math.abs(run(-2.0).delta)).toBe(Math.abs(run(-3.4).delta));
  });

  it('never goes below the protein + fat-floor minimum', () => {
    const r = run(-0.5, { currentKcal: 1500 });
    expect(r.kcal).toBe(1460);
    expect(r.delta).toBe(-40);
    expect(r.changed).toBe(true);
    expect(r.reason).toMatch(/Cut 40 kcal to 1,460 kcal/);
    expect(r.reason).toMatch(/Held at 1,460 kcal — the minimum that fits 180 g protein and the 60 g fat floor/);
    // already at the floor and still too slow → no change, explained
    const atFloor = run(-0.5, { currentKcal: 1460 });
    expect(atFloor).toMatchObject({ kcal: 1460, delta: 0, changed: false });
    expect(atFloor.reason).toMatch(/already at your minimum intake/);
  });

  it('raises an intake that is already under the floor, even when the rate is fine', () => {
    const r = run(-1.2, { currentKcal: 1400 });
    expect(r).toMatchObject({ kcal: 1460, delta: 60, changed: true });
    expect(r.reason).toMatch(/Held at 1,460 kcal/);
  });

  it('holds with the empty-state reason when this week’s expenditure is invalid', () => {
    const r = run(-0.5, { result: invalid });
    expect(r.changed).toBe(false);
    expect(r.kcal).toBe(1950);
    expect(r.reason).toBe(invalid.reason);
  });

  it('holds when there is no weekly rate yet', () => {
    const r = run(null);
    expect(r.changed).toBe(false);
    expect(r.reason).toMatch(/Not enough trend data/);
  });

  it('consecutiveWeeksOutside: 0 holds for a full week; ≥2 escalates 100 → 200', () => {
    const hold = run(-0.5, { consecutiveWeeksOutside: 0 });
    expect(hold.changed).toBe(false);
    expect(hold.reason).toMatch(/hold for a full week/);
    expect(run(-0.5, { consecutiveWeeksOutside: 2 })).toMatchObject({ delta: -200 });
    expect(run(-2.0, { consecutiveWeeksOutside: 3 })).toMatchObject({ delta: 200 });
    expect(run(-1.2, { consecutiveWeeksOutside: 3 }).changed).toBe(false); // in band → still holds
  });

  it('uses the body weight and targets given, not hard-coded numbers', () => {
    const r = run(-1.5, { bodyWeightLb: 200 }); // band 1–2 lb/wk → in
    expect(r.changed).toBe(false);
    const wide = run(-1.5, { targets: { ...targets, weeklyRatePct: [1.0, 1.5] } }); // 1.72–2.58 → below
    expect(wide.delta).toBe(-100);
    const min = run(-1.2, { targets: { ...targets, protein: 200, fatFloor: 70 } });
    expect(min.minimumKcal).toBe(200 * 4 + 70 * 9 + 200);
  });
});
