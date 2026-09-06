/**
 * Simulation gates for `engine/readiness.ts`.
 *
 * The fixture is a *coupled* user: resting HR is generated from the same night
 * as the HRV reading (r ≈ −0.65), which is what real overnight physiology does
 * and what the vagal-saturation guard is calibrated against. `simFixtures`
 * draws the two independently, so the coupling is added here rather than in a
 * bespoke fixture.
 *
 * Measured on the seeds fixed here:
 *   composite red 6.8 % · green 19.6 % · yellow 73.6 % of stationary days
 *   a 3-day WHOOP gap moves the hero number by 6.3 points on average, against
 *   11.8 for the v2 switch it replaces
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../data/defaults';
import type { DailyRecord } from '../data/types';
import { addDays } from '../lib/dates';
import {
  checkInSeries,
  gaussianSeries,
  hrvSeries,
  loadDays,
  mergeRecords,
  runSeeds,
  sleepNights,
} from './simFixtures';
import { hrvStatus } from './hrv';
import { readiness } from './readiness';

const END = '2026-09-06';
const DAYS = 340;
const WARMUP = 110;
const SEEDS = 8;
const P = DEFAULT_PROFILE;

const dayOf = (index: number, days = DAYS): string => addDays(END, -(days - 1 - index));
const pct = (hits: number, n: number): number => (hits / n) * 100;

/** HRV plus a resting HR genuinely coupled to it (r ≈ −0.65). */
function coupledHrv(seed: number, days: number, meanMs = 60, cvPct = 10, rhrMean = 52): DailyRecord[] {
  const hrv = hrvSeries({ seed, days, end: END, meanMs, cvPct });
  const noise = new Map(
    gaussianSeries({ seed: seed + 5000, days, end: END, mean: 0, sd: 1, dp: 4 }).map((p) => [p.d, p.v]),
  );
  const sdLn = Math.log(1 + cvPct / 100);
  const rho = -0.65;
  return hrv.map((r) => {
    if (r.hrv === undefined) return { d: r.d };
    const z = (Math.log(r.hrv) - Math.log(meanMs)) / sdLn;
    const g = noise.get(r.d) ?? 0;
    return {
      d: r.d,
      hrv: r.hrv,
      rhr: Math.round(rhrMean + 2.5 * (rho * z + Math.sqrt(1 - rho * rho) * g)),
    };
  });
}

/** The whole stationary user: HRV, RHR, sleep at need, training load and check-ins. */
function stationaryUser(seed: number, days = DAYS): DailyRecord[] {
  return mergeRecords(
    coupledHrv(seed, days),
    sleepNights({ seed: seed + 100, days, end: END, meanHrs: P.sleepBaselineHrs, sdHrs: 0.7 }),
    loadDays({ seed: seed + 200, days, end: END, meanLoad: 300 }),
    checkInSeries({ seed: seed + 300, days, end: END, mean: 3, sd: 0.7 }),
  );
}

describe('R1 — the composite verdict on a stationary user', () => {
  it('calls ≤ 8 % of days red and 8–30 % of them green', () => {
    const counts: Record<string, number> = { red: 0, yellow: 0, green: 0, neutral: 0 };
    let n = 0;
    let scoreSum = 0;
    runSeeds(SEEDS, (seed) => {
      const recs = stationaryUser(seed);
      for (let k = WARMUP; k < DAYS; k++) {
        const asOf = dayOf(k);
        const hrv = hrvStatus(recs, asOf, { age: P.age });
        const r = readiness(recs, asOf, P, { hrv });
        n++;
        counts[r.band]++;
        scoreSum += r.score as number;
        expect(r.score).not.toBeNull();
        expect(Number.isFinite(r.score as number)).toBe(true);
        expect(r.confidence?.nInputs).toBe(5);
      }
    });
    // Measured: red 6.79 %, green 19.57 %, yellow 73.64 %, mean score 56.4.
    expect(n).toBe(SEEDS * (DAYS - WARMUP));
    expect(pct(counts.red, n)).toBeLessThanOrEqual(8);
    expect(pct(counts.green, n)).toBeGreaterThanOrEqual(8);
    expect(pct(counts.green, n)).toBeLessThanOrEqual(30);
    expect(counts.neutral).toBe(0);
    expect(scoreSum / n).toBeGreaterThan(50);
    expect(scoreSum / n).toBeLessThan(65);
  });
});

