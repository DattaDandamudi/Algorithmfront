/**
 * CONTRACT (implemented by module d-billing; called by module c-core-loop's verification poll/webhook).
 * When a customer's number becomes carrier-verified:
 *  - self-serve trial: push Stripe `trial_end` to now + TRIAL_DAYS
 *  - pay-now monthly:  set `billing_cycle_anchor`-equivalent (proration-free) so the first full cycle starts today
 *  - pay-now annual:   the term was charged at checkout and stays anchored there; the days spent in
 *                      carrier review are refunded as a customer-balance credit (days/365 × annual price),
 *                      consumed by the next invoice (matches the Checkout copy)
 *  - promote accounts.status 'pending_verification' → 'live' (never paused/cancelled — those come back
 *    through the Stripe sync on resume/re-subscribe), record event 'verified'
 *
 * The caller (module c) has already tracked `verified`; this function tracks `billing_anchored`.
 */
import type Stripe from "stripe";
import { createAdminSupabase } from "@/lib/db/client";
import { track } from "@/lib/events";
import { getPlan, TRIAL_DAYS } from "@/lib/plans";
import { planItemOf, syncSubscriptionFromStripe } from "@/lib/billing/sync";
import { stripe, toUnix } from "@/lib/billing/stripe";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Only accounts waiting on carrier review are promoted to live by a verification event. */
const PROMOTABLE_STATUSES = ["pending_verification"] as const;

export type OnVerifiedResult = { ok: boolean; detail?: string };

