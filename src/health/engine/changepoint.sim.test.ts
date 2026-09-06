/**
 * §1i simulations — BOCPD against the plan's two bounds:
 *
 *   C1  a 40-day-then-shift series is detected within 5 days in ≥ 90% of seeds
 *   C2  a stationary series raises < 1 false shift per 200 days
 *
 * The plan fixes the bounds but not the step size, so C1 uses **+6 bpm on a
 * 2 bpm SD** (a 3σ step — the same RHR delta `stressEpisode` uses for an
 * infection, and the "resting HR settles higher for good" case the module was
 * written for). Measured here: 38/40 seeds within 5 days (latency min 2,
 * median 3, worst 6), reported start date exact or ±1 day on 37/39 (worst 3),
 * one extra shift across all 40 runs, and 3 false shifts across 8,000
 * stationary days = 0.075 per 200 days. Smaller steps degrade gracefully
 * rather than off a cliff: 2.5σ lands 37/40 within five days, 2σ 30/40, 1.5σ
 * 10/40. That last one is the honest statistical limit of a rule that needs
 * three consecutive days of posterior mass, not a tuning failure — and a 1.5σ
 * wobble is a dip, which is exactly what this module exists not to report.
 */
import { describe, expect, it } from 'vitest';
import { gaussianSeries, hrvSeries, runSeeds, simDay } from './simFixtures';
import { detectChangepoints, detectRegimeShifts } from './changepoint';
import { diffDays } from '../lib/dates';

const END = '2026-09-06';
const SEEDS = 40;

/** `days` of N(55, sd) bpm with a step of `delta` from `shiftAt` on. */
function stepSeries(seed: number, days: number, shiftAt: number, delta: number, sd = 2) {
  return gaussianSeries({ seed, days, end: END, mean: 55, sd, dp: 2 }).map((p, i) => ({
    d: p.d,
    v: i >= shiftAt ? p.v + delta : p.v,
  }));
}

describe('C1 — detection latency on a 40-day-then-shift series', () => {
  const DAYS = 60;
  const SHIFT = 40;
  const shiftDate = simDay(END, DAYS, SHIFT);

  function measure(delta: number) {
    return runSeeds(SEEDS, (seed) => {
      const cps = detectChangepoints(stepSeries(seed, DAYS, SHIFT, delta), {
        metric: 'rhr',
        label: 'resting heart rate',
      });
      const hit = cps.find((c) => Math.abs(diffDays(shiftDate, c.d)) <= 5);
      return {
        found: !!hit,
        latency: hit ? diffDays(shiftDate, hit.confirmedOn) : Infinity,
        dateError: hit ? Math.abs(diffDays(shiftDate, hit.d)) : Infinity,
        extra: Math.max(0, cps.length - 1),
      };
    });
  }

  it('flags a 3σ step within 5 days in ≥ 90% of seeds', () => {
    const res = measure(6);
    const within5 = res.filter((r) => r.latency <= 5).length;
    const lat = res.filter((r) => r.found).map((r) => r.latency).sort((a, b) => a - b);
    expect(within5 / SEEDS).toBeGreaterThanOrEqual(0.9);
    // Never instant: the observation that starts a regime is still scored by
    // the old run, and confirmation needs three consecutive days.
    expect(lat[0]).toBeGreaterThanOrEqual(2);
    expect(lat[Math.floor(lat.length / 2)]).toBeLessThanOrEqual(4);
  });

  it('puts the reported start date on the true step, not on the day it noticed', () => {
    const res = measure(6).filter((r) => r.found);
    const exact = res.filter((r) => r.dateError <= 1).length;
    expect(exact / res.length).toBeGreaterThanOrEqual(0.8);
    expect(Math.max(...res.map((r) => r.dateError))).toBeLessThanOrEqual(4);
  });

  it('reports one shift, not a cluster, for one step', () => {
    const extra = measure(6).reduce((s, r) => s + r.extra, 0);
    expect(extra / SEEDS).toBeLessThan(0.15);
  });

  it('degrades gracefully rather than inventing shifts as the step shrinks', () => {
    // 2.5σ still clears the plan's bar with room to spare…
    const mid = measure(5);
    expect(mid.filter((r) => r.latency <= 5).length / SEEDS).toBeGreaterThanOrEqual(0.85);
    // …and a 1.5σ step mostly goes unreported, which is the point: it is a
    // dip, not a new baseline. What must not happen is a burst of extra
    // shifts as the evidence thins.
    const small = measure(3);
    expect(small.filter((r) => r.found).length / SEEDS).toBeLessThan(0.6);
    expect(small.reduce((s, r) => s + r.extra, 0)).toBeLessThanOrEqual(3);
  });
});

describe('C2 — false shifts on a stationary series', () => {
  const DAYS = 200;

  it('raises fewer than 1 false shift per 200 stationary days', () => {
    const counts = runSeeds(SEEDS, (seed) =>
      detectChangepoints(
        gaussianSeries({ seed: seed + 500, days: DAYS, end: END, mean: 55, sd: 2, dp: 2 }),
        { metric: 'rhr' },
      ).length,
    );
    const total = counts.reduce((a, b) => a + b, 0);
    const per200 = total / SEEDS;
    expect(per200).toBeLessThan(1);
    // The measured rate is 0.075 (3 shifts in 8,000 days); anything above
    // 0.25 is a regression, not a bad seed.
    expect(per200).toBeLessThanOrEqual(0.25);
  });

  it('stays quiet when a fifth of the days are missing', () => {
    const counts = runSeeds(20, (seed) =>
      detectChangepoints(
        gaussianSeries({
          seed: seed + 900,
          days: DAYS,
          end: END,
          mean: 55,
          sd: 2,
          skipProb: 0.2,
          dp: 2,
        }),
        { metric: 'rhr' },
      ).length,
    );
    expect(counts.reduce((a, b) => a + b, 0) / 20).toBeLessThan(1);
  });
});

describe('C3 — ln rMSSD through detectRegimeShifts', () => {
  const DAYS = 70;
  const SHIFT = 40;

  it('finds a −20% HRV level shift and reports both means in ms', () => {
    const shiftDate = simDay(END, DAYS, SHIFT);
    const res = runSeeds(SEEDS, (seed) => {
      const recs = hrvSeries({ seed, days: DAYS, end: END, meanMs: 60, cvPct: 10 }).map((r, i) =>
        i >= SHIFT && r.hrv !== undefined ? { ...r, hrv: Math.round(r.hrv * 0.8 * 10) / 10 } : r,
      );
      const cps = detectRegimeShifts(recs, END).filter((c) => c.metric === 'hrv');
      const hit = cps.find((c) => Math.abs(diffDays(shiftDate, c.d)) <= 5);
      return { hit, n: cps.length };
    });
    const hits = res.filter((r) => r.hit).map((r) => r.hit!);
    expect(hits.length / SEEDS).toBeGreaterThanOrEqual(0.8);
    for (const h of hits) {
      // Geometric means, back-transformed: ~60 ms before, ~48 ms after.
      expect(h.meanBefore).toBeGreaterThan(h.meanAfter);
      expect(h.meanAfter / h.meanBefore).toBeGreaterThan(0.7);
      expect(h.meanAfter / h.meanBefore).toBeLessThan(0.92);
      expect(h.label).toBe('HRV');
    }
  });
});
