import { describe, expect, it } from 'vitest';
import {
  benjaminiHochberg,
  erf,
  ewma,
  incompleteBeta,
  linreg,
  logistic,
  mad,
  median,
  normalCdf,
  normalQuantile,
  pearson,
  quantile,
  robustSd,
  robustZ,
  tCdf,
  zScore,
} from './stats';

describe('median / mad / robustSd', () => {
  it('is the middle value for an odd sample and the mean of the middle pair for an even one', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('shrugs off the outlier that would move a mean (hand-computed)', () => {
    // [1, 2, 3, 4, 100]: median 3; |x − 3| = [2, 1, 0, 1, 97] → MAD 1.
    const xs = [1, 2, 3, 4, 100];
    expect(median(xs)).toBe(3);
    expect(mad(xs)).toBe(1);
    expect(robustSd(xs)).toBeCloseTo(1.4826, 6);
    // The mean would be 22 — an "average day" nobody had.
  });

  it('accepts an explicit centre for MAD', () => {
    expect(mad([1, 2, 3, 4, 100], 2)).toBe(1); // |x − 2| = [1,0,1,2,98] → 1
  });

  it('skips non-finite entries instead of reading them as zero', () => {
    expect(median([1, null, 3, undefined, NaN, Infinity])).toBe(2);
    expect(mad([2, null, 2, 2])).toBe(0);
  });

  it('applies the caller-supplied floor so identical readings do not make every z infinite', () => {
    expect(robustSd([5, 5, 5, 5])).toBe(0);
    expect(robustSd([5, 5, 5, 5], 0.03)).toBe(0.03);
    // A real spread beats the floor rather than being clamped up to it.
    expect(robustSd([1, 2, 3, 4, 100], 0.03)).toBeCloseTo(1.4826, 6);
  });

  it('returns null on empty / all-non-finite input', () => {
    expect(median([])).toBeNull();
    expect(median([NaN, null, undefined])).toBeNull();
    expect(mad([])).toBeNull();
    expect(robustSd([])).toBeNull();
  });
});

describe('quantile', () => {
  it('interpolates linearly between order statistics (R type 7)', () => {
    const xs = [1, 2, 3, 4];
    expect(quantile(xs, 0)).toBe(1);
    expect(quantile(xs, 1)).toBe(4);
    expect(quantile(xs, 0.5)).toBe(2.5); // h = 1.5
    expect(quantile(xs, 0.25)).toBe(1.75); // h = 0.75
  });

  it('agrees with median on an odd sample', () => {
    expect(quantile([5, 1, 9], 0.5)).toBe(median([5, 1, 9]));
  });

  it('clamps p and returns null for an empty sample', () => {
    expect(quantile([1, 2, 3], -1)).toBe(1);
    expect(quantile([1, 2, 3], 2)).toBe(3);
    expect(quantile([], 0.5)).toBeNull();
    expect(quantile([1, 2], NaN)).toBeNull();
  });
});

describe('erf / normalCdf / normalQuantile', () => {
  it('matches published values of the error function', () => {
    expect(erf(0)).toBe(0);
    expect(erf(1)).toBeCloseTo(0.8427008, 6);
    expect(erf(0.5)).toBeCloseTo(0.5204999, 6);
    expect(erf(2)).toBeCloseTo(0.9953223, 6);
    expect(erf(-1)).toBeCloseTo(-0.8427008, 6); // odd symmetry
  });

  it('gives the normal CDF at the values every band in the app is drawn from', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 10);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 5);
    expect(normalCdf(1.645)).toBeCloseTo(0.95, 4);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 5);
    expect(normalCdf(1)).toBeCloseTo(0.8413447, 6);
    // Mean/sd form: 1 sd above the mean is the same probability.
    expect(normalCdf(12, 10, 2)).toBeCloseTo(0.8413447, 6);
  });

  it('inverts the normal CDF (Acklam)', () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 5);
    expect(normalQuantile(0.95)).toBeCloseTo(1.644854, 5);
    expect(normalQuantile(0.5)).toBeCloseTo(0, 10);
    expect(normalQuantile(0.025)).toBeCloseTo(-1.959964, 5);
    // Far tail — the other branch of the approximation.
    expect(normalQuantile(0.001)).toBeCloseTo(-3.090232, 4);
  });

  it('round-trips against normalCdf', () => {
    for (const p of [0.01, 0.1, 0.3, 0.5, 0.7, 0.9, 0.99]) {
      const z = normalQuantile(p) as number;
      expect(normalCdf(z)).toBeCloseTo(p, 6);
    }
  });

  it('is total: no NaN escapes, and degenerate probabilities are null', () => {
    expect(erf(NaN)).toBe(0);
    expect(erf(Infinity)).toBe(1);
    expect(erf(-Infinity)).toBe(-1);
    expect(normalCdf(NaN)).toBe(0.5);
    expect(normalCdf(5, 0, 0)).toBe(1); // sd 0 → a step at the mean
    expect(normalQuantile(0)).toBeNull();
    expect(normalQuantile(1)).toBeNull();
    expect(normalQuantile(NaN)).toBeNull();
  });
});

