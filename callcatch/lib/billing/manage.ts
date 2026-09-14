// Server-only: Customer Portal, pause/resume, in-place upgrades.
import { z } from "zod";
import type Stripe from "stripe";
import { createAdminSupabase } from "@/lib/db/client";
import { env } from "@/lib/env";
import { track } from "@/lib/events";
import { stripePriceIdFor, type BillingInterval, type PlanId } from "@/lib/plans";
import { sendPausedConfirmation } from "@/lib/billing/emails";
import { planItemOf, syncSubscriptionFromStripe } from "@/lib/billing/sync";
import { stripe, toUnix } from "@/lib/billing/stripe";
import { isOverageItem, overagePriceIdFor } from "@/lib/billing/usage";

export const MAX_PAUSE_MONTHS = 2;
export const pauseMonthsSchema = z.coerce.number().int().min(1).max(MAX_PAUSE_MONTHS);

type AccountLite = { id: string; stripe_customer_id: string | null; alert_email: string | null; legal_name: string | null; dba: string | null };

async function loadAccount(accountId: string): Promise<AccountLite> {
  const db = createAdminSupabase();
  const { data, error } = await db.from("accounts").select("id, stripe_customer_id, alert_email, legal_name, dba").eq("id", accountId).maybeSingle();
  if (error) throw new Error(`accounts lookup failed: ${error.message}`);
  if (!data) throw new Error("Account not found");
  return data;
}

type SubscriptionLite = { stripe_subscription_id: string; status: string; paid_now: boolean };

/** The account's live subscription row, or null when there is none to act on. */
async function loadSubscription(accountId: string): Promise<SubscriptionLite | null> {
  const db = createAdminSupabase();
  const { data } = await db.from("subscriptions").select("stripe_subscription_id, status, paid_now").eq("account_id", accountId).maybeSingle();
  if (!data || data.status === "canceled" || data.status === "incomplete_expired") return null;
  return data;
}

async function loadSubscriptionId(accountId: string): Promise<string | null> {
  return (await loadSubscription(accountId))?.stripe_subscription_id ?? null;
}

export type PortalFlow = "home" | "cancel" | "payment_method" | "update_plan";

/** Customer Portal session; `flow` deep-links to cancel / update card. Returns the hosted URL. */
export async function createPortalSession(accountId: string, flow: PortalFlow = "home"): Promise<string> {
  const account = await loadAccount(accountId);
  if (!account.stripe_customer_id) throw new Error("No Stripe customer yet — complete checkout first.");
  const returnUrl = `${env.appUrl()}/billing`;
  const subscriptionId = flow === "cancel" || flow === "update_plan" ? await loadSubscriptionId(accountId) : null;

  const session = await stripe().billingPortal.sessions.create({
    customer: account.stripe_customer_id,
    return_url: returnUrl,
    ...(flow === "cancel" && subscriptionId
      ? { flow_data: { type: "subscription_cancel", subscription_cancel: { subscription: subscriptionId }, after_completion: { type: "redirect", redirect: { return_url: returnUrl } } } }
      : {}),
    ...(flow === "update_plan" && subscriptionId
      ? { flow_data: { type: "subscription_update", subscription_update: { subscription: subscriptionId } } }
      : {}),
    ...(flow === "payment_method" ? { flow_data: { type: "payment_method_update", after_completion: { type: "redirect", redirect: { return_url: returnUrl } } } } : {}),
  });
  await track("portal_opened", { flow }, { accountId });
  return session.url;
}

/**
 * Pause collection for 1–2 months (winter dip). Stripe keeps the subscription `active` with
 * `pause_collection` set; invoices generated in the window are voided (`behavior: 'void'`) and
 * collection resumes automatically at `resumes_at`. Our sync maps that to status `paused`.
 */
