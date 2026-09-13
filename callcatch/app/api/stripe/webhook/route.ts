import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { createAdminSupabase } from "@/lib/db/client";
import { env } from "@/lib/env";
import { track } from "@/lib/events";
import { sendCapiEvent } from "@/lib/meta/capi";
import { getPlan, TRIAL_DAYS, type BillingInterval, type PlanId } from "@/lib/plans";
import { sendDunningNotice, sendTrialEndingReminder, sendTrialExtendedPendingVerification } from "@/lib/billing/emails";
import { isInterval, isPlanId, recurringPriceUsd } from "@/lib/billing/plans-ui";
import { applyReferralOnCheckout, rewardReferral } from "@/lib/billing/referrals";
import { fromUnix, idOf, stripe, toUnix } from "@/lib/billing/stripe";
import { syncSubscriptionById, syncSubscriptionFromStripe } from "@/lib/billing/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

const STRIPE_EVENT = "stripe_event";
/** Extra days granted when the trial is about to end but the number is still in carrier review. */
const VERIFICATION_GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * POST /api/stripe/webhook
 * Verified with `stripe.webhooks.constructEvent` (raw body + `stripe-signature`).
 * Idempotent on `event.id` via the `events` table (`name = 'stripe_event'`, `props.id`).
 * Returns 200 for handled/ignored/duplicate events; 500 only when *our* processing fails so Stripe retries.
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "missing_signature" }, { status: 400 });

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, env.required("STRIPE_WEBHOOK_SECRET"));
  } catch (err) {
    console.warn("[stripe/webhook] signature verification failed", err instanceof Error ? err.message : err);
    return Response.json({ error: "invalid_signature" }, { status: 400 });
  }

  const db = createAdminSupabase();
  const { data: seen, error: seenError } = await db
    .from("events")
    .select("id")
    .eq("name", STRIPE_EVENT)
    .eq("props->>id", event.id)
    .limit(1)
    .maybeSingle();
  if (seenError) {
    console.error("[stripe/webhook] idempotency lookup failed", seenError.message);
    return Response.json({ error: "db_unavailable" }, { status: 500 });
  }
  if (seen) return Response.json({ received: true, duplicate: true });

  let accountId: string | null = null;
  try {
    accountId = await handle(event);
  } catch (err) {
    console.error("[stripe/webhook] handler failed", { type: event.type, id: event.id, err });
    return Response.json({ error: "handler_failed" }, { status: 500 });
  }

  const { error: markError } = await db.from("events").insert({
    account_id: accountId,
    name: STRIPE_EVENT,
    props: { id: event.id, type: event.type, livemode: event.livemode, created: event.created },
    occurred_at: new Date(event.created * 1000).toISOString(),
  });
  if (markError) console.error("[stripe/webhook] failed to record event id", markError.message);

  return Response.json({ received: true });
}

