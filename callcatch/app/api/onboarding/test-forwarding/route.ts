/**
 * "Test my forwarding".
 *  POST → places an outbound call from TWILIO_NOTIFICATION_NUMBER to accounts.business_phone with
 *         TwiML at /api/twilio/voice/test-outbound (module c). Stores the attempt in
 *         accounts.ai_profile.forwarding_test. Rate-limited 5 / 10 min per account.
 *  GET ?attemptId= → { seen } once a `calls` row with status 'test' for this account has started
 *         after the attempt (module c's inbound webhook writes it when the carrier forwards the ring).
 */
import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import type { Json } from "@/lib/db/types";
import { env } from "@/lib/env";
import { track } from "@/lib/events";
import { twilioClient } from "@/lib/telephony/client";
import { jsonError, patchAiProfile, requireMemberAccount } from "@/lib/onboarding/account";
import { checkRateLimit } from "@/lib/onboarding/rate-limit";
import { testForwardingQuery } from "@/lib/onboarding/schemas";
import { parseOnboardingMeta } from "@/lib/onboarding/state";

export const runtime = "nodejs";
export const maxDuration = 30;

const TEST_CALL_TIMEOUT_SEC = 25;

export async function POST() {
  const auth = await requireMemberAccount();
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const { account, db } = auth.ctx;
  if (!account.business_phone) return jsonError(400, "Add your business phone in step 1 first");

  const meta = parseOnboardingMeta(account.ai_profile);
  const limit = checkRateLimit(`test-forwarding:${account.id}`, meta.forwardingTest?.sent_at ?? [], { max: 5, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return Response.json({ ok: false, error: `Too many test calls. Try again in ${Math.ceil(limit.retryAfterSec / 60)} min.` }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
  }

  const attemptId = randomUUID();
  const startedAt = new Date().toISOString();
  const from = env.required("TWILIO_NOTIFICATION_NUMBER");

  let callSid: string | null = null;
  try {
    const call = await twilioClient().calls.create({
      to: account.business_phone,
      from,
      url: `${env.appUrl()}/api/twilio/voice/test-outbound`,
      method: "POST",
      timeout: TEST_CALL_TIMEOUT_SEC,
      // machineDetection intentionally off: we want the ring to time out and forward, not be answered.
    });
    callSid = call.sid;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Twilio call failed";
    console.error("[test-forwarding] call failed", { accountId: account.id, message });
    return jsonError(502, message);
  }

  await patchAiProfile(db, account.id, {
    forwarding_test: { attempt_id: attemptId, started_at: startedAt, call_sid: callSid, seen_at: null, sent_at: limit.timestamps } as Json,
  });
  await track("forwarding_test_started", { attempt_id: attemptId, call_sid: callSid }, { accountId: account.id, userId: auth.ctx.user.id });

  return Response.json({ ok: true, attemptId, startedAt, callSid });
}

export async function GET(request: NextRequest) {
  const auth = await requireMemberAccount();
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const { account, db } = auth.ctx;

  const parsed = testForwardingQuery.safeParse({ attemptId: request.nextUrl.searchParams.get("attemptId") });
  if (!parsed.success) return jsonError(400, "attemptId required");

  const meta = parseOnboardingMeta(account.ai_profile);
  const attempt = meta.forwardingTest;
  if (!attempt || attempt.attempt_id !== parsed.data.attemptId) return jsonError(404, "Unknown attempt");

  if (attempt.seen_at) return Response.json({ ok: true, seen: true, seenAt: attempt.seen_at, outboundStatus: "completed" });

  // Allow a little clock skew between the outbound create and the inbound webhook's started_at.
  const floor = new Date(Date.parse(attempt.started_at) - 15_000).toISOString();
  const { data: rows } = await db
    .from("calls")
    .select("id, started_at, forwarded_from")
    .eq("account_id", account.id)
    .eq("status", "test")
    .gte("started_at", floor)
    .order("started_at", { ascending: false })
    .limit(1);
  const hit = rows?.[0] ?? null;

  let outboundStatus: string | null = null;
  if (attempt.call_sid) {
    try {
      outboundStatus = (await twilioClient().calls(attempt.call_sid).fetch()).status;
    } catch {
      outboundStatus = null;
    }
  }

  if (!hit) return Response.json({ ok: true, seen: false, outboundStatus });

  const seenAt = new Date().toISOString();
  await patchAiProfile(db, account.id, {
    forwarding_test: { ...attempt, seen_at: seenAt } as Json,
    forwarding: { ...(meta.forwarding.carrier ? { carrier: meta.forwarding.carrier } : {}), attested: meta.forwarding.attested, confirmed_at: seenAt } as Json,
  });
  return Response.json({ ok: true, seen: true, seenAt, callId: hit.id, forwardedFrom: hit.forwarded_from, outboundStatus });
}