export async function onVerified(accountId: string): Promise<OnVerifiedResult> {
  const db = createAdminSupabase();

  const [{ data: account, error: accountError }, { data: sub }] = await Promise.all([
    db.from("accounts").select("id, status, plan").eq("id", accountId).maybeSingle(),
    db
      .from("subscriptions")
      .select("stripe_subscription_id, status, interval, paid_now, plan, trial_end, current_period_end")
      .eq("account_id", accountId)
      .maybeSingle(),
  ]);
  if (accountError) return { ok: false, detail: `accounts lookup failed: ${accountError.message}` };
  if (!account) return { ok: false, detail: "account_not_found" };

  let detail = "no_subscription";
  const now = new Date();

  try {
    if (sub?.stripe_subscription_id) {
      const s = stripe();
      const live = await s.subscriptions.retrieve(sub.stripe_subscription_id, { expand: ["items.data.price"] });
      const isMonthly = sub.interval === "month";
      const isTrialPath = !sub.paid_now;

      if (live.status === "canceled" || live.status === "incomplete_expired") {
        detail = `subscription_${live.status}_skipped`;
      } else if (live.status === "trialing" && isTrialPath) {
        /**
         * Self-serve trial. Stripe semantics: updating `trial_end` on a trialing subscription
         * moves the end of the trial and re-anchors `billing_cycle_anchor` to that instant, so the
         * first charge fires exactly TRIAL_DAYS after verification and renews on that day of month.
         * `proration_behavior: 'none'` avoids any $0 proration invoice for the cycle change.
         */
        const trialEnd = new Date(now.getTime() + TRIAL_DAYS * DAY_MS);
        const updated = await s.subscriptions.update(live.id, {
          trial_end: toUnix(trialEnd),
          proration_behavior: "none",
          metadata: { verified_at: now.toISOString() },
        });
        await syncSubscriptionFromStripe(updated, { accountId });
        detail = `trial_end_set:${trialEnd.toISOString()}`;
      } else if (live.status === "active" && isMonthly && sub.paid_now) {
        /**
         * Pay-now monthly (already charged for period 1 at Checkout).
         *
         * Stripe semantics we rely on: on an *active* subscription, `trial_end = <future>` puts the
         * subscription into a paid-for grace window and moves `billing_cycle_anchor` to that
         * timestamp; with `proration_behavior: 'none'` no credit/charge is generated. Setting it to
         * verification + 1 month therefore makes the month the customer already paid for *start
         * today*, and the next $79/$149 renewal fires one month after verification — exactly
         * "the first full month starts on verification", with a single charge.
         *
         * Why not `billing_cycle_anchor: 'now'`? Resetting the anchor ends the current period and
         * Stripe invoices the new period immediately; with `proration_behavior: 'none'` the customer
         * would be charged a second full month with no credit for the one they just paid. That is a
         * refund magnet, so we use the trial-window mechanism instead.
         */
        const nextRenewal = addOneMonth(now);
        const updated = await s.subscriptions.update(live.id, {
          trial_end: toUnix(nextRenewal),
          proration_behavior: "none",
          metadata: { verified_at: now.toISOString(), anchored_paid_month: "1" },
        });
        await syncSubscriptionFromStripe(updated, { accountId, paidNow: true });
        detail = `cycle_anchored_to_verification:${nextRenewal.toISOString()}`;
      } else if (live.status === "active" && sub.interval === "year" && sub.paid_now) {
        /**
         * Pay-now annual (charged in full at Checkout). Parking a year-long term in a Stripe trial
         * window would hide overage until the renewal and show "trialing" for a year, so the term
         * stays anchored on the checkout date and the verification days are given back as a
         * customer-balance credit: (days from checkout to verification / 365) × annual price. The
         * credit is consumed by the next invoice (renewal or overage). Idempotent via subscription
         * metadata + a Stripe idempotency key.
         */
        detail = await creditAnnualVerificationDays(accountId, live, now);
      } else {
        detail = `no_change:${live.status}`;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[billing/onVerified] stripe update failed", { accountId, message });
    // Still flip the account live: SMS is verified regardless of the billing anchor.
    await setLive(accountId, account.status);
    await track("billing_anchor_failed", { detail: message }, { accountId });
    return { ok: false, detail: `stripe_error: ${message}` };
  }

  await setLive(accountId, account.status);
  await track("billing_anchored", { detail, interval: sub?.interval ?? null, paid_now: sub?.paid_now ?? null }, { accountId });
  return { ok: true, detail };
}

/**
 * Promotes an account waiting on carrier review to live. Never resurrects a paused (customer pause
 * or dunning), cancelled or still-onboarding account — those change status through the Stripe sync
 * (`lib/billing/sync.ts`), which checks for a verified number when the subscription comes back.
 * The UPDATE is conditional so a concurrent pause/cancel is never overwritten.
 */
async function setLive(accountId: string, currentStatus: string): Promise<void> {
  if (!(PROMOTABLE_STATUSES as readonly string[]).includes(currentStatus)) return;
  const db = createAdminSupabase();
  const { error } = await db
    .from("accounts")
    .update({ status: "live" })
    .eq("id", accountId)
    .in("status", [...PROMOTABLE_STATUSES]);
  if (error) console.error("[billing/onVerified] accounts.status update failed", error.message);
}

/** Credits the verification days of a pay-now annual subscription back to the customer balance. */
async function creditAnnualVerificationDays(accountId: string, live: Stripe.Subscription, now: Date): Promise<string> {
  if (live.metadata?.verification_credit_cents !== undefined) return `annual_credit_already_applied:${live.metadata.verification_credit_cents}`;
  const s = stripe();
  const customerId = typeof live.customer === "string" ? live.customer : live.customer.id;
  const item = planItemOf(live);
  const annualCents = item?.price.unit_amount ?? getPlan(live.metadata?.plan).priceAnnualUsd * 100;
  const currency = item?.price.currency ?? "usd";
  const days = Math.max(0, Math.floor((now.getTime() - live.start_date * 1000) / DAY_MS));
  const credit = Math.min(annualCents, Math.round((annualCents * days) / 365));

  if (credit > 0) {
    await s.customers.createBalanceTransaction(
      customerId,
      {
        amount: -credit,
        currency,
        description: `Credit for ${days} day${days === 1 ? "" : "s"} of carrier verification on your annual plan`,
        metadata: { account_id: accountId, subscription_id: live.id, reason: "annual_verification_credit", days: String(days) },
      },
      { idempotencyKey: `verification-credit:${live.id}` }
    );
  }
  await s.subscriptions.update(live.id, {
    metadata: { verified_at: now.toISOString(), verification_credit_cents: String(credit), verification_credit_days: String(days) },
  });
  await track("annual_verification_credited", { subscription_id: live.id, days, credit_cents: credit }, { accountId });
  return `annual_verification_credit:${credit}:${days}d`;
}

/** Same day next month (clamped to that month's last day), UTC. */
function addOneMonth(d: Date): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const lastOfNext = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
  return new Date(Date.UTC(y, m + 1, Math.min(day, lastOfNext), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
}
