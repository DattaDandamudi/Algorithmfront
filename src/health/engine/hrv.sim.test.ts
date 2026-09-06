/**
 * Simulation gates for `engine/hrv.ts` — these are acceptance criteria, not
 * documentation. v2 banded a single reading against a 6-week SD and alarmed on
 * roughly a third of ordinary days; every bound below exists because of that.
 *
 * Measured on the seeds fixed here (see the report in each `expect`):
 *   low 9.4 % · unbalanced 10.3 % · forced 3.1 % of stationary days
 *   −15 % episode: first forcing at a median of day 4, clear 3 days after it ends
 *   a single 250 ms night moves the reference median by 0.34 %
 *   the saturation seed raises zero low-HRV warnings
 */
import { describe, expect, it } from 'vitest';
import type { DailyRecord } from '../data/types';
import { addDays } from '../lib/dates';
import { gaussianSeries, hrvSeries, runSeeds } from './simFixtures';
import { hrvStatus } from './hrv';

const END = '2026-09-06';
/** The plan's stationary window. */
const DAYS = 340;
/** Skip the days before a 90-day reference and a 30-day baseline can exist. */
const WARMUP = 110;
const SEEDS = 24;

const dayOf = (index: number, days = DAYS): string => addDays(END, -(days - 1 - index));
const pct = (hits: number, n: number): number => (hits / n) * 100;
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** HRV only: with no RHR the saturation guard is inert, so these are the raw rates. */
function hrvOnly(seed: number, days = DAYS, opts: Partial<Parameters<typeof hrvSeries>[0]> = {}): DailyRecord[] {
  return hrvSeries({ seed, days, end: END, meanMs: 60, cvPct: 10, ...opts }).map((r) => ({
    d: r.d,
    ...(r.hrv === undefined ? {} : { hrv: r.hrv }),
  }));
}

describe('H1 — a stationary user is left alone', () => {
  it('bands ≤ 10 % low, ≤ 12 % unbalanced and forces a light day on < 5 % of days', () => {
    let n = 0;
    let low = 0;
    let unbalanced = 0;
    let forced = 0;
    let ruleA = 0;
    let ruleB = 0;
    runSeeds(SEEDS, (seed) => {
      const recs = hrvOnly(seed);
      for (let k = WARMUP; k < DAYS; k++) {
        const s = hrvStatus(recs, dayOf(k), { age: 30 });
        n++;
        if (s.band === 'low') low++;
        if (s.band === 'unbalanced') unbalanced++;
        if (s.forcing) forced++;
        if (s.forcingRule === 'twoSwc') ruleA++;
        if (s.forcingRule === 'twoDays') ruleB++;
      }
    });
    // Measured: low 9.42 %, unbalanced 10.34 %, forced 3.12 % (A 0.54 %, B 2.57 %).
    expect(n).toBe(SEEDS * (DAYS - WARMUP));
    expect(pct(low, n)).toBeLessThanOrEqual(10);
    expect(pct(unbalanced, n)).toBeLessThanOrEqual(12);
    expect(pct(forced, n)).toBeLessThan(5);
    expect(ruleA + ruleB).toBe(forced);
    // The 2 × SWC heuristic must stay the rare clause; Kiviniemi's carries the rest.
    expect(pct(ruleA, n)).toBeLessThan(1.5);
  });

  it('never returns NaN, and every band it publishes has a reference behind it', () => {
    const recs = hrvOnly(7, 200, { skipProb: 0.35 });
    for (let k = 0; k < 200; k++) {
      const s = hrvStatus(recs, dayOf(k, 200), { age: 30 });
      for (const v of [s.mean7Ln, s.z, s.sdLn, s.baselineLn, s.swcLowerLn, s.swcUpperLn, s.todayZ]) {
        expect(v === null || Number.isFinite(v)).toBe(true);
      }
      if (s.bandAvailable) {
        expect(s.n7).toBeGreaterThanOrEqual(4);
        expect(s.nBaseline).toBeGreaterThanOrEqual(7);
      } else {
        expect(s.band).toBe('insufficient');
        expect(s.forcing).toBe(false);
        expect(s.suppressedReason).not.toBeNull();
      }
    }
  });
});

