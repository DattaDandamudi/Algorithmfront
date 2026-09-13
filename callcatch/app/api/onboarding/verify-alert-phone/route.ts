/**
 * POST /api/onboarding/verify-alert-phone
 *   { action: 'send', phone }  → texts a 6-digit code from TWILIO_NOTIFICATION_NUMBER (5 sends / 10 min)
 *   { action: 'check', code }  → verifies the code; sets accounts.alert_phone_verified = true
 * Only the HMAC of the code is stored (accounts.ai_profile.alert_code).
 */
import type { NextRequest } from "next/server";
import type { Json } from "@/lib/db/types";
import { track } from "@/lib/events";
import { sendSms } from "@/lib/telephony/client";
import { jsonError, patchAiProfile, requireMemberAccount } from "@/lib/onboarding/account";
import { ALERT_CODE_MAX_SENDS, ALERT_CODE_SEND_WINDOW_MS, ALERT_CODE_TTL_MS, checkCode, codeSmsBody, generateCode, hashCode } from "@/lib/onboarding/alert-code";
import { checkRateLimit } from "@/lib/onboarding/rate-limit";
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
    const limit = checkRateLimit(`alert-code:${account.id}`, meta.alertCode?.sent_at ?? [], { max: ALERT_CODE_MAX_SENDS, windowMs: ALERT_CODE_SEND_WINDOW_MS });
    if (!limit.allowed) {
      return Response.json({ ok: false, error: `Too many codes sent. Try again in ${Math.ceil(limit.retryAfterSec / 60)} min.` }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
    }
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
        alert_code: { phone: body.phone, hash: hashCode(account.id, body.phone, code), expires_at: expiresAt, attempts: 0, sent_at: limit.timestamps } as Json,
      }),
      db.from("accounts").update({ alert_phone: body.phone, alert_phone_verified: alreadyVerifiedSame }).eq("id", account.id),
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
