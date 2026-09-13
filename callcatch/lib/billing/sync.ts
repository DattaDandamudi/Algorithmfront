// Server-only: mirrors Stripe subscription state into `subscriptions` + `accounts`.
import type Stripe from "stripe";
import { createAdminSupabase } from "@/lib/db/client";
import { track } from "@/lib/events";
import type { BillingInterval, PlanId } from "@/lib/plans";
import { fromUnix, idOf, stripe } from "@/lib/billing/stripe";
import { isInterval, isPlanId } from "@/lib/billing/plans-ui";

export type SyncOptions = {
  /** Set from `checkout.session.completed` metadata; preserved on later updates when omitted. */
  paidNow?: boolean;
  setupFeePaid?: boolean;
  /** Explicit account id (when the caller already knows it). */
  accountId?: string;
};

export type SyncResult = {
  accountId: string;
  status: string;
  plan: PlanId | null;
  interval: BillingInterval | null;
};

/** Reverse-maps a Stripe price id to a plan + interval using the configured env price ids. */
export function planForPriceId(priceId: string | null | undefined): { plan: PlanId; interval: BillingInterval } | null {
  if (!priceId) return null;
  const table: Array<[string, PlanId, BillingInterval]> = [
    ["STRIPE_PRICE_STARTER_MONTHLY", "starter", "month"],
    ["STRIPE_PRICE_STARTER_ANNUAL", "starter", "year"],
    ["STRIPE_PRICE_PRO_MONTHLY", "pro", "month"],
    ["STRIPE_PRICE_PRO_ANNUAL", "pro", "year"],
  ];
  for (const [key, plan, interval] of table) {
    if (process.env[key] && process.env[key] === priceId) return { plan, interval };
  }
  return null;
}

/** The recurring (plan) item on the subscription — ignores metered overage items. */
export function planItemOf(sub: Stripe.Subscription): Stripe.SubscriptionItem | null {
  const items = sub.items?.data ?? [];
  const overage = process.env.STRIPE_PRICE_OVERAGE_CONVERSATION;
  const licensed = items.filter((it) => it.price.recurring?.usage_type !== "metered" && it.price.id !== overage);
  return licensed[0] ?? items[0] ?? null;
}

/**
 * Local status derived from Stripe's. With API version 2026-08-26 a subscription whose
 * collection is paused keeps `status: 'active'` and carries `pause_collection`; we surface
 * that as `paused` so the app (and the AI) stop for the pause window.
 */
export function deriveStatus(sub: Stripe.Subscription): string {
  if (sub.pause_collection) return "paused";
  return sub.status;
}

/** `current_period_end` lives on subscription items in this API version; take the latest. */
export function currentPeriodEnd(sub: Stripe.Subscription): string | null {
  const ends = (sub.items?.data ?? []).map((it) => it.current_period_end).filter((n): n is number => typeof n === "number");
  if (ends.length === 0) return null;
  return fromUnix(Math.max(...ends));
}

async function resolveAccountId(sub: Stripe.Subscription, explicit?: string): Promise<string | null> {
  if (explicit) return explicit;
  const fromMeta = sub.metadata?.account_id;
  if (fromMeta) return fromMeta;
  const db = createAdminSupabase();
  const { data: existing } = await db
    .from("subscriptions")
    .select("account_id")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();
  if (existing) return existing.account_id;
  const customerId = idOf(sub.customer);
  if (customerId) {
    const { data: acct } = await db.from("accounts").select("id").eq("stripe_customer_id", customerId).maybeSingle();
    if (acct) return acct.id;
  }
  return null;
}

/**
 * Upserts the `subscriptions` row and keeps `accounts.plan` / `accounts.status` coherent.
 * Shared by every subscription-shaped webhook and by the pause/upgrade Server Functions.
 */
