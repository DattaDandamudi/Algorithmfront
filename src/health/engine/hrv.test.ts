import { describe, expect, it } from 'vitest';
import type { DailyRecord } from '../data/types';
import { addDays } from '../lib/dates';
import {
  BASELINE_READINGS,
  FORCING_EVIDENCE,
  HRV_PLAUSIBLE_MS,
  MIN_REF_READINGS,
  MIN_WEEK_READINGS,
  REF_EXTEND_MIN_READINGS,
  REF_SD_FLOOR_LN,
  REF_WINDOW_DAYS,
  REF_WINDOW_MAX_DAYS,
  SWC_K,
  Z_SWC,
  ageNormMs,
  forcingHitRate,
  hrvStatus,
  isHrv,
  lnSeries,
  saturationThreshold,
  swcBandSeries,
  swcPosition,
} from './hrv';

const ASOF = '2026-09-06';
const MU = Math.log(60);

/** A 7-day zero-sum cycle, so every complete 7-day mean of ln is exactly μ. */
const CYCLE = [0.04, -0.04, 0.02, -0.02, 0.06, -0.06, 0];
/** 98 days (14 whole cycles) ending on ASOF, whose last entry has deviation 0. */
const BASE: Array<number | null> = Array.from({ length: 98 }, (_, i) => CYCLE[i % 7]);

/**
 * Hand-derived reference for BASE at ASOF: the 90-day window `[ASOF−97, ASOF−7]`
 * holds all 91 readings (≥ 90), median 0, MAD 0.04 → robustSd = 1.4826 × 0.04.
 */
const REF_SD = 1.4826 * 0.04;
const REF_N = 91;
const SE = REF_SD * Math.sqrt(1 / 7 + Math.PI / 2 / REF_N);
const HALF = Z_SWC * SE;

/** devs[i] → record on ASOF − (len − 1 − i) with hrv = exp(mu + dev); null → no record. */
function fromDevs(devs: Array<number | null>, mu = MU, asOf = ASOF): DailyRecord[] {
  const out: DailyRecord[] = [];
  const n = devs.length;
  devs.forEach((dev, i) => {
    if (dev !== null) out.push({ d: addDays(asOf, -(n - 1 - i)), hrv: Math.exp(mu + dev) });
  });
  return out;
}

/** Add `delta` to the last `n` deviations (the current week, by default). */
function shiftLast(delta: number, n = 7, base = BASE): Array<number | null> {
  return base.map((v, i) => (i >= base.length - n && v !== null ? v + delta : v));
}

/** Replace today's deviation. */
function withToday(dev: number | null, base = BASE): Array<number | null> {
  return [...base.slice(0, -1), dev];
}

function flat(n: number, ms = 60, asOf = ASOF): DailyRecord[] {
  return Array.from({ length: n }, (_, i) => ({ d: addDays(asOf, -(n - 1 - i)), hrv: ms }));
}

