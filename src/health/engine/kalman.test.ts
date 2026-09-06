import { describe, expect, it } from 'vitest';
import type { DailyRecord } from '../data/types';
import { DEFAULT_SETTINGS } from '../data/defaults';
import { createRng } from '../data/prng';
import { generateDemoData } from '../data/seed';
import { addDays } from '../lib/dates';
import {
  KALMAN_CYCLE_OFFSET_LB,
  KALMAN_P0_SLOPE,
  KALMAN_R_DEFAULT,
  KALMAN_R_FLOOR,
  computeKalmanTrend,
  kalmanAt,
  kalmanLevelMap,
  kalmanRate,
  pOutsideBand,
  smoothKalman,
  suspectWeighIns,
} from './kalman';

const D0 = '2026-08-01';
const day = (i: number) => addDays(D0, i);
const rec = (i: number, w?: number, extra: Partial<DailyRecord> = {}): DailyRecord => ({
  d: day(i),
  ...(w !== undefined ? { w } : {}),
  ...extra,
});
/** `n` days of the same weight, starting at day `from`. */
const flat = (n: number, w: number, from = 0): DailyRecord[] =>
  Array.from({ length: n }, (_, i) => rec(from + i, w));

const finite = (v: number | null | undefined): boolean =>
  typeof v === 'number' && Number.isFinite(v);
const round1 = (v: number): number => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------
// Degenerate input — every consumer renders these without a guard
// ---------------------------------------------------------------------------