export async function syncSubscriptionFromStripe(sub: Stripe.Subscription, opts: SyncOptions = {}): Promise<SyncResult | null> {
  const accountId = await resolveAccountId(sub, opts.accountId);
  if (!accountId) {
    console.warn("[billing/sync] no account for subscription", sub.id);
    return null;
  }

  const db = createAdminSupabase();
  const item = planItemOf(sub);
  const priceId = item?.price.id ?? null;
  const mapped = planForPriceId(priceId);
  const metaPlan = sub.metadata?.plan;
  const metaInterval = sub.metadata?.interval;
  const plan: PlanId | null = mapped?.plan ?? (isPlanId(metaPlan) ? metaPlan : null);
  const priceInterval = item?.price.recurring?.interval;
  const interval: BillingInterval | null =
    mapped?.interval ?? (isInterval(priceInterval) ? priceInterval : isInterval(metaInterval) ? metaInterval : null);

  const status = deriveStatus(sub);
  const pauseUntil = sub.pause_collection?.resumes_at ? fromUnix(sub.pause_collection.resumes_at)?.slice(0, 10) ?? null : null;

  const { data: prev } = await db
    .from("subscriptions")
    .select("id, status, paid_now, setup_fee_paid, plan")
    .eq("account_id", accountId)
    .maybeSingle();

  const paidNow = opts.paidNow ?? prev?.paid_now ?? sub.metadata?.path === "paynow";
  const setupFeePaid = opts.setupFeePaid ?? prev?.setup_fee_paid ?? false;

  const row = {
    account_id: accountId,
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId,
    plan,
    interval,
    status,
    trial_end: fromUnix(sub.trial_end),
    current_period_end: currentPeriodEnd(sub),
    setup_fee_paid: setupFeePaid,
    paid_now: paidNow,
    cancel_at_period_end: sub.cancel_at_period_end,
    pause_until: pauseUntil,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await db.from("subscriptions").upsert(row, { onConflict: "account_id" });
  if (upsertError) throw new Error(`subscriptions upsert failed: ${upsertError.message}`);

  // accounts.plan / accounts.status — module d is the only writer of these.
  const { data: account } = await db.from("accounts").select("id, plan, status, stripe_customer_id").eq("id", accountId).maybeSingle();
  if (account) {
    const patch: { plan?: string; status?: string; stripe_customer_id?: string } = {};
    if (plan && account.plan !== plan) patch.plan = plan;
    const customerId = idOf(sub.customer);
    if (customerId && !account.stripe_customer_id) patch.stripe_customer_id = customerId;

    if (status === "canceled" || status === "incomplete_expired") {
      if (account.status !== "cancelled") patch.status = "cancelled";
    } else if (status === "paused") {
      if (account.status !== "paused" && account.status !== "onboarding") patch.status = "paused";
    } else if (status === "active" || status === "trialing" || status === "past_due") {
      // Coming back from a pause/cancel: live if a customer number is verified, else pending.
      if (account.status === "paused" || account.status === "cancelled") {
        const { data: verified } = await db
          .from("numbers")
          .select("id")
          .eq("account_id", accountId)
          .eq("purpose", "customer")
          .eq("verification_status", "verified")
          .limit(1)
          .maybeSingle();
        patch.status = verified ? "live" : "pending_verification";
      }
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await db.from("accounts").update(patch).eq("id", accountId);
      if (error) throw new Error(`accounts update failed: ${error.message}`);
    }
  }

  if (prev?.status !== status) {
    await track("subscription_status_changed", { from: prev?.status ?? null, to: status, plan, interval, subscription_id: sub.id }, { accountId });
    if (status === "active" && prev?.status !== "active") await track("subscription_active", { plan, interval }, { accountId });
    if (status === "canceled") await track("subscription_canceled", { plan, interval, at: sub.canceled_at ?? null }, { accountId });
    if (status === "paused") await track("subscription_paused", { until: pauseUntil }, { accountId });
  }
  if (prev && plan && prev.plan && prev.plan !== plan) {
    await track("plan_changed", { from: prev.plan, to: plan }, { accountId });
  }

  return { accountId, status, plan, interval };
}

/** Retrieves the subscription with the price expanded and syncs it. */
export async function syncSubscriptionById(subscriptionId: string, opts: SyncOptions = {}): Promise<SyncResult | null> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
  return syncSubscriptionFromStripe(sub, opts);
}