describe('hrvStatus — reference window', () => {
  it('uses the 90-day window only when it holds 90+ readings, else 60, else a 28-day fallback', () => {
    expect(hrvStatus(flat(100), ASOF).reference).toMatchObject({
      windowDays: REF_WINDOW_MAX_DAYS,
      n: 91,
      calibrating: false,
    });
    // 70 days: the 90-day window holds 61 readings, so the 60-day one wins.
    expect(hrvStatus(flat(70), ASOF).reference).toMatchObject({
      windowDays: REF_WINDOW_DAYS,
      n: 61,
      calibrating: false,
    });
    // 30 days: 23 readings in the 60-day window — still ≥ 20, so no fallback.
    expect(hrvStatus(flat(30), ASOF).reference).toMatchObject({
      windowDays: REF_WINDOW_DAYS,
      n: 23,
      calibrating: false,
    });
    // 20 days: only 13 in the lagged window → 28-day fallback and `calibrating`.
    const short = hrvStatus(flat(20), ASOF);
    expect(short.reference.windowDays).toBe(28);
    expect(short.calibrating).toBe(true);
    expect(short.note).toMatch(/Reference still calibrating/);
    expect(REF_EXTEND_MIN_READINGS).toBe(90);
    expect(MIN_REF_READINGS).toBe(20);
  });

  it('takes the median and a floored robust SD of ln, and reports the window it used', () => {
    const s = hrvStatus(fromDevs(BASE), ASOF, { age: 26 });
    expect(s.nBaseline).toBe(REF_N);
    expect(s.baselineLn).toBeCloseTo(MU, 12);
    expect(s.baselineMs).toBe(60);
    expect(s.sdLn).toBeCloseTo(REF_SD, 12);
    expect(s.reference.start).toBe(addDays(ASOF, -97));
    expect(s.reference.end).toBe(addDays(ASOF, -7));
    expect(s.reference.truncatedAt).toBeNull();
    // A dead-flat series still gets a usable range because of the SD floor.
    expect(hrvStatus(flat(100), ASOF).sdLn).toBe(REF_SD_FLOOR_LN);
  });

  it('excludes |z| > 3 once: a single 250 ms night barely moves the reference median', () => {
    const clean = flat(100, 60);
    const spiked = clean.map((r) => (r.d === addDays(ASOF, -40) ? { ...r, hrv: 250 } : r));
    const a = hrvStatus(clean, ASOF);
    const b = hrvStatus(spiked, ASOF);
    expect(b.reference.nExcluded).toBe(1);
    expect(b.nBaseline).toBe(REF_N - 1);
    expect(Math.abs((b.baselineMs as number) - (a.baselineMs as number))).toBeLessThan(0.6);
  });

  it('honours referenceStart so a confirmed regime shift does not average the old regime in', () => {
    // 60 days at 40 ms, then 38 days at 60 ms.
    const devs = BASE.map((_, i) => (i < 60 ? Math.log(40) - MU : 0));
    const recs = fromDevs(devs);
    expect(hrvStatus(recs, ASOF).baselineMs).toBe(40);
    const shiftDay = addDays(ASOF, -(98 - 1 - 60));
    const cut = hrvStatus(recs, ASOF, { referenceStart: shiftDay });
    expect(cut.baselineMs).toBe(60);
    expect(cut.reference.truncatedAt).toBe(shiftDay);
    expect(cut.reference.windowDays).toBe(REF_WINDOW_DAYS);
    expect(cut.calibrating).toBe(false);
  });
});

