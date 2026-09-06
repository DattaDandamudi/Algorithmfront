/**
 * §1a simulation gates for the Kalman weight trend.
 *
 * These are **gates, not documentation**: every bound below is the plan's, and
 * a failure means the filter is wrong, not that the bound is too tight. Truth
 * is known by construction (`simFixtures.weightTrajectory` builds a linear
 * trajectory plus scale noise, missed weigh-ins and water bumps), so every
 * assertion compares the filter against the trajectory it was generated from.
 *
 *   K1  20 seeds × 120 d, −1 lb/wk, noise 0.9, 1–2 skips/wk, weekly water:
 *       level RMSE < 0.6 lb after day 21; slope within ±0.3 lb/wk at day 60 in
 *       ≥ 90% of seeds; 90% band coverage between 80% and 97%.
 *   K2  a single 20-lb typo moves the level < 0.2 lb.
 *   K5  a real 6-lb step is re-anchored within days (the reset rule).
 *   K6  smoothed RMSE ≤ filtered RMSE on every seed.
 *
 * Budget: 20 seeds × 120 days, well under the 5 s per-sim cap.
 */
import { describe, expect, it } from 'vitest';
import type { DailyRecord } from '../data/types';
import { createRng } from '../data/prng';
import { addDays } from '../lib/dates';
import { computeKalmanTrend, kalmanAt, smoothKalman } from './kalman';
import { runSeeds, weightTrajectory } from './simFixtures';

const END = '2026-09-06';
const DAYS = 120;
const SEEDS = 20;
const START_LB = 180;
const LB_PER_WEEK = -1;
/** 0-based index → its date in the window. */
const at = (i: number) => addDays(END, -(DAYS - 1) + i);
/** The trajectory's *pure* trend on day `i` — water and noise are not truth. */
const truthAt = (i: number, startLb = START_LB, lbPerWeek = LB_PER_WEEK) =>
  startLb + (lbPerWeek / 7) * i;

const K1_OPTS = {
  days: DAYS,
  end: END,
  startLb: START_LB,
  lbPerWeek: LB_PER_WEEK,
  noiseSd: 0.9,
  /** 1–2 missed weigh-ins a week. */
  skipProb: 1.5 / 7,
  /** A 1 lb, two-day water bump every week. */
  waterBumps: { every: 7, days: 2, lb: 1 },
};

const rmse = (errs: number[]): number =>
  Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / Math.max(1, errs.length));
const pct = (xs: boolean[]): number => xs.filter(Boolean).length / Math.max(1, xs.length);

// ---------------------------------------------------------------------------
// K1 — level accuracy, slope accuracy, band calibration
// ---------------------------------------------------------------------------

describe('K1 — a dieter losing 1 lb/wk with a noisy scale and missed weigh-ins', () => {
  const runs = runSeeds(SEEDS, (seed) => {
    const recs = weightTrajectory({ seed, ...K1_OPTS });
    const res = computeKalmanTrend(recs, END);
    const errs: number[] = [];
    const covered: boolean[] = [];
    for (let i = 21; i < DAYS; i++) {
      const p = res.byDate.get(at(i));
      if (!p) continue;
      const err = p.level - truthAt(i);
      errs.push(err);
      covered.push(Math.abs(err) <= 1.6449 * p.levelSd);
    }
    const day60 = res.byDate.get(at(59));
    return {
      seed,
      rmse: rmse(errs),
      slope60: (day60?.slope ?? 0) * 7,
      coverage: pct(covered),
      measurementSd: res.measurementSd,
      rejected: res.nRejected,
    };
  });

  const worstRmse = Math.max(...runs.map((r) => r.rmse));
  const slopeHits = pct(runs.map((r) => Math.abs(r.slope60 - LB_PER_WEEK) <= 0.3));
  const coverage = runs.reduce((s, r) => s + r.coverage, 0) / runs.length;

  it('keeps the level RMSE under 0.6 lb from day 22 on, on every seed', () => {
    for (const r of runs) expect(r.rmse, `seed ${r.seed}`).toBeLessThan(0.6);
    expect(worstRmse).toBeLessThan(0.6);
  });

  it('has the weekly rate within ±0.3 lb/wk at day 60 in at least 90% of seeds', () => {
    expect(slopeHits).toBeGreaterThanOrEqual(0.9);
  });

  it('publishes a 90% band that actually covers 80–97% of the truth', () => {
    expect(coverage).toBeGreaterThanOrEqual(0.8);
    expect(coverage).toBeLessThanOrEqual(0.97);
  });

  it('reports the measured numbers so a regression is legible', () => {
    const mean = (f: (r: (typeof runs)[number]) => number) =>
      runs.reduce((s, r) => s + f(r), 0) / runs.length;
    console.log(
      `K1: worst level RMSE ${worstRmse.toFixed(3)} lb (mean ${mean((r) => r.rmse).toFixed(3)}), ` +
        `slope hit rate ${(slopeHits * 100).toFixed(0)}% ` +
        `(mean slope ${mean((r) => r.slope60).toFixed(3)} lb/wk), ` +
        `90% band coverage ${(coverage * 100).toFixed(1)}%, ` +
        `adapted scale sd ${mean((r) => r.measurementSd).toFixed(2)} lb, ` +
        `rejections ${mean((r) => r.rejected).toFixed(2)}/seed`,
    );
    expect(runs).toHaveLength(SEEDS);
  });
});

