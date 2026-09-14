/**
 * POST /api/onboarding/verify-alert-phone
 *   { action: 'send', phone }  → texts a 6-digit code from TWILIO_NOTIFICATION_NUMBER
 *   { action: 'check', code }  → verifies the code; sets accounts.alert_phone_verified = true
 * Only the HMAC of the code is stored (accounts.ai_profile.alert_code).
 *
 * Abuse controls on `send` (this endpoint makes OUR verified number text a number the member typed):
 *   - the account must have completed Stripe Checkout (entitled subscription) — no free signups,
 *   - the number becomes the account's own (unverified) alert_phone; nothing else is ever targeted,
 *   - limits persisted server-side (public.rate_limits, not member-writable):
 *       5 / 10 min and 10 / day per account, 3 / hour per destination across all accounts, 300 / hour global,
 *   - every send is tracked (`alert_code_sent`) so bursts are visible in the admin event log.
 */
import type { NextRequest } from "next/server";
import type { Json } from "@/lib/db/types";
import { getBillingGate } from "@/lib/billing/status";
import { track } from "@/lib/events";
import { sendSms } from "@/lib/telephony/client";
import { jsonError, patchAiProfile, requireMemberAccount } from "@/lib/onboarding/account";
import {
  ALERT_CODE_MAX_SENDS,
  ALERT_CODE_MAX_SENDS_GLOBAL_HOUR,
  ALERT_CODE_MAX_SENDS_PER_DAY,
  ALERT_CODE_MAX_SENDS_PER_TARGET_HOUR,
  ALERT_CODE_SEND_WINDOW_MS,
  ALERT_CODE_TTL_MS,
  DAY_MS,
  HOUR_MS,
  checkCode,
  codeSmsBody,
  generateCode,
  hashCode,
} from "@/lib/onboarding/alert-code";
import { checkRateLimits, rateLimitedResponse } from "@/lib/onboarding/rate-limit";
import { verifyAlertPhoneBody } from "@/lib/onboarding/schemas";
import { parseOnboardingMeta } from "@/lib/onboarding/state";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireMemberAccount();
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const { account, db, user } = auth.ctx;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const parsed = verifyAlertPhoneBody.safeParse(raw);
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid request");
  const body = parsed.data;
  const meta = parseOnboardingMeta(account.ai_profile);

  if (body.action === "send") {
    if (account.status === "cancelled") return jsonError(403, "This account is cancelled");
    if (!account.business_phone || !account.legal_name) return jsonError(400, "Complete the business step first");
    const gate = await getBillingGate(account.id, db);
    if (!gate.allowed) {
      return jsonError(402, "Complete checkout before verifying an alert number.", { code: "billing_required", redirect: "/billing/checkout" });
    }

    const limit = await checkRateLimits([
      { key: `alert-code:acct:${account.id}`, max: ALERT_CODE_MAX_SENDS, windowMs: ALERT_CODE_SEND_WINDOW_MS },
      { key: `alert-code:acct-day:${account.id}`, max: ALERT_CODE_MAX_SENDS_PER_DAY, windowMs: DAY_MS },
      { key: `alert-code:to:${body.phone}`, max: ALERT_CODE_MAX_SENDS_PER_TARGET_HOUR, windowMs: HOUR_MS },
      { key: "alert-code:global", max: ALERT_CODE_MAX_SENDS_GLOBAL_HOUR, windowMs: HOUR_MS },
    ]);
    if (!limit.allowed) return rateLimitedResponse(limit, "Too many codes sent.");

    const code = generateCode();
    const expiresAt = new Date(Date.now() + ALERT_CODE_TTL_MS).toISOString();
    try {
      await sendSms({ to: body.phone, body: codeSmsBody(code) });
    } catch (err) {
      const message = err instanceof Error ? err.message : "SMS failed";
      console.error("[verify-alert-phone] send failed", { accountId: account.id, message });
      return jsonError(502, "We couldn't text that number. Double-check it's a mobile number.");
    }
    const alreadyVerifiedSame = account.alert_phone_verified && account.alert_phone === body.phone;
    await Promise.all([
      patchAiProfile(db, account.id, {
        alert_code: { phone: body.phone, hash: hashCode(account.id, body.phone, code), expires_at: expiresAt, attempts: 0 } as Json,
      }),
      db.from("accounts").update({ alert_phone: body.phone, alert_phone_verified: alreadyVerifiedSame }).eq("id", account.id),
      track("alert_code_sent", { phone_last4: body.phone.slice(-4) }, { accountId: account.id, userId: user.id }),
    ]);
    return Response.json({ ok: true, sent: true, expiresAt, phone: body.phone });
  }

  const result = checkCode(account.id, meta.alertCode, body.code);
  if (!result.ok) {
    if (meta.alertCode && result.reason === "mismatch") {
      await patchAiProfile(db, account.id, { alert_code: { ...meta.alertCode, attempts: meta.alertCode.attempts + 1 } as Json });
    }
    const messages: Record<typeof result.reason, string> = {
      no_code: "Send a code first.",
      expired: "That code expired. Send a new one.",
      too_many_attempts: "Too many wrong attempts. Send a new code.",
      mismatch: "That code doesn't match.",
    };
    return jsonError(400, messages[result.reason], { reason: result.reason });
  }

  const phone = meta.alertCode!.phone;
  await Promise.all([
    db.from("accounts").update({ alert_phone: phone, alert_phone_verified: true }).eq("id", account.id),
    patchAiProfile(db, account.id, { alert_code: undefined }),
  ]);
  await track("alert_phone_verified", { phone_last4: phone.slice(-4) }, { accountId: account.id, userId: user.id });
  return Response.json({ ok: true, verified: true, phone });
}