describe('hrvStatus — display band', () => {
  it('bands the 7-day mean at ±0.5 SD (widened for the reference median error)', () => {
    const s = hrvStatus(fromDevs(BASE), ASOF, { age: 26 });
    expect(s.band).toBe('balanced');
    expect(s.mean7Ln).toBeCloseTo(MU, 12);
    expect(s.mean7Ms).toBe(60);
    expect(s.n7).toBe(7);
    expect(s.z).toBeCloseTo(0, 12);
    expect(s.swcLowerLn as number).toBeCloseTo(MU - HALF, 12);
    expect(s.swcUpperLn as number).toBeCloseTo(MU + HALF, 12);
    expect(s.swcLowerMs).toBe(58.1);
    expect(s.swcUpperMs).toBe(61.9);
    expect(s.bandAvailable).toBe(true);
    expect(s.suppressedReason).toBeNull();
    expect(s.note).toMatch(/7-day average 60 ms is within your normal range \(58–62 ms\)/);
    // Z_SWC is the nominal SWC: with a full week and a long reference the edge
    // is exactly ±0.5 SD.
    expect(Z_SWC).toBeCloseTo(SWC_K * Math.sqrt(7), 12);
    const nominal = REF_SD * Math.sqrt(1 / 7);
    expect(HALF / (Z_SWC * nominal)).toBeGreaterThan(1); // widened, but only slightly
    expect(HALF / (Z_SWC * nominal)).toBeLessThan(1.1);
  });

  it('is low below the lower edge and unbalanced above the upper one', () => {
    const low = hrvStatus(fromDevs(shiftLast(-0.05)), ASOF, { age: 26 });
    expect(low.band).toBe('low');
    expect(low.lowWarning).toBe(true);
    expect(low.mean7Ln as number).toBeCloseTo(MU - 0.05, 12);
    expect(low.note).toMatch(/below your normal range/);

    const high = hrvStatus(fromDevs(shiftLast(0.05)), ASOF, { age: 26 });
    expect(high.band).toBe('unbalanced');
    expect(high.greatRecovery).toBe(true);
    expect(high.note).toMatch(/above your normal range/);
    // The reference never moves with the current week.
    expect(low.baselineMs).toBe(60);
    expect(high.baselineMs).toBe(60);
  });

  it('a single outlying reading moves the 7-day mean but not the band', () => {
    const dip = hrvStatus(fromDevs(withToday(-0.1)), ASOF, { age: 26 });
    expect(dip.band).toBe('balanced');
    expect(dip.mean7Ln as number).toBeCloseTo(MU - 0.1 / 7, 12);
    expect(hrvStatus(fromDevs(withToday(0.1)), ASOF, { age: 26 }).band).toBe('balanced');
  });

  it('is poor when the 28-day geometric mean is below the age norm (suppresses balanced only)', () => {
    const recs = fromDevs(BASE, Math.log(28));
    expect(hrvStatus(recs, ASOF, { age: 26 }).band).toBe('poor'); // norm 35
    expect(hrvStatus(recs, ASOF, { age: 26 }).note).toMatch(/below the age norm \(35 ms\)/);
    expect(hrvStatus(recs, ASOF, { age: 55 }).band).toBe('balanced'); // norm 20
    expect(hrvStatus(recs, ASOF).band).toBe('balanced'); // no age → no norm check
    expect(hrvStatus(fromDevs(shiftLast(-0.05), Math.log(28)), ASOF, { age: 26 }).band).toBe('low');
    expect(hrvStatus(recs, ASOF, { age: 26 }).greatRecovery).toBe(false);
  });

  it('validity gate: below 4 readings in the last 7 days the band is suppressed, not guessed', () => {
    const devs = [...BASE];
    for (let i = 98 - 7; i < 98 - 1; i++) devs[i] = null; // leaves today only
    const one = hrvStatus(fromDevs(devs), ASOF, { age: 26 });
    expect(one.n7).toBe(1);
    expect(one.band).toBe('insufficient');
    expect(one.bandAvailable).toBe(false);
    expect(one.suppressedReason).toMatch(/Only 1 HRV reading in the last 7 days/);
    expect(one.forcing).toBe(false);

    const devs4 = [...BASE];
    devs4[97 - 1] = null;
    devs4[97 - 3] = null;
    devs4[97 - 5] = null; // 4 readings left in the window
    const four = hrvStatus(fromDevs(devs4), ASOF, { age: 26 });
    expect(four.n7).toBe(MIN_WEEK_READINGS);
    expect(four.bandAvailable).toBe(true);
    expect(four.band).not.toBe('insufficient');
    // Fewer readings ⇒ a wider band, because the mean is less certain.
    const full = hrvStatus(fromDevs(BASE), ASOF, { age: 26 });
    expect((four.swcUpperLn as number) - (four.swcLowerLn as number)).toBeGreaterThan(
      (full.swcUpperLn as number) - (full.swcLowerLn as number),
    );
  });

  it('is insufficient with nothing in the last 7 days, and never throws on empty input', () => {
    const devs: Array<number | null> = BASE.map((v, i) => (i >= 91 ? null : v));
    const s = hrvStatus(fromDevs(devs), ASOF);
    expect(s.band).toBe('insufficient');
    expect(s.mean7Ln).toBeNull();
    expect(s.suppressedReason).toMatch(/No HRV logged in the last 7 days/);

    const empty = hrvStatus([], ASOF, { age: 26 });
    expect(empty.band).toBe('insufficient');
    expect(empty.todayMs).toBeNull();
    expect(empty.z).toBeNull();
    expect(empty.daysOfData).toBe(0);
    expect(empty.forcing).toBe(false);
    expect(empty.saturated).toBe(false);
    expect(empty.reference.n).toBe(0);
    expect(Object.values(empty).every((v) => typeof v !== 'number' || Number.isFinite(v))).toBe(true);
  });

  it('ignores records after asOf and implausible readings, whatever order they arrive in', () => {
    const bad = new Map<string, number>([
      [addDays(ASOF, -3), 300],
      [addDays(ASOF, -4), 0],
    ]);
    const recs: DailyRecord[] = [
      ...fromDevs(BASE).map((r) => (bad.has(r.d) ? { ...r, hrv: bad.get(r.d) } : r)),
      { d: addDays(ASOF, 1), hrv: 5 },
    ];
    const s = hrvStatus(recs, ASOF, { age: 26 });
    expect(s.n7).toBe(5); // the 300 ms and the 0 are dropped
    expect(hrvStatus([...recs].reverse(), ASOF, { age: 26 })).toEqual(s);
    expect(isHrv(HRV_PLAUSIBLE_MS.min)).toBe(true);
    expect(isHrv(HRV_PLAUSIBLE_MS.max)).toBe(true);
    expect(isHrv(HRV_PLAUSIBLE_MS.max + 1)).toBe(false);
    expect(isHrv(4.9)).toBe(false);
    expect(isHrv(0)).toBe(false);
    expect(isHrv(Number.NaN)).toBe(false);
  });
});

