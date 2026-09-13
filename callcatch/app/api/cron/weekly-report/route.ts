/**
 * GET /api/cron/weekly-report — hourly. For each live account whose local time is Monday
 * 07:00–07:59 and that has no `weekly_reports` row for the week that just ended, builds the
 * stats (module e), emails the report, and (Pro) texts a two-line summary from the notification
 * number. The unique (account_id, week_start) index makes re-runs safe.
 */
import type { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import { sendEmail } from "@/lib/email/send";
import { track } from "@/lib/events";
import { getPlan } from "@/lib/plans";
import { buildWeeklyStats, renderWeeklyEmail } from "@/lib/reports/weekly";
import { businessNameOf } from "@/lib/ai/prompts";
import { sendOwnerAlert } from "@/lib/telephony/alerts";
import { localTime, safeTimeZone } from "@/lib/telephony/quietHours";
import { formatUsd } from "@/lib/utils";
import { authorizeCron, cronError, cronResponse } from "../_lib/cron";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Monday (YYYY-MM-DD) of the week that ended before the given local Monday date. */
function previousMonday(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - 7));
  return dt.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  const started = Date.now();
  const counts = { live: 0, due: 0, sent: 0, skipped_existing: 0, errors: 0 };
  const db = createAdminSupabase();
  const now = new Date();
  try {
    const accounts = await db.from("accounts").select("*").eq("status", "live").limit(2000);
    for (const account of accounts.data ?? []) {
      const aiProfile = (account.ai_profile ?? {}) as { weekly_report_opt_out?: boolean };
      if (aiProfile.weekly_report_opt_out) continue; // Settings → Alerts opt-out (module e)
      counts.live++;
      const lt = localTime(now, safeTimeZone(account.timezone));
      if (lt.weekday !== 1 || lt.hour !== 7) continue;
      counts.due++;
      if (Date.now() - started > 50_000) break;
      const weekStart = previousMonday(lt.dateIso);
      const existing = await db.from("weekly_reports").select("id").eq("account_id", account.id).eq("week_start", weekStart).maybeSingle();
      if (existing.data) {
        counts.skipped_existing++;
        continue;
      }
      try {
        const stats = await buildWeeklyStats(account.id, new Date(`${weekStart}T00:00:00Z`));
        const name = businessNameOf(account);
        const email = renderWeeklyEmail(stats, name);
        // Claim the week first (unique index) so a concurrent run cannot send twice.
        const claim = await db
          .from("weekly_reports")
          .insert({ account_id: account.id, week_start: weekStart, stats: stats as unknown as Json })
          .select("id")
          .single();
        if (claim.error || !claim.data) {
          counts.skipped_existing++;
          continue;
        }
        if (account.alert_email) {
          await sendEmail({ to: account.alert_email, subject: email.subject, html: email.html, text: email.text, tags: [{ name: "kind", value: "weekly_report" }] });
        }
        if (getPlan(account.plan).id === "pro") {
          await sendOwnerAlert({
            account,
            kind: "report",
            sms: `CallCatch weekly: ${stats.missedCalls} missed calls, ${stats.textedBack} texted back, ${stats.booked} booked, ~${formatUsd(stats.estimatedRevenueUsd)} recovered. Full report in your email.`,
            email: null,
          });
        }
        await db.from("weekly_reports").update({ sent_at: new Date().toISOString() }).eq("id", claim.data.id);
        await track("weekly_report_sent", { week_start: weekStart, booked: stats.booked }, { accountId: account.id });
        counts.sent++;
      } catch (err) {
        counts.errors++;
        console.error("[cron:weekly-report] failed", { accountId: account.id, err: err instanceof Error ? err.message : err });
      }
    }
    return cronResponse("weekly-report", started, counts);
  } catch (err) {
    return cronError("weekly-report", started, err, counts);
  }
}