describe('H2 — a real drop is caught quickly and released quickly', () => {
  it('forces by a median of day 4 of a −15 % episode and clears within 7 days of its end', () => {
    const D = 200;
    const START = 140;
    const LEN = 10;
    const first: number[] = [];
    const clear: number[] = [];
    runSeeds(SEEDS, (seed) => {
      const recs = hrvOnly(seed, D, {
        episode: { startDay: START, days: LEN, hrvPct: -15, rhrDelta: 3 },
      });
      let f = Infinity;
      let c = Infinity;
      for (let k = START; k < D; k++) {
        const s = hrvStatus(recs, dayOf(k, D), { age: 30 });
        if (s.forcing && f === Infinity) f = k - START + 1;
        if (k >= START + LEN && !s.forcing && c === Infinity) c = k - (START + LEN) + 1;
      }
      first.push(f);
      clear.push(c);
    });
    // Measured: median first forcing = day 4, median clear = 3 days after the episode.
    expect(median(first)).toBeLessThanOrEqual(4);
    expect(median(clear)).toBeLessThanOrEqual(7);
    expect(first.filter((d) => d === Infinity).length).toBe(0);
  });
});

describe('H3 — one bad night is not a new baseline', () => {
  it('a single 250 ms reading moves the reference median by less than 1 %', () => {
    const shifts: number[] = [];
    runSeeds(12, (seed) => {
      const clean = hrvOnly(seed, 200);
      const spikeDay = addDays(END, -40);
      const spiked = clean.map((r) => (r.d === spikeDay ? { ...r, hrv: 250 } : r));
      const a = hrvStatus(clean, END, { age: 30 }).baselineMs as number;
      const b = hrvStatus(spiked, END, { age: 30 }).baselineMs as number;
      shifts.push((Math.abs(b - a) / a) * 100);
    });
    // Measured: worst case 0.34 %.
    expect(Math.max(...shifts)).toBeLessThan(1);
  });
});

describe('H4 — vagal saturation', () => {
  it('raises no low-HRV warning for an athlete at RHR 48 whose rMSSD keeps climbing', () => {
    let n = 0;
    let warnings = 0;
    let saturated = 0;
    runSeeds(12, (seed) => {
      const g = gaussianSeries({ seed, days: 120, end: END, mean: 0, sd: 1, dp: 4 });
      // rMSSD climbing 70 → 110 ms while resting HR sits at 48 and edges *up*:
      // the R–R interval is not following the rMSSD, which is what saturation is.
      const recs: DailyRecord[] = g.map((p, i) => ({
        d: p.d,
        hrv: Math.round(Math.exp(Math.log(70 + 0.35 * i) + 0.1 * p.v) * 10) / 10,
        rhr: Math.round(46 + 0.03 * i + 0.36 * p.v),
      }));
      for (let k = 60; k < 120; k++) {
        const s = hrvStatus(recs, dayOf(k, 120), { age: 30 });
        n++;
        if (s.saturated) saturated++;
        if (s.lowWarning) warnings++;
        if (s.saturated) {
          expect(s.forcing).toBe(false);
          expect(s.greatRecovery).toBe(false);
          expect(s.saturationReason).not.toBeNull();
        }
      }
    });
    expect(pct(saturated, n)).toBeGreaterThan(90);
    expect(warnings).toBe(0);
  });
});

describe('H5 — the validity gate', () => {
  it('suppresses the band rather than guessing it for a 2-nights-a-week logger', () => {
    let shown = 0;
    let suppressed = 0;
    runSeeds(8, (seed) => {
      // Dense history, then five weeks of logging on two nights out of seven.
      const dense = hrvOnly(seed, 200);
      const recs = dense.map((r, i) =>
        i >= 165 && i % 7 > 1 ? { d: r.d } : r,
      );
      for (let k = 170; k < 200; k++) {
        const s = hrvStatus(recs, dayOf(k, 200), { age: 30 });
        if (s.bandAvailable) shown++;
        else {
          suppressed++;
          expect(s.suppressedReason).toMatch(/needs 4\+|last 7 days/);
        }
      }
    });
    expect(suppressed).toBeGreaterThan(shown);
  });
});