// ---------------------------------------------------------------------------
// K2 — one fat-fingered entry
// ---------------------------------------------------------------------------

describe('K2 — a single 20 lb typo', () => {
  const TYPO_AT = 60;
  const runs = runSeeds(SEEDS, (seed) => {
    const typoRecs = weightTrajectory({ seed, ...K1_OPTS, typoDay: TYPO_AT, typoLb: 20 });
    // The same user who simply did not weigh in that day: the typo must leave
    // the filter in *exactly* this state, contributing nothing at all.
    const blanked = typoRecs.map((r) => (r.d === at(TYPO_AT) ? { d: r.d } : r));
    const typo = computeKalmanTrend(typoRecs, END);
    const blank = computeKalmanTrend(blanked, END);
    // …and the same user whose reading that day was real: the only cost of the
    // gate is one discarded weigh-in, and it must wash out.
    const clean = computeKalmanTrend(weightTrajectory({ seed, ...K1_OPTS }), END);
    let vsBlank = 0;
    for (let i = TYPO_AT; i < DAYS; i++) {
      const t = typo.byDate.get(at(i));
      const b = blank.byDate.get(at(i));
      if (t && b) vsBlank = Math.max(vsBlank, Math.abs(t.level - b.level));
    }
    return {
      seed,
      vsBlank,
      shiftEnd: Math.abs(
        (typo.byDate.get(at(DAYS - 1))?.level ?? 0) - (clean.byDate.get(at(DAYS - 1))?.level ?? 0),
      ),
      flagged: typo.byDate.get(at(TYPO_AT))?.suspect === true,
    };
  });

  it('flags the typo on every seed', () => {
    for (const r of runs) expect(r.flagged, `seed ${r.seed}`).toBe(true);
  });

  it('moves the level by nothing at all: a rejected reading is a reading that never happened', () => {
    for (const r of runs) expect(r.vsBlank, `seed ${r.seed}`).toBeLessThan(1e-9);
  });

  it('costs less than 0.2 lb by the end of the series even against the untyped truth', () => {
    for (const r of runs) expect(r.shiftEnd, `seed ${r.seed}`).toBeLessThan(0.2);
    console.log(
      `K2: level shift vs the same series with that day blank ` +
        `${Math.max(...runs.map((r) => r.vsBlank)).toExponential(1)} lb; ` +
        `vs the untyped series at day 120 ` +
        `${Math.max(...runs.map((r) => r.shiftEnd)).toFixed(4)} lb (worst of ${SEEDS} seeds)`,
    );
  });
});

// ---------------------------------------------------------------------------
// K5 — a real step must not lock the filter out
// ---------------------------------------------------------------------------

describe('K5 — a genuine 6 lb step (a move, a new scale, a real jump)', () => {
  const STEP_AT = 40;
  const STEP_LB = 6;
  const TOTAL = 70;
  const stepAt = (i: number) => addDays(END, -(TOTAL - 1) + i);

  /** Flat truth, sd 0.9 scale noise, a hard +6 lb step at day 40. */
  const stepped = (seed: number): DailyRecord[] => {
    const rng = createRng(seed);
    return Array.from({ length: TOTAL }, (_, i) => ({
      d: stepAt(i),
      w: Math.round(rng.normal(172 + (i >= STEP_AT ? STEP_LB : 0), 0.9) * 10) / 10,
    }));
  };

  /** Days from the step until the level is within 1 lb of the new truth. */
  const measure = (seed: number, opts?: { resetAfter: number }) => {
    const res = computeKalmanTrend(stepped(seed), END, opts);
    let recoveredIn: number | null = null;
    for (let i = STEP_AT; i < TOTAL; i++) {
      const p = res.byDate.get(stepAt(i));
      if (p && Math.abs(p.level - 178) <= 1) {
        recoveredIn = i - STEP_AT + 1;
        break;
      }
    }
    const err = (from: number, to: number, truth: number): number => {
      let ss = 0;
      let n = 0;
      for (let i = from; i < to; i++) {
        const p = res.byDate.get(stepAt(i));
        if (!p) continue;
        ss += (p.level - truth) ** 2;
        n++;
      }
      return Math.sqrt(ss / Math.max(1, n));
    };
    return {
      seed,
      recoveredIn,
      // A week after the step, the filter should be on the new level…
      postRmse: err(STEP_AT + 7, TOTAL, 178),
      // …and the settled half before it should never have been disturbed.
      preRmse: err(14, STEP_AT, 172),
    };
  };

  const runs = runSeeds(SEEDS, (seed) => measure(seed));

  it('re-anchors within a week on every seed instead of locking the step out', () => {
    for (const r of runs) {
      expect(r.recoveredIn, `seed ${r.seed}`).not.toBeNull();
      expect(r.recoveredIn as number, `seed ${r.seed}`).toBeLessThanOrEqual(7);
    }
    const days = runs.map((r) => r.recoveredIn as number);
    console.log(
      `K5: recovery to within 1 lb of the new level took ` +
        `${Math.min(...days)}–${Math.max(...days)} days ` +
        `(mean ${(days.reduce((s, d) => s + d, 0) / days.length).toFixed(1)})`,
    );
  });

  it('settles on the new level and leaves the pre-step history intact', () => {
    for (const r of runs) {
      expect(r.postRmse, `seed ${r.seed}`).toBeLessThan(0.6);
      expect(r.preRmse, `seed ${r.seed}`).toBeLessThan(0.6);
    }
    console.log(
      `K5: post-step level RMSE ≤ ${Math.max(...runs.map((r) => r.postRmse)).toFixed(3)} lb, ` +
        `pre-step ≤ ${Math.max(...runs.map((r) => r.preRmse)).toFixed(3)} lb`,
    );
  });

  it('takes far longer without the reset rule — the rule is what earns the recovery', () => {
    // `resetAfter` beyond the series length disables the re-anchor entirely.
    // The gate does eventually relent (P grows every day it refuses a reading),
    // but only after a fortnight of published levels that are 6 lb wrong.
    const off = runSeeds(SEEDS, (seed) => measure(seed, { resetAfter: 999 }));
    for (const r of off) expect(r.recoveredIn as number, `seed ${r.seed}`).toBeGreaterThan(7);
    const days = off.map((r) => r.recoveredIn as number);
    console.log(
      `K5: without the reset rule the same step takes ` +
        `${Math.min(...days)}–${Math.max(...days)} days ` +
        `(post-step RMSE up to ${Math.max(...off.map((r) => r.postRmse)).toFixed(2)} lb)`,
    );
  });
});

