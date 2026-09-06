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
  it('R3-4: blocks are anchored to 7-day boundaries from the first weigh-in; the latest is the last COMPLETED block', () => {
    // First weigh-in day(0); asOf day(99) sits inside block 14 (days 98–104), which is still in progress.
    const r = weeklyExpenditure(ramp(100), ASOF);
    expect(r.firstWeighIn).toBe(day(0));
    expect(r.weeks).toHaveLength(6);
    expect(r.weeks[5].end).toBe(day(97));
    expect(r.weeks[5].start).toBe(day(91));
    expect(r.weeks[0].end).toBe(day(62));
    expect(r.weeks[0].start).toBe(day(56));
    for (let i = 1; i < r.weeks.length; i++) {
      expect(r.weeks[i].start).toBe(addDays(r.weeks[i - 1].end, 1));
    }
    // The in-progress block publishes the morning after its 7th day.
    expect(r.nextUpdate).toBe(day(105));
    // Gate counters describe the in-progress block (days 98–99 so far) for the empty-state nudge.
    expect(r.weighInsThisWeek).toBe(2);
    expect(r.intakeDaysThisWeek).toBe(2);
  });

  it('R3-4: the published estimate changes weekly, not daily', () => {
    // Alternating intake makes every block's mean differ from its neighbour's.
    const recs = ramp(100).map((r, i) => ({ ...r, kc: i % 2 ? 2150 : 1650 }));
    const tdee = (i: number) => weeklyExpenditure(recs, day(i)).tdee;
    const changes: number[] = [];
    for (let i = 70; i < 99; i++) if (tdee(i) !== tdee(i + 1)) changes.push(i + 1);
    expect(changes.length).toBeGreaterThan(0);
    for (const c of changes) expect(c % 7).toBe(0); // only on a block boundary
    for (let i = 70; i < 99; i++) if ((i + 1) % 7 !== 0) expect(tdee(i)).toBe(tdee(i + 1));
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
    expect(r.weighInsThisWeek).toBe(2); // in-progress block: days 98–99
    expect(r.intakeDaysThisWeek).toBe(2);
    for (const wk of r.weeks) {
      expect(wk.valid).toBe(true);
      expect(wk.weighIns).toBe(7);
      expect(wk.intakeDays).toBe(7);
      expect(wk.meanIntake).toBe(1900);
      expect(wk.deltaLb).toBeCloseTo(-1, 1);
      expect(Math.abs(wk.tdee! - 2400)).toBeLessThanOrEqual(6);
      expect(wk.smoothedTdee).not.toBeNull();
    }
    expect(r.reason).toMatch(/Calibrated from 12 valid weeks/); // blocks 2–13 (0–1 are calibrating)
  });

  it('uses trend(end) − trend(day before start) so Δ spans 7 trend updates', () => {
    const r = weeklyExpenditure(ramp(100), ASOF);
    const wk = r.weeks[5]; // block 13: days 91–97
    // trend_t = 172 − t/7 → day 90 = 159.143, day 97 = 158.143
    expect(wk.trendStart).toBeCloseTo(172 - 90 / 7, 1);
    expect(wk.trendEnd).toBeCloseTo(172 - 97 / 7, 1);
  });

  it('a gaining trend lowers the TDEE estimate', () => {
    const r = weeklyExpenditure(ramp(100, { lbPerWeek: -1 }), ASOF);
    expect(Math.abs(r.tdee! - 1400)).toBeLessThanOrEqual(6);
  });

  it('R3-5: the first two weeks are calibrating — no published estimate before ~3 weeks of weigh-ins', () => {
    // Block 0 completes on day 7: its Δ starts from the seed weigh-in, so it is computed but never published.
    const wk1 = weeklyExpenditure(ramp(8), day(7), { weeks: 1 });
    expect(wk1.weeks[0]).toMatchObject({ start: day(0), end: day(6), calibrating: true, valid: false, trendStart: 172 });
    expect(wk1.weeks[0].deltaLb).toBeCloseTo(-6 / 7, 2);
    expect(wk1.weeks[0].reason).toMatch(/Calibrating/);
    expect(wk1.valid).toBe(false);
    expect(wk1.calibrating).toBe(true);
    expect(wk1.tdee).toBeNull();
    expect(wk1.smoothedTdee).toBeNull();
    expect(wk1.reason).toMatch(/^Calibrating — .*day 8 of 21/);
    expect(wk1.nextUpdate).toBe(day(21));
    // Day 20: block 1 is complete but still calibrating; block 2 is in progress.
    const d20 = weeklyExpenditure(ramp(21), day(20));
    expect(d20.valid).toBe(false);
    expect(d20.calibrating).toBe(true);
    expect(d20.reason).toMatch(/day 21 of 21/);
    // Day 21: block 2 (days 14–20, starting ≥ 14 days after the first weigh-in) publishes.
    const d21 = weeklyExpenditure(ramp(22), day(21));
    expect(d21.valid).toBe(true);
    expect(d21.calibrating).toBe(false);
    expect(d21.weeks[d21.weeks.length - 1]).toMatchObject({ start: day(14), end: day(20), calibrating: false, valid: true });
    expect(Math.abs(d21.tdee! - 2400)).toBeLessThanOrEqual(6);
    expect(d21.reason).toMatch(/^Calibrated from 1 valid week —/);
  });

  it('R3-5: gating hides the seed-lagged weeks of a real (un-lagged) linear loss', () => {
    // True loss 1 lb/wk at 1,900 kcal → true TDEE 2,400; the EWMA seeded at the first weigh-in lags.
    const real: DailyRecord[] = Array.from({ length: 22 }, (_, t) => ({ d: day(t), w: 172 - t / 7, kc: 1900 }));
    const wk1 = weeklyExpenditure(real, day(7), { weeks: 1 }).weeks[0];
    expect(wk1.tdee as number).toBeLessThan(2100); // ≈ 2,027 — the seed-lag error the gate keeps off the screen
    expect(wk1.valid).toBe(false);
    const d21 = weeklyExpenditure(real, day(21));
    expect(d21.valid).toBe(true);
    expect(Math.abs(d21.tdee! - 2400)).toBeLessThan(120); // ≈ 2,315 and converging
  });

  it('counts only kc > 0 as intake days', () => {
    const recs = ramp(100).map((r) => (r.d === day(LAST) ? { ...r, kc: 0 } : r));
    const r = weeklyExpenditure(recs, ASOF);
    expect(r.intakeDaysThisWeek).toBe(1); // in-progress block: day 98 only
    expect(r.weeks[5].meanIntake).toBe(1900);
  });
});