export async function pauseSubscription(accountId: string, months: number): Promise<{ resumesAt: string }> {
  const m = pauseMonthsSchema.parse(months);
  const subscriptionId = await loadSubscriptionId(accountId);
  if (!subscriptionId) throw new Error("No active subscription to pause.");
  const account = await loadAccount(accountId);

  const resumesAt = new Date();
  resumesAt.setUTCMonth(resumesAt.getUTCMonth() + m);

  const updated = await stripe().subscriptions.update(subscriptionId, {
    pause_collection: { behavior: "void", resumes_at: toUnix(resumesAt) },
    metadata: { paused_by: "customer", paused_months: String(m) },
  });
  await syncSubscriptionFromStripe(updated, { accountId });

  if (account.alert_email) {
    try {
      await sendPausedConfirmation({ to: account.alert_email, businessName: account.dba || account.legal_name || "there", resumesOnIso: resumesAt.toISOString() });
    } catch (err) {
      console.error("[billing/pause] confirmation email failed", err);
    }
  }
  return { resumesAt: resumesAt.toISOString() };
}

/** Lifts a pause early. */
export async function resumeSubscription(accountId: string): Promise<void> {
  const subscriptionId = await loadSubscriptionId(accountId);
  if (!subscriptionId) throw new Error("No subscription to resume.");
  const updated = await stripe().subscriptions.update(subscriptionId, { pause_collection: "" });
  await syncSubscriptionFromStripe(updated, { accountId });
  await track("subscription_resumed", {}, { accountId });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Swaps the plan price in place, keeping the interval. Returns null when there is no subscription
 * to change (caller should send them to Checkout).
 *
 * Proration:
 *  - active subscription: Stripe invoices the prorated difference immediately (`always_invoice`).
 *  - real self-serve trial (`paid_now = false`, Stripe `trialing`): price just changes (`none`).
 *  - pay-now subscription *parked* in a Stripe trial window by `onVerified()` (`paid_now = true`,
 *    Stripe `trialing`): Stripe sees a $0 trial and would prorate nothing, so the customer would get
 *    the upgrade free for the rest of the paid month. We prorate by hand: charge the remaining
 *    fraction of (new − old) on a one-off invoice before swapping (upgrade), or credit it to the
 *    customer balance for the next invoice (downgrade). Idempotency keys make a retried Server
 *    Action safe.
 *
 * The metered overage item, when present, is swapped to the new plan's overage price in the same
 * update so overage is billed at the new plan's rate from the moment of the change (never two
 * metered items on one meter).
 */
export async function changePlan(accountId: string, plan: PlanId): Promise<{ plan: PlanId; interval: BillingInterval } | null> {
  const row = await loadSubscription(accountId);
  if (!row) return null;

  const s = stripe();
  const sub = await s.subscriptions.retrieve(row.stripe_subscription_id, { expand: ["items.data.price"] });
  const item = planItemOf(sub);
  if (!item) throw new Error("Subscription has no plan item.");
  const interval: BillingInterval = item.price.recurring?.interval === "year" ? "year" : "month";
  const newPrice = stripePriceIdFor(plan, interval);
  if (item.price.id === newPrice) return { plan, interval };

  const parked = sub.status === "trialing" && (row.paid_now || sub.metadata?.anchored_paid_month === "1") && typeof sub.trial_end === "number";
  if (parked) await prorateParkedPeriod(accountId, sub, item, newPrice);

  const items: Stripe.SubscriptionUpdateParams.Item[] = [{ id: item.id, price: newPrice, quantity: 1 }];
  const overageItem = sub.items.data.find((it) => it.id !== item.id && isOverageItem(it));
  if (overageItem) {
    const overagePrice = overagePriceIdFor(plan);
    if (overageItem.price.id !== overagePrice) items.push({ id: overageItem.id, price: overagePrice });
  }

  const updated = await s.subscriptions.update(sub.id, {
    items,
    // Stripe never prorates inside a trial window; the parked case was prorated by hand above.
    proration_behavior: sub.status === "trialing" ? "none" : "always_invoice",
    metadata: { plan, interval },
    expand: ["items.data.price"],
  });
  await syncSubscriptionFromStripe(updated, { accountId });
  await track("plan_change_requested", { to: plan, interval, parked_proration: parked }, { accountId });
  return { plan, interval };
}

