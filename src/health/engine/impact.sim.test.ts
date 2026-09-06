/**
 * §1i simulations — the N-of-1 engine against the plan's two bounds:
 *
 *   I1  (headline) a **null** behaviour is "confirmed" after BH correction in
 *       < 5% of 200 runs. A coach that invents effects is worse than one that
 *       says nothing, so this test is a build gate: if it regresses, the
 *       Welch df, the shrinkage or the BH wiring has broken.
 *   I2  a true −10-point alcohol effect with 12 yes-days is recovered within
 *       ±4 points in ≥ 85% of seeds.
 *
 * ## Two things about I1 worth knowing before changing it
 *
 * **Every field needs its own PRNG stream.** Drawing a behaviour and an
 * outcome from one interleaved `createRng` makes the "null" user not null: the
 * shared stream carries enough lag structure to lift the whole-grid false rate
 * to 9.5%, and the engine is then being blamed for the generator. On
 * `strictNullUser`, where all 35 cells are provably null, the measured
 * whole-grid rate is **5/200 = 2.5%** against a nominal 5% — Benjamini–Hochberg
 * is Simes under the global null, so 5% is the level, not the ceiling, and a
 * bound *below* it would be one no correct implementation could meet. Hence
 * ≤ 8%.
 *
 * The plan's headline bound is asserted the way the plan words it — on **a**
 * null behaviour, not on the whole grid at once: alcohol (five of the 30 cells
 * a realistic logging user produces) is confirmed in **2/200 = 1.0%** of runs.
 *
 * The plan fixes I2's effect size and day count but not the day-to-day spread
 * of readiness, and ±4 is only meetable for some spreads: at sd 7 the Welch se
 * with 12 yes / 78 no days is ≈ 2.2 points, so ±4 is ±1.8 se ≈ 93% coverage.
 * That number is stated here rather than tuned until the test went green.
 * Measured: 38/40 seeds within ±4 points, 38/40 intervals covering the truth,
 * 34/40 confirmed after BH.
 */
import { describe, expect, it } from 'vitest';
import type { DailyRecord, ISODate } from '../data/types';
import { createRng } from '../data/prng';
import { hrvSeries, loadDays, mergeRecords, runSeeds, sleepNights } from './simFixtures';
import { lastNDates } from '../lib/dates';
import { behaviourImpact, isConfirmedEffect } from './impact';

const END = '2026-09-06';
const DAYS = 90;

interface SynthUser {
  records: DailyRecord[];
  readiness: Array<{ d: ISODate; score: number | null }>;
}

/**
 * A logging user whose behaviours are pure coin flips: alcohol, tobacco and a
 * late coffee happen on random days and change nothing. Readiness, HRV, RHR,
 * sleep, load and OSI are independent noise, so every behaviour × metric cell
 * is a true null.
 *
 * `alcoholEffect` moves **next-day** readiness only — the I2 user.
 */
function synthUser(seed: number, alcoholEffect = 0, alcoholDays = 0, readinessSd = 7): SynthUser {
  const base = mergeRecords(
    hrvSeries({ seed, days: DAYS, end: END, meanMs: 60, cvPct: 10, rhrMean: 55, rhrSd: 2 }),
    sleepNights({
      seed: seed + 100003,
      days: DAYS,
      end: END,
      meanHrs: 7.5,
      sdHrs: 0.8,
      bedTarget: '23:00',
      jitterMin: 50,
    }),
    loadDays({ seed: seed + 200003, days: DAYS, end: END, meanLoad: 300, restProb: 3 / 7 }),
  );
  // One stream per field: see the header — sharing a stream between a
  // behaviour and an outcome is what makes a "null" user non-null.
  const rngAlc = createRng(seed + 300007);
  const rngTob = createRng(seed + 400009);
  const rngCaf = createRng(seed + 500011);
  const rngOsi = createRng(seed + 600017);
  const rngRdy = createRng(seed + 700019);

  const drinkIdx = new Set<number>();
  if (alcoholDays > 0) while (drinkIdx.size < alcoholDays) drinkIdx.add(rngAlc.int(0, DAYS - 2));
  const drank = base.map((_, i) => (alcoholDays > 0 ? drinkIdx.has(i) : rngAlc.chance(0.15)));

  const records: DailyRecord[] = base.map((r, i) => ({
    ...r,
    alc: drank[i] ? 2 : 0,
    tob: rngTob.chance(0.1) ? 1 : 0,
    caf: rngCaf.chance(0.3) ? ['08:00', '16:30'] : ['08:00'],
    osi: Math.round(rngOsi.normal(30, 8) * 10) / 10,
  }));
  const readiness = records.map((r, i) => ({
    d: r.d,
    // The behaviour is yesterday's: day i's readiness answers day i−1's drink.
    score: Math.round(rngRdy.normal(65, readinessSd) + (i > 0 && drank[i - 1] ? alcoholEffect : 0)),
  }));
  return { records, readiness };
}

function nullRun(seed: number) {
  const u = synthUser(seed);
  return behaviourImpact(u.records, [], END, { readinessScores: u.readiness });
}

/**
 * The same idea with **no shared streams at all** — every field, including the
 * ones `simFixtures` bundles together (`hrvSeries` draws HRV and RHR from one
 * stream, `sleepNights` draws bedtime and hours from one), gets its own PRNG.
 * This is the user the family-wise rate is measured on, because it is the only
 * construction where all 35 cells are provably null. All seven behaviours are
 * present, including `lateEating` via meals.
 */
