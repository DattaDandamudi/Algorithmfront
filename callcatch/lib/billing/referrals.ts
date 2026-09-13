// Server-only: referral bookkeeping + Stripe credits.
import { createAdminSupabase } from "@/lib/db/client";
import { env } from "@/lib/env";
import { track } from "@/lib/events";
import { PLANS } from "@/lib/plans";
import { idOf, stripe } from "@/lib/billing/stripe";

/** Cookie a signup page may set from `/signup?ref=CODE` so the code survives auth redirects. */
export const REFERRAL_COOKIE = "cc_ref";

/** One free Starter month for each side, in cents. */
export const REFERRAL_CREDIT_CENTS = PLANS.starter.priceMonthlyUsd * 100;

export function referralLinkFor(code: string | null | undefined): string {
  return `${env.appUrl()}/signup?ref=${encodeURIComponent(code ?? "")}`;
}

/**
 * Records who referred a new account at checkout time (idempotent).
 * Creates the `referrals` row as `pending`; it flips to `rewarded` on the first paid invoice.
 */
export async function applyReferralOnCheckout(accountId: string, refCode: string): Promise<{ ok: boolean; referrerAccountId?: string; reason?: string }> {
  const db = createAdminSupabase();
  const code = refCode.trim();
  if (!code) return { ok: false, reason: "empty_code" };

  const { data: referrer } = await db.from("accounts").select("id").eq("referral_code", code).neq("id", accountId).maybeSingle();
  if (!referrer) return { ok: false, reason: "unknown_code" };

  const { data: referred } = await db.from("accounts").select("id, referred_by_account_id").eq("id", accountId).maybeSingle();
  if (!referred) return { ok: false, reason: "account_not_found" };
  if (referred.referred_by_account_id && referred.referred_by_account_id !== referrer.id) {
    return { ok: false, reason: "already_referred" };
  }

  if (!referred.referred_by_account_id) {
    const { error } = await db.from("accounts").update({ referred_by_account_id: referrer.id }).eq("id", accountId);
    if (error) throw new Error(`accounts.referred_by update failed: ${error.message}`);
  }

  const { data: existing } = await db.from("referrals").select("id").eq("referred_account_id", accountId).maybeSingle();
  if (!existing) {
    const { error } = await db.from("referrals").insert({
      referrer_account_id: referrer.id,
      referred_account_id: accountId,
      status: "pending",
    });
    if (error && !/duplicate|unique/i.test(error.message)) throw new Error(`referrals insert failed: ${error.message}`);
  }

  await track("referral_applied", { referrer_account_id: referrer.id, code }, { accountId });
  return { ok: true, referrerAccountId: referrer.id };
}

/**
 * Rewards both sides once the referred account pays its first invoice.
 *
 * Mechanism (documented choice):
 *  - We create a single-use Stripe coupon ($79 off, `duration: 'once'`) so the reward is a first-class,
 *    auditable object in the Stripe dashboard, and store its id in `referrals.stripe_coupon_id`.
 *  - The coupon is attached to the *referrer's subscription* as a discount (Stripe applies a `once`
 *    discount to the next invoice). Customer-level `coupon` no longer exists in this API version, and
 *    subscription discounts stack, so an existing promo code is preserved rather than replaced.
 *  - If the referrer has no active subscription to attach to (e.g. canceled), we fall back to a
 *    customer balance credit of the same amount, which Stripe applies to whatever they pay next.
 *  - The *referred* account already paid its first invoice, so its "free month" is a customer balance
 *    credit consumed by its next invoice (a Checkout coupon would collide with `allow_promotion_codes`).
 * Idempotent via `referrals.status`.
 */
export async function rewardReferral(referredAccountId: string): Promise<{ ok: boolean; reason?: string }> {
  const db = createAdminSupabase();
  const { data: referral } = await db
    .from("referrals")
    .select("id, referrer_account_id, referred_account_id, status")
    .eq("referred_account_id", referredAccountId)
    .maybeSingle();
  if (!referral) return { ok: false, reason: "no_referral" };
  if (referral.status === "rewarded") return { ok: true, reason: "already_rewarded" };

  const [{ data: referrer }, { data: referred }] = await Promise.all([
    db.from("accounts").select("id, stripe_customer_id, dba, legal_name").eq("id", referral.referrer_account_id).maybeSingle(),
    db.from("accounts").select("id, stripe_customer_id, dba, legal_name").eq("id", referral.referred_account_id).maybeSingle(),
  ]);
  if (!referrer?.stripe_customer_id) return { ok: false, reason: "referrer_has_no_customer" };

  const s = stripe();
  const referredName = referred?.dba || referred?.legal_name || "a contractor you referred";
  const description = `CallCatch referral credit — ${referredName} joined`;

  const coupon = await s.coupons.create({
    amount_off: REFERRAL_CREDIT_CENTS,
    currency: "usd",
    duration: "once",
    max_redemptions: 1,
    name: "Referral: one free month",
    metadata: { referral_id: referral.id, referrer_account_id: referrer.id, referred_account_id: referral.referred_account_id },
  });

  // Attach to the referrer's live subscription (next invoice) or fall back to a balance credit.
  const subs = await s.subscriptions.list({ customer: referrer.stripe_customer_id, status: "all", limit: 5 });
  const target = subs.data.find((x) => x.status === "active" || x.status === "trialing" || x.status === "past_due");
  let applied: "subscription_discount" | "customer_balance";
  if (target) {
    const existing = target.discounts.map((d) => ({ discount: idOf(d) ?? "" })).filter((d) => d.discount);
    await s.subscriptions.update(target.id, { discounts: [...existing, { coupon: coupon.id }] });
    applied = "subscription_discount";
  } else {
    await s.customers.createBalanceTransaction(referrer.stripe_customer_id, {
      amount: -REFERRAL_CREDIT_CENTS,
      currency: "usd",
      description,
      metadata: { coupon_id: coupon.id, referral_id: referral.id },
    });
    applied = "customer_balance";
  }

  // Referred side: balance credit against their next invoice.
  if (referred?.stripe_customer_id) {
    await s.customers.createBalanceTransaction(referred.stripe_customer_id, {
      amount: -REFERRAL_CREDIT_CENTS,
      currency: "usd",
      description: "CallCatch referral credit — welcome, your next month is on us",
      metadata: { referral_id: referral.id },
    });
  }

  const { error } = await db
    .from("referrals")
    .update({ status: "rewarded", stripe_coupon_id: coupon.id })
    .eq("id", referral.id)
    .eq("status", "pending");
  if (error) throw new Error(`referrals update failed: ${error.message}`);

  await track("referral_rewarded", { referral_id: referral.id, coupon_id: coupon.id, applied, referred_account_id: referredAccountId }, { accountId: referrer.id });
  return { ok: true };
}

export type ReferralSummary = {
  code: string | null;
  link: string;
  pending: number;
  rewarded: number;
  creditUsd: number;
};

export async function getReferralSummary(accountId: string, referralCode: string | null): Promise<ReferralSummary> {
  const db = createAdminSupabase();
  const { data } = await db.from("referrals").select("status").eq("referrer_account_id", accountId);
  const rows = data ?? [];
  return {
    code: referralCode,
    link: referralLinkFor(referralCode),
    pending: rows.filter((r) => r.status === "pending").length,
    rewarded: rows.filter((r) => r.status === "rewarded").length,
    creditUsd: REFERRAL_CREDIT_CENTS / 100,
  };
}
