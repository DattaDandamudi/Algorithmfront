/**
 * Deterministic seeded RNG (xmur3 hash → mulberry32). Quotes must be
 * reproducible within a session: same seed key ⇒ identical stream.
 */

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeededRng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform float in [lo, hi), optionally snapped down to a step. */
  range(lo: number, hi: number, step?: number): number;
  /** Uniform integer in [lo, hi] inclusive. */
  int(lo: number, hi: number): number;
  pick<T>(items: readonly T[]): T;
}

export function createRng(seedKey: string): SeededRng {
  const seed = xmur3(seedKey)();
  const next = mulberry32(seed);
  return {
    next,
    range(lo, hi, step) {
      const v = lo + next() * (hi - lo);
      if (!step) return v;
      return lo + Math.floor((v - lo) / step) * step;
    },
    int(lo, hi) {
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    pick(items) {
      return items[Math.floor(next() * items.length)];
    },
  };
}