describe('logistic', () => {
  it('is the readiness link function', () => {
    expect(logistic(0)).toBe(0.5);
    expect(logistic(1)).toBeCloseTo(0.7310586, 6);
    expect(logistic(1, 1.1)).toBeCloseTo(0.7502601, 6);
    expect(logistic(-1)).toBeCloseTo(0.2689414, 6);
  });

  it('is total', () => {
    expect(logistic(NaN)).toBe(0.5);
    expect(logistic(Infinity)).toBe(1);
    expect(logistic(-Infinity)).toBe(0);
  });
});

describe('ewma', () => {
  it('seeds at the first value and smooths towards each next one', () => {
    expect(ewma([10, 20], 0.5)).toEqual([10, 15]);
    expect(ewma([0, 0, 10], 0.1)).toEqual([0, 0, 1]);
  });

  it('stays aligned with the input: nulls before the first value, carry-forward across gaps', () => {
    expect(ewma([null, 10, null, 20], 0.5)).toEqual([null, 10, 10, 15]);
    expect(ewma([], 0.3)).toEqual([]);
    expect(ewma([null, null], 0.3)).toEqual([null, null]);
  });

  it('falls back to α = 0.1 for a nonsense alpha', () => {
    expect(ewma([0, 10], NaN)).toEqual([0, 1]);
  });
});

describe('zScore / robustZ', () => {
  it('standardises against an explicit mean and sd', () => {
    expect(zScore(12, 10, 2)).toBe(1);
    expect(zScore(8, 10, 2)).toBe(-1);
  });

  it('standardises against a robust reference window', () => {
    // ref median 3, MAD 1 → robust sd 1.4826.
    expect(robustZ(6, [1, 2, 3, 4, 100])).toBeCloseTo(3 / 1.4826, 6);
  });

  it('returns null rather than infinity for zero variance', () => {
    expect(zScore(1, 0, 0)).toBeNull();
    expect(zScore(NaN, 0, 1)).toBeNull();
    expect(robustZ(6, [3, 3, 3])).toBeNull();
    expect(robustZ(6, [])).toBeNull();
    // …unless the caller supplied a floor, which is exactly what it is for.
    expect(robustZ(6, [3, 3, 3], 0.5)).toBe(6);
  });
});

describe('pearson', () => {
  it('is ±1 on a perfect line and 0 on an orthogonal pair', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 12);
    // Σ(x−3)(y−3) = 8, Σ(x−3)² = Σ(y−3)² = 10 → r = 0.8.
    expect(pearson([1, 2, 3, 4, 5], [1, 3, 2, 5, 4])).toBeCloseTo(0.8, 10);
  });

  it('uses complete pairs only', () => {
    expect(pearson([1, null, 2, 3], [2, 5, 4, 6])).toBeCloseTo(1, 12);
  });

  it('returns null for n < 2 or a constant series', () => {
    expect(pearson([1], [2])).toBeNull();
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(pearson([], [])).toBeNull();
  });
});