describe('hrvStatus — lnRmssdCv (Flatt & Esco)', () => {
  it('exports the trailing-7-day CV as an independent marker, not a band driver', () => {
    const s = hrvStatus(fromDevs(BASE), ASOF, { age: 26 });
    expect(s.lnRmssdCv).toBe(s.cv7);
    expect(s.lnRmssdCv).toBeCloseTo(1.06, 2);
    expect(s.cvRef).not.toBeNull();
    expect(s.cvTrend).toBe('stable');

    // A collapsing CV is *positive adaptation* in v3 — it must not band the day.
    const small = [0.005, -0.005, 0.002, -0.002, 0.007, -0.007, 0];
    const calm = hrvStatus(fromDevs([...BASE.slice(0, 91), ...small]), ASOF, { age: 26 });
    expect((calm.lnRmssdCv as number) * 2).toBeLessThan(calm.cvRef as number);
    expect(calm.cvTrend).toBe('falling');
    expect(calm.overreachingFlag).toBe(false);
    expect(calm.band).toBe('balanced');

    // A rising CV is still flagged — as a note beside the band, never as the band.
    const big = [0.2, -0.2, 0.15, -0.15, 0.25, -0.25, 0];
    const wild = hrvStatus(fromDevs([...BASE.slice(0, 91), ...big]), ASOF, { age: 26 });
    expect(wild.overreachingFlag).toBe(true);
    expect(wild.overreachingNote).toMatch(/variability is rising/);
    expect(wild.band).toBe('balanced');
    expect(wild.note).toMatch(/variability is rising/);
  });
});

describe('hrvStatus — vagal-saturation guard', () => {
  /** hrv and rhr moving together (so ln rMSSD and RR move apart) — r < 0. */
  function saturatedRecords(shift = 0): DailyRecord[] {
    return BASE.map((dev, i) => {
      const d = addDays(ASOF, -(98 - 1 - i));
      const extra = i >= 91 ? shift : 0;
      return {
        d,
        hrv: Math.exp(MU + (dev as number) + extra),
        rhr: 55 + Math.round(100 * (dev as number)),
      };
    });
  }

  it('sets saturated when the 28-day ln rMSSD / RR correlation is ≤ 0', () => {
    const s = hrvStatus(saturatedRecords(), ASOF, { age: 26 });
    expect(s.saturationN).toBe(28);
    expect(s.saturationR as number).toBeLessThanOrEqual(saturationThreshold(28));
    expect(saturationThreshold(28)).toBeCloseTo(-0.318, 2);
    expect(s.saturated).toBe(true);
    expect(s.saturationReason).toMatch(/moving against your resting heart rate/);
    expect(s.greatRecovery).toBe(false);
  });

  it('suppresses the low-HRV warning and the forcing rule while saturated', () => {
    const s = hrvStatus(saturatedRecords(-0.08), ASOF, { age: 26 });
    expect(s.band).toBe('low'); // the band still describes where the week sits…
    expect(s.saturated).toBe(true);
    expect(s.lowWarning).toBe(false); // …but nothing is claimed from it
    expect(s.forcing).toBe(false);
    expect(s.note).toMatch(/moving against your resting heart rate/);
    expect(s.note).not.toMatch(/favour low intensity/);
  });

  it('leaves an ordinary coupled user unsaturated, and needs 14 pairs before it decides', () => {
    // Higher HRV with a lower RHR: the healthy coupling, r > 0.
    const recs = BASE.map((dev, i) => ({
      d: addDays(ASOF, -(98 - 1 - i)),
      hrv: Math.exp(MU + (dev as number)),
      rhr: 55 - Math.round(100 * (dev as number)),
    }));
    const s = hrvStatus(recs, ASOF, { age: 26 });
    expect(s.saturated).toBe(false);
    expect(s.saturationR as number).toBeGreaterThan(0);

    const noRhr = hrvStatus(fromDevs(BASE), ASOF, { age: 26 });
    expect(noRhr.saturationN).toBe(0);
    expect(noRhr.saturated).toBe(false);
    expect(noRhr.saturationR).toBeNull();
  });
});

