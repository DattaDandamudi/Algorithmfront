import { describe, expect, it } from 'vitest';
import type { DailyRecord } from '../data/types';
import { addDays } from '../lib/dates';
import { ageNormMs, hrvStatus, isHrv, lnSeries, swcBandSeries, swcPosition } from './hrv';

const ASOF = '2026-09-06';
const MU = Math.log(60);

/**
 * Repeating 7-day ln deviations that sum to 0, so the 7-day mean is exactly μ
 * and the sample SD over 28 days is sqrt(0.0448/27) ≈ 0.04073 (hand-derived).
 */
const CYCLE = [0.04, -0.04, 0.02, -0.02, 0.06, -0.06, 0];
/** 30 days: two quiet lead-in days + 4 cycles; the last entry is today (dev 0). */
const BALANCED = [0, 0, ...CYCLE, ...CYCLE, ...CYCLE, ...CYCLE];

/** devs[i] → record on ASOF − (len − 1 − i) with hrv = exp(mu + dev); null → no record. */
function fromDevs(devs: Array<number | null>, mu = MU, asOf = ASOF): DailyRecord[] {
  const out: DailyRecord[] = [];
  const n = devs.length;
  devs.forEach((dev, i) => {
    if (dev !== null) out.push({ d: addDays(asOf, -(n - 1 - i)), hrv: Math.exp(mu + dev) });
  });
  return out;
}

function withToday(dev: number | null, base = BALANCED): Array<number | null> {
  return [...base.slice(0, -1), dev];
}

