// Server-only: mirrors Stripe subscription state into `subscriptions` + `accounts`.
import type Stripe from "stripe";
import { createAdminSupabase, type Db } from "@/lib/db/client";
import { sendEmail } from "@/lib/email/send";
import { env } from "@/lib/env";
import { track } from "@/lib/events";
import type { BillingInterval, PlanId } from "@/lib/plans";
import { fromUnix, idOf, stripe } from "@/lib/billing/stripe";
import { isInterval, isPlanId } from "@/lib/billing/plans-ui";

/** Terminal Stripe statuses: the subscription is gone and can be replaced by a new one. */
const TERMINAL_STATUSES = new Set(["canceled", "incomplete_expired"]);

/**
 * `events` rows the dunning cron writes when it pauses every thread of an account for
 * non-payment / cancellation (`props.conversation_ids`), and that this module consumes when the
 * account comes back to `live` so exactly those threads — and no owner-takeover pause — resume.
 */
export const DUNNING_AI_PAUSED_EVENT = "dunning_ai_paused";
export const DUNNING_AI_RESUMED_EVENT = "dunning_ai_resumed";

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

/** The recurring (plan) item on the subscription — ignores metered overage items (Starter or Pro price). */
export function planItemOf(sub: Stripe.Subscription): Stripe.SubscriptionItem | null {
  const items = sub.items?.data ?? [];
  const overageIds = new Set([process.env.STRIPE_PRICE_OVERAGE_CONVERSATION, process.env.STRIPE_PRICE_OVERAGE_CONVERSATION_PRO].filter(Boolean));
  const licensed = items.filter((it) => it.price.recurring?.usage_type !== "metered" && !overageIds.has(it.price.id));
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
    .select("id, status, paid_now, setup_fee_paid, plan, stripe_subscription_id")
    .eq("account_id", accountId)
    .maybeSingle();

  // One row per account: never let an event for a *different* Stripe subscription overwrite the
  // subscription the account actually runs on. Only a terminal tracked row may be replaced.
  if (prev && prev.stripe_subscription_id !== sub.id && !TERMINAL_STATUSES.has(prev.status)) {
    const conflict = { subscription_id: sub.id, status, tracked_subscription_id: prev.stripe_subscription_id, tracked_status: prev.status };
    if (TERMINAL_STATUSES.has(status)) {
      // A stale/duplicate subscription ended (support cancelled it, cancel_at_period_end landed…):
      // the live row and accounts.status must stay untouched.
      console.warn("[billing/sync] ignoring terminal event for untracked subscription", { accountId, ...conflict });
      await track("subscription_event_ignored", conflict, { accountId });
    } else {
      // Two live subscriptions on one account: keep the tracked one, do not overwrite, get a human
      // to cancel/refund the newcomer in Stripe. (Checkout refuses to create one; this is the backstop.)
      console.error("[billing/sync] second live subscription for account — not mirrored", { accountId, ...conflict });
      await track("duplicate_subscription_detected", conflict, { accountId });
      await alertAdminsDuplicateSubscription(accountId, conflict);
    }
    return { accountId, status: prev.status, plan: isPlanId(prev.plan) ? prev.plan : null, interval: null };
  }

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
      // Coming back from a pause/cancel (customer pause lifted, dunning recovered, re-subscribed):
      // live if a customer number is verified, else pending.
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

    // Threads the dunning cron paused for non-payment/cancellation resume with the account.
    // Owner-takeover and safe-mode pauses are not recorded there, so they stay paused.
    if (patch.status === "live" || patch.status === "pending_verification") {
      await resumeDunningPausedThreads(db, accountId);
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

/**
 * Un-pauses exactly the conversations the dunning cron paused (recorded in `events` as
 * `dunning_ai_paused` with `props.conversation_ids`), once per pause event. Never touches threads
 * the owner took over (`paused_by_user_id` set) or that were paused by anything else.
 */
export async function resumeDunningPausedThreads(db: Db, accountId: string): Promise<number> {
  const [{ data: paused }, { data: resumed }] = await Promise.all([
    db.from("events").select("id, props").eq("account_id", accountId).eq("name", DUNNING_AI_PAUSED_EVENT).order("occurred_at", { ascending: false }).limit(10),
    db.from("events").select("props").eq("account_id", accountId).eq("name", DUNNING_AI_RESUMED_EVENT).order("occurred_at", { ascending: false }).limit(10),
  ]);
  const consumed = new Set(
    (resumed ?? []).map((e) => (e.props && typeof e.props === "object" && !Array.isArray(e.props) ? e.props.paused_event_id : null)).filter((v): v is number => typeof v === "number")
  );
  let total = 0;
  for (const event of paused ?? []) {
    if (consumed.has(event.id)) continue;
    const props = event.props && typeof event.props === "object" && !Array.isArray(event.props) ? event.props : {};
    const ids = Array.isArray(props.conversation_ids) ? props.conversation_ids.filter((v): v is string => typeof v === "string") : [];
    let resumedHere = 0;
    let failed = false;
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await db
        .from("conversations")
        .update({ ai_paused: false })
        .eq("account_id", accountId)
        .in("id", ids.slice(i, i + 100))
        .eq("ai_paused", true)
        .is("paused_by_user_id", null)
        .select("id");
      if (error) {
        console.error("[billing/sync] dunning un-pause failed", { accountId, err: error.message });
        failed = true;
        break;
      }
      resumedHere += data?.length ?? 0;
    }
    if (failed) continue; // not marked consumed: retried on the next status change
    total += resumedHere;
    await track(DUNNING_AI_RESUMED_EVENT, { paused_event_id: event.id, conversation_ids: ids, resumed: resumedHere }, { accountId });
  }
  return total;
}

async function alertAdminsDuplicateSubscription(accountId: string, conflict: Record<string, string>): Promise<void> {
  const admins = env.adminEmails();
  if (admins.length === 0) return;
  const text = [
    `Account ${accountId} has two live Stripe subscriptions.`,
    `Tracked (kept): ${conflict.tracked_subscription_id} (${conflict.tracked_status})`,
    `Incoming (ignored, still billing at Stripe): ${conflict.subscription_id} (${conflict.status})`,
    "Cancel and refund the duplicate in the Stripe dashboard; the app keeps mirroring the tracked one.",
  ].join("\n");
  try {
    await sendEmail({ to: admins, subject: `Duplicate Stripe subscription: account ${accountId}`, html: `<pre>${text}</pre>`, text, tags: [{ name: "type", value: "billing_alert" }] });
  } catch (err) {
    console.error("[billing/sync] admin alert failed", err);
  }
}

/** Retrieves the subscription with the price expanded and syncs it. */
export async function syncSubscriptionById(subscriptionId: string, opts: SyncOptions = {}): Promise<SyncResult | null> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
  return syncSubscriptionFromStripe(sub, opts);
}
