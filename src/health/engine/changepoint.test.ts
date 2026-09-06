import { describe, expect, it } from 'vitest';
import type { DailyRecord } from '../data/types';
import { addDays } from '../lib/dates';
import type { SeriesPoint } from './baseline';
import {
  BOCPD_MIN_OBS,
  CHANGEPOINT_METRICS,
  detectChangepoints,
  detectRegimeShifts,
} from './changepoint';

const ASOF = '2026-09-06';

/** Deterministic zero-mean wobble, so nothing here depends on a PRNG. */
const WOBBLE = [0.4, -0.4, 0.2, -0.2, 0.6, -0.6, 0];

/** `values[i]` on the day `n − 1 − i` days before `ASOF`. */
function series(values: Array<number | null>, asOf = ASOF): SeriesPoint[] {
  const n = values.length;
  return values.map((v, i) => ({ d: addDays(asOf, -(n - 1 - i)), v }));
}

/** `before` days at `lo`, then `after` days at `hi`, both with the wobble. */
function step(before: number, after: number, lo: number, hi: number): SeriesPoint[] {
  const vals: number[] = [];
  for (let i = 0; i < before + after; i++) vals.push((i < before ? lo : hi) + WOBBLE[i % 7]);
  return series(vals);
}

const flat = (n: number, base = 50): SeriesPoint[] =>
  series(Array.from({ length: n }, (_, i) => base + WOBBLE[i % 7]));

describe('detectChangepoints — degenerate input', () => {
  it('returns [] for an empty series', () => {
    expect(detectChangepoints([])).toEqual([]);
  });

  it('returns [] below the minimum observation count', () => {
    expect(detectChangepoints(flat(BOCPD_MIN_OBS - 1))).toEqual([]);
    // …and a step it would otherwise find, if the series is too short to judge.
    expect(detectChangepoints(step(9, 9, 50, 70))).toEqual([]);
  });

  it('returns [] when every value is null', () => {
    expect(detectChangepoints(series(Array.from({ length: 60 }, () => null)))).toEqual([]);
  });

  it('returns [] for a perfectly constant series — there is no scale to judge against', () => {
    expect(detectChangepoints(series(Array.from({ length: 60 }, () => 55)))).toEqual([]);
  });

  it('returns [] for a stationary series', () => {
    expect(detectChangepoints(flat(60))).toEqual([]);
  });

  it('never throws and never returns NaN on a rubbish series', () => {
    const junk = series([
      ...Array.from({ length: 30 }, (_, i) => (i % 3 === 0 ? null : 50 + WOBBLE[i % 7])),
      ...Array.from({ length: 30 }, (_, i) => (i % 4 === 0 ? null : 62 + WOBBLE[i % 7])),
    ]);
    for (const cp of detectChangepoints(junk, { metric: 'rhr' })) {
      expect(Number.isFinite(cp.prob)).toBe(true);
      expect(Number.isFinite(cp.meanBefore)).toBe(true);
      expect(Number.isFinite(cp.meanAfter)).toBe(true);
      expect(cp.prob).toBeGreaterThan(0);
      expect(cp.prob).toBeLessThanOrEqual(1);
    }
  });
});

describe('detectChangepoints — a clean step', () => {
  const s = step(30, 20, 50, 56);
  // 50 observations, index 30 is the first of the new regime → ASOF − 19.
  const shiftDate = addDays(ASOF, -19);

  it('finds exactly one shift, dated at the first day of the new regime', () => {
    const cps = detectChangepoints(s, { metric: 'rhr', label: 'resting heart rate' });
    expect(cps).toHaveLength(1);
    expect(cps[0].d).toBe(shiftDate);
    expect(cps[0].metric).toBe('rhr');
    expect(cps[0].label).toBe('resting heart rate');
  });

  it('reports the pre and post means and a posterior above the 0.5 bar', () => {
    const [cp] = detectChangepoints(s, { metric: 'rhr' });
    expect(cp.meanBefore).toBeCloseTo(50, 0);
    expect(cp.meanAfter).toBeCloseTo(56, 0);
    expect(cp.prob).toBeGreaterThan(0.5);
    expect(cp.prob).toBeLessThanOrEqual(1);
  });

  it('confirms after the shift, never before it', () => {
    const [cp] = detectChangepoints(s, { metric: 'rhr' });
    expect(cp.confirmedOn >= cp.d).toBe(true);
    expect(cp.nObs).toBe(50);
  });

  it('is order-independent — callers pass unsorted arrays', () => {
    const shuffled = [...s].sort((a, b) => (a.d < b.d ? 1 : -1));
    expect(detectChangepoints(shuffled, { metric: 'rhr' })).toEqual(
      detectChangepoints(s, { metric: 'rhr' }),
    );
  });

  it('takes the last value for a duplicated date', () => {
    const dup: SeriesPoint[] = [...s, { d: s[0].d, v: 50 }];
    expect(detectChangepoints(dup, { metric: 'rhr' })).toEqual(
      detectChangepoints(s, { metric: 'rhr' }),
    );
  });

  it('skips null days rather than imputing them', () => {
    // Same 50 readings, spread over 60 calendar days with 10 gaps.
    const withGaps: SeriesPoint[] = [];
    let k = 0;
    for (let i = 0; i < 60; i++) {
      const d = addDays(ASOF, -(59 - i));
      if (i % 6 === 5) withGaps.push({ d, v: null });
      else withGaps.push({ d, v: s[k++]?.v ?? null });
    }
    const cps = detectChangepoints(withGaps, { metric: 'rhr' });
    expect(cps).toHaveLength(1);
    expect(cps[0].meanAfter - cps[0].meanBefore).toBeCloseTo(6, 0);
  });
});

