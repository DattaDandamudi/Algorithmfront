// Server-only: everything the /billing page needs, in one read.
import { createAdminSupabase } from "@/lib/db/client";
import type { SubscriptionRow } from "@/lib/db/types";
import { getPlan, type BillingInterval, type PlanId } from "@/lib/plans";
import { isInterval, isPlanId, toUiStatus, type SubscriptionUiStatus } from "@/lib/billing/plans-ui";
import { getReferralSummary, type ReferralSummary } from "@/lib/billing/referrals";
import { getUsageThisMonth, type UsageSnapshot } from "@/lib/billing/usage";

export type BillingSummary = {
  subscription: SubscriptionRow | null;
  plan: PlanId;
  interval: BillingInterval;
  /** Stripe's status, mapped for the UI. */
  rawStatus: SubscriptionUiStatus;
  /** What we show: a paid-now subscription parked in a Stripe "trial" window reads as Active. */
  status: SubscriptionUiStatus;
  paidNow: boolean;
  /** True when a customer number has passed carrier verification. */
  verified: boolean;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pauseUntil: string | null;
  usage: UsageSnapshot;
  referral: ReferralSummary;
  hasStripeCustomer: boolean;
};

export async function getBillingSummary(account: {
  id: string;
  plan: string | null;
  stripe_customer_id: string | null;
  referral_code: string | null;
}): Promise<BillingSummary> {
  const db = createAdminSupabase();

  const [{ data: sub }, { data: verifiedNumber }] = await Promise.all([
    db.from("subscriptions").select("*").eq("account_id", account.id).maybeSingle(),
    db
      .from("numbers")
      .select("id")
      .eq("account_id", account.id)
      .eq("purpose", "customer")
      .eq("verification_status", "verified")
      .limit(1)
      .maybeSingle(),
  ]);

  const plan: PlanId = isPlanId(sub?.plan) ? sub.plan : isPlanId(account.plan) ? account.plan : getPlan(account.plan).id;
  const interval: BillingInterval = isInterval(sub?.interval) ? sub.interval : "month";
  const rawStatus = toUiStatus(sub?.status);
  const paidNow = sub?.paid_now ?? false;
  const status: SubscriptionUiStatus = rawStatus === "trialing" && paidNow ? "active" : rawStatus;

  const [usage, referral] = await Promise.all([getUsageThisMonth(account.id, plan), getReferralSummary(account.id, account.referral_code)]);

  return {
    subscription: sub ?? null,
    plan,
    interval,
    rawStatus,
    status,
    paidNow,
    verified: Boolean(verifiedNumber),
    trialEnd: sub?.trial_end ?? null,
    currentPeriodEnd: sub?.current_period_end ?? null,
    cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false,
    pauseUntil: sub?.pause_until ?? null,
    usage,
    referral,
    hasStripeCustomer: Boolean(account.stripe_customer_id),
  };
}