function strictNullUser(seed: number): SynthUser {
  const dates = lastNDates(END, DAYS);
  const s = (k: number) => createRng(seed * 31 + k * 104729 + 7);
  const [rAlc, rTob, rCaf, rMeal, rLoad, rSlh, rBt, rHrv, rRhr, rOsi, rRdy] = Array.from(
    { length: 11 },
    (_, i) => s(i),
  );
  const records: DailyRecord[] = dates.map((d) => ({
    d,
    alc: rAlc.chance(0.15) ? 2 : 0,
    tob: rTob.chance(0.12) ? 1 : 0,
    caf: rCaf.chance(0.3) ? ['08:00', '16:30'] : ['08:00'],
    meals: [
      {
        id: `${d}-1`,
        t: rMeal.chance(0.3) ? '21:30' : '18:30',
        n: 'dinner',
        g: 500,
        kc: 700,
        p: 40,
        f: 25,
        c: 70,
        fi: 8,
      },
    ],
    ld: Math.round(Math.max(0, rLoad.normal(300, 120))),
    slh: Math.round(rSlh.normal(7.5, 0.8) * 100) / 100,
    bt: rBt.chance(0.3) ? '00:20' : '22:50',
    hrv: Math.round(rHrv.normal(60, 6) * 10) / 10,
    rhr: Math.round(rRhr.normal(55, 2)),
    osi: Math.round(rOsi.normal(30, 8) * 10) / 10,
  }));
  return {
    records,
    readiness: records.map((r) => ({ d: r.d, score: Math.round(rRdy.normal(65, 7)) })),
  };
}

describe('I1 — a null behaviour is not confirmed', () => {
  const RUNS = 200;

  it('confirms a null behaviour in < 5% of 200 runs after BH correction', () => {
    const hits = runSeeds(RUNS, (seed) =>
      nullRun(seed).effects.some((e) => e.behaviour === 'alcohol' && isConfirmedEffect(e)) ? 1 : 0,
    ).reduce((a: number, b) => a + b, 0);
    expect(hits / RUNS).toBeLessThan(0.05);
  });

  it('keeps the whole-grid family rate at BH’s nominal level', () => {
    const hits = runSeeds(RUNS, (seed) => {
      const u = strictNullUser(seed);
      const ctx = behaviourImpact(u.records, [], END, { readinessScores: u.readiness });
      return ctx.effects.some(isConfirmedEffect) ? 1 : 0;
    }).reduce((a: number, b) => a + b, 0);
    // BH is Simes under the global null, so this rate *is* q = 5%. Above 8%
    // the p-values themselves are wrong — that is the regression this catches.
    expect(hits / RUNS).toBeLessThanOrEqual(0.08);
  });

  it('still produces a full grid of estimates — silence is q, not emptiness', () => {
    const ctx = nullRun(1);
    expect(ctx.effects.length).toBeGreaterThan(20);
    for (const e of ctx.effects) {
      expect(Number.isFinite(e.deltaMean)).toBe(true);
      expect(e.lo95).toBeLessThanOrEqual(e.deltaMean);
      expect(e.hi95).toBeGreaterThanOrEqual(e.deltaMean);
      expect(e.qValue).toBeGreaterThanOrEqual(0);
      expect(e.qValue).toBeLessThanOrEqual(1);
      expect(e.nYes).toBeGreaterThanOrEqual(5);
      expect(e.nNo).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('I2 — a real alcohol effect is recovered', () => {
  const alcoholReadiness = (seed: number) => {
    const u = synthUser(seed, -10, 12);
    const ctx = behaviourImpact(u.records, [], END, { readinessScores: u.readiness });
    return ctx.effects.find((x) => x.behaviour === 'alcohol' && x.metric === 'readiness') ?? null;
  };

  it('recovers a −10-point readiness effect within ±4 points in ≥ 85% of seeds', () => {
    const found = runSeeds(40, alcoholReadiness).filter((e) => e !== null);
    expect(found.length).toBe(40);
    const close = found.filter((e) => Math.abs(e!.deltaMean + 10) <= 4).length;
    expect(close / found.length).toBeGreaterThanOrEqual(0.85);
    // Twelve yes-days, and the sentence says so.
    expect(found[0]!.nYes).toBe(12);
    expect(found[0]!.label).toMatch(/^on the 12 days you drank, next-day readiness averaged /);
  });

  it('confirms it after BH correction in most seeds, and never with the wrong sign', () => {
    const found = runSeeds(40, alcoholReadiness).filter((e) => e !== null);
    const confirmed = found.filter((e) => isConfirmedEffect(e!)).length;
    expect(confirmed / found.length).toBeGreaterThanOrEqual(0.7);
    expect(found.every((e) => e!.deltaMean < 0)).toBe(true);
    // Readiness has no published prior, so nothing is shrunk and the 95%
    // interval is a plain Welch one: it covers the truth ~95% of the time.
    expect(found.every((e) => e!.shrunkToPrior === 0)).toBe(true);
    const covered = found.filter((e) => e!.lo95 <= -10 && e!.hi95 >= -10).length;
    expect(covered / found.length).toBeGreaterThanOrEqual(0.85);
  });
});
