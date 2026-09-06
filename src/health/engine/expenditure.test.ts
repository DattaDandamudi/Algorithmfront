import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, DEFAULT_TARGETS } from '../data/defaults';
import type { DailyRecord, ISODate, Profile, Targets, Workout } from '../data/types';
import { addDays } from '../lib/dates';
import { LB_PER_KG, round } from '../lib/format';
import type { KalmanPoint, KalmanResult } from './kalman';
import {
  ASSUMED_BODY_FAT_PCT,
  COARSE_STEP,
  DEFAULT_NOISE_BAND_LB,
  DEFAULT_SESSION_MIN,
  ENERGY_DENSITY_MAX_LB,
  ENERGY_DENSITY_MIN_LB,
  FALLBACK_LEVEL_VAR,
  FAT_FLOOR_G,
  FINE_STEP_LARGE,
  FINE_STEP_SMALL,
  FINE_TIER_P,
  GLYCOGEN_CAP_KG,
  KCAL_CHANGE_FREEZE_DAYS,
  KCAL_PER_LB,
  MET_LIFT,
  MIN_BLOCK_WEIGH_INS,
  NEAT_MULTIPLIER,
  PRIOR_COMPRESSION,
  PRIOR_SD_KCAL,
  PRIOR_SD_NO_HEIGHT_KCAL,
  STEP_FLOOR,
  STEP_KCAL_PER_KG_PER_STEP,
  TDEE_CI_Z,
  TDEE_DRIFT_SD,
  energyDensity,
  expenditureSeries,
  fatFloorGrams,
  glycogenSeries,
  metKcal,
  minimumIntakeKcal,
  minimumIntakeKcalV3,
  priorTdee,
  recommendIntake,
  recommendIntakeV3,
  sessionKcal,
  waterNoiseBand,
  weeklyExpenditure,
  weeklyExpenditureV3,
  type ExpenditureResult,
  type ExpenditureV3Opts,
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

describe('R7-7 weeklyExpenditure — `weeks` never reaches back before the first weigh-in', () => {
  it('on day 22 returns the 3 completed blocks only, all anchored on or after the first weigh-in', () => {
    const recs = ramp(22); // first weigh-in day(0); asOf day(21) sits in block 3
    const r = weeklyExpenditure(recs, day(21));
    expect(r.firstWeighIn).toBe(day(0));
    expect(r.weeks).toHaveLength(3);
    expect(r.weeks[0].start).toBe(day(0));
    for (const wk of r.weeks) expect(wk.start >= day(0)).toBe(true);
    expect(r.weeks.map((w) => w.end)).toEqual([day(6), day(13), day(20)]);
    // The chart/caption count follows: one calibrated of three plotted, never five.
    expect(r.weeks.filter((w) => w.valid).length).toBe(1);
    expect(expenditureSeries(recs, day(21))).toHaveLength(1);
  });

  it('returns no blocks at all during the first week (nothing has completed yet)', () => {
    const r = weeklyExpenditure(ramp(3), day(2));
    expect(r.weeks).toEqual([]);
    expect(r.valid).toBe(false);
    expect(r.tdee).toBeNull();
    expect(r.weighInsThisWeek).toBe(3);
  });

  it('still returns the full `weeks` count once enough blocks have completed', () => {
    expect(weeklyExpenditure(ramp(100), ASOF).weeks).toHaveLength(6);
  });
});

// ===========================================================================
// v3 (§1b) — energy density, glycogen water, Bayesian TDEE, two-tier coaching
// ===========================================================================

/**
 * §1a is being built in parallel, so every v3 test drives the module from a
 * hand-built `KalmanResult`: the maths under test is this module's, not the
 * filter's. `kalmanFixture` lays a known level/slope series on consecutive
 * days with a fixed level sd.
 */
function kalmanFixture(start: ISODate, levels: number[], levelSd = 0.5, measurementSd = 0.9): KalmanResult {
  const points: KalmanPoint[] = levels.map((level, i) => ({
    d: addDays(start, i),
    level,
    levelSd,
    slope: i === 0 ? 0 : level - levels[i - 1],
    slopeSd: 0.02,
    predicted: false,
  }));
  return {
    points,
    byDate: new Map(points.map((p) => [p.d, p])),
    measurementSd,
    nAccepted: levels.length,
    nRejected: 0,
    first: points.length > 0 ? points[0].d : null,
    moments: [],
    smoothed: false,
  };
}

/** A profile whose fat mass is exactly `fatKg` at `weightLb`. */
function profileWithFat(weightLb: number, fatKg: number, over: Partial<Profile> = {}): Profile {
  const kg = weightLb / LB_PER_KG;
  return { ...DEFAULT_PROFILE, weightLb, bodyFatPct: (fatKg / kg) * 100, heightCm: 180, age: 30, sex: 'male', ...over };
}

const V3_TARGETS: Targets = { ...DEFAULT_TARGETS, kcal: 2000, protein: 180, fatFloor: 60, weeklyRatePct: [0.5, 1.0] };

/** Constant intake + a level falling exactly `lbPerWeek`, with steps optional. */
function v3Records(days: number, opts: { kc?: number; lbPerWeek?: number; w0?: number; steps?: number; carbs?: number | ((i: number) => number) } = {}): DailyRecord[] {
  const { kc = 2000, lbPerWeek = -1, w0 = 180, steps, carbs } = opts;
  return Array.from({ length: days }, (_, i) => {
    const r: DailyRecord = { d: day(i), w: round(w0 + (lbPerWeek / 7) * i, 2), kc };
    if (steps !== undefined) r.st = steps;
    if (carbs !== undefined) r.c = typeof carbs === 'function' ? carbs(i) : carbs;
    return r;
  });
}

/** The matching level series (the truth, since the fixture filter is exact). */
function v3Levels(days: number, lbPerWeek = -1, w0 = 180): number[] {
  return Array.from({ length: days }, (_, i) => w0 + (lbPerWeek / 7) * i);
}

describe('energyDensity (Forbes/Hall)', () => {
  it('is 2,348 kcal/lb at 10 kg of fat mass and 3,587 at 45 kg — not 3,500', () => {
    const lean = energyDensity(profileWithFat(176.37, 10));
    const obese = energyDensity(profileWithFat(300, 45));
    expect(lean.kcalPerLb).toBe(2348);
    expect(obese.kcalPerLb).toBe(3587);
    // The lean lifter's true factor is ~33% below the folk constant.
    expect(lean.kcalPerLb / KCAL_PER_LB).toBeLessThan(0.7);
    expect(lean.source).toBe('profile');
    expect(lean.leanFraction).toBeCloseTo(10.4 / 20.4, 4);
    expect(lean.label).toBe('2,348 kcal per lb at your body composition');
  });

  it('falls back to Deurenberg when no body fat % is on file', () => {
    const p = { ...DEFAULT_PROFILE, weightLb: 176.37, heightCm: 180, age: 30, sex: 'male' as const };
    const d = energyDensity(p);
    expect(d.source).toBe('deurenberg');
    expect(d.bodyFatPct).toBeCloseTo(20.3, 1);
    expect(d.kcalPerLb).toBe(2809);
  });

  it('falls back to a labelled population prior with neither body fat nor height', () => {
    const d = energyDensity({ ...DEFAULT_PROFILE, heightCm: undefined, weightLb: 176.37 });
    expect(d.source).toBe('assumed');
    expect(d.bodyFatPct).toBe(ASSUMED_BODY_FAT_PCT.male);
    expect(d.label).toContain('assumed body composition');
  });

  it('clamps to [2,300, 3,700] and says so', () => {
    const high = energyDensity(profileWithFat(300, 81.6));
    expect(high.kcalPerLb).toBe(ENERGY_DENSITY_MAX_LB);
    expect(high.clamped).toBe(true);
    const low = energyDensity({ ...DEFAULT_PROFILE, weightLb: 120, bodyFatPct: 3.5, heightCm: 175 });
    expect(low.kcalPerLb).toBeGreaterThanOrEqual(ENERGY_DENSITY_MIN_LB);
  });

  it('never returns NaN on a degenerate profile', () => {
    const d = energyDensity({ ...DEFAULT_PROFILE, weightLb: 0, age: 0, heightCm: 0, bodyFatPct: -5 });
    expect(Number.isFinite(d.kcalPerLb)).toBe(true);
    expect(d.kcalPerLb).toBeGreaterThanOrEqual(ENERGY_DENSITY_MIN_LB);
  });
});

describe('glycogenSeries', () => {
  it('is all zeros when carbohydrate is never logged', () => {
    const s = glycogenSeries(v3Records(20));
    expect(s).toHaveLength(20);
    expect(s.every((p) => p.kg === 0 && p.lb === 0 && p.levelLb === 0 && p.carb7 === null)).toBe(true);
  });

  it('starts at its own steady state, so a constant carb intake never moves it', () => {
    const s = glycogenSeries(v3Records(30, { carbs: 300 }));
    expect(s[0].kg).toBe(0);
    expect(Math.max(...s.map((p) => Math.abs(p.kg)))).toBe(0);
  });

  it('a 150 g/day cut approaches −2.4 kg with a 6-day time constant', () => {
    const recs = v3Records(60, { carbs: (i) => (i < 20 ? 300 : 150) });
    const s = glycogenSeries(recs);
    const at = (i: number) => s[i].kg;
    expect(at(19)).toBe(0);
    // 4 g water per g glycogen × 0.004 kg per g carb × 150 g = 2.4 kg.
    expect(at(59)).toBeCloseTo(-2.4, 1);
    // Monotone down through the transition, and most of the way there in ~2 weeks.
    for (let i = 21; i < 59; i++) expect(at(i)).toBeLessThanOrEqual(at(i - 1) + 1e-9);
    expect(at(33)).toBeLessThan(-1.8);
  });

  it('caps the attributed water at ±2.5 kg', () => {
    const s = glycogenSeries(v3Records(120, { carbs: (i) => (i < 20 ? 600 : 50) }));
    expect(Math.min(...s.map((p) => p.kg))).toBe(-GLYCOGEN_CAP_KG);
  });

  it('holds flat across a gap in carb logging rather than decaying to zero', () => {
    const recs = v3Records(30, { carbs: (i) => (i < 10 ? 300 : 150) }).map((r, i) =>
      i >= 20 ? { d: r.d, w: r.w, kc: r.kc } : r,
    );
    const s = glycogenSeries(recs);
    const tail = s.slice(27).map((p) => p.kg);
    expect(new Set(tail).size).toBe(1);
    expect(s[29].carb7).toBeNull();
  });

  it('lag-matches the level: levelLb trails lb through the transition and lands on it', () => {
    const s = glycogenSeries(v3Records(80, { carbs: (i) => (i < 20 ? 300 : 150) }));
    // Through the drop the filtered water is behind the raw water — which is
    // exactly what the weight level does, and why the correction uses it.
    for (let i = 21; i < 32; i++) expect(s[i].levelLb).toBeGreaterThan(s[i].lb);
    // Both settle on the same steady state once the carb intake stops moving.
    expect(s[79].levelLb).toBeCloseTo(s[79].lb, 1);
  });

  it('returns [] with no records at all', () => {
    expect(glycogenSeries([])).toEqual([]);
  });
});

describe('priorTdee (Mifflin × activity factor, sd 450)', () => {
  const p80 = { ...DEFAULT_PROFILE, weightLb: 176.37, heightCm: 180, age: 30, sex: 'male' as const };

  it('is Mifflin × 1.3 with no steps, sd 450', () => {
    const prior = priorTdee(p80, [], day(0));
    expect(prior.rmr).toBe(1780);
    expect(prior.activityFactor).toBe(1.3);
    expect(prior.kcal).toBe(round(1780 * 1.3));
    expect(prior.sd).toBe(PRIOR_SD_KCAL);
    expect(prior.steps30).toBeNull();
  });

  it('scales the activity factor 0.05 per 1,000 steps above 4,000 and compresses the sd at high activity', () => {
    const recs = v3Records(30, { steps: 10000 });
    const prior = priorTdee(p80, recs, day(29));
    expect(prior.steps30).toBe(10000);
    expect(prior.activityFactor).toBe(1.6);
    expect(prior.sd).toBe(round(PRIOR_SD_KCAL * PRIOR_COMPRESSION));
  });

  it('caps the step factor at 1.8 and adds 0.03 per lifting day', () => {
    const recs = v3Records(30, { steps: 30000 }).map((r, i) => (i % 2 === 0 ? { ...r, wko: 1 } : r));
    const prior = priorTdee(p80, recs, day(29));
    expect(prior.activityFactor).toBeCloseTo(1.8 + 0.03 * prior.liftDaysPerWk, 6);
    expect(prior.liftDaysPerWk).toBeCloseTo(3.5, 1);
  });

  it('widens to 550 and estimates the height when none is on file', () => {
    const prior = priorTdee({ ...p80, heightCm: undefined }, [], day(0));
    expect(prior.heightEstimated).toBe(true);
    expect(prior.rmr).toBe(round(1748.75));
    expect(prior.sd).toBe(PRIOR_SD_NO_HEIGHT_KCAL);
    expect(prior.label).toContain('height estimated');
  });
});

describe('metKcal / sessionKcal', () => {
  it('is the (MET − 1) · 3.5 · kg / 200 · min identity', () => {
    expect(metKcal(5, 80, 60)).toBeCloseTo(((5 - 1) * 3.5 * 80) / 200 * 60, 6);
    expect(metKcal(5, 80, 0)).toBe(0);
    expect(metKcal(Number.NaN, 80, 60)).toBe(0);
  });

  it('picks the MET from kind and session RPE, and prefers a logged cardio kcal', () => {
    const base = { id: 'w', d: day(0), start: '18:00', durationMin: 60, kind: 'strength', source: 'manual' } as Workout;
    expect(sessionKcal({ ...base, srpe: 3 }, 80)).toBeCloseTo(metKcal(MET_LIFT.light, 80, 60), 6);
    expect(sessionKcal({ ...base, srpe: 6 }, 80)).toBeCloseTo(metKcal(MET_LIFT.moderate, 80, 60), 6);
    expect(sessionKcal({ ...base, srpe: 9 }, 80)).toBeCloseTo(metKcal(MET_LIFT.vigorous, 80, 60), 6);
    expect(sessionKcal({ ...base, kind: 'cardio', srpe: 6, cardio: { kcal: 420 } }, 80)).toBe(420);
    expect(sessionKcal({ ...base, durationMin: 0 }, 80)).toBeCloseTo(metKcal(MET_LIFT.moderate, 80, DEFAULT_SESSION_MIN), 6);
  });
});

describe('weeklyExpenditureV3 — the observation', () => {
  const profile = profileWithFat(180, 18); // ρ ≈ 2,900 kcal/lb

  it('reverse-calculates with the per-user ρ, not 3,500', () => {
    const recs = v3Records(15, { kc: 2000, lbPerWeek: -1 });
    const kalman = kalmanFixture(day(0), v3Levels(15, -1), 0.4);
    const r = weeklyExpenditureV3(recs, day(14), { profile, targets: V3_TARGETS, kalman });
    const rho = r.density.kcalPerLb;
    const b = r.blocks[1]; // block 1 covers a full 7 days
    expect(b.spanDays).toBe(7);
    expect(b.deltaLb).toBeCloseTo(-1, 3);
    expect(b.glycogenLb).toBe(0);
    expect(b.tdeeObs).toBe(round(2000 + rho / 7));
    // With the v2 constant the same block would have read ~85 kcal higher.
    expect(b.tdeeObs).toBeLessThan(2000 + KCAL_PER_LB / 7);
    expect(r.density.kcalPerLb).toBe(energyDensity(profile, r.bodyWeightLb).kcalPerLb);
    expect(r.reason).toContain(`${rho.toLocaleString('en-US')} kcal per lb`);
    expect(r.reason).toContain('of 7 days logged');
  });

  it('block 0 covers 6 days — there is no level before the first weigh-in', () => {
    const recs = v3Records(15, { kc: 2000, lbPerWeek: -1 });
    const kalman = kalmanFixture(day(0), v3Levels(15, -1), 0.4);
    const r = weeklyExpenditureV3(recs, day(14), { profile, targets: V3_TARGETS, kalman });
    expect(r.blocks[0].spanDays).toBe(6);
    expect(r.blocks[0].deltaLb).toBeCloseTo(-6 / 7, 3);
    expect(r.blocks[0].tdeeObs).toBe(round(2000 + r.density.kcalPerLb / 7));
  });

  it('imputes unlogged days at the target and widens Var(mean) accordingly', () => {
    const recs = v3Records(15, { kc: 2000, lbPerWeek: -1 }).map((r, i) => (i % 7 === 3 ? { d: r.d, w: r.w } : r));
    const kalman = kalmanFixture(day(0), v3Levels(15, -1), 0.4);
    const r = weeklyExpenditureV3(recs, day(14), { profile, targets: { ...V3_TARGETS, kcal: 2700 }, kalman });
    const b = r.blocks[1];
    expect(b.loggedDays).toBe(6);
    expect(b.imputedDays).toBe(1);
    expect(b.meanIntake).toBe(round((6 * 2000 + 2700) / 7));
    expect(b.meanIntakeVar).toBeCloseTo((6 * 150 ** 2 + 400 ** 2) / 49, 1);
  });

  it('corrects Δlevel by the glycogen water before forming the observation', () => {
    const withCut = v3Records(30, { kc: 2000, lbPerWeek: -1, carbs: (i) => (i < 7 ? 300 : 150) });
    const flat = v3Records(30, { kc: 2000, lbPerWeek: -1, carbs: 300 });
    const kalman = kalmanFixture(day(0), v3Levels(30, -1), 0.4);
    const cut = weeklyExpenditureV3(withCut, day(28), { profile, targets: V3_TARGETS, kalman });
    const none = weeklyExpenditureV3(flat, day(28), { profile, targets: V3_TARGETS, kalman });
    // Same level series both times, so the ONLY difference is the correction.
    expect(cut.blocks[1].glycogenLb).toBeLessThan(-0.5);
    expect(none.blocks[1].glycogenLb).toBe(0);
    // Same level series both ways, so the corrected block attributes part of
    // the drop to water and reads LOWER — v2 would have banked it as expenditure.
    expect(cut.blocks[1].tdeeObs as number).toBeLessThan(none.blocks[1].tdeeObs as number);
    expect(cut.blocks[1].reason).toContain('glycogen water');
  });

  it('gates a sparse block to predict-only and only widens the interval', () => {
    const recs = v3Records(15, { kc: 2000, lbPerWeek: -1 }).map((r, i) =>
      i >= 8 && i <= 13 ? { d: r.d, kc: r.kc } : r,
    );
    const kalman = kalmanFixture(day(0), v3Levels(15, -1), 0.4);
    const r = weeklyExpenditureV3(recs, day(14), { profile, targets: V3_TARGETS, kalman });
    const b = r.blocks[1];
    expect(b.weighIns).toBeLessThan(MIN_BLOCK_WEIGH_INS);
    expect(b.valid).toBe(false);
    expect(b.reason).toContain('predict-only');
    // Predict-only: the block drifts the posterior wider instead of moving it.
    expect(b.tdee).toBe(r.blocks[0].tdee);
    expect(b.tdeeSd).toBeGreaterThan(r.blocks[0].tdeeSd);
  });
});

describe('weeklyExpenditureV3 — the steps observation and the posterior', () => {
  const profile = profileWithFat(180, 18);

  it('folds in RMR·1.15 + 0.00044·kg·(steps − 2,500) + session kcal', () => {
    const recs = v3Records(15, { kc: 2000, lbPerWeek: -1, steps: 12000 });
    const kalman = kalmanFixture(day(0), v3Levels(15, -1), 0.4);
    const r = weeklyExpenditureV3(recs, day(14), { profile, targets: V3_TARGETS, kalman });
    const kg = r.bodyWeightLb / LB_PER_KG;
    const expected = r.prior.rmr * NEAT_MULTIPLIER + STEP_KCAL_PER_KG_PER_STEP * kg * (12000 - STEP_FLOOR);
    expect(r.blocks[1].steps).toBe(12000);
    expect(r.blocks[1].tdeeSteps).toBe(round(expected));
  });

  it('adds session kcal from the workouts it is given', () => {
    const recs = v3Records(15, { kc: 2000, lbPerWeek: -1, steps: 8000 });
    const kalman = kalmanFixture(day(0), v3Levels(15, -1), 0.4);
    const workouts: Workout[] = [8, 10, 12].map((i) => ({
      id: `w${i}`, d: day(i), start: '18:00', durationMin: 60, kind: 'strength', srpe: 6, source: 'manual',
    }));
    const bare = weeklyExpenditureV3(recs, day(14), { profile, targets: V3_TARGETS, kalman });
    const lifted = weeklyExpenditureV3(recs, day(14), { profile, targets: V3_TARGETS, kalman, workouts });
    expect(bare.blocks[1].sessionKcal).toBe(0);
    expect(lifted.blocks[1].sessionKcal).toBe(round((3 * metKcal(MET_LIFT.moderate, lifted.bodyWeightLb / LB_PER_KG, 60)) / 7));
    expect(lifted.blocks[1].tdeeSteps as number).toBeGreaterThan(bare.blocks[1].tdeeSteps as number);
  });

  it('skips the steps observation when fewer than 3 days carry steps', () => {
    const kalman = kalmanFixture(day(0), v3Levels(15, -1), 0.4);
    const two = v3Records(15, { kc: 2000, lbPerWeek: -1 }).map((r, i) => (i === 8 || i === 9 ? { ...r, st: 9000 } : r));
    const three = v3Records(15, { kc: 2000, lbPerWeek: -1 }).map((r, i) => (i >= 8 && i <= 10 ? { ...r, st: 9000 } : r));
    const run = (recs: DailyRecord[]) => weeklyExpenditureV3(recs, day(14), { profile, targets: V3_TARGETS, kalman });
    /** Replay the posterior over both blocks using the WEIGHT observation only. */
    const weightOnly = (r: ReturnType<typeof run>) => {
      let theta = r.prior.kcal;
      let v = r.prior.sd ** 2;
      for (const b of r.blocks) {
        v += TDEE_DRIFT_SD ** 2;
        if (!b.valid || b.tdeeObs === null || b.tdeeObsVar === null) continue;
        const g = v / (v + b.tdeeObsVar);
        theta += g * (b.tdeeObs - theta);
        v *= 1 - g;
      }
      return theta;
    };
    const a = run(two);
    const b = run(three);
    expect(a.blocks[1].steps).toBe(9000); // measured…
    expect(Math.abs(a.blocks[1].tdee - weightOnly(a))).toBeLessThanOrEqual(1); // …but not folded
    expect(Math.abs(b.blocks[1].tdee - weightOnly(b))).toBeGreaterThan(1); // three days: folded
  });

  it('starts at the prior with a wide interval and narrows as blocks land', () => {
    const empty = weeklyExpenditureV3([], day(14), { profile, targets: V3_TARGETS });
    expect(empty.tdee).toBe(priorTdee(profile, [], day(14), 180).kcal);
    expect(empty.ci).toBe(round(TDEE_CI_Z * PRIOR_SD_KCAL));
    expect(empty.valid).toBe(false);
    expect(empty.calibrating).toBe(true);
    expect(empty.blocks).toEqual([]);

    const recs = v3Records(60, { kc: 2000, lbPerWeek: -1 });
    const kalman = kalmanFixture(day(0), v3Levels(60, -1), 0.4);
    const r = weeklyExpenditureV3(recs, day(59), { profile, targets: V3_TARGETS, kalman });
    expect(r.blocks.length).toBe(8);
    expect(r.ci).toBeLessThan(empty.ci);
    expect(r.valid).toBe(true);
    // Every block's own posterior sd is finite and shrinking early on.
    expect(r.blocks[7].tdeeSd).toBeLessThan(r.blocks[0].tdeeSd);
    expect(r.blocks.every((b) => Number.isFinite(b.tdee) && Number.isFinite(b.tdeeSd))).toBe(true);
  });

  it('is the exact 1-D Kalman fold of prior and first observation', () => {
    const recs = v3Records(8, { kc: 2000, lbPerWeek: -1 });
    const kalman = kalmanFixture(day(0), v3Levels(8, -1), 0.4);
    const r = weeklyExpenditureV3(recs, day(7), { profile, targets: V3_TARGETS, kalman });
    const b = r.blocks[0];
    const prior = r.prior;
    const v0 = prior.sd ** 2 + TDEE_DRIFT_SD ** 2;
    const gain = v0 / (v0 + (b.tdeeObsVar as number));
    expect(b.tdee).toBe(round(prior.kcal + gain * ((b.tdeeObs as number) - prior.kcal)));
    expect(b.tdeeSd).toBe(round(Math.sqrt((1 - gain) * v0)));
  });
});

describe('weeklyExpenditureV3 — degenerate input', () => {
  const profile = profileWithFat(180, 18);
  const call = (recs: DailyRecord[], asOf = day(14)) =>
    weeklyExpenditureV3(recs, asOf, { profile, targets: V3_TARGETS });

  it('survives empty, single-record and all-null input without a NaN', () => {
    for (const recs of [[], [{ d: day(3) }], [{ d: day(1), w: 180 }], v3Records(1)]) {
      const r = call(recs as DailyRecord[]);
      expect(Number.isFinite(r.tdee)).toBe(true);
      expect(Number.isFinite(r.ci)).toBe(true);
      expect(r.reason.length).toBeGreaterThan(0);
      expect(r.blocks.every((b) => Number.isFinite(b.tdee) && !b.valid)).toBe(true);
      expect(recommendIntakeV3({ result: r, targets: V3_TARGETS }).tier).toBe('hold');
    }
    // With no weigh-in at all there is no anchor, so there are no blocks.
    expect(call([{ d: day(3) }]).blocks).toEqual([]);
    expect(call([]).firstWeighIn).toBeNull();
  });

  it('is order-independent and ignores future-dated records', () => {
    const recs = v3Records(20, { kc: 2000, lbPerWeek: -1 });
    const shuffled = [...recs].reverse();
    const withFuture = [...recs, { d: day(40), w: 120, kc: 900 }];
    const a = call(recs, day(19));
    expect(call(shuffled, day(19))).toEqual(a);
    expect(call(withFuture, day(19))).toEqual(a);
  });

  it('falls back to the EWMA trend when no Kalman result is supplied', () => {
    const recs = v3Records(30, { kc: 2000, lbPerWeek: -1 });
    const r = call(recs, day(29));
    expect(r.blocks.length).toBe(4);
    expect(r.blocks.every((b) => b.deltaLb !== null)).toBe(true);
    expect(r.blocks[3].deltaVar).toBe(round(2 * FALLBACK_LEVEL_VAR, 4));
  });

  it('an empty Kalman result falls back rather than producing nothing', () => {
    const recs = v3Records(20, { kc: 2000, lbPerWeek: -1 });
    const empty = kalmanFixture(day(0), []);
    expect(weeklyExpenditureV3(recs, day(19), { profile, targets: V3_TARGETS, kalman: empty }).blocks.length).toBe(2);
  });
});

describe('recommendIntakeV3 — two tiers', () => {
  const profile = profileWithFat(180, 18);
  /** 180 lb × [0.5, 1.0]%/wk ⇒ a −1.80 … −0.90 lb/wk signed band. */
  const run = (lbPerWeek: number, days: number, over: Partial<ExpenditureV3Opts> = {}) => {
    const recs = v3Records(days, { kc: 2000, lbPerWeek });
    const kalman = kalmanFixture(day(0), v3Levels(days, lbPerWeek), 0.25);
    return weeklyExpenditureV3(recs, day(days - 1), { profile, targets: V3_TARGETS, kalman, ...over });
  };

  it('holds inside the band and says how confident it is', () => {
    const r = run(-1.35, 30);
    expect(r.blocks[3].pOutside).toBeLessThan(FINE_TIER_P);
    const rec = recommendIntakeV3({ result: r, targets: V3_TARGETS });
    expect(rec.tier).toBe('hold');
    expect(rec.delta).toBe(0);
    expect(rec.reason).toContain('%');
    expect(rec.reason).toContain('kcal per lb');
  });

  it('nudges ±50–100 kcal after a SINGLE block at p ≥ 0.7', () => {
    const r = run(-0.2, 8); // losing far too slowly
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks[0].pOutside).toBeGreaterThanOrEqual(FINE_TIER_P);
    const rec = recommendIntakeV3({ result: r, targets: V3_TARGETS });
    expect(rec.tier).toBe('fine');
    expect(Math.abs(rec.delta)).toBeLessThanOrEqual(FINE_STEP_LARGE);
    expect(Math.abs(rec.delta)).toBeGreaterThanOrEqual(FINE_STEP_SMALL);
    expect(rec.delta).toBeLessThan(0); // above the band ⇒ eat less
    expect(rec.reason).toMatch(/\d+% chance/);
    expect(rec.reason).toMatch(/\d+ of \d+ days logged/);
  });

  it('escalates to ≥ 150 kcal only after two blocks outside, and adds when losing too fast', () => {
    const r = run(-3, 22);
    expect(r.blocksOutside).toBeGreaterThanOrEqual(2);
    expect(r.valid).toBe(true);
    const rec = recommendIntakeV3({ result: r, targets: V3_TARGETS });
    expect(rec.tier).toBe('coarse');
    expect(rec.delta).toBeGreaterThanOrEqual(COARSE_STEP);
    expect(rec.reason).toContain('blocks running');
  });

  it('freezes the coarse move for 14 days after a target change but still allows the nudge', () => {
    const days = 22;
    const open = run(-3, days);
    expect(recommendIntakeV3({ result: open, targets: V3_TARGETS }).tier).toBe('coarse');

    const frozen = run(-3, days, { lastKcalChangeAt: day(days - 3) });
    expect(frozen.frozen).toBe(true);
    expect(frozen.frozenUntil).toBe(addDays(day(days - 3), KCAL_CHANGE_FREEZE_DAYS));
    // `blocksOutside` counts only blocks that START after the change, so a
    // fresh change also resets the coarse tier's evidence.
    expect(frozen.blocksOutside).toBe(0);
    const rec = recommendIntakeV3({ result: frozen, targets: V3_TARGETS });
    expect(rec.tier).toBe('fine');
    expect(Math.abs(rec.delta)).toBeLessThan(COARSE_STEP);
    expect(rec.reason).toContain('frozen until');
  });

  it('never goes below the floor that fits protein, the fat floor and 50 g of carbs', () => {
    const targets: Targets = { ...V3_TARGETS, kcal: 1500, protein: 200, fatFloor: 70 };
    const r = run(-0.1, 22);
    const rec = recommendIntakeV3({ result: r, targets, currentKcal: 1500 });
    expect(rec.minimumKcal).toBe(minimumIntakeKcalV3(targets));
    expect(rec.kcal).toBeGreaterThanOrEqual(rec.minimumKcal);
    if (rec.kcal === rec.minimumKcal) expect(rec.reason).toContain('floor');
  });

  it('holds when the latest block never passed its gates', () => {
    const recs = v3Records(15, { kc: 2000, lbPerWeek: -1 }).map((r, i) => (i >= 7 ? { d: r.d } : r));
    const kalman = kalmanFixture(day(0), v3Levels(15, -1), 0.4);
    const r = weeklyExpenditureV3(recs, day(14), { profile, targets: V3_TARGETS, kalman });
    const rec = recommendIntakeV3({ result: r, targets: V3_TARGETS });
    expect(rec.tier).toBe('hold');
    expect(rec.changed).toBe(false);
  });

  it('holds with no completed block at all', () => {
    const r = weeklyExpenditureV3([], day(5), { profile, targets: V3_TARGETS });
    const rec = recommendIntakeV3({ result: r, targets: V3_TARGETS });
    expect(rec.tier).toBe('hold');
    expect(rec.kcal).toBe(V3_TARGETS.kcal);
  });

  it('reads the band from the goal phase, so a gainer is never told to cut for gaining', () => {
    const gainer: Profile = { ...profile, goalPhase: 'muscle-gain' };
    const recs = v3Records(15, { kc: 3000, lbPerWeek: 1.35 });
    const kalman = kalmanFixture(day(0), v3Levels(15, 1.35), 0.25);
    const r = weeklyExpenditureV3(recs, day(14), { profile: gainer, targets: V3_TARGETS, kalman });
    expect(r.band).toEqual([round(r.bodyWeightLb * 0.005, 2), round(r.bodyWeightLb * 0.01, 2)]);
    expect(recommendIntakeV3({ result: r, targets: V3_TARGETS, currentKcal: 3000 }).tier).toBe('hold');
  });
});

describe('the v3 floors', () => {
  it('fatFloorGrams is max(60 g, 15% of kcal / 9)', () => {
    expect(fatFloorGrams(2000)).toBe(FAT_FLOOR_G);
    expect(fatFloorGrams(4000)).toBe(round((0.15 * 4000) / 9, 1));
    expect(fatFloorGrams(2000, { ...V3_TARGETS, fatFloor: 80 })).toBe(80);
  });

  it('minimumIntakeKcalV3 keeps protein whole and leaves 50 g of carbs', () => {
    expect(minimumIntakeKcalV3(V3_TARGETS)).toBe(180 * 4 + 60 * 9 + 50 * 4);
    // The percentage form binds only for an implausibly high protein target.
    expect(minimumIntakeKcalV3({ ...V3_TARGETS, protein: 900 })).toBe(round((900 * 4 + 200) / 0.85));
  });
});
