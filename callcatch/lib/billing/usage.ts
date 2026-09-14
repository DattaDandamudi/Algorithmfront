// Server-only: metered overage reporting + usage reads for the billing page.
import { z } from "zod";
import type Stripe from "stripe";
import { createAdminSupabase } from "@/lib/db/client";
import { env } from "@/lib/env";
import { track } from "@/lib/events";
import { getPlan, PLANS, type PlanId } from "@/lib/plans";
import { periodEndIso, periodKey, periodStartIso } from "@/lib/billing/plans-ui";
import { stripe } from "@/lib/billing/stripe";

/**
 * Recommended Stripe Billing Meter `event_name` (docs/DEPLOYMENT.md §2). The code does not depend on
 * it: the event name and payload keys are read from the meter the overage price is attached to, so a
 * meter created under another name still bills correctly and a price without a meter fails loudly.
 */
export const OVERAGE_METER_EVENT_NAME = "callcatch_conversation_overage";

const periodSchema = z.string().regex(/^\d{4}-\d{2}-01$/, "period must be YYYY-MM-01");

/** Both configured overage price ids (Starter, and Pro when set). */
export function overagePriceIds(): Set<string> {
  return new Set([env.get("STRIPE_PRICE_OVERAGE_CONVERSATION"), env.get("STRIPE_PRICE_OVERAGE_CONVERSATION_PRO")].filter((v): v is string => Boolean(v)));
}

/** True for any subscription item that bills conversation overage (either plan's price, or any metered price). */
export function isOverageItem(item: Stripe.SubscriptionItem, ids: Set<string> = overagePriceIds()): boolean {
  return ids.has(item.price.id) || item.price.recurring?.usage_type === "metered";
}

/**
 * Overage price for a plan. Starter and Pro bill different per-conversation rates ($0.25 / $0.20),
 * so two Stripe prices share one meter: `STRIPE_PRICE_OVERAGE_CONVERSATION` (Starter) and
 * `STRIPE_PRICE_OVERAGE_CONVERSATION_PRO` (Pro). Both are required in production (DEPLOYMENT.md §2).
 *
 * If the Pro price is missing we fall back to the Starter price with a loud error, and
 * `reportOverageForPeriod` scales the reported quantity so the customer is still invoiced at the
 * published Pro rate (never the Starter rate). Fix the env var; the log line says so.
 */
export function overagePriceIdFor(plan: PlanId): string {
  const starter = env.required("STRIPE_PRICE_OVERAGE_CONVERSATION");
  if (plan !== "pro") return starter;
  const pro = env.get("STRIPE_PRICE_OVERAGE_CONVERSATION_PRO");
  if (pro) return pro;
  console.error(
    "[billing/usage] STRIPE_PRICE_OVERAGE_CONVERSATION_PRO is not set — Pro overage is being billed on the Starter price with a rate-scaled quantity. Create the $0.20 price on the overage meter (DEPLOYMENT.md §2) and set the env var."
  );
  return starter;
}

/**
 * Quantity to report for `overage` conversations on `priceId`, at the plan's published rate.
 * Normally `overage` itself; only when Pro is (mis)configured onto the Starter price is it scaled
 * by 0.20/0.25 so the invoice total still matches the ToS.
 */
export function overageQuantityFor(plan: PlanId, priceId: string, overage: number): { quantity: number; scaled: boolean } {
  const pro = env.get("STRIPE_PRICE_OVERAGE_CONVERSATION_PRO");
  const starter = env.get("STRIPE_PRICE_OVERAGE_CONVERSATION");
  if (plan === "pro" && !pro && priceId === starter) {
    const ratio = PLANS.pro.overagePerConversationUsd / PLANS.starter.overagePerConversationUsd;
    return { quantity: Math.max(0, Math.round(overage * ratio)), scaled: true };
  }
  return { quantity: overage, scaled: false };
}

type MeterConfig = { eventName: string; customerKey: string; valueKey: string; meterId: string };
const meterConfigCache = new Map<string, MeterConfig>();

/**
 * Resolves the Billing Meter behind an overage price (memoized per process). Throws a clear error
 * when the price is not a metered price on an active meter — the misconfiguration the deployment
 * doc used to hide until the first overage invoice.
 */