describe('linreg', () => {
  it('recovers a hand-computed perfect line exactly (se 0, r² 1)', () => {
    // y = 3 + 2x on x = 0..4.
    const r = linreg([0, 1, 2, 3, 4], [3, 5, 7, 9, 11]);
    expect(r).not.toBeNull();
    expect(r?.slope).toBeCloseTo(2, 12);
    expect(r?.intercept).toBeCloseTo(3, 12);
    expect(r?.seSlope).toBeCloseTo(0, 12);
    expect(r?.r2).toBeCloseTo(1, 12);
    expect(r?.n).toBe(5);
  });

  it('reports the slope standard error on a noisy fit', () => {
    // x = 1..5, y = [2, 4, 5, 4, 5]: Sxy = 6, Sxx = 10 → slope 0.6, intercept 2.2.
    // Residuals [-0.8, 0.6, 1.0, -0.6, -0.2] → SSres = 2.4, s² = 0.8,
    // se = sqrt(0.8/10) = 0.2828427.
    const r = linreg([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]);
    expect(r?.slope).toBeCloseTo(0.6, 12);
    expect(r?.intercept).toBeCloseTo(2.2, 12);
    expect(r?.seSlope).toBeCloseTo(0.2828427, 6);
    expect(r?.r2).toBeCloseTo(0.6, 10); // SStot 6 → 1 − 2.4/6
  });

  it('has no residual degrees of freedom at n = 2', () => {
    const r = linreg([0, 1], [1, 3]);
    expect(r?.slope).toBe(2);
    expect(r?.n).toBe(2);
    expect(r?.seSlope).toBeNull();
  });

  it('returns null for n < 2 or a vertical fit', () => {
    expect(linreg([1], [1])).toBeNull();
    expect(linreg([], [])).toBeNull();
    expect(linreg([2, 2, 2], [1, 2, 3])).toBeNull();
  });
});

describe('tCdf', () => {
  it('matches a published t-table at df 5', () => {
    expect(tCdf(0, 5)).toBe(0.5);
    expect(tCdf(2.015, 5)).toBeCloseTo(0.95, 4); // t(0.95, 5) = 2.015
    expect(tCdf(2.571, 5)).toBeCloseTo(0.975, 4); // t(0.975, 5) = 2.571
    expect(tCdf(3.365, 5)).toBeCloseTo(0.99, 4); // t(0.99, 5) = 3.365
  });

  it('matches a published t-table at df 30', () => {
    expect(tCdf(1.697, 30)).toBeCloseTo(0.95, 4); // t(0.95, 30) = 1.697
    expect(tCdf(2.042, 30)).toBeCloseTo(0.975, 4); // t(0.975, 30) = 2.042
    expect(tCdf(2.457, 30)).toBeCloseTo(0.99, 4); // t(0.99, 30) = 2.457
  });

  it('is symmetric and approaches the normal as df grows', () => {
    expect(tCdf(-2.042, 30)).toBeCloseTo(1 - (tCdf(2.042, 30) as number), 12);
    expect(tCdf(1.96, 100000)).toBeCloseTo(normalCdf(1.96), 4);
    // Heavier tails than the normal at small df — the whole point of using it.
    expect(tCdf(1.96, 5)).toBeLessThan(normalCdf(1.96));
  });

  it('returns null for a non-finite t or a non-positive df', () => {
    expect(tCdf(NaN, 5)).toBeNull();
    expect(tCdf(1, 0)).toBeNull();
    expect(tCdf(1, -3)).toBeNull();
  });

  it('exposes the incomplete beta it is built on', () => {
    expect(incompleteBeta(0.5, 1, 1)).toBeCloseTo(0.5, 12); // uniform
    expect(incompleteBeta(0.5, 2, 2)).toBeCloseTo(0.5, 12); // symmetric
    expect(incompleteBeta(0, 2, 3)).toBe(0);
    expect(incompleteBeta(1, 2, 3)).toBe(1);
    expect(incompleteBeta(0.5, 0, 1)).toBeNull();
  });
});

