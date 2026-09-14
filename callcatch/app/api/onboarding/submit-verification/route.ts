/**
 * POST /api/onboarding/submit-verification — (re)submits toll-free verification (or the
 * sole-prop 10DLC registration) for the account's number. Idempotent. Also called from the
 * wizard's Finish action through the same lib function. Requires an entitled subscription:
 * a verified number turns on metered SMS/AI for the account, so no unpaid account gets one.
 */
import { getBillingGate } from "@/lib/billing/status";
import { jsonError, requireMemberAccount } from "@/lib/onboarding/account";
import { toWizardNumber } from "@/lib/onboarding/state";
import { submitVerification } from "@/lib/onboarding/submit-verification";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const auth = await requireMemberAccount();
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const { account, db, user } = auth.ctx;
  if (account.status === "cancelled") return jsonError(403, "This account is cancelled");

  const gate = await getBillingGate(account.id, db);
  if (!gate.allowed) {
    return jsonError(402, "Complete checkout before submitting carrier verification.", { code: "billing_required", reason: gate.reason, redirect: "/billing/checkout" });
  }

  const result = await submitVerification(account, user);
  if (!result.ok) {
    const status = result.code === "twilio_error" ? 502 : 400;
    return jsonError(status, result.error, { code: result.code });
  }
  return Response.json({ ok: true, already: result.already, path: result.path, verificationSid: result.verificationSid, number: toWizardNumber(result.number) });
}
