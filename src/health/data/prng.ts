/**
 * Tiny seeded PRNG for the demo dataset (seed.ts).
 *
 * Screenshots, docs and tests all need the *same* 45 demo days every time, so
 * nothing in the seed path may touch Math.random. mulberry32 is a 32-bit
 * generator (one multiply + xorshift mix, period 2^32) that is more than good
 * enough for plausible-looking noise and is ~10 lines long.
 *
 * All helpers draw a fixed number of underlying values per call (normal() is
 * Box–Muller without caching, always two draws) so a caller can keep its
 * per-day draw count constant and therefore keep streams stable across
 * endDates.
 */

/** Seed used for the demo persona — the launch date, so screenshots are reproducible. */
export const DEMO_SEED = 20260906;

/** mulberry32 → uniform float in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform float in [lo, hi). */
  uniform(lo: number, hi: number): number;
  /** Uniform integer in [lo, hi] (inclusive). */
  int(lo: number, hi: number): number;
  /** Gaussian via Box–Muller (always consumes two draws). */
  normal(mean?: number, sd?: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** One element of a non-empty array. */
  pick<T>(xs: readonly T[]): T;
  /** n distinct elements (partial Fisher–Yates), order randomised. */
  sample<T>(xs: readonly T[], n: number): T[];
}

export function createRng(seed: number = DEMO_SEED): Rng {
  const next = mulberry32(seed);
  const rng: Rng = {
    next,
    uniform: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    normal: (mean = 0, sd = 1) => {
      // 1 − u keeps the log argument in (0, 1].
      const u1 = 1 - next();
      const u2 = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
    chance: (p) => next() < p,
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    sample: (xs, n) => {
      const pool = xs.slice();
      const out: typeof pool = [];
      const take = Math.min(n, pool.length);
      for (let i = 0; i < take; i++) {
        const j = i + Math.floor(next() * (pool.length - i));
        [pool[i], pool[j]] = [pool[j], pool[i]];
        out.push(pool[i]);
      }
      return out;
    },
  };
  return rng;
}