describe('weeklyExpenditure — gating', () => {
  it('<5 weigh-ins in the latest completed block → invalid, tdee null, empty-state reason; last calibration kept', () => {
    const recs = without(ramp(100), 'w', [LAST - 6, LAST - 5, LAST - 4, LAST - 3]); // days 93–96 → block 13 keeps 3
    const r = weeklyExpenditure(recs, ASOF);
    expect(r.valid).toBe(false);
    expect(r.tdee).toBeNull();
    expect(r.reason).toBe('Only 3 of 5 weigh-ins in your last full week. Weigh in 5+ days this week so your trend and expenditure calibrate.');
    expect(r.weighInsThisWeek).toBe(2); // the in-progress block (days 98–99)
    expect(r.weeks[5].valid).toBe(false);
    expect(r.weeks[5].reason).toBe('Only 3 of 5 weigh-ins');
    expect(r.weeks[5].smoothedTdee).toBeNull();
    // earlier weeks still calibrate
    expect(r.smoothedTdee).not.toBeNull();
    expect(Math.abs(r.smoothedTdee! - 2400)).toBeLessThanOrEqual(6);
    expect(r.weeks[4].valid).toBe(true);
  });

  it('<5 intake days in the latest completed block → invalid with the intake nudge', () => {
    const recs = without(ramp(100), 'kc', [LAST - 6, LAST - 5, LAST - 4, LAST - 3]);
    const r = weeklyExpenditure(recs, ASOF);
    expect(r.valid).toBe(false);
    expect(r.tdee).toBeNull();
    expect(r.intakeDaysThisWeek).toBe(2);
    expect(r.weighInsThisWeek).toBe(2);
    expect(r.reason).toBe('Only 3 of 5 intake days in your last full week. Log intake on 5+ days this week so your expenditure can calibrate.');
    expect(r.weeks[5].reason).toBe('Only 3 of 5 intake days');
  });

  it('gates are configurable', () => {
    const recs = without(ramp(100), 'w', [LAST - 6, LAST - 5, LAST - 4, LAST - 3]);
    const r = weeklyExpenditure(recs, ASOF, { minWeighIns: 3 });
    expect(r.valid).toBe(true);
    expect(r.reason).toBe('Calibrated from 12 valid weeks — 3 weigh-ins and 7 intake days in your last full week.');
    expect(weeklyExpenditure(recs, ASOF, { minWeighIns: 4 }).reason).toMatch(/^Only 3 of 4 weigh-ins .* Weigh in 4\+ days/);
  });

  it('handles no data at all without throwing', () => {
    const r = weeklyExpenditure([], ASOF);
    expect(r.valid).toBe(false);
    expect(r.tdee).toBeNull();
    expect(r.smoothedTdee).toBeNull();
    expect(r.weeks).toHaveLength(6);
    expect(r.weighInsThisWeek).toBe(0);
    expect(r.intakeDaysThisWeek).toBe(0);
    expect(r.firstWeighIn).toBeNull();
    expect(r.calibrating).toBe(false);
    expect(r.nextUpdate).toBeNull();
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
    expect(r.reason).toMatch(/^Only 0 of 5 intake days in your last full week/);
    expect(r.weeks[5].meanIntake).toBeNull();
    expect(r.weeks[5].tdee).toBeNull();
    expect(r.weeks[5].deltaLb).toBeCloseTo(-1, 1);
  });
});

