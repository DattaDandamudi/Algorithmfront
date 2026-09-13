// Server-only: metered overage reporting + usage reads for the billing page.
import { z } from "zod";
import { createAdminSupabase } from "@/lib/db/client";
import { env } from "@/lib/env";
import { track } from "@/lib/events";
import { getPlan, type PlanId } from "@/lib/plans";
import { periodEndIso, periodKey, periodStartIso } from "@/lib/billing/plans-ui";
import { stripe } from "@/lib/billing/stripe";

/** Stripe Billing Meter `event_name` the overage prices are attached to. */
export const OVERAGE_METER_EVENT_NAME = "callcatch_conversation_overage";

const periodSchema = z.string().regex(/^\d{4}-\d{2}-01$/, "period must be YYYY-MM-01");

/**
 * Overage price for a plan. Starter and Pro bill different per-conversation rates
 * ($0.25 / $0.20), so two Stripe prices share one meter: `STRIPE_PRICE_OVERAGE_CONVERSATION`
 * (Starter) and optional `STRIPE_PRICE_OVERAGE_CONVERSATION_PRO` (falls back to the Starter id).
 */
export function overagePriceIdFor(plan: PlanId): string {
  const base = env.required("STRIPE_PRICE_OVERAGE_CONVERSATION");
  return plan === "pro" ? (env.get("STRIPE_PRICE_OVERAGE_CONVERSATION_PRO") ?? base) : base;
}

export type OverageResult = {
  ok: boolean;
  overage: number;
  reported: boolean;
  reason?: string;
};

/**
 * Reports the previous period's overage to Stripe exactly once.
 *
 * overage = max(0, usage_monthly.conversations − plan.includedConversations). When > 0 and not yet
 * reported: (1) make sure the subscription carries the metered overage price (added with no
 * proration on first use), (2) send a Billing Meter Event (`billing.meterEvents.create`) for the
 * customer with `value = overage`, using a deterministic `identifier` so Stripe de-duplicates a
 * retried cron, (3) flip `usage_monthly.overage_reported`.
 *
 * The event is stamped "now" (the cron runs on the 1st), so the overage lands on the customer's
 * next invoice — which is the intended behaviour since plan periods anchor on the verification
 * date, not on calendar months.
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

  const s = stripe();
  const overagePrice = overagePriceIdFor(plan.id);

  // Ensure the metered price is on the subscription so meter events are billed.
  const stripeSub = await s.subscriptions.retrieve(sub.stripe_subscription_id, { expand: ["items.data.price"] });
  const hasOverageItem = stripeSub.items.data.some((it) => it.price.id === overagePrice);
  if (!hasOverageItem) {
    await s.subscriptions.update(stripeSub.id, {
      items: [{ price: overagePrice }],
      proration_behavior: "none",
    });
  }

  await s.billing.meterEvents.create({
    event_name: OVERAGE_METER_EVENT_NAME,
    identifier: `overage:${accountId}:${p}`,
    payload: {
      stripe_customer_id: account.stripe_customer_id,
      value: String(overage),
    },
  });

  const { error } = await db.from("usage_monthly").update({ overage_reported: true }).eq("account_id", accountId).eq("period", p);
  if (error) throw new Error(`usage_monthly update failed: ${error.message}`);

  await track(
    "overage_reported",
    { period: p, conversations: usage.conversations, included: plan.includedConversations, overage, unit_usd: plan.overagePerConversationUsd },
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
