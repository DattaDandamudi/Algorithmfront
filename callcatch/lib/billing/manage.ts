// Server-only: Customer Portal, pause/resume, in-place upgrades.
import { z } from "zod";
import { createAdminSupabase } from "@/lib/db/client";
import { env } from "@/lib/env";
import { track } from "@/lib/events";
import { stripePriceIdFor, type BillingInterval, type PlanId } from "@/lib/plans";
import { sendPausedConfirmation } from "@/lib/billing/emails";
import { planItemOf, syncSubscriptionFromStripe } from "@/lib/billing/sync";
import { stripe, toUnix } from "@/lib/billing/stripe";

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

async function loadSubscriptionId(accountId: string): Promise<string | null> {
  const db = createAdminSupabase();
  const { data } = await db.from("subscriptions").select("stripe_subscription_id, status").eq("account_id", accountId).maybeSingle();
  if (!data || data.status === "canceled" || data.status === "incomplete_expired") return null;
  return data.stripe_subscription_id;
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

/**
 * Swaps the plan price in place, keeping the interval. Active subscriptions are invoiced for the
 * prorated difference immediately (`always_invoice`); trialing ones just change price (`none`).
 * Returns null when there is no subscription to change (caller should send them to Checkout).
 */
export async function changePlan(accountId: string, plan: PlanId): Promise<{ plan: PlanId; interval: BillingInterval } | null> {
  const subscriptionId = await loadSubscriptionId(accountId);
  if (!subscriptionId) return null;

  const s = stripe();
  const sub = await s.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
  const item = planItemOf(sub);
  if (!item) throw new Error("Subscription has no plan item.");
  const interval: BillingInterval = item.price.recurring?.interval === "year" ? "year" : "month";
  const newPrice = stripePriceIdFor(plan, interval);
  if (item.price.id === newPrice) return { plan, interval };

  const updated = await s.subscriptions.update(sub.id, {
    items: [{ id: item.id, price: newPrice, quantity: 1 }],
    proration_behavior: sub.status === "trialing" ? "none" : "always_invoice",
    metadata: { plan, interval },
    expand: ["items.data.price"],
  });
  await syncSubscriptionFromStripe(updated, { accountId });
  await track("plan_change_requested", { to: plan, interval }, { accountId });
  return { plan, interval };
}
