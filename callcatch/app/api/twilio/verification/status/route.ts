/**
 * POST /api/twilio/verification/status — Trust Hub / Toll-Free Verification / 10DLC status
 * webhook (optional; the cron polls as well). Twilio may post form-encoded or JSON; both are
 * signature-validated (JSON via `validateRequestWithBody`, which checks the bodySHA256 query
 * parameter). We only extract a SID we track — a toll-free verification (HH…), a 10DLC brand
 * registration (BN…) or a 10DLC campaign (QE…) — and re-fetch the record from the API, so the
 * payload shape never matters and the source of truth stays Twilio. Trust Hub bundle callbacks
 * (BU…/RN…) are acknowledged and ignored; the cron covers those numbers.
 */
import { after, type NextRequest } from "next/server";
import twilio from "twilio";
import { env } from "@/lib/env";
import { publicUrlFor, validateTwilioRequest } from "@/lib/telephony/client";
import { findNumberForCallbackSid, pollVerification } from "@/lib/verification/poll";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Toll-free verification (HH), 10DLC brand (BN) and 10DLC campaign (QE) SIDs. */
const TRACKED_SID_RE = /\b(?:HH|BN|QE)[0-9a-fA-F]{32}\b/;

function findSid(value: unknown, depth = 0): string | null {
  if (depth > 6 || value == null) return null;
  if (typeof value === "string") return TRACKED_SID_RE.exec(value)?.[0] ?? null;
  if (Array.isArray(value)) {
    for (const v of value) {
      const hit = findSid(v, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const hit = findSid(v, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  let payload: unknown;
  if (contentType.includes("application/json")) {
    const raw = await request.text();
    if (!env.bool("TWILIO_SKIP_SIGNATURE_VALIDATION")) {
      const signature = request.headers.get("x-twilio-signature") ?? "";
      const ok = twilio.validateRequestWithBody(env.required("TWILIO_AUTH_TOKEN"), signature, publicUrlFor(request), raw);
      if (!ok) return new Response("invalid signature", { status: 403 });
    }
    try {
      payload = JSON.parse(raw);
    } catch {
      return new Response("invalid json", { status: 400 });
    }
  } else {
    const params = await validateTwilioRequest(request);
    if (!params) return new Response("invalid signature", { status: 403 });
    payload = params;
  }

  const sid = findSid(payload);
  if (!sid) return Response.json({ ok: true, ignored: "no verification, brand or campaign sid in payload" }, { status: 202 });

  after(async () => {
    const number = await findNumberForCallbackSid(sid);
    if (!number) {
      console.warn("[verification/status] unknown sid", sid);
      return;
    }
    try {
      const result = await pollVerification(number);
      console.info("[verification/status]", { sid, numberId: number.id, ...result });
    } catch (err) {
      console.error("[verification/status] poll failed", { sid, err: err instanceof Error ? err.message : err });
    }
  });
  return new Response(null, { status: 204 });
}