describe('computeKalmanTrend — no-data shapes', () => {
  it('returns the empty result for no records at all', () => {
    const res = computeKalmanTrend([]);
    expect(res.points).toEqual([]);
    expect(res.first).toBeNull();
    expect(res.byDate.size).toBe(0);
    expect(res.moments).toEqual([]);
    expect(res.smoothed).toBe(false);
    expect(res.measurementSd).toBeCloseTo(Math.sqrt(KALMAN_R_DEFAULT), 10);
    expect(res.nAccepted).toBe(0);
    expect(res.nRejected).toBe(0);
  });

  it('returns the empty result when no record carries a usable weigh-in', () => {
    const res = computeKalmanTrend([
      rec(0, undefined, { kc: 1900 }),
      rec(1, 0),
      rec(2, -3),
      rec(3, Number.NaN),
      { d: day(4), w: undefined },
    ]);
    expect(res.first).toBeNull();
    expect(res.points).toEqual([]);
  });

  it('seeds on the first weigh-in and produces exactly one point for one weigh-in', () => {
    const res = computeKalmanTrend([rec(0, undefined, { kc: 1800 }), rec(1, 172)]);
    expect(res.first).toBe(day(1));
    expect(res.points).toHaveLength(1);
    const p = res.points[0];
    expect(p.d).toBe(day(1));
    expect(p.level).toBe(172);
    expect(p.slope).toBe(0);
    expect(p.levelSd).toBeCloseTo(Math.sqrt(KALMAN_R_DEFAULT), 10); // 0.9 lb
    expect(p.slopeSd).toBeCloseTo(Math.sqrt(KALMAN_P0_SLOPE), 10); // 0.3 lb/day
    expect(p.predicted).toBe(false);
    expect(p.z).toBeNull();
    expect(res.nAccepted).toBe(1);
  });

  it('never produces a NaN, on any field, for a hostile record set', () => {
    const res = computeKalmanTrend([
      rec(3, 172),
      rec(1, undefined, { note: 'x' }),
      rec(4, Number.POSITIVE_INFINITY),
      rec(5, 171.4),
      rec(2, 0),
      rec(6, undefined),
    ]);
    for (const p of res.points) {
      expect(finite(p.level)).toBe(true);
      expect(finite(p.levelSd)).toBe(true);
      expect(finite(p.slope)).toBe(true);
      expect(finite(p.slopeSd)).toBe(true);
      if (p.z !== null && p.z !== undefined) expect(Number.isFinite(p.z)).toBe(true);
    }
    expect(Number.isFinite(res.measurementSd)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The filter itself — pinned against the hand-worked recursion
// ---------------------------------------------------------------------------

describe('computeKalmanTrend — local linear trend recursion', () => {
  /**
   * Hand-worked, α-free (all values exact from the plan's constants):
   *   x₀ = [172, 0], P₀ = diag(0.81, 0.09)
   *   predict: P⁻ = F P Fᵀ + Q = [[0.90 + 0.01, 0.09], [0.09, 0.09 + 0.0003]]
   *                            = [[0.91, 0.09], [0.09, 0.0903]]
   *   ν = 171 − 172 = −1,  S = 0.91 + 0.81 = 1.72,  z = −1/√1.72 = −0.7624929
   *   K = [0.91, 0.09]/1.72 = [0.5290698, 0.0523256]
   *   x = [172 − 0.5290698, −0.0523256] = [171.4709302, −0.0523256]
   *   P₀₀ = (1 − K₀)·0.91 = 0.4285465,  P₁₁ = 0.0855907
   */
  const res = computeKalmanTrend([rec(0, 172), rec(1, 171)]);

  it('matches the hand-computed first update', () => {
    const p = res.points[1];
    expect(p.level).toBeCloseTo(171.4709302, 6);
    expect(p.slope).toBeCloseTo(-0.0523256, 6);
    expect(p.levelSd).toBeCloseTo(Math.sqrt(0.4285465), 5);
    expect(p.slopeSd).toBeCloseTo(Math.sqrt(0.0855907), 5);
    expect(p.z).toBeCloseTo(-0.7624929, 6);
    expect(p.predicted).toBe(false);
    expect(p.suspect).toBeUndefined();
    expect(res.nAccepted).toBe(2);
    expect(res.nRejected).toBe(0);
  });

  it('shrinks the level variance below the measurement variance after one update', () => {
    expect(res.points[1].levelSd ** 2).toBeLessThan(KALMAN_R_DEFAULT);
  });

  it('is order-independent (the store passes unsorted object values)', () => {
    const recs = [rec(0, 172), rec(1, 171.4), rec(2, 171.6), rec(3, 171)];
    const a = computeKalmanTrend(recs);
    const b = computeKalmanTrend([recs[2], recs[0], recs[3], recs[1]]);
    expect(b.points).toEqual(a.points);
    expect(b.measurementSd).toBe(a.measurementSd);
  });

  it('predicts on every calendar day, so a gap widens the band instead of freezing it', () => {
    const res2 = computeKalmanTrend([rec(0, 172), rec(1, 172), rec(9, 172)]);
    expect(res2.points).toHaveLength(10);
    const gap = res2.points.slice(2, 9);
    expect(gap.every((p) => p.predicted)).toBe(true);
    for (let i = 1; i < gap.length; i++) {
      expect(gap[i].levelSd).toBeGreaterThan(gap[i - 1].levelSd);
      expect(gap[i].slopeSd).toBeGreaterThanOrEqual(gap[i - 1].slopeSd);
    }
    // …and the weigh-in that ends the gap pulls the band back in.
    expect(res2.points[9].levelSd).toBeLessThan(res2.points[8].levelSd);
  });

  it('tracks a steady 1 lb/wk loss to within a tenth of a pound over 8 weeks', () => {
    const recs = Array.from({ length: 57 }, (_, i) => rec(i, 172 - i / 7));
    const res2 = computeKalmanTrend(recs);
    const end = res2.points[res2.points.length - 1];
    expect(end.level).toBeCloseTo(172 - 56 / 7, 1);
    expect(end.slope * 7).toBeCloseTo(-1, 1);
  });

  it('holds the level and the slope flat on a perfectly flat series', () => {
    const res2 = computeKalmanTrend(flat(30, 180));
    const end = res2.points[29];
    expect(end.level).toBeCloseTo(180, 6);
    expect(end.slope).toBeCloseTo(0, 6);
  });
});

// ---------------------------------------------------------------------------
// R7-13: the `through` cap, shared with computeEwmaTrend
// ---------------------------------------------------------------------------

describe('R7-13 — `through` caps the window at max(last weigh-in, through)', () => {
  it('gives a bedtime logged for tomorrow no Kalman state', () => {
    const res = computeKalmanTrend(
      [rec(0, 172), rec(1, 171.8), rec(2, undefined, { bt: '23:10' })],
      day(1),
    );
    expect(res.points).toHaveLength(2);
    expect(res.byDate.has(day(2))).toBe(false);
  });

  it('still filters a weigh-in dated after `through` — it is real data', () => {
    const res = computeKalmanTrend([rec(0, 172), rec(1, 171)], day(0));
    expect(res.points).toHaveLength(2);
    expect(res.byDate.get(day(1))?.predicted).toBe(false);
  });

  it('runs to the last record when `through` is omitted', () => {
    const res = computeKalmanTrend([rec(0, 172), rec(4, undefined, { st: 8000 })]);
    expect(res.points).toHaveLength(5);
    expect(res.points[4].predicted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Outlier gate and re-anchor
// ---------------------------------------------------------------------------

describe('outlier gate', () => {
  it('rejects a 100 lb typo, flags it suspect and barely moves the level', () => {
    const clean = computeKalmanTrend([...flat(10, 172), rec(10, 171.8)]);
    const typo = computeKalmanTrend([...flat(10, 172), rec(10, 271.8)]);
    const p = typo.points[10];
    expect(p.suspect).toBe(true);
    expect(p.predicted).toBe(true);
    expect(typo.nRejected).toBe(1);
    expect(suspectWeighIns(typo)).toEqual([day(10)]);
    expect(Math.abs(p.level - 172)).toBeLessThan(0.05);
    expect(Math.abs(p.level - clean.points[10].level)).toBeGreaterThan(0.01);
  });

  it('rejects on |z| alone once the level is well established', () => {
    // 6 lb is inside the 8 lb absolute gate, so this is the z branch.
    const res = computeKalmanTrend([...flat(14, 172), rec(14, 178)]);
    const p = res.points[14];
    expect(Math.abs(p.z as number)).toBeGreaterThan(3.5);
    expect(p.suspect).toBe(true);
  });

  it('rejects on the absolute innovation alone when the z gate is disabled', () => {
    const res = computeKalmanTrend([...flat(14, 172), rec(14, 178)], undefined, {
      rejectZ: 99,
      rejectLb: 5,
    });
    expect(Math.abs(res.points[14].z as number)).toBeLessThan(99);
    expect(res.points[14].suspect).toBe(true);
  });

  it('accepts an ordinary noisy reading', () => {
    const res = computeKalmanTrend([...flat(14, 172), rec(14, 173.2)]);
    expect(res.points[14].suspect).toBeUndefined();
    expect(res.nRejected).toBe(0);
  });
});

describe('re-anchor after three consecutive same-sign rejections', () => {
  const recs = [...flat(14, 172), rec(14, 178), rec(15, 178.2), rec(16, 178.1), rec(17, 178.05)];
  const res = computeKalmanTrend(recs);

  it('locks out the first two readings of a real 6 lb step, then re-anchors on the third', () => {
    expect(res.points[14].level).toBeCloseTo(172, 1);
    expect(res.points[15].level).toBeCloseTo(172, 1);
    // median(178, 178.2, 178.1) = 178.1
    expect(res.points[16].level).toBeCloseTo(178.1, 6);
    expect(res.points[16].predicted).toBe(false);
  });

  it('clears the suspicion on the three readings it just decided were real', () => {
    expect(suspectWeighIns(res)).toEqual([]);
    expect(res.nRejected).toBe(0);
    expect(res.nAccepted).toBe(recs.length);
  });

  it('re-opens the level variance to R so the next readings are trusted again', () => {
    expect(res.points[16].levelSd ** 2).toBeCloseTo(KALMAN_R_DEFAULT, 6);
    expect(res.points[17].suspect).toBeUndefined();
    expect(res.points[17].level).toBeGreaterThan(177);
  });

  it('does NOT re-anchor on alternating-sign rejections (noise, not a step)', () => {
    const noisy = computeKalmanTrend([
      ...flat(14, 172),
      rec(14, 178),
      rec(15, 166),
      rec(16, 178),
    ]);
    expect(noisy.nRejected).toBe(3);
    expect(suspectWeighIns(noisy)).toEqual([day(14), day(15), day(16)]);
    expect(noisy.points[16].level).toBeCloseTo(172, 1);
  });

  it('honours a custom `resetAfter`', () => {
    const res2 = computeKalmanTrend([...flat(14, 172), rec(14, 178), rec(15, 178.2)], undefined, {
      resetAfter: 2,
    });
    expect(res2.points[15].level).toBeCloseTo(178.1, 6);
  });
});

// ---------------------------------------------------------------------------
// Adaptive R
// ---------------------------------------------------------------------------

describe('adaptive measurement variance', () => {
  /** A seeded "weighs in dressed, at random times" user: sd 2.0 lb, flat truth. */
  const noisy = (n: number, sdLb: number): DailyRecord[] => {
    const rng = createRng(7);
    return Array.from({ length: n }, (_, i) => rec(i, round1(rng.normal(172, sdLb))));
  };

  it('widens R for a noisy scale once 10 innovations exist', () => {
    const res = computeKalmanTrend(noisy(40, 2));
    expect(res.measurementSd).toBeGreaterThan(Math.sqrt(KALMAN_R_DEFAULT));
    expect(res.measurementSd).toBeLessThan(6); // still a scale, not a random number
  });

  it('stays at the default before `adaptAfter` innovations', () => {
    const res = computeKalmanTrend(noisy(8, 2));
    expect(res.measurementSd).toBeCloseTo(Math.sqrt(KALMAN_R_DEFAULT), 10);
  });

  it('floors R for an implausibly consistent scale', () => {
    const res = computeKalmanTrend(flat(40, 172));
    expect(res.measurementSd).toBeCloseTo(Math.sqrt(KALMAN_R_FLOOR), 10);
  });
});

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

describe('kalmanLevelMap / kalmanAt', () => {
  const res = computeKalmanTrend([rec(0, 172), rec(1, 171), rec(2, undefined), rec(3, 170)]);

  it('exposes a date → level map in the shape computeEwmaTrend returns', () => {
    const map = kalmanLevelMap(res);
    expect(map.size).toBe(4);
    expect(map.get(day(0))).toBe(172);
    expect(map.get(day(1))).toBeCloseTo(171.47, 2);
  });

  it('carries the latest earlier point forward and is null before the first weigh-in', () => {
    expect(kalmanAt(res, day(2))?.d).toBe(day(2));
    expect(kalmanAt(res, day(9))?.d).toBe(day(3));
    expect(kalmanAt(res, addDays(D0, -1))).toBeNull();
    expect(kalmanAt(computeKalmanTrend([]), day(0))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Weekly rate and its availability gate
// ---------------------------------------------------------------------------

describe('kalmanRate', () => {
  it('is unavailable with no weigh-ins at all', () => {
    const r = kalmanRate(computeKalmanTrend([]), day(10), 172);
    expect(r.available).toBe(false);
    expect(r.lbPerWk).toBeNull();
    expect(r.reason).toBe('No weigh-ins yet');
  });

  it('is suppressed while 7·√P₁₁ exceeds 0.6 lb/wk, and says how many weigh-ins are missing', () => {
    const r = kalmanRate(computeKalmanTrend([rec(0, 172), rec(1, 171.8)]), day(1), 172);
    expect(r.available).toBe(false);
    expect(r.lbPerWk).toBeNull();
    expect(r.reason).toMatch(/^Rate unavailable — about \d+ more weigh-ins?$/);
  });

  it('publishes the rate, its 90% interval and %BW once the slope is precise enough', () => {
    const recs = Array.from({ length: 60 }, (_, i) => rec(i, 172 - i / 7));
    const res = computeKalmanTrend(recs);
    const r = kalmanRate(res, day(59), 172);
    expect(r.available).toBe(true);
    expect(r.lbPerWk).toBeCloseTo(-1, 1);
    expect(r.sdLbPerWk as number).toBeLessThanOrEqual(0.6);
    expect(r.lo90 as number).toBeLessThan(r.lbPerWk as number);
    expect(r.hi90 as number).toBeGreaterThan(r.lbPerWk as number);
    // 90% interval half-width is 1.645 standard errors
    expect((r.hi90 as number) - (r.lo90 as number)).toBeCloseTo(2 * 1.6449 * (r.sdLbPerWk as number), 2);
    expect(r.pctPerWk).toBeCloseTo(((r.lbPerWk as number) / 172) * 100, 2);
    expect(r.reason).toMatch(/^Rate from \d+ weigh-ins$/);
  });

  it('returns a null %BW rather than an Infinity for a nonsense body weight', () => {
    const recs = Array.from({ length: 60 }, (_, i) => rec(i, 172 - i / 7));
    const r = kalmanRate(computeKalmanTrend(recs), day(59), 0);
    expect(r.available).toBe(true);
    expect(r.pctPerWk).toBeNull();
  });

  it('honours a caller-supplied rate cap', () => {
    const recs = Array.from({ length: 60 }, (_, i) => rec(i, 172 - i / 7));
    const res = computeKalmanTrend(recs);
    expect(kalmanRate(res, day(59), 172, 0.01).available).toBe(false);
  });
});

describe('pOutsideBand', () => {
  it('splits the posterior mass either side of a signed band', () => {
    // r = −0.5, sd = 0.5, band [−1.72, −0.86]:
    //   pBelow = Φ((−1.72 + 0.5)/0.5) = Φ(−2.44) = 0.00734
    //   pAbove = 1 − Φ((−0.86 + 0.5)/0.5) = 1 − Φ(−0.72) = 0.76424
    const b = pOutsideBand({ lbPerWk: -0.5, sdLbPerWk: 0.5 }, -1.72, -0.86);
    expect(b.pBelow).toBeCloseTo(0.00734, 4);
    expect(b.pAbove).toBeCloseTo(0.76424, 4);
    expect(b.p).toBeCloseTo(0.77158, 4);
    expect(b.direction).toBe('above');
  });

  it('points below when the rate is more negative than the band', () => {
    const b = pOutsideBand({ lbPerWk: -2.5, sdLbPerWk: 0.4 }, -1.72, -0.86);
    expect(b.direction).toBe('below');
    expect(b.p).toBeGreaterThan(0.95);
  });

  it('is near zero in the middle of a wide band', () => {
    expect(pOutsideBand({ lbPerWk: -1.3, sdLbPerWk: 0.1 }, -1.72, -0.86).p).toBeLessThan(0.01);
  });

  it('tolerates a reversed band', () => {
    const a = pOutsideBand({ lbPerWk: -0.5, sdLbPerWk: 0.5 }, -0.86, -1.72);
    const b = pOutsideBand({ lbPerWk: -0.5, sdLbPerWk: 0.5 }, -1.72, -0.86);
    expect(a).toEqual(b);
  });

  it('reports no evidence at all when the rate is unavailable', () => {
    for (const r of [
      null,
      { lbPerWk: null, sdLbPerWk: null },
      { lbPerWk: -1, sdLbPerWk: null },
      { lbPerWk: -1, sdLbPerWk: 0 },
      { lbPerWk: Number.NaN, sdLbPerWk: 0.3 },
    ]) {
      expect(pOutsideBand(r, -1.72, -0.86)).toEqual({
        p: 0,
        pBelow: 0,
        pAbove: 0,
        direction: null,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// RTS smoother
// ---------------------------------------------------------------------------

describe('smoothKalman (Rauch–Tung–Striebel)', () => {
  const recs = Array.from({ length: 45 }, (_, i) =>
    rec(i, 172 - i / 7 + (i % 5 === 0 ? 1.2 : -0.4)),
  );
  const filtered = computeKalmanTrend(recs);
  const smoothed = smoothKalman(filtered);

  it('returns a new result flagged smoothed, leaving the filtered one untouched', () => {
    expect(smoothed.smoothed).toBe(true);
    expect(filtered.smoothed).toBe(false);
    expect(smoothed).not.toBe(filtered);
    expect(smoothed.points).toHaveLength(filtered.points.length);
    expect(filtered.points[0].level).toBe(recs[0].w);
  });

  it('never increases a variance: hindsight can only narrow the band', () => {
    for (let i = 0; i < filtered.points.length; i++) {
      expect(smoothed.points[i].levelSd).toBeLessThanOrEqual(filtered.points[i].levelSd + 1e-9);
      expect(smoothed.points[i].slopeSd).toBeLessThanOrEqual(filtered.points[i].slopeSd + 1e-9);
    }
    // Strictly narrower somewhere in the middle — the pass did real work.
    expect(smoothed.points[20].levelSd).toBeLessThan(filtered.points[20].levelSd - 1e-6);
  });

  it('agrees with the filter at the last point (there is no future to borrow)', () => {
    const n = filtered.points.length - 1;
    expect(smoothed.points[n].level).toBeCloseTo(filtered.points[n].level, 10);
    expect(smoothed.points[n].slope).toBeCloseTo(filtered.points[n].slope, 10);
  });

  it('carries `predicted`, `suspect` and `z` through unchanged', () => {
    const withTypo = smoothKalman(computeKalmanTrend([...flat(10, 172), rec(10, 271.8)]));
    expect(withTypo.points[10].suspect).toBe(true);
    expect(withTypo.points[10].predicted).toBe(true);
    expect(suspectWeighIns(withTypo)).toEqual([day(10)]);
  });

  it('does not smear a re-anchored step backwards into the history before it', () => {
    // 20 flat days, a real +6 lb step, then it holds. Hindsight must re-estimate
    // the days *inside* the step, not rewrite the three weeks before it: a
    // re-anchor is a discontinuity, and the RTS pass is told so.
    const stepped = [
      ...flat(20, 172),
      rec(20, 178),
      rec(21, 178.2),
      rec(22, 178.1),
      ...Array.from({ length: 10 }, (_, i) => rec(23 + i, 178)),
    ];
    const s = smoothKalman(computeKalmanTrend(stepped));
    expect(s.points[10].level).toBeCloseTo(172, 1);
    expect(s.points[19].level).toBeCloseTo(172, 1);
    expect(s.points[32].level).toBeCloseTo(178, 1);
  });

  it('is a no-op on an empty result and on an already-smoothed one', () => {
    const empty = computeKalmanTrend([]);
    expect(smoothKalman(empty)).toBe(empty);
    expect(smoothKalman(smoothed)).toBe(smoothed);
  });

  it('stays within 1 lb of the filtered series on the demo dataset', () => {
    const demo = generateDemoData(DEFAULT_SETTINGS, '2026-09-06', 45);
    const f = computeKalmanTrend(demo, '2026-09-06');
    const s = smoothKalman(f);
    let worst = 0;
    for (let i = 0; i < f.points.length; i++) {
      worst = Math.max(worst, Math.abs(s.points[i].level - f.points[i].level));
    }
    expect(f.points.length).toBeGreaterThan(30);
    expect(worst).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// Cycle covariate
// ---------------------------------------------------------------------------

describe('cycle covariate (Kanellakis 2023, +0.45 kg)', () => {
  const base = [...flat(20, 172)];
  const withMens = base.map((r, i) =>
    i >= 20 - 3 ? { ...r, w: 172 + KALMAN_CYCLE_OFFSET_LB, mens: true as const } : r,
  );

  it('is absent entirely when the flag was never logged', () => {
    const off = computeKalmanTrend(base);
    const on = computeKalmanTrend(base, undefined, { cycle: { enabled: true } });
    expect(on.points).toEqual(off.points);
  });

  it('is ignored when profile.tracksCycle is off, even with flagged days', () => {
    const off = computeKalmanTrend(withMens);
    const on = computeKalmanTrend(withMens, undefined, { cycle: { enabled: false } });
    expect(on.points).toEqual(off.points);
  });

  it('removes the offset from the level, so cycle water never reaches the rate', () => {
    const off = computeKalmanTrend(withMens);
    const on = computeKalmanTrend(withMens, undefined, { cycle: { enabled: true } });
    const end = on.points[19];
    expect(end.level).toBeCloseTo(172, 3);
    // Without the covariate the same days drag the level up.
    expect(off.points[19].level).toBeGreaterThan(end.level + 0.3);
    expect(Math.abs(end.slope * 7)).toBeLessThan(Math.abs(off.points[19].slope * 7));
  });

  it('widens the measurement variance on flagged days', () => {
    const on = computeKalmanTrend(withMens, undefined, { cycle: { enabled: true } });
    const plain = computeKalmanTrend(
      withMens.map((r) => ({ ...r, w: (r.w as number) - (r.mens ? KALMAN_CYCLE_OFFSET_LB : 0) })),
      undefined,
      { cycle: { enabled: false } },
    );
    // Same innovations, larger R on the flagged days → a wider band.
    expect(on.points[19].levelSd).toBeGreaterThan(plain.points[19].levelSd);
  });
});