describe('weeklyExpenditure — smoothing', () => {
  it('dampens a one-week spike (α=0.3 over valid weeks, oldest → newest)', () => {
    // The last completed block (days 91–97) eats 2500 instead of 1900 → raw week TDEE 3000 vs 2400 before.
    const recs = ramp(100).map((r) => (r.d >= day(91) && r.d <= day(97) ? { ...r, kc: 2500 } : r));
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
    const recs = ramp(100).map((r) => (r.d >= day(91) && r.d <= day(97) ? { ...r, kc: 2500 } : r));
    expect(Math.abs(weeklyExpenditure(recs, ASOF, { smoothing: 1 }).tdee! - 3000)).toBeLessThanOrEqual(6);
    expect(Math.abs(weeklyExpenditure(recs, ASOF, { smoothing: 0.5 }).tdee! - 2700)).toBeLessThanOrEqual(8);
  });

  it('skips invalid weeks in the EWMA instead of resetting it', () => {
    // Invalidate week index 4 via intake days (weights stay, so the trend is
    // unchanged); the spike must still land on the 2400 baseline carried from
    // week 3 — not re-seed at its own raw 3000.
    const spike = ramp(100).map((r) => (r.d >= day(91) && r.d <= day(97) ? { ...r, kc: 2500 } : r));
    const recs = without(spike, 'kc', [84, 85, 86, 87]); // block 12 (days 84–90) keeps 3 intake days
    const r = weeklyExpenditure(recs, ASOF);
    expect(r.weeks[4].valid).toBe(false);
    expect(r.weeks[4].reason).toBe('Only 3 of 5 intake days');
    expect(r.weeks[4].smoothedTdee).toBeNull();
    expect(Math.abs(r.weeks[3].smoothedTdee! - 2400)).toBeLessThanOrEqual(6);
    expect(Math.abs(r.smoothedTdee! - 2580)).toBeLessThanOrEqual(8);
    expect(r.reason).toMatch(/Calibrated from 11 valid weeks/);
  });
});

describe('expenditureSeries', () => {
  it('one point per valid completed week at the block end, smoothed value, oldest first', () => {
    const recs = ramp(100).map((r) => (r.d >= day(91) && r.d <= day(97) ? { ...r, kc: 2500 } : r));
    const s = expenditureSeries(recs, ASOF);
    expect(s).toHaveLength(6);
    expect(s.map((p) => p.d)).toEqual([5, 4, 3, 2, 1, 0].map((k) => day(97 - 7 * k)));
    expect(Math.abs(s[4].tdee - 2400)).toBeLessThanOrEqual(6);
    expect(Math.abs(s[5].tdee - 2580)).toBeLessThanOrEqual(8);
  });

  it('omits invalid weeks and honours `weeks`', () => {
    const recs = without(ramp(100), 'w', [LAST - 6, LAST - 5, LAST - 4, LAST - 3]);
    const s = expenditureSeries(recs, ASOF);
    expect(s).toHaveLength(5);
    expect(s[s.length - 1].d).toBe(day(90));
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
    firstWeighIn: day(0),
    calibrating: false,
    nextUpdate: day(105),
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
