/**
 * GET /api/cron/dunning — daily. Past-due reminders on day 1, 3 and 7 (each sent once, keyed by an
 * `events` row `dunning_reminder` with the day), account pause on `unpaid`, and cancellation
 * (accounts.status='cancelled' + AI paused on every thread) when a subscription is `canceled`.
 * Module d's Stripe webhook is the primary writer of these statuses; this cron is the backstop.
 *
 * Every thread pause done here is recorded as a `dunning_ai_paused` event carrying the exact
 * conversation ids, so `lib/billing/sync.ts` can resume those threads — and only those — when the
 * subscription becomes active again (invoice.paid / customer.subscription.updated) and the account
 * returns to `live`.
 */
import type { NextRequest } from "next/server";
import { createAdminSupabase, type Db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import { track } from "@/lib/events";
import { businessNameOf } from "@/lib/ai/prompts";
import { DUNNING_AI_PAUSED_EVENT } from "@/lib/billing/sync";
import { renderAlertEmail } from "@/lib/telephony/alerts";
import { authorizeCron, cronError, cronResponse } from "../_lib/cron";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const REMINDER_DAYS = [1, 3, 7] as const;
const DAY_MS = 24 * 3600 * 1000;

function reminderCopy(day: number, business: string, portalUrl: string) {
  const intro =
    day === 1
      ? `Your card on file was declined for ${business}'s CallCatch subscription. Missed-call texts keep running for now — update your card so nothing pauses.`
      : day === 3
        ? `We still couldn't charge the card for ${business}'s CallCatch plan. Please update it in the next few days to keep text-backs and alerts running.`
        : `Final reminder: ${business}'s CallCatch plan is still unpaid. Text-backs and AI replies pause when the payment fails again — a card update takes 30 seconds.`;
  return renderAlertEmail({
    title: day === 7 ? "Last reminder: update your card" : "Your CallCatch payment didn't go through",
    intro,
    rows: [{ label: "What keeps working", value: "Voice greeting, voicemail transcripts and missed-call alerts" }],
    ctaUrl: portalUrl,
    ctaLabel: "Update payment method",
    footnote: "Questions? Reply to this email.",
  });
}

/**
 * Pauses the AI on every open thread of the account (same effect as module c's
 * `pauseAllAiForAccount`) and records which ones, so the billing sync can undo exactly this pause.
 */
async function pauseThreadsForBilling(db: Db, accountId: string, reason: "unpaid" | "canceled", subscriptionId: string): Promise<number> {
  const { data, error } = await db.from("conversations").update({ ai_paused: true }).eq("account_id", accountId).eq("ai_paused", false).select("id");
  if (error) throw new Error(`dunning thread pause failed: ${error.message}`);
  const ids = (data ?? []).map((c) => c.id);
  await track(DUNNING_AI_PAUSED_EVENT, { reason, subscription_id: subscriptionId, conversation_ids: ids, paused: ids.length }, { accountId });
  return ids.length;
}

export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  const started = Date.now();
  const counts = { past_due: 0, reminded: 0, paused: 0, cancelled: 0, ai_paused_threads: 0, errors: 0 };
  const db = createAdminSupabase();
  const now = Date.now();
  const portalUrl = `${env.appUrl()}/billing`;
  try {
    const subs = await db.from("subscriptions").select("*").in("status", ["past_due", "unpaid", "canceled"]).limit(2000);
    for (const sub of subs.data ?? []) {
      if (Date.now() - started > 50_000) break;
      try {
        const account = (await db.from("accounts").select("*").eq("id", sub.account_id).maybeSingle()).data;
        if (!account) continue;
        const business = businessNameOf(account);

        if (sub.status === "past_due") {
          counts.past_due++;
          // Stripe retries bump subscriptions.updated_at; anchor on the first reminder we sent (if any)
          // so the day count does not reset, and dedupe by day number over the last 30 days.
          const windowStart = new Date(now - 30 * DAY_MS).toISOString();
          const earliest = await db
            .from("events")
            .select("occurred_at")
            .eq("account_id", account.id)
            .eq("name", "dunning_reminder")
            .gte("occurred_at", windowStart)
            .order("occurred_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          const updatedAt = new Date(sub.updated_at).getTime();
          const since = earliest.data ? Math.min(updatedAt, new Date(earliest.data.occurred_at).getTime() - DAY_MS) : updatedAt;
          const dayIndex = Math.floor((now - since) / DAY_MS);
          const due = [...REMINDER_DAYS].reverse().find((d) => dayIndex >= d);
          if (!due) continue;
          const already = await db
            .from("events")
            .select("id")
            .eq("account_id", account.id)
            .eq("name", "dunning_reminder")
            .gte("occurred_at", windowStart)
            .contains("props", { day: due })
            .limit(1)
            .maybeSingle();
          if (already.data) continue;
          if (account.alert_email) {
            const { html, text } = reminderCopy(due, business, portalUrl);
            await sendEmail({ to: account.alert_email, subject: due === 7 ? "Last reminder: update your CallCatch card" : "Action needed: your CallCatch payment failed", html, text, tags: [{ name: "kind", value: "dunning" }] });
          }
          await track("dunning_reminder", { day: due, subscription_id: sub.stripe_subscription_id }, { accountId: account.id });
          counts.reminded++;
          continue;
        }

        if (sub.status === "unpaid") {
          if (account.status === "live") {
            await db.from("accounts").update({ status: "paused" }).eq("id", account.id).eq("status", "live");
            counts.ai_paused_threads += await pauseThreadsForBilling(db, account.id, "unpaid", sub.stripe_subscription_id);
            counts.paused++;
            if (account.alert_email) {
              const { html, text } = renderAlertEmail({
                title: "CallCatch is paused for non-payment",
                intro: `Text-backs and AI replies for ${business} are paused. Your greeting, voicemails and missed-call alerts keep working. Update your card to resume instantly.`,
                ctaUrl: portalUrl,
                ctaLabel: "Update payment method",
              });
              await sendEmail({ to: account.alert_email, subject: "CallCatch paused — update your card to resume", html, text, tags: [{ name: "kind", value: "dunning_paused" }] });
            }
            await track("account_paused_nonpayment", { subscription_id: sub.stripe_subscription_id }, { accountId: account.id });
          }
          continue;
        }

        if (sub.status === "canceled" && account.status !== "cancelled") {
          await db.from("accounts").update({ status: "cancelled" }).eq("id", account.id);
          counts.ai_paused_threads += await pauseThreadsForBilling(db, account.id, "canceled", sub.stripe_subscription_id);
          counts.cancelled++;
          await track("subscription_canceled", { subscription_id: sub.stripe_subscription_id, via: "dunning_cron" }, { accountId: account.id });
        }
      } catch (err) {
        counts.errors++;
        console.error("[cron:dunning] failed", { subscription: sub.stripe_subscription_id, err: err instanceof Error ? err.message : err });
      }
    }
    return cronResponse("dunning", started, counts);
  } catch (err) {
    return cronError("dunning", started, err, counts);
  }
}