// ---------------------------------------------------------------------------
// K6 — hindsight never hurts
// ---------------------------------------------------------------------------

describe('K6 — the RTS smoother beats the causal filter on every seed', () => {
  const runs = runSeeds(SEEDS, (seed) => {
    const recs = weightTrajectory({ seed, ...K1_OPTS });
    const filtered = computeKalmanTrend(recs, END);
    const smoothed = smoothKalman(filtered);
    const fErr: number[] = [];
    const sErr: number[] = [];
    let worstGap = 0;
    let worstGapSettled = 0;
    for (let i = 0; i < DAYS; i++) {
      const f = filtered.byDate.get(at(i));
      const s = smoothed.byDate.get(at(i));
      if (!f || !s) continue;
      fErr.push(f.level - truthAt(i));
      sErr.push(s.level - truthAt(i));
      const gap = Math.abs(s.level - f.level);
      worstGap = Math.max(worstGap, gap);
      if (i >= 21) worstGapSettled = Math.max(worstGapSettled, gap);
    }
    return { seed, filtered: rmse(fErr), smoothed: rmse(sErr), worstGap, worstGapSettled };
  });

  it('has smoothed RMSE ≤ filtered RMSE on every seed', () => {
    for (const r of runs) {
      expect(r.smoothed, `seed ${r.seed}`).toBeLessThanOrEqual(r.filtered + 1e-9);
    }
    const f = runs.reduce((s, r) => s + r.filtered, 0) / runs.length;
    const s = runs.reduce((s2, r) => s2 + r.smoothed, 0) / runs.length;
    console.log(
      `K6: mean RMSE filtered ${f.toFixed(3)} lb → smoothed ${s.toFixed(3)} lb ` +
        `(${(((f - s) / f) * 100).toFixed(1)}% better), ` +
        `worst filtered/smoothed disagreement ${Math.max(...runs.map((r) => r.worstGap)).toFixed(2)} lb`,
    );
  });

  it('keeps the drawn (smoothed) and decision (filtered) series close once settled', () => {
    // The plan's "never more than 1 lb apart" is asserted where the plan states
    // it — on the demo dataset, in kalman.test.ts. Here the gap is allowed
    // 1.5 lb, because the fixture injects weekly water bumps that the causal
    // filter must follow and the smoother can see straight through: seed 13's
    // worst day is the second day of a bump, where the filter reads 175.4 and
    // the smoother — knowing the next two readings drop back — reads 174.2.
    // That difference is the smoother doing its job, not the two disagreeing.
    for (const r of runs) expect(r.worstGapSettled, `seed ${r.seed}`).toBeLessThan(1.5);
    console.log(
      `K6: filtered vs smoothed disagreement — ` +
        `${Math.max(...runs.map((r) => r.worstGapSettled)).toFixed(2)} lb after day 21, ` +
        `${Math.max(...runs.map((r) => r.worstGap)).toFixed(2)} lb including the first weeks`,
    );
  });

  it('does not shift the decision series: kalmanAt still reads the filtered result', () => {
    const recs = weightTrajectory({ seed: 1, ...K1_OPTS });
    const filtered = computeKalmanTrend(recs, END);
    const before = kalmanAt(filtered, END)?.level;
    smoothKalman(filtered);
    expect(kalmanAt(filtered, END)?.level).toBe(before);
  });
});