describe('hrvStatus — forcing', () => {
  it('rule A fires below 2 × SWC and names itself a tunable heuristic', () => {
    const s = hrvStatus(fromDevs(shiftLast(-0.1)), ASOF, { age: 26 });
    expect(s.forcing).toBe(true);
    expect(s.forcingRule).toBe('twoSwc');
    expect(s.forcingSupport).toBe('heuristic');
    expect(s.forcingLabel).toBe('tunable heuristic, no direct published support');
    expect(s.forcingReason).toMatch(/our own tunable heuristic/);
    expect(s.note).toMatch(/our own tunable heuristic/);
    expect(FORCING_EVIDENCE.twoSwc.support).toBe('heuristic');
    expect(FORCING_EVIDENCE.twoDays.support).toBe('published');
    expect(FORCING_EVIDENCE.twoDays.label).toMatch(/Kiviniemi 2007/);
  });

  it('rule B fires on two days below the SWC edge while still falling (Kiviniemi 2007)', () => {
    const s = hrvStatus(fromDevs(shiftLast(-0.05)), ASOF, { age: 26 });
    expect(s.forcing).toBe(true);
    expect(s.forcingRule).toBe('twoDays');
    expect(s.forcingSupport).toBe('published');

    // One day below the edge is not enough — the second day has to be below too.
    const oneDay = hrvStatus(fromDevs(shiftLast(-0.2, 2)), ASOF, { age: 26 });
    expect(oneDay.band).toBe('low');
    expect(oneDay.forcing).toBe(false);

    // Below the edge two days running, but already recovering → no forcing.
    const recovering = [...BASE];
    for (let i = 91; i < 98; i++) recovering[i] = (recovering[i] as number) - 0.05;
    recovering[97] = 0.02; // today ticks back up, so the weekly mean stops falling
    const r = hrvStatus(fromDevs(recovering), ASOF, { age: 26 });
    expect(r.band).toBe('low');
    expect(r.forcing).toBe(false);
  });

  it('never forces while calibrating, before the baseline is established, or without a week', () => {
    // 20 days of data: reference is a 28-day fallback → calibrating.
    const short = flat(20).map((r, i) => ({ ...r, hrv: i >= 13 ? 40 : 60 }));
    const cal = hrvStatus(short, ASOF, { age: 26 });
    expect(cal.calibrating).toBe(true);
    expect(cal.forcing).toBe(false);

    // Enough reference, but only 15 readings inside the last 30 days.
    const sparse = [...BASE];
    for (let i = 68; i < 98; i++) if (i % 2 === 0) sparse[i] = null;
    const gappy = hrvStatus(fromDevs(shiftLast(-0.1, 7, sparse)), ASOF, { age: 26 });
    expect(gappy.baselineEstablished).toBe(false);
    expect(gappy.forcing).toBe(false);
    expect(gappy.note).toMatch(/Baseline still forming/);
    expect(BASELINE_READINGS).toBe(21);
  });

  it('forcingHitRate replays the rule so the heuristic can be personalised', () => {
    const quiet = forcingHitRate(fromDevs(BASE), ASOF, 30);
    expect(quiet.scannedDays).toBe(30);
    expect(quiet.eligibleDays).toBeGreaterThan(0);
    expect(quiet.hits).toBe(0);
    expect(quiet.rate).toBe(0);

    const dropped = fromDevs(shiftLast(-0.1, 20));
    const hot = forcingHitRate(dropped, ASOF, 30);
    expect(hot.hits).toBeGreaterThan(0);
    expect(hot.byRule.twoSwc + hot.byRule.twoDays).toBe(hot.hits);
    expect(hot.rate as number).toBeGreaterThan(0);
    expect(forcingHitRate([], ASOF, 30).rate).toBeNull();
    expect(forcingHitRate(fromDevs(BASE), ASOF, 0)).toMatchObject({ scannedDays: 0, rate: null });
  });
});

