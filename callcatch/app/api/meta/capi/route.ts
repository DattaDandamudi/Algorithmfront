import { NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/utils";
import { sendCapiEvent } from "@/lib/meta/capi";

/**
 * Internal endpoint: server code (Stripe webhook, demo line, onboarding) posts
 * Meta CAPI events here. Guarded by `x-internal-secret` === INTERNAL_API_SECRET.
 * Prefer importing `sendCapiEvent` directly from server code; this route exists
 * for callers that cannot (edge runtimes, external automations).
 */

export const runtime = "nodejs";

const bodySchema = z.object({
  eventName: z.enum(["Lead", "StartTrial", "Purchase", "Subscribe", "Schedule", "CompleteRegistration"]),
  eventId: z.string().min(8).max(128),
  email: z.string().email().max(320).optional().nullable(),
  phone: z.string().min(7).max(32).optional().nullable(),
  fbc: z.string().max(512).optional().nullable(),
  fbp: z.string().max(128).optional().nullable(),
  clientIp: z.string().max(64).optional().nullable(),
  userAgent: z.string().max(1024).optional().nullable(),
  sourceUrl: z.string().url().max(2048).optional().nullable(),
  value: z.number().finite().nonnegative().optional().nullable(),
  currency: z.string().length(3).optional().nullable(),
  externalId: z.string().max(128).optional().nullable(),
  eventTime: z.number().int().positive().optional(),
  customData: z.record(z.string().max(64), z.union([z.string().max(512), z.number(), z.boolean(), z.null()])).optional(),
});

function firstForwardedIp(request: NextRequest): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}

export async function POST(request: NextRequest) {
  const secret = env.get("INTERNAL_API_SECRET");
  if (!secret) {
    return Response.json({ ok: false, error: "INTERNAL_API_SECRET not configured" }, { status: 503 });
  }
  if (!safeEqual(request.headers.get("x-internal-secret"), secret)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const b = parsed.data;

  const result = await sendCapiEvent({
    eventName: b.eventName,
    eventId: b.eventId,
    email: b.email,
    phone: b.phone,
    fbc: b.fbc,
    fbp: b.fbp,
    clientIp: b.clientIp ?? firstForwardedIp(request),
    userAgent: b.userAgent ?? request.headers.get("user-agent"),
    sourceUrl: b.sourceUrl,
    value: b.value,
    currency: b.currency,
    externalId: b.externalId,
    eventTime: b.eventTime,
    customData: b.customData,
  });

  if (result.ok) return Response.json({ ok: true, eventsReceived: result.eventsReceived, fbtraceId: result.fbtraceId });
  if ("skipped" in result && result.skipped) return Response.json({ ok: false, skipped: true, reason: result.reason }, { status: 202 });
  return Response.json({ ok: false, error: result.error }, { status: 502 });
}