describe('hrvStatus — SWC on a synthetic series', () => {
  it('computes the 7-day geometric mean, SD and SWC band (balanced)', () => {
    const s = hrvStatus(fromDevs(BALANCED), ASOF, { age: 26 });
    expect(s.band).toBe('balanced');
    expect(s.todayMs).toBeCloseTo(60, 6);
    expect(s.todayLn).toBeCloseTo(MU, 9);
    expect(s.mean7Ln).toBeCloseTo(MU, 9);
    expect(s.mean7Ms).toBe(60);
    expect(s.sdLn).toBeCloseTo(0.040734, 5);
    expect(s.swcLowerLn).toBeCloseTo(MU - 0.5 * 0.040734, 5);
    expect(s.swcUpperLn).toBeCloseTo(MU + 0.5 * 0.040734, 5);
    expect(s.swcLowerMs).toBe(58.8);
    expect(s.swcUpperMs).toBe(61.2);
    expect(s.cv7).toBeCloseTo(1.06, 2);
    expect(s.cvPrev7).toBeCloseTo(1.06, 2);
    expect(s.cvTrend).toBe('stable');
    expect(s.bigDrop).toBe(false);
    expect(s.daysOfData).toBe(30);
    expect(s.baselineEstablished).toBe(true);
    expect(s.note).toMatch(/Within your normal range \(59–61 ms\)/);
  });

  it('is low when today sits below the lower SWC, and flags the big drop', () => {
    const s = hrvStatus(fromDevs(withToday(-0.1)), ASOF, { age: 26 });
    expect(s.band).toBe('low');
    expect(s.bigDrop).toBe(true); // 20 × 0.10 = 2.0 ≥ 1.5
    expect(s.note).toMatch(/Below your normal range/);
    expect(s.note).toMatch(/suggest low intensity/);
  });

  it('is unbalanced when today sits above the upper SWC', () => {
    const s = hrvStatus(fromDevs(withToday(0.1)), ASOF, { age: 26 });
    expect(s.band).toBe('unbalanced');
    expect(s.bigDrop).toBe(false);
    expect(s.note).toMatch(/Above your normal range/);
  });

  it('is unbalanced when day-to-day CV rises > 1.5× even with today inside the band', () => {
    const small = [0.01, -0.01, 0.005, -0.005, 0.015, -0.015, 0];
    const big = [0.05, -0.05, 0.03, -0.03, 0.07, -0.07, 0];
    const s = hrvStatus(fromDevs([0, 0, ...small, ...small, ...small, ...big]), ASOF, { age: 26 });
    // today (dev 0) equals mean7 → inside the SWC; only the CV rule can fire.
    expect(s.todayLn as number).toBeGreaterThan(s.swcLowerLn as number);
    expect(s.todayLn as number).toBeLessThan(s.swcUpperLn as number);
    expect(s.cvTrend).toBe('rising');
    expect((s.cv7 as number) / (s.cvPrev7 as number)).toBeGreaterThan(1.5);
    expect(s.band).toBe('unbalanced');
    expect(s.note).toMatch(/variability is rising/);
  });

  it('is insufficient with fewer than 7 readings in the SD window', () => {
    const devs: Array<number | null> = Array.from({ length: 30 }, () => null);
    [29, 27, 25, 23, 21].forEach((i) => (devs[i] = 0));
    const s = hrvStatus(fromDevs(devs), ASOF, { age: 26 });
    expect(s.band).toBe('insufficient');
    expect(s.sdLn).toBeNull();
    expect(s.swcLowerMs).toBeNull();
    expect(s.swcUpperMs).toBeNull();
    expect(s.mean7Ms).toBe(60); // 4 readings (dev 0) in the last 7 days
    expect(s.daysOfData).toBe(5);
    expect(s.baselineEstablished).toBe(false);
    expect(s.note).toMatch(/Need 7\+ HRV readings in the last 28 days .*have 5/);
    expect(s.note).toMatch(/Baseline still forming \(5\/21 days\)/);
  });

  it('is insufficient when the window has readings but the last 7 days have none', () => {
    const devs: Array<number | null> = Array.from({ length: 30 }, () => null);
    for (let i = 5; i < 20; i++) devs[i] = CYCLE[i % 7];
    const s = hrvStatus(fromDevs(devs), ASOF);
    expect(s.band).toBe('insufficient');
    expect(s.mean7Ln).toBeNull();
    expect(s.todayMs).toBeNull();
    expect(s.note).toMatch(/No HRV logged in the last 7 days/);
  });

  it('is poor when the 28-day geometric mean is below the age norm (suppresses balanced only)', () => {
    const recs = fromDevs(BALANCED, Math.log(28)); // geometric mean 28 ms
    expect(hrvStatus(recs, ASOF, { age: 26 }).band).toBe('poor'); // norm 35
    expect(hrvStatus(recs, ASOF, { age: 26 }).note).toMatch(/below the age norm \(35 ms\)/);
    expect(hrvStatus(recs, ASOF, { age: 55 }).band).toBe('balanced'); // norm 20
    expect(hrvStatus(recs, ASOF).band).toBe('balanced'); // no age → no norm check
    // low still wins over poor
    expect(hrvStatus(fromDevs(withToday(-0.1), Math.log(28)), ASOF, { age: 26 }).band).toBe('low');
  });

  it('bigDrop triggers at a 1.5-point drop in 20×ln (≈7.5 %)', () => {
    expect(hrvStatus(fromDevs(withToday(-0.08)), ASOF).bigDrop).toBe(true);
    expect(hrvStatus(fromDevs(withToday(-0.075)), ASOF).bigDrop).toBe(true);
    expect(hrvStatus(fromDevs(withToday(-0.07)), ASOF).bigDrop).toBe(false);
    expect(hrvStatus(fromDevs(withToday(null)), ASOF).bigDrop).toBe(false);
  });

  it('falls back to the 7-day mean when today has no reading', () => {
    const s = hrvStatus(fromDevs(withToday(null)), ASOF, { age: 26 });
    expect(s.todayMs).toBeNull();
    expect(s.todayLn).toBeNull();
    expect(s.band).toBe('balanced');
    expect(s.daysOfData).toBe(29);
    expect(s.mean7Ms).not.toBeNull();
  });

  it('marks the baseline as forming below 21 readings in 30 days', () => {
    const devs: Array<number | null> = Array.from({ length: 30 }, () => null);
    for (let i = 15; i < 30; i++) devs[i] = CYCLE[i % 7];
    const s = hrvStatus(fromDevs(devs), ASOF, { age: 26 });
    expect(s.daysOfData).toBe(15);
    expect(s.baselineEstablished).toBe(false);
    expect(s.band).not.toBe('insufficient');
    expect(s.note).toMatch(/Baseline still forming \(15\/21 days\)/);
  });

  it('ignores records after asOf and non-positive readings', () => {
    const recs = [...fromDevs(BALANCED), { d: addDays(ASOF, 1), hrv: 5 }, { d: addDays(ASOF, -3), hrv: 0 }];
    const s = hrvStatus(recs, ASOF);
    expect(s.mean7Ms).toBeCloseTo(60, 0);
    expect(isHrv(0)).toBe(false);
    expect(isHrv(-3)).toBe(false);
    expect(isHrv(Number.NaN)).toBe(false);
    expect(isHrv(48)).toBe(true);
  });

  it('honours a custom SD window', () => {
    const s = hrvStatus(fromDevs(BALANCED), ASOF, { sdWindowDays: 14 });
    expect(s.sdLn).toBeCloseTo(Math.sqrt((0.0448 / 2) / 13), 5);
    expect(s.band).toBe('balanced');
  });

  it('never throws on empty input', () => {
    const s = hrvStatus([], ASOF, { age: 26 });
    expect(s.band).toBe('insufficient');
    expect(s.todayMs).toBeNull();
    expect(s.daysOfData).toBe(0);
    expect(s.bigDrop).toBe(false);
  });
});