describe('hrvStatus — bigDrop', () => {
  it('needs today at z ≤ −2 AND a falling weekly mean', () => {
    const both = hrvStatus(fromDevs(withToday(-0.3)), ASOF, { age: 26 });
    expect(both.todayZ as number).toBeLessThanOrEqual(-2);
    expect(both.bigDrop).toBe(true);

    // A −2.5 z day that barely moves the week is not a big drop.
    const single = hrvStatus(fromDevs(withToday(-0.15)), ASOF, { age: 26 });
    expect(single.todayZ as number).toBeLessThanOrEqual(-2);
    expect(single.bigDrop).toBe(false);

    expect(hrvStatus(fromDevs(withToday(null)), ASOF).bigDrop).toBe(false);
    expect(hrvStatus(fromDevs(BASE), ASOF).bigDrop).toBe(false);
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
  });
});

describe('swcBandSeries', () => {
  it('matches hrvStatus on every day it covers', () => {
    const recs = fromDevs(shiftLast(0.05));
    const band = swcBandSeries(recs, ASOF, 10);
    expect(band).toHaveLength(10);
    expect(band[band.length - 1].d).toBe(ASOF);
    for (const p of band) {
      const s = hrvStatus(recs, p.d);
      expect(p.mean7Ms).toBe(s.mean7Ms);
      expect(p.lowerMs).toBe(s.swcLowerMs);
      expect(p.upperMs).toBe(s.swcUpperMs);
      expect(p.n7).toBe(s.n7);
    }
  });

  it('drops the band on days the validity gate suppresses it, and returns [] for 0 days', () => {
    const devs: Array<number | null> = Array.from({ length: 98 }, (_, i) => (i < 60 ? CYCLE[i % 7] : null));
    const band = swcBandSeries(fromDevs(devs), ASOF, 20);
    const last = band[band.length - 1];
    expect(last.valid).toBe(false);
    expect(last.lowerMs).toBeNull();
    expect(swcBandSeries([], ASOF, 0)).toEqual([]);
    expect(swcBandSeries([], ASOF, 3)).toEqual([
      { d: addDays(ASOF, -2), mean7Ms: null, lowerMs: null, upperMs: null, n7: 0, valid: false },
      { d: addDays(ASOF, -1), mean7Ms: null, lowerMs: null, upperMs: null, n7: 0, valid: false },
      { d: ASOF, mean7Ms: null, lowerMs: null, upperMs: null, n7: 0, valid: false },
    ]);
  });
});

describe('swcPosition', () => {
  it('positions the 7-day mean: 0.5 at the median, < 0 below, > 1 above', () => {
    expect(swcPosition(hrvStatus(fromDevs(BASE), ASOF))).toBeCloseTo(0.5, 9);
    expect(swcPosition(hrvStatus(fromDevs(shiftLast(-0.05)), ASOF)) as number).toBeLessThan(0);
    expect(swcPosition(hrvStatus(fromDevs(shiftLast(0.05)), ASOF)) as number).toBeGreaterThan(1);
    expect(swcPosition(hrvStatus([], ASOF))).toBeNull();
  });
});
