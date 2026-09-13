/**
 * Small sliding-window limiter: in-memory (per instance) + a list of ISO timestamps persisted
 * by the caller (so it survives cold starts and works across instances). Both must pass.
 */
const memory = new Map<string, number[]>();

export type RateLimitResult = { allowed: true; timestamps: string[] } | { allowed: false; retryAfterSec: number; timestamps: string[] };

export function checkRateLimit(key: string, persisted: string[], opts: { max: number; windowMs: number; now?: number }): RateLimitResult {
  const now = opts.now ?? Date.now();
  const floor = now - opts.windowMs;
  const fromDb = persisted.map((s) => Date.parse(s)).filter((t) => Number.isFinite(t) && t > floor);
  const fromMem = (memory.get(key) ?? []).filter((t) => t > floor);
  // Memory is the superset on this instance; the persisted list is the superset across instances. Take the fuller one.
  const merged = (fromMem.length >= fromDb.length ? fromMem : fromDb).slice().sort((a, b) => a - b);
  if (merged.length >= opts.max) {
    const retryAfterSec = Math.max(1, Math.ceil((merged[0] + opts.windowMs - now) / 1000));
    return { allowed: false, retryAfterSec, timestamps: merged.map((t) => new Date(t).toISOString()) };
  }
  const next = [...merged, now];
  memory.set(key, next);
  return { allowed: true, timestamps: next.map((t) => new Date(t).toISOString()) };
}
