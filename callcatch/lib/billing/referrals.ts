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
  // Codes are generated and stored lowercase; a code relayed by hand may arrive in caps.
  const code = refCode.trim().toLowerCase();
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
 * Rewards both sides once the referred account has paid an invoice.
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
 *
 * State-based and retry-safe: it is called on every paid invoice (and on checkout completion) until
 * `referrals.status = 'rewarded'`, so it must never double-credit. Every Stripe write carries an
 * idempotency key derived from the referral id, the coupon id is persisted before it is applied, and
 * each side checks Stripe for an already-applied credit before creating one — so a crash, a retry
 * days later or two webhooks racing each other converge on exactly one reward per side.
 */
export async function rewardReferral(referredAccountId: string): Promise<{ ok: boolean; reason?: string }> {
  const db = createAdminSupabase();
  const { data: referral } = await db
    .from("referrals")
    .select("id, referrer_account_id, referred_account_id, status, stripe_coupon_id")
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
  const key = `referral:${referral.id}`;
  const referredName = referred?.dba || referred?.legal_name || "a contractor you referred";
  const description = `CallCatch referral credit — ${referredName} joined`;

  // 1. The coupon: reuse the persisted one, else create it (idempotent) and persist before applying.
  let couponId = referral.stripe_coupon_id;
  if (!couponId) {
    const coupon = await s.coupons.create(
      {
        amount_off: REFERRAL_CREDIT_CENTS,
        currency: "usd",
        duration: "once",
        max_redemptions: 1,
        name: "Referral: one free month",
        metadata: { referral_id: referral.id, referrer_account_id: referrer.id, referred_account_id: referral.referred_account_id },
      },
      { idempotencyKey: `${key}:coupon` }
    );
    couponId = coupon.id;
    const { error } = await db.from("referrals").update({ stripe_coupon_id: couponId }).eq("id", referral.id).eq("status", "pending");
    if (error) throw new Error(`referrals coupon update failed: ${error.message}`);
  }

  // 2. Referrer side: the coupon on their live subscription (next invoice), else a balance credit.
  const subs = await s.subscriptions.list({ customer: referrer.stripe_customer_id, status: "all", limit: 5, expand: ["data.discounts"] });
  const target = subs.data.find((x) => x.status === "active" || x.status === "trialing" || x.status === "past_due");
  let applied: "subscription_discount" | "customer_balance" | "already_applied";
  if (target) {
    const existing = target.discounts.map((d) => (typeof d === "string" ? { id: d, coupon: null } : { id: d.id, coupon: idOf(d.source?.coupon ?? null) }));
    if (existing.some((d) => d.coupon === couponId)) {
      applied = "already_applied";
    } else {
      await s.subscriptions.update(
        target.id,
        { discounts: [...existing.map((d) => ({ discount: d.id })), { coupon: couponId }] },
        { idempotencyKey: `${key}:referrer:${target.id}` }
      );
      applied = "subscription_discount";
    }
  } else if (await hasReferralBalanceCredit(referrer.stripe_customer_id, referral.id, "referrer")) {
    applied = "already_applied";
  } else {
    await s.customers.createBalanceTransaction(
      referrer.stripe_customer_id,
      { amount: -REFERRAL_CREDIT_CENTS, currency: "usd", description, metadata: { coupon_id: couponId, referral_id: referral.id, side: "referrer" } },
      { idempotencyKey: `${key}:referrer:balance` }
    );
    applied = "customer_balance";
  }

  // 3. Referred side: balance credit against their next invoice.
  if (referred?.stripe_customer_id && !(await hasReferralBalanceCredit(referred.stripe_customer_id, referral.id, "referred"))) {
    await s.customers.createBalanceTransaction(
      referred.stripe_customer_id,
      {
        amount: -REFERRAL_CREDIT_CENTS,
        currency: "usd",
        description: "CallCatch referral credit — welcome, your next month is on us",
        metadata: { referral_id: referral.id, side: "referred" },
      },
      { idempotencyKey: `${key}:referred:balance` }
    );
  }

  const { data: flipped, error } = await db
    .from("referrals")
    .update({ status: "rewarded", stripe_coupon_id: couponId })
    .eq("id", referral.id)
    .eq("status", "pending")
    .select("id");
  if (error) throw new Error(`referrals update failed: ${error.message}`);
  if ((flipped?.length ?? 0) === 0) return { ok: true, reason: "already_rewarded" };

  await track("referral_rewarded", { referral_id: referral.id, coupon_id: couponId, applied, referred_account_id: referredAccountId }, { accountId: referrer.id });
  return { ok: true };
}

/** True when a balance credit for this referral + side already exists on the customer (retry guard beyond Stripe's 24h idempotency window). */
async function hasReferralBalanceCredit(customerId: string, referralId: string, side: "referrer" | "referred"): Promise<boolean> {
  const txns = await stripe().customers.listBalanceTransactions(customerId, { limit: 50 });
  return txns.data.some((t) => t.metadata?.referral_id === referralId && (t.metadata?.side === side || (side === "referrer" && t.metadata?.coupon_id)));
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