export async function meterConfigForPrice(priceId: string): Promise<MeterConfig> {
  const cached = meterConfigCache.get(priceId);
  if (cached) return cached;
  const s = stripe();
  const price = await s.prices.retrieve(priceId);
  const meterId = price.recurring?.meter ?? null;
  if (price.recurring?.usage_type !== "metered" || !meterId) {
    throw new Error(`overage price ${priceId} is not a usage-based price attached to a Billing Meter (see DEPLOYMENT.md §2)`);
  }
  const meter = await s.billing.meters.retrieve(meterId);
  if (meter.status !== "active") throw new Error(`Billing Meter ${meterId} (${meter.event_name}) is not active`);
  const config: MeterConfig = {
    meterId,
    eventName: meter.event_name,
    customerKey: meter.customer_mapping.event_payload_key || "stripe_customer_id",
    valueKey: meter.value_settings.event_payload_key || "value",
  };
  meterConfigCache.set(priceId, config);
  return config;
}

export type OverageResult = {
  ok: boolean;
  overage: number;
  reported: boolean;
  reason?: string;
};

/**
 * Reports a closed period's overage to Stripe exactly once. Safe to call nightly for every
 * `usage_monthly` row with `overage_reported = false` — that flag is the idempotency guard.
 *
 * overage = max(0, usage_monthly.conversations − plan.includedConversations). When > 0 and not yet
 * reported: (1) claim the row (`overage_reported := true` only if it was false — a concurrent or
 * retried run sees 0 rows and stops), (2) make sure the subscription carries the plan's metered
 * overage price — added with no proration on first use, or *swapped* in place when the item on the
 * subscription is the other plan's price (Starter → Pro upgrade), never a second metered item,
 * (3) send a Billing Meter Event for the customer. If (2) or (3) throws, the claim is released so the
 * next nightly run retries; Stripe's own `identifier` de-dupe only covers ~24h, so the DB flag, not
 * the identifier, is what prevents double billing.
 *
 * The event is stamped "now", so the overage lands on the customer's next invoice — intended, since
 * plan periods anchor on the verification date, not on calendar months.
 */
