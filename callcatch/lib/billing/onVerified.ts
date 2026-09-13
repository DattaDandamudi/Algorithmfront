/**
 * CONTRACT (implemented by module d-billing; called by module c-core-loop's verification poll/webhook).
 * When a customer's number becomes carrier-verified:
 *  - self-serve trial: push Stripe `trial_end` to now + TRIAL_DAYS
 *  - pay-now monthly:  set `billing_cycle_anchor`-equivalent (proration-free) so the first full cycle starts today
 *  - annual:           no change
 *  - always: set accounts.status = 'live', record event 'verified'
 *
 * The caller (module c) has already tracked `verified`; this function tracks `billing_anchored`.
 */
import { createAdminSupabase } from "@/lib/db/client";
import { track } from "@/lib/events";
import { TRIAL_DAYS } from "@/lib/plans";
import { syncSubscriptionFromStripe } from "@/lib/billing/sync";
import { stripe, toUnix } from "@/lib/billing/stripe";

const DAY_MS = 24 * 60 * 60 * 1000;

export type OnVerifiedResult = { ok: boolean; detail?: string };

export async function onVerified(accountId: string): Promise<OnVerifiedResult> {
  const db = createAdminSupabase();

  const [{ data: account, error: accountError }, { data: sub }] = await Promise.all([
    db.from("accounts").select("id, status, plan").eq("id", accountId).maybeSingle(),
    db
      .from("subscriptions")
      .select("stripe_subscription_id, status, interval, paid_now, trial_end, current_period_end")
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
         * refund magnet, so we use the trial-window mechanism instead. (Annual plans are untouched:
         * the term simply starts on verification per the spec.)
         */
        const nextRenewal = addOneMonth(now);
        const updated = await s.subscriptions.update(live.id, {
          trial_end: toUnix(nextRenewal),
          proration_behavior: "none",
          metadata: { verified_at: now.toISOString(), anchored_paid_month: "1" },
        });
        await syncSubscriptionFromStripe(updated, { accountId, paidNow: true });
        detail = `cycle_anchored_to_verification:${nextRenewal.toISOString()}`;
      } else if (sub.interval === "year") {
        detail = "annual_no_change";
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

async function setLive(accountId: string, currentStatus: string): Promise<void> {
  // Never resurrect a cancelled account; a paused one resumes on the Stripe side.
  if (currentStatus === "cancelled") return;
  const db = createAdminSupabase();
  const { error } = await db.from("accounts").update({ status: "live" }).eq("id", accountId);
  if (error) console.error("[billing/onVerified] accounts.status update failed", error.message);
}

/** Same day next month (clamped to that month's last day), UTC. */
function addOneMonth(d: Date): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const lastOfNext = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
  return new Date(Date.UTC(y, m + 1, Math.min(day, lastOfNext), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
}