/** Returns the account id the event touched (for the idempotency row), or null. */
async function handle(event: Stripe.Event): Promise<string | null> {
  switch (event.type) {
    case "checkout.session.completed":
      return onCheckoutCompleted(event.data.object);
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
    case "customer.subscription.deleted": {
      const result = await syncSubscriptionFromStripe(event.data.object);
      return result?.accountId ?? null;
    }
    case "invoice.paid":
      return onInvoicePaid(event.data.object);
    case "invoice.payment_failed":
      return onInvoicePaymentFailed(event.data.object);
    case "customer.subscription.trial_will_end":
      return onTrialWillEnd(event.data.object);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------

type AccountForBilling = {
  id: string;
  owner_user_id: string;
  legal_name: string | null;
  dba: string | null;
  alert_email: string | null;
  alert_phone: string | null;
  plan: string | null;
  status: string;
  stripe_customer_id: string | null;
};

const ACCOUNT_COLUMNS = "id, owner_user_id, legal_name, dba, alert_email, alert_phone, plan, status, stripe_customer_id";

async function loadAccount(accountId: string): Promise<AccountForBilling | null> {
  const db = createAdminSupabase();
  const { data } = await db.from("accounts").select(ACCOUNT_COLUMNS).eq("id", accountId).maybeSingle();
  return data;
}

async function accountByCustomer(customerId: string | null): Promise<AccountForBilling | null> {
  if (!customerId) return null;
  const db = createAdminSupabase();
  const { data } = await db.from("accounts").select(ACCOUNT_COLUMNS).eq("stripe_customer_id", customerId).maybeSingle();
  return data;
}

async function accountBySubscription(subscriptionId: string | null): Promise<AccountForBilling | null> {
  if (!subscriptionId) return null;
  const db = createAdminSupabase();
  const { data: row } = await db.from("subscriptions").select("account_id").eq("stripe_subscription_id", subscriptionId).maybeSingle();
  return row ? loadAccount(row.account_id) : null;
}

async function ownerEmail(account: AccountForBilling): Promise<string | null> {
  try {
    const { data } = await createAdminSupabase().auth.admin.getUserById(account.owner_user_id);
    return data.user?.email ?? account.alert_email;
  } catch {
    return account.alert_email;
  }
}

function businessName(account: AccountForBilling): string {
  return account.dba || account.legal_name || "there";
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return idOf(invoice.parent?.subscription_details?.subscription ?? null);
}

// ---------------------------------------------------------------------------

async function onCheckoutCompleted(session: Stripe.Checkout.Session): Promise<string | null> {
  if (session.mode !== "subscription") return null;
  const accountId = session.client_reference_id ?? session.metadata?.account_id ?? null;
  if (!accountId) {
    console.warn("[stripe/webhook] checkout without account reference", session.id);
    return null;
  }
  const db = createAdminSupabase();
  const meta = session.metadata ?? {};
  const plan: PlanId | null = isPlanId(meta.plan) ? meta.plan : null;
  const interval: BillingInterval | null = isInterval(meta.interval) ? meta.interval : null;
  const path = meta.path === "paynow" ? "paynow" : "trial";
  const customerId = idOf(session.customer);
  const subscriptionId = idOf(session.subscription);
  const setupFeePaid = meta.setup_fee === "1" && session.payment_status === "paid";

  // 1. Link the Stripe customer + plan to the account.
  const patch: { stripe_customer_id?: string; plan?: string } = {};
  if (customerId) patch.stripe_customer_id = customerId;
  if (plan) patch.plan = plan;
  if (Object.keys(patch).length > 0) {
    const { error } = await db.from("accounts").update(patch).eq("id", accountId);
    if (error) throw new Error(`accounts update failed: ${error.message}`);
  }

  // 2. Mirror the subscription (creates the row if subscription.created arrived first or not at all).
  if (subscriptionId) {
    await syncSubscriptionById(subscriptionId, { accountId, paidNow: path === "paynow", setupFeePaid });
  }

  // 3. Referral attribution.
  if (meta.ref) {
    try {
      await applyReferralOnCheckout(accountId, meta.ref);
    } catch (err) {
      console.error("[stripe/webhook] referral apply failed", err);
    }
  }

  const amountUsd = (session.amount_total ?? 0) / 100;
  await track(
    "checkout_completed",
    { session_id: session.id, plan, interval, path, setup_fee_paid: setupFeePaid, amount_total_usd: amountUsd, subscription_id: subscriptionId, event_id: meta.event_id ?? null },
    { accountId }
  );
  if (path === "trial") await track("trial_started", { plan, interval }, { accountId });

  // 4. Meta CAPI. eventId is deterministic (`checkout_<session id>`) so the onboarding success page
  //    (`/onboarding?checkout=success&session_id=…`) can fire the same Pixel event with the same id
  //    via `trackPixel(name, params, 'checkout_' + session_id)` and Meta de-duplicates the pair.
  const account = await loadAccount(accountId);
  const email = session.customer_details?.email ?? (account ? await ownerEmail(account) : null);
  const value = path === "paynow" ? amountUsd : plan && interval ? recurringPriceUsd(plan, interval) : 0;
  await sendCapiEvent({
    eventName: path === "paynow" ? "Purchase" : "StartTrial",
    eventId: `checkout_${session.id}`,
    email,
    phone: account?.alert_phone ?? session.customer_details?.phone ?? null,
    fbc: meta.fbc ?? null,
    fbp: meta.fbp ?? null,
    externalId: accountId,
    sourceUrl: `${env.appUrl()}/billing/checkout`,
    value,
    currency: "USD",
    customData: { plan: plan ?? undefined, interval: interval ?? undefined, path, content_name: plan ? `${getPlan(plan).name} ${interval ?? ""}`.trim() : undefined },
  });

  return accountId;
}

async function onInvoicePaid(invoice: Stripe.Invoice): Promise<string | null> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  const account = (await accountBySubscription(subscriptionId)) ?? (await accountByCustomer(idOf(invoice.customer)));
  if (!account) return null;
  const db = createAdminSupabase();

  const amountPaidUsd = invoice.amount_paid / 100;
  const paid = invoice.amount_paid > 0;

  // First paid invoice for this account? (earlier `invoice_paid` events with `paid: true`)
  const { data: earlier } = await db
    .from("events")
    .select("id")
    .eq("account_id", account.id)
    .eq("name", "invoice_paid")
    .eq("props->>paid", "true")
    .limit(1)
    .maybeSingle();
  const firstPaid = paid && !earlier;

  await track(
    "invoice_paid",
    {
      invoice_id: invoice.id,
      subscription_id: subscriptionId,
      amount_paid_usd: amountPaidUsd,
      paid,
      first_paid: firstPaid,
      billing_reason: invoice.billing_reason,
      hosted_invoice_url: invoice.hosted_invoice_url ?? null,
    },
    { accountId: account.id }
  );

  // Keep the subscription row fresh (past_due → active after a successful retry, period end moves).
  if (subscriptionId) {
    try {
      await syncSubscriptionById(subscriptionId);
    } catch (err) {
      console.error("[stripe/webhook] sync after invoice.paid failed", err);
    }
  }

  if (firstPaid) {
    await track("subscription_active", { source: "first_invoice_paid", amount_paid_usd: amountPaidUsd }, { accountId: account.id });
    await sendCapiEvent({
      eventName: "Subscribe",
      eventId: `subscribe_${invoice.id}`,
      email: invoice.customer_email ?? (await ownerEmail(account)),
      phone: account.alert_phone,
      externalId: account.id,
      sourceUrl: `${env.appUrl()}/billing`,
      value: amountPaidUsd,
      currency: "USD",
      customData: { plan: account.plan ?? undefined, predicted_ltv: getPlan(account.plan).priceMonthlyUsd * 12 },
    });
    try {
      await rewardReferral(account.id);
    } catch (err) {
      console.error("[stripe/webhook] referral reward failed", err);
    }
  }
  return account.id;
}

async function onInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<string | null> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  const account = (await accountBySubscription(subscriptionId)) ?? (await accountByCustomer(idOf(invoice.customer)));
  if (!account) return null;
  const db = createAdminSupabase();

  if (subscriptionId) {
    const { error } = await db.from("subscriptions").update({ status: "past_due" }).eq("stripe_subscription_id", subscriptionId);
    if (error) throw new Error(`subscriptions past_due update failed: ${error.message}`);
  }

  await track(
    "invoice_payment_failed",
    { invoice_id: invoice.id, subscription_id: subscriptionId, amount_due_usd: invoice.amount_due / 100, attempt: invoice.attempt_count, next_attempt: fromUnix(invoice.next_payment_attempt) },
    { accountId: account.id }
  );

  // Dunning notice #1 on the first failed attempt; the daily dunning cron handles reminders.
  if (invoice.attempt_count <= 1) {
    const to = invoice.customer_email ?? (await ownerEmail(account));
    if (to) {
      await sendDunningNotice({
        to,
        businessName: businessName(account),
        amountDueUsd: invoice.amount_due / 100,
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
        nextAttemptAt: fromUnix(invoice.next_payment_attempt),
      });
      await track("dunning_email_sent", { invoice_id: invoice.id, notice: 1 }, { accountId: account.id });
    }
  }
  return account.id;
}