/**
 * Manual proration for a pay-now subscription parked in a Stripe trial window (see `changePlan`).
 * window = [verified_at (metadata, set by onVerified) | item.current_period_start, trial_end].
 * delta = round((new − old) × remaining fraction). > 0: one-off invoice, charged now — the plan is
 * not swapped if the charge fails. < 0: customer balance credit consumed by the next invoice.
 */
async function prorateParkedPeriod(accountId: string, sub: Stripe.Subscription, item: Stripe.SubscriptionItem, newPriceId: string): Promise<void> {
  const s = stripe();
  const windowEnd = sub.trial_end as number;
  const verifiedAt = sub.metadata?.verified_at ? Date.parse(sub.metadata.verified_at) : Number.NaN;
  const windowStart = Number.isFinite(verifiedAt) ? Math.floor(verifiedAt / 1000) : item.current_period_start;
  const nowSec = Math.floor(Date.now() / 1000);
  // Whole days so that a retried Server Action the same day sends identical params under the same
  // idempotency key (Stripe rejects a reused key with different params).
  const totalDays = Math.max(1, Math.round(((windowEnd - windowStart) * 1000) / DAY_MS));
  const remainingDays = Math.min(totalDays, Math.max(0, Math.ceil(((windowEnd - nowSec) * 1000) / DAY_MS)));
  const fraction = remainingDays / totalDays;

  const newPrice = await s.prices.retrieve(newPriceId);
  const oldAmount = item.price.unit_amount ?? 0;
  const newAmount = newPrice.unit_amount ?? 0;
  const currency = item.price.currency;
  const delta = Math.round((newAmount - oldAmount) * fraction);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const key = `changeplan:${sub.id}:${newPriceId}:${windowEnd}:${remainingDays}`;

  if (delta > 0) {
    const description = `Plan change: prorated difference for the remaining ${remainingDays} day${remainingDays === 1 ? "" : "s"} of your current period`;
    const invoice = await s.invoices.create(
      { customer: customerId, auto_advance: false, collection_method: "charge_automatically", pending_invoice_items_behavior: "exclude", description, metadata: { account_id: accountId, reason: "plan_change_proration", subscription_id: sub.id } },
      { idempotencyKey: `${key}:invoice` }
    );
    await s.invoiceItems.create(
      { customer: customerId, invoice: invoice.id, amount: delta, currency, description, metadata: { account_id: accountId, subscription_id: sub.id } },
      { idempotencyKey: `${key}:item` }
    );
    try {
      await s.invoices.finalizeInvoice(invoice.id, {}, { idempotencyKey: `${key}:finalize` });
      const paid = await s.invoices.pay(invoice.id, {}, { idempotencyKey: `${key}:pay` });
      if (paid.status !== "paid") throw new Error(`proration invoice ${invoice.id} is ${paid.status}`);
    } catch (err) {
      await s.invoices.voidInvoice(invoice.id).catch(() => undefined);
      await track("plan_change_proration_failed", { subscription_id: sub.id, delta_cents: delta, error: err instanceof Error ? err.message : String(err) }, { accountId });
      throw new Error("We couldn't charge the prorated difference to your card on file. Update your card from Manage billing and try again.");
    }
    await track("plan_change_prorated", { subscription_id: sub.id, delta_cents: delta, invoice_id: invoice.id, fraction }, { accountId });
  } else if (delta < 0) {
    await s.customers.createBalanceTransaction(
      customerId,
      { amount: delta, currency, description: `Plan change credit for the remaining ${remainingDays} day${remainingDays === 1 ? "" : "s"} of your current period`, metadata: { account_id: accountId, subscription_id: sub.id, reason: "plan_change_proration" } },
      { idempotencyKey: `${key}:credit` }
    );
    await track("plan_change_prorated", { subscription_id: sub.id, delta_cents: delta, fraction }, { accountId });
  }
}
