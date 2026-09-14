/**
 * POST /api/onboarding/provision-number — buys the account's number (toll-free, or local on the
 * sole-prop path), attaches the module-c webhooks and inserts the `numbers` row. Idempotent.
 * Auth: Supabase session + account membership + an entitled subscription (a number is a real
 * monthly Twilio cost; nothing is bought for an account that has not completed Checkout).
 */
import { getBillingGate } from "@/lib/billing/status";
import { jsonError, requireMemberAccount } from "@/lib/onboarding/account";
import { provisionNumber } from "@/lib/onboarding/provision";
import { toWizardNumber } from "@/lib/onboarding/state";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST() {
  const auth = await requireMemberAccount();
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const { account, db } = auth.ctx;
  if (account.status === "cancelled") return jsonError(403, "This account is cancelled");
  if (!account.business_phone || !account.legal_name) return jsonError(400, "Complete the business step first");

  const gate = await getBillingGate(account.id, db);
  if (!gate.allowed) {
    return jsonError(402, "Complete checkout first — add a payment method under Billing to reserve your number.", {
      code: "billing_required",
      reason: gate.reason,
      redirect: "/billing/checkout",
    });
  }

  try {
    const { number, created } = await provisionNumber(account);
    return Response.json({ ok: true, created, number: toWizardNumber(number) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Provisioning failed";
    console.error("[provision-number]", { accountId: account.id, message });
    return jsonError(502, message);
  }
}
