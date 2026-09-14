/**
 * Sliding-window rate limiter for the endpoints that make CallCatch's own notification number send
 * texts / place calls (alert-phone codes, forwarding tests).
 *
 * Counters are persisted in `public.rate_limits` through the service-role-only
 * `rate_limit_hit()` SQL function (atomic, row-locked), so they survive cold starts, work across
 * instances, and — unlike the old `accounts.ai_profile` timestamps — cannot be reset by the member
 * being limited. A small in-memory guard per instance short-circuits obvious bursts.
 *
 * Server-only (uses the admin client).
 */
import { createAdminSupabase } from "@/lib/db/client";

const memory = new Map<string, number[]>();

export type RateLimitRule = { key: string; max: number; windowMs: number };
export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSec: number; key: string };

/** Counts one hit against `rule.key`; false when the window already holds `max` hits. Fails closed on DB errors. */
export async function checkRateLimit(rule: RateLimitRule): Promise<RateLimitResult> {
  const now = Date.now();
  const floor = now - rule.windowMs;
  const local = (memory.get(rule.key) ?? []).filter((t) => t > floor);
  if (local.length >= rule.max) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((local[0] + rule.windowMs - now) / 1000)), key: rule.key };
  }

  const { data, error } = await createAdminSupabase().rpc("rate_limit_hit", {
    p_key: rule.key,
    p_max: rule.max,
    p_window_seconds: Math.max(1, Math.ceil(rule.windowMs / 1000)),
  });
  if (error) {
    console.error("[rate-limit] rate_limit_hit failed", { key: rule.key, message: error.message });
    return { allowed: false, retryAfterSec: 60, key: rule.key };
  }
  const row = data?.[0];
  if (!row?.allowed) return { allowed: false, retryAfterSec: Math.max(1, row?.retry_after_seconds ?? 60), key: rule.key };

  memory.set(rule.key, [...local, now]);
  return { allowed: true };
}

/** All rules must pass; the first exhausted one is returned. */
export async function checkRateLimits(rules: RateLimitRule[]): Promise<RateLimitResult> {
  for (const rule of rules) {
    const result = await checkRateLimit(rule);
    if (!result.allowed) return result;
  }
  return { allowed: true };
}

export function rateLimitedResponse(result: Extract<RateLimitResult, { allowed: false }>, what: string): Response {
  const minutes = Math.ceil(result.retryAfterSec / 60);
  const wait = result.retryAfterSec < 60 ? `${result.retryAfterSec} sec` : `${minutes} min`;
  return Response.json(
    { ok: false, error: `${what} Try again in ${wait}.`, code: "rate_limited" },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } }
  );
}