describe('benjaminiHochberg', () => {
  it('reproduces a hand-computed example, monotonicity included', () => {
    // n = 5; raw q(i) = p(i)·n/i:
    //   0.001·5/1 = 0.005
    //   0.008·5/2 = 0.020
    //   0.039·5/3 = 0.065
    //   0.041·5/4 = 0.05125
    //   0.042·5/5 = 0.042
    // Step-up from the largest: q5 = 0.042, q4 = min(0.05125, 0.042) = 0.042,
    // q3 = min(0.065, 0.042) = 0.042, q2 = 0.020, q1 = 0.005.
    const q = benjaminiHochberg([0.001, 0.008, 0.039, 0.041, 0.042]);
    expect(q[0]).toBeCloseTo(0.005, 12);
    expect(q[1]).toBeCloseTo(0.02, 12);
    expect(q[2]).toBeCloseTo(0.042, 12);
    expect(q[3]).toBeCloseTo(0.042, 12);
    expect(q[4]).toBeCloseTo(0.042, 12);
  });

  it('returns q-values in the input order, not sorted order', () => {
    const q = benjaminiHochberg([0.042, 0.001, 0.041, 0.008, 0.039]);
    expect(q[0]).toBeCloseTo(0.042, 12);
    expect(q[1]).toBeCloseTo(0.005, 12);
    expect(q[2]).toBeCloseTo(0.042, 12);
    expect(q[3]).toBeCloseTo(0.02, 12);
    expect(q[4]).toBeCloseTo(0.042, 12);
  });

  it('never reports a q above 1 and never lets a q fall below a smaller p', () => {
    const q = benjaminiHochberg([0.5, 0.6, 0.7, 0.8, 0.9]) as number[];
    for (const v of q) expect(v).toBeLessThanOrEqual(1);
    expect(q[0]).toBeLessThanOrEqual(q[1]);
    expect(q[1]).toBeLessThanOrEqual(q[2]);
  });

  it('is the identity on a single p-value', () => {
    expect(benjaminiHochberg([0.03])).toEqual([0.03]);
  });

  it('nulls out non-p-values and excludes them from n', () => {
    // Only two real p-values, so n = 2: q = [0.01·2/1, 0.02·2/2] = [0.02, 0.02].
    const q = benjaminiHochberg([0.01, NaN, 0.02, null, 1.5, -0.1]);
    expect(q[0]).toBeCloseTo(0.02, 12);
    expect(q[1]).toBeNull();
    expect(q[2]).toBeCloseTo(0.02, 12);
    expect(q[3]).toBeNull();
    expect(q[4]).toBeNull();
    expect(q[5]).toBeNull();
    expect(benjaminiHochberg([])).toEqual([]);
  });
});

describe('the module contract', () => {
  it('never returns NaN, for any input any caller could pass', () => {
    const nasty = [NaN, Infinity, -Infinity, 0, -0, 1e308, -1e308, 0.5, -7];
    const isClean = (v: number | null) => v === null || Number.isFinite(v);
    for (const x of nasty) {
      expect(Number.isFinite(erf(x))).toBe(true);
      expect(Number.isFinite(normalCdf(x))).toBe(true);
      expect(Number.isFinite(logistic(x))).toBe(true);
      expect(isClean(normalQuantile(x))).toBe(true);
      expect(isClean(tCdf(x, 7))).toBe(true);
      expect(isClean(median(nasty))).toBe(true);
      expect(isClean(robustSd(nasty, 0.01))).toBe(true);
      expect(isClean(quantile(nasty, 0.9))).toBe(true);
      expect(isClean(zScore(x, 0, 1))).toBe(true);
      expect(isClean(robustZ(x, nasty))).toBe(true);
      expect(isClean(pearson(nasty, nasty))).toBe(true);
    }
    for (const v of ewma(nasty, 0.3)) expect(isClean(v)).toBe(true);
    for (const v of benjaminiHochberg(nasty)) expect(isClean(v)).toBe(true);
    const r = linreg(nasty, nasty);
    if (r) {
      expect(Number.isFinite(r.slope)).toBe(true);
      expect(Number.isFinite(r.intercept)).toBe(true);
      expect(Number.isFinite(r.r2)).toBe(true);
      expect(isClean(r.seSlope)).toBe(true);
    }
  });

  it('does not mutate its inputs', () => {
    const xs = [3, 1, 2];
    median(xs);
    quantile(xs, 0.5);
    robustSd(xs);
    expect(xs).toEqual([3, 1, 2]);
    const ps = [0.5, 0.01];
    benjaminiHochberg(ps);
    expect(ps).toEqual([0.5, 0.01]);
  });
});