describe('ageNormMs', () => {
  it('uses the small age table', () => {
    expect(ageNormMs(26)).toBe(35);
    expect(ageNormMs(29)).toBe(35);
    expect(ageNormMs(30)).toBe(30);
    expect(ageNormMs(45)).toBe(25);
    expect(ageNormMs(50)).toBe(20);
    expect(ageNormMs(80)).toBe(20);
    expect(ageNormMs(undefined)).toBeNull();
    expect(ageNormMs(Number.NaN)).toBeNull();
  });
});

describe('lnSeries', () => {
  it('returns ms and ln per calendar day with null gaps', () => {
    const recs: DailyRecord[] = [
      { d: addDays(ASOF, -2), hrv: 50 },
      { d: ASOF, hrv: 60 },
    ];
    const s = lnSeries(recs, ASOF, 3);
    expect(s.map((p) => p.d)).toEqual([addDays(ASOF, -2), addDays(ASOF, -1), ASOF]);
    expect(s.map((p) => p.ms)).toEqual([50, null, 60]);
    expect(s[0].ln).toBeCloseTo(Math.log(50), 12);
    expect(s[1].ln).toBeNull();
    expect(s[2].ln).toBeCloseTo(Math.log(60), 12);
  });
});

describe('swcBandSeries', () => {
  it('matches hrvStatus on the last day and has one point per day', () => {
    const recs = fromDevs(BALANCED);
    const band = swcBandSeries(recs, ASOF, 30);
    const status = hrvStatus(recs, ASOF);
    expect(band).toHaveLength(30);
    expect(band[0].d).toBe(addDays(ASOF, -29));
    const last = band[band.length - 1];
    expect(last.d).toBe(ASOF);
    expect(last.mean7Ms).toBe(status.mean7Ms);
    expect(last.lowerMs).toBe(status.swcLowerMs);
    expect(last.upperMs).toBe(status.swcUpperMs);
  });

  it('leaves the band null until 7 readings exist, but still reports the 7-day mean', () => {
    const devs: Array<number | null> = Array.from({ length: 30 }, () => null);
    for (let i = 20; i < 30; i++) devs[i] = CYCLE[i % 7]; // readings on the last 10 days only
    const band = swcBandSeries(fromDevs(devs), ASOF, 30);
    // day index 22 = 3rd reading: mean7 exists, no range yet
    expect(band[22].mean7Ms).not.toBeNull();
    expect(band[22].lowerMs).toBeNull();
    // day index 26 = 7th reading: range appears
    expect(band[26].lowerMs).not.toBeNull();
    expect(band[26].upperMs).not.toBeNull();
    // before the first reading everything is null
    expect(band[10]).toEqual({ d: addDays(ASOF, -19), mean7Ms: null, lowerMs: null, upperMs: null });
  });

  it('agrees with hrvStatus evaluated on each earlier day (same rules per day)', () => {
    const recs = fromDevs(withToday(0.1));
    const band = swcBandSeries(recs, ASOF, 10);
    for (const p of band) {
      const s = hrvStatus(recs, p.d);
      expect(p.mean7Ms).toBe(s.mean7Ms);
      expect(p.lowerMs).toBe(s.swcLowerMs);
      expect(p.upperMs).toBe(s.swcUpperMs);
    }
  });

  it('returns [] for a zero-length window', () => {
    expect(swcBandSeries([], ASOF, 0)).toEqual([]);
  });
});

describe('swcPosition', () => {
  it('is 0.5 at the mean, < 0 below, > 1 above', () => {
    expect(swcPosition(hrvStatus(fromDevs(BALANCED), ASOF))).toBeCloseTo(0.5, 6);
    expect(swcPosition(hrvStatus(fromDevs(withToday(-0.1)), ASOF)) as number).toBeLessThan(0);
    expect(swcPosition(hrvStatus(fromDevs(withToday(0.1)), ASOF)) as number).toBeGreaterThan(1);
    expect(swcPosition(hrvStatus([], ASOF))).toBeNull();
  });
});