describe('detectChangepoints — the reporting gates', () => {
  const s = step(30, 20, 50, 56);

  it('minShiftSd suppresses a step the posterior is sure of', () => {
    expect(detectChangepoints(s, { minShiftSd: 100 })).toEqual([]);
  });

  it('minProb suppresses a step the posterior is not sure enough of', () => {
    expect(detectChangepoints(s, { minProb: 0.999999 })).toEqual([]);
  });

  it('minRunDays makes the rule stricter, never looser', () => {
    const strict = detectChangepoints(s, { minRunDays: 12 });
    expect(strict.length).toBeLessThanOrEqual(detectChangepoints(s).length);
  });

  it('does not report a step with too little history behind it', () => {
    // Five observations before the step is under BOCPD_MIN_BEFORE.
    expect(detectChangepoints(step(3, 30, 50, 70))).toEqual([]);
  });

  it('does not report a step with too little evidence after it', () => {
    const late = step(40, 2, 50, 70);
    expect(detectChangepoints(late)).toEqual([]);
  });

  it('ignores non-finite options instead of turning them into NaN', () => {
    const bad = detectChangepoints(s, {
      hazard: Number.NaN,
      minProb: Number.POSITIVE_INFINITY,
      minRunDays: -3,
      minShiftSd: Number.NaN,
      meanWindow: 0,
      prior: { kappa0: 0, alpha0: Number.NaN, beta0: -1 },
    });
    expect(bad).toEqual(detectChangepoints(s));
  });
});

describe('detectRegimeShifts', () => {
  function records(hrvBefore: number, hrvAfter: number, n = 50, shiftAt = 30): DailyRecord[] {
    return Array.from({ length: n }, (_, i) => ({
      d: addDays(ASOF, -(n - 1 - i)),
      hrv: (i < shiftAt ? hrvBefore : hrvAfter) * (1 + WOBBLE[i % 7] / 50),
      rhr: 55 + WOBBLE[i % 7],
    }));
  }

  it('watches ln rMSSD, RHR, the Kalman level and OSI', () => {
    expect(CHANGEPOINT_METRICS.map((m) => m.key)).toEqual(['hrv', 'rhr', 'kl', 'osi']);
    expect(CHANGEPOINT_METRICS.find((m) => m.key === 'hrv')?.ln).toBe(true);
  });

  it('reports an HRV shift back in ms, not in ln', () => {
    const cps = detectRegimeShifts(records(60, 44), ASOF);
    expect(cps).toHaveLength(1);
    expect(cps[0].metric).toBe('hrv');
    expect(cps[0].label).toBe('HRV');
    expect(cps[0].meanBefore).toBeCloseTo(60, 0);
    expect(cps[0].meanAfter).toBeCloseTo(44, 0);
    expect(cps[0].d).toBe(addDays(ASOF, -19));
  });

  it('returns [] for records with none of the watched fields', () => {
    const bare: DailyRecord[] = Array.from({ length: 60 }, (_, i) => ({
      d: addDays(ASOF, -(59 - i)),
      w: 170 + WOBBLE[i % 7],
    }));
    expect(detectRegimeShifts(bare, ASOF)).toEqual([]);
  });

  it('ignores records after asOf and is order-independent', () => {
    const recs = records(60, 44);
    const future = [...recs, { d: addDays(ASOF, 5), hrv: 20 }].sort(() => -1);
    expect(detectRegimeShifts(future, ASOF)).toEqual(detectRegimeShifts(recs, ASOF));
  });

  it('returns shifts oldest first', () => {
    const recs = [...records(60, 44), ...[]];
    const cps = detectRegimeShifts(
      recs.map((r, i) => ({ ...r, rhr: i < 30 ? 55 + WOBBLE[i % 7] : 62 + WOBBLE[i % 7] })),
      ASOF,
    );
    expect(cps.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < cps.length; i++) expect(cps[i].d >= cps[i - 1].d).toBe(true);
  });
});
