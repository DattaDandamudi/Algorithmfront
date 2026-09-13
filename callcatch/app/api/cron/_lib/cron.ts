/**
 * Shared helpers for /api/cron/* routes (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`).
 * `_lib` is a private folder: Next.js never routes it.
 */
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/utils";

export function authorizeCron(request: Request): Response | null {
  const secret = env.get("CRON_SECRET");
  if (!secret) return Response.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 503 });
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!safeEqual(token, secret)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return null;
}

export function cronResponse(name: string, startedAt: number, counts: Record<string, number>, extra: Record<string, unknown> = {}): Response {
  const durationMs = Date.now() - startedAt;
  console.info(`[cron:${name}]`, { durationMs, ...counts, ...extra });
  return Response.json({ ok: true, cron: name, durationMs, ...counts, ...extra }, { headers: { "Cache-Control": "no-store" } });
}

export function cronError(name: string, startedAt: number, err: unknown, counts: Record<string, number> = {}): Response {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[cron:${name}] failed`, { message, ...counts });
  return Response.json({ ok: false, cron: name, durationMs: Date.now() - startedAt, error: message, ...counts }, { status: 500 });
}

/** First day of the UTC month containing `d`, as YYYY-MM-01. */
export function periodOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function previousPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return periodOf(d);
}

export function nextPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return periodOf(new Date(Date.UTC(y, m, 1)));
}