export async function reportOverageForPeriod(accountId: string, period: string): Promise<OverageResult> {
  const p = periodSchema.parse(period);
  const db = createAdminSupabase();

  const [{ data: usage }, { data: account }, { data: sub }] = await Promise.all([
    db.from("usage_monthly").select("conversations, overage_reported").eq("account_id", accountId).eq("period", p).maybeSingle(),
    db.from("accounts").select("id, plan, stripe_customer_id").eq("id", accountId).maybeSingle(),
    db.from("subscriptions").select("stripe_subscription_id, status, plan").eq("account_id", accountId).maybeSingle(),
  ]);

  if (!usage) return { ok: true, overage: 0, reported: false, reason: "no_usage_row" };
  if (usage.overage_reported) return { ok: true, overage: 0, reported: true, reason: "already_reported" };

  const plan = getPlan(sub?.plan ?? account?.plan);
  const overage = Math.max(0, (usage.conversations ?? 0) - plan.includedConversations);
  if (overage === 0) {
    await db.from("usage_monthly").update({ overage_reported: true }).eq("account_id", accountId).eq("period", p);
    return { ok: true, overage: 0, reported: true, reason: "no_overage" };
  }

  if (!account?.stripe_customer_id || !sub?.stripe_subscription_id) {
    return { ok: false, overage, reported: false, reason: "no_stripe_customer_or_subscription" };
  }
  if (sub.status === "canceled" || sub.status === "incomplete_expired") {
    return { ok: false, overage, reported: false, reason: `subscription_${sub.status}` };
  }
  // Invoices raised during a pause are voided (`pause_collection.behavior = 'void'`): a meter event
  // sent now would be billed into the void. Leave the row unreported; the nightly sweep retries
  // after the subscription resumes.
  if (sub.status === "paused") {
    return { ok: false, overage, reported: false, reason: "subscription_paused_deferred" };
  }

  // Claim the row first: only one run ever gets past this line for a given period.
  const claim = await db.from("usage_monthly").update({ overage_reported: true }).eq("account_id", accountId).eq("period", p).eq("overage_reported", false).select("account_id");
  if (claim.error) throw new Error(`usage_monthly claim failed: ${claim.error.message}`);
  if ((claim.data?.length ?? 0) !== 1) return { ok: true, overage, reported: true, reason: "claimed_by_other_run" };

  const s = stripe();
  const overagePrice = overagePriceIdFor(plan.id);
  const { quantity, scaled } = overageQuantityFor(plan.id, overagePrice, overage);

  try {
    const meter = await meterConfigForPrice(overagePrice);

    // Ensure exactly one metered overage item — the plan's price — is on the subscription.
    const stripeSub = await s.subscriptions.retrieve(sub.stripe_subscription_id, { expand: ["items.data.price"] });
    const ids = overagePriceIds();
    const overageItems = stripeSub.items.data.filter((it) => isOverageItem(it, ids));
    const current = overageItems.find((it) => it.price.id === overagePrice) ?? overageItems[0] ?? null;
    if (!current) {
      await s.subscriptions.update(stripeSub.id, { items: [{ price: overagePrice }], proration_behavior: "none" });
    } else if (current.price.id !== overagePrice) {
      // Wrong plan's price (e.g. Starter item left over from an upgrade): swap in place, do not add a second one.
      await s.subscriptions.update(stripeSub.id, { items: [{ id: current.id, price: overagePrice }], proration_behavior: "none" });
    }

    await s.billing.meterEvents.create({
      event_name: meter.eventName,
      identifier: `overage:${accountId}:${p}`,
      payload: {
        [meter.customerKey]: account.stripe_customer_id,
        [meter.valueKey]: String(quantity),
      },
    });
  } catch (err) {
    // Release the claim so tomorrow's sweep retries; nothing reached Stripe's meter (or the create
    // itself failed), so there is nothing to double-bill.
    const { error } = await db.from("usage_monthly").update({ overage_reported: false }).eq("account_id", accountId).eq("period", p);
    if (error) console.error("[billing/usage] failed to release overage claim — row stays reported, reconcile by hand", { accountId, period: p, err: error.message });
    await track("overage_report_failed", { period: p, overage, error: err instanceof Error ? err.message : String(err) }, { accountId });
    throw err;
  }

  await track(
    "overage_reported",
    {
      period: p,
      conversations: usage.conversations,
      included: plan.includedConversations,
      overage,
      quantity,
      scaled_to_plan_rate: scaled,
      unit_usd: plan.overagePerConversationUsd,
      price_id: overagePrice,
    },
    { accountId }
  );
  return { ok: true, overage, reported: true };
}

export type UsageSnapshot = {
  period: string;
  conversations: number;
  included: number;
  overage: number;
  overageUnitUsd: number;
  estimatedOverageUsd: number;
  smsSegmentsOut: number;
  smsSegmentsIn: number;
  voiceMinutes: number;
};

/**
 * Usage this calendar month: the rolled-up `usage_monthly` row (nightly) merged with a live count
 * of conversations started this month, so the billing page never lags the rollup.
 */
export async function getUsageThisMonth(accountId: string, planId: PlanId | string | null | undefined): Promise<UsageSnapshot> {
  const db = createAdminSupabase();
  const period = periodKey();
  const plan = getPlan(planId);

  const [{ data: row }, { count }] = await Promise.all([
    db
      .from("usage_monthly")
      .select("conversations, sms_segments_out, sms_segments_in, voice_minutes")
      .eq("account_id", accountId)
      .eq("period", period)
      .maybeSingle(),
    db
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .gte("created_at", periodStartIso(period))
      .lt("created_at", periodEndIso(period)),
  ]);

  const conversations = Math.max(row?.conversations ?? 0, count ?? 0);
  const overage = Math.max(0, conversations - plan.includedConversations);
  return {
    period,
    conversations,
    included: plan.includedConversations,
    overage,
    overageUnitUsd: plan.overagePerConversationUsd,
    estimatedOverageUsd: Math.round(overage * plan.overagePerConversationUsd * 100) / 100,
    smsSegmentsOut: row?.sms_segments_out ?? 0,
    smsSegmentsIn: row?.sms_segments_in ?? 0,
    voiceMinutes: Number(row?.voice_minutes ?? 0),
  };
}