describe('R2 — an import gap does not step the hero number', () => {
  it('moves the score by less than 8 points across a 3-day WHOOP gap', () => {
    const D = 150;
    const blendDelta: number[] = [];
    const switchDelta: number[] = [];
    runSeeds(10, (seed) => {
      const base = stationaryUser(seed, D);
      // WHOOP measures the same thing our model does but on its own calibration:
      // for this user it reads ~12 points higher, with ±5 points of its own noise.
      // That systematic offset is the whole reason a switch steps and a blend does not.
      const noise = new Map(
        gaussianSeries({ seed: seed + 900, days: D, end: END, mean: 12, sd: 5, dp: 3 }).map((p) => [
          p.d,
          p.v,
        ]),
      );
      const ownBy = new Map<string, number>();
      const full = base.map((r) => {
        const own = readiness(base, r.d, P).score;
        if (own === null) return r;
        ownBy.set(r.d, own);
        return { ...r, rec: Math.round(Math.max(5, Math.min(99, own + (noise.get(r.d) ?? 0)))) };
      });
      const gapDays = [addDays(END, -2), addDays(END, -1), END];
      const gapSet = new Set(gapDays);
      const gapped = full.map((r) => (gapSet.has(r.d) ? { ...r, rec: undefined } : r));
      for (const d of gapDays) {
        const a = readiness(full, d, P).score as number;
        const b = readiness(gapped, d, P).score as number;
        blendDelta.push(Math.abs(a - b));
        // What v2 did: drop WHOOP entirely the moment the import stops.
        switchDelta.push(Math.abs(a - (ownBy.get(d) as number)));
      }
      expect(readiness(gapped, END, P).blendWeight).toBeCloseTo(4 / 7, 3);
      expect(readiness(gapped, gapDays[0], P).blendWeight).toBeCloseTo(6 / 7, 3);
    });
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    // Measured: mean 6.30 points across the gap, against 11.83 for v2's hard
    // switch. The worst single day is larger (18) and always will be: on a day
    // with no import there is no way to know what WHOOP would have said, and
    // that residual is WHOOP's own idiosyncratic noise, not a step in our number.
    expect(mean(blendDelta)).toBeLessThan(8);
    expect(mean(blendDelta)).toBeLessThan(mean(switchDelta) * 0.75);
  });
});

describe('R3 — uncertainty tracks coverage', () => {
  it('widens the confidence band monotonically as inputs are removed', () => {
    const recs = stationaryUser(1, 200);
    const asOf = END;
    const width = (rs: DailyRecord[]): number => {
      const c = readiness(rs, asOf, P).confidence;
      return c ? c.hi - c.lo : Infinity;
    };
    const drop = (key: 'hrv' | 'rhr' | 'slh' | 'ld' | 'qs') =>
      recs.map((r) => ({ ...r, [key]: undefined }));
    const all = width(recs);
    expect(all).toBeGreaterThan(0);
    for (const key of ['hrv', 'rhr', 'slh', 'ld'] as const) {
      expect(width(drop(key))).toBeGreaterThan(all);
    }
    // Losing the heaviest input costs the most certainty.
    expect(width(drop('hrv'))).toBeGreaterThan(width(drop('ld')));
    const nothing = readiness(
      recs.map((r) => ({ d: r.d })),
      asOf,
      P,
    );
    expect(nothing.score).toBeNull();
    expect(nothing.confidence).toBeUndefined();
  });
});

describe('R4 — a real drop still reaches the verdict', () => {
  it('turns a −15 % HRV episode red even while WHOOP reports a green recovery', () => {
    let redDays = 0;
    let seeds = 0;
    runSeeds(12, (seed) => {
      const D = 200;
      const START = 150;
      const base = mergeRecords(
        hrvSeries({
          seed,
          days: D,
          end: END,
          meanMs: 60,
          cvPct: 10,
          rhrMean: 52,
          episode: { startDay: START, days: 20, hrvPct: -15, rhrDelta: 3 },
        }),
        sleepNights({ seed: seed + 100, days: D, end: END, meanHrs: P.sleepBaselineHrs, sdHrs: 0.7 }),
      ).map((r) => ({ ...r, rec: 80 }));
      seeds++;
      let red = false;
      for (let k = START; k < START + 8; k++) {
        const r = readiness(base, dayOf(k, D), P);
        if (r.band === 'red') {
          red = true;
          expect(r.forced).toBe(true);
          expect(r.score as number).toBeGreaterThan(50); // WHOOP still says 80-ish
          break;
        }
      }
      if (red) redDays++;
    });
    expect(redDays / seeds).toBeGreaterThanOrEqual(0.9);
  });
});