async function onTrialWillEnd(sub: Stripe.Subscription): Promise<string | null> {
  const result = await syncSubscriptionFromStripe(sub);
  const accountId = result?.accountId ?? null;
  if (!accountId) return null;
  const account = await loadAccount(accountId);
  if (!account) return null;
  const db = createAdminSupabase();

  const { data: subRow } = await db.from("subscriptions").select("paid_now, plan, interval").eq("account_id", accountId).maybeSingle();
  // A paid-now subscription parked in a Stripe trial window is a paid month, not a trial: no reminder.
  if (subRow?.paid_now) return accountId;

  const { data: verified } = await db
    .from("numbers")
    .select("id")
    .eq("account_id", accountId)
    .eq("purpose", "customer")
    .eq("verification_status", "verified")
    .limit(1)
    .maybeSingle();

  const to = await ownerEmail(account);

  if (!verified) {
    // Carriers haven't approved the number yet: the trial never really started. Push trial_end out
    // (no proration) so nobody is charged for a service whose text-backs aren't on. `onVerified()`
    // will set the real TRIAL_DAYS clock once the number is approved.
    const currentEnd = sub.trial_end ? sub.trial_end * 1000 : Date.now();
    const newEnd = new Date(Math.max(currentEnd, Date.now()) + VERIFICATION_GRACE_DAYS * DAY_MS);
    const updated = await stripe().subscriptions.update(sub.id, { trial_end: toUnix(newEnd), proration_behavior: "none" });
    await syncSubscriptionFromStripe(updated, { accountId });
    await track("trial_extended_pending_verification", { new_trial_end: newEnd.toISOString(), grace_days: VERIFICATION_GRACE_DAYS }, { accountId });
    if (to) await sendTrialExtendedPendingVerification({ to, businessName: businessName(account), newTrialEndIso: newEnd.toISOString() });
    return accountId;
  }

  if (to && sub.trial_end) {
    const plan = getPlan(subRow?.plan ?? account.plan);
    const interval: BillingInterval = subRow?.interval === "year" ? "year" : "month";
    await sendTrialEndingReminder({
      to,
      businessName: businessName(account),
      trialEndIso: new Date(sub.trial_end * 1000).toISOString(),
      planName: plan.name,
      priceUsd: recurringPriceUsd(plan.id, interval),
      interval,
    });
    await track("trial_ending_email_sent", { trial_end: fromUnix(sub.trial_end), trial_days: TRIAL_DAYS }, { accountId });
  }
  return accountId;
}
