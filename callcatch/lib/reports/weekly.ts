/**
 * Weekly "calls recovered" report (module e-dashboard).
 *
 * CONTRACT: consumed by module c's /api/cron/weekly-report:
 *   buildWeeklyStats(accountId, weekStart) -> WeeklyStats
 *   renderWeeklyEmail(stats, businessName) -> { subject, html, text }
 *
 * `weekStart` is interpreted as a calendar date (Monday) in the account's timezone; the
 * week covers Monday 00:00 → next Monday 00:00 local. The same computation powers the
 * dashboard tiles and 4-week trend (`computeWeekStats` accepts any Db, RLS or admin).
 */
import { createAdminSupabase, type Db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { safeTimeZone, zonedToUtc } from "@/lib/telephony/quietHours";
import { formatUsd } from "@/lib/utils";

export type WeeklyStats = {
  accountId: string;
  weekStart: string; // ISO date (Monday)
  weekEnd: string; // ISO date (Sunday)
  missedCalls: number;
  textedBack: number;
  replied: number;
  qualified: number;
  booked: number;
  avgTicketUsd: number;
  estimatedRevenueUsd: number; // booked * avgTicketUsd
  topIssues: { issue: string; count: number }[];
  referralUrl: string;
};

export type WeekAccount = {
  id: string;
  timezone: string | null;
  avg_ticket_usd: number | null;
  referral_code: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * YYYY-MM-DD for a "Monday" Date. Callers pass either a UTC-midnight date (the cron:
 * `new Date("2026-09-07T00:00:00Z")`) or a local-midnight date (`startOfWeekMonday`); a date
 * sitting exactly on UTC midnight is read with UTC fields, anything else with local fields.
 */
export function isoDate(d: Date): string {
  const utcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  const y = utcMidnight ? d.getUTCFullYear() : d.getFullYear();
  const m = String((utcMidnight ? d.getUTCMonth() : d.getMonth()) + 1).padStart(2, "0");
  const day = String(utcMidnight ? d.getUTCDate() : d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return t.toISOString().slice(0, 10);
}

/** UTC instants for [Monday 00:00, next Monday 00:00) in the account's timezone. */
export function weekWindow(weekStartIso: string, timezone: string | null): { start: Date; end: Date } {
  const tz = safeTimeZone(timezone);
  const [y, m, d] = weekStartIso.split("-").map(Number);
  const start = zonedToUtc(y, m, d, 0, 0, tz);
  const endIso = addDaysIso(weekStartIso, 7);
  const [ey, em, ed] = endIso.split("-").map(Number);
  const end = zonedToUtc(ey, em, ed, 0, 0, tz);
  return { start, end };
}

export function referralUrlFor(code: string | null | undefined): string {
  return code ? `${env.appUrl()}/signup?ref=${encodeURIComponent(code)}` : `${env.appUrl()}/signup`;
}

function normalizeIssue(raw: string): string {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return "";
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function groupTopIssues(issues: Array<string | null | undefined>, limit = 5): { issue: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const raw of issues) {
    if (!raw) continue;
    const key = normalizeIssue(raw).slice(0, 80);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count || a.issue.localeCompare(b.issue))
    .slice(0, limit);
}

/**
 * Computes one week of stats for an account with whichever client the caller holds
 * (RLS client on the dashboard, service role in the cron). Every query is account-scoped.
 */
export async function computeWeekStats(db: Db, account: WeekAccount, weekStartIso: string): Promise<WeeklyStats> {
  const { start, end } = weekWindow(weekStartIso, account.timezone);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const avgTicketUsd = Number(account.avg_ticket_usd ?? 450) || 450;

  const [calls, conversations, leadsCreated, leadsBooked] = await Promise.all([
    db
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("account_id", account.id)
      .in("status", ["missed", "voicemail", "answered_by_greeting"])
      .gte("started_at", startIso)
      .lt("started_at", endIso),
    db
      .from("conversations")
      .select("id, source")
      .eq("account_id", account.id)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    db
      .from("leads")
      .select("id, status, issue")
      .eq("account_id", account.id)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    db
      .from("leads")
      .select("id, est_value_usd")
      .eq("account_id", account.id)
      .eq("status", "booked")
      .gte("booked_at", startIso)
      .lt("booked_at", endIso),
  ]);

  const convRows = conversations.data ?? [];
  const convIds = convRows.map((c) => c.id);
  const missedCallConvIds = new Set(convRows.filter((c) => c.source === "missed_call").map((c) => c.id));

  let textedBack = 0;
  let replied = 0;
  if (convIds.length > 0) {
    // One round-trip for the message shape of every conversation started this week.
    const msgs = await db
      .from("messages")
      .select("conversation_id, direction, author, status")
      .eq("account_id", account.id)
      .in("conversation_id", convIds)
      .neq("status", "failed");
    const outbound = new Set<string>();
    const inbound = new Set<string>();
    for (const m of msgs.data ?? []) {
      if (m.direction === "out" && m.author !== "system") outbound.add(m.conversation_id);
      if (m.direction === "in" && m.author === "contact") inbound.add(m.conversation_id);
    }
    for (const id of outbound) if (missedCallConvIds.has(id)) textedBack++;
    replied = inbound.size;
  }

  const created = leadsCreated.data ?? [];
  const qualified = created.filter((l) => l.status === "qualified" || l.status === "booked").length;
  const bookedRows = leadsBooked.data ?? [];
  const booked = bookedRows.length;
  // "Booked × average ticket", honouring an owner-entered estimate where one exists.
  const estimatedRevenueUsd = Math.round(
    bookedRows.reduce((sum, l) => sum + (l.est_value_usd != null && l.est_value_usd > 0 ? Number(l.est_value_usd) : avgTicketUsd), 0)
  );

  return {
    accountId: account.id,
    weekStart: weekStartIso,
    weekEnd: addDaysIso(weekStartIso, 6),
    missedCalls: calls.count ?? 0,
    textedBack,
    replied,
    qualified,
    booked,
    avgTicketUsd,
    estimatedRevenueUsd,
    topIssues: groupTopIssues(created.map((l) => l.issue)),
    referralUrl: referralUrlFor(account.referral_code),
  };
}

/** Cron entry point (service role). `weekStart` is the Monday of the week to report on. */
export async function buildWeeklyStats(accountId: string, weekStart: Date): Promise<WeeklyStats> {
  const db = createAdminSupabase();
  const { data: account } = await db
    .from("accounts")
    .select("id, timezone, avg_ticket_usd, referral_code")
    .eq("id", accountId)
    .maybeSingle();
  const weekStartIso = isoDate(weekStart);
  if (!account) {
    return {
      accountId,
      weekStart: weekStartIso,
      weekEnd: addDaysIso(weekStartIso, 6),
      missedCalls: 0,
      textedBack: 0,
      replied: 0,
      qualified: 0,
      booked: 0,
      avgTicketUsd: 450,
      estimatedRevenueUsd: 0,
      topIssues: [],
      referralUrl: referralUrlFor(null),
    };
  }
  return computeWeekStats(db, account, weekStartIso);
}

/** Mondays (ISO dates) for the last `n` weeks, most recent last. */
export function recentWeekStarts(n: number, now: Date = new Date(), timezone: string | null = null): string[] {
  const tz = safeTimeZone(timezone);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  const weekdayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const mondayOffset = (weekdayIdx + 6) % 7;
  const thisMonday = new Date(Date.UTC(y, m - 1, d - mondayOffset, 12, 0, 0));
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(thisMonday.getTime() - i * 7 * DAY_MS).toISOString().slice(0, 10));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Email rendering
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const NAVY = "#0b1f3a";
const NAVY_SOFT = "#22427a";
const ORANGE = "#ff6a1a";
const BG = "#fbfaf7";
const LINE = "#d8e2f2";

function statCell(label: string, value: string, highlight = false): string {
  return `<td style="padding:6px;width:50%;vertical-align:top">
    <div style="border:1px solid ${LINE};border-radius:12px;padding:16px 18px;background:${highlight ? "#fff4ee" : "#ffffff"}">
      <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${highlight ? "#bf4208" : "#4f75b5"}">${escapeHtml(label)}</div>
      <div style="font-size:28px;font-weight:800;color:${NAVY};margin-top:4px;line-height:1.1">${escapeHtml(value)}</div>
    </div>
  </td>`;
}

export function renderWeeklyEmail(stats: WeeklyStats, businessName: string): { subject: string; html: string; text: string } {
  const name = businessName.trim() || "your business";
  const range = `${prettyDate(stats.weekStart)} – ${prettyDate(stats.weekEnd)}`;
  const revenue = formatUsd(stats.estimatedRevenueUsd);
  const appUrl = env.appUrl();
  const quiet = stats.missedCalls === 0 && stats.replied === 0 && stats.booked === 0;

  const subject = quiet
    ? `Quiet week at ${name} — CallCatch report (${range})`
    : `${stats.booked > 0 ? `${stats.booked} booked, ` : ""}${stats.missedCalls} missed call${stats.missedCalls === 1 ? "" : "s"} recovered — ${name}`;

  const headline = quiet
    ? "No missed calls this week."
    : stats.booked > 0
      ? `About ${revenue} in jobs came from calls you couldn't pick up.`
      : `${stats.textedBack} caller${stats.textedBack === 1 ? "" : "s"} got a text back while you were busy.`;

  const issuesHtml =
    stats.topIssues.length > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:8px">
          ${stats.topIssues
            .map(
              (t) => `<tr>
                <td style="padding:8px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${NAVY}">${escapeHtml(t.issue)}</td>
                <td style="padding:8px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${NAVY_SOFT};text-align:right;font-weight:600">${t.count}</td>
              </tr>`
            )
            .join("")}
        </table>`
      : `<p style="margin:8px 0 0;font-size:14px;color:#4f75b5">No qualified issues logged this week.</p>`;

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${NAVY}">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${BG}">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px">
        <tr><td style="padding:0 6px 16px">
          <span style="display:inline-block;background:${NAVY};color:#fff;font-weight:800;font-size:16px;padding:8px 12px;border-radius:10px;letter-spacing:.02em">Call<span style="color:${ORANGE}">Catch</span></span>
        </td></tr>
        <tr><td style="padding:0 6px">
          <div style="background:${NAVY};border-radius:16px;padding:24px 22px;color:#fff">
            <div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#ff9f6b">Calls recovered · ${escapeHtml(range)}</div>
            <div style="font-size:24px;font-weight:800;line-height:1.25;margin-top:8px">${escapeHtml(headline)}</div>
            <div style="font-size:14px;color:#b3c5e4;margin-top:8px">Weekly report for ${escapeHtml(name)}.</div>
          </div>
        </td></tr>
        <tr><td style="padding:12px 0 0">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate">
            <tr>${statCell("Missed calls", String(stats.missedCalls))}${statCell("Texted back", String(stats.textedBack))}</tr>
            <tr>${statCell("Replied", String(stats.replied))}${statCell("Qualified", String(stats.qualified))}</tr>
            <tr>${statCell("Booked", String(stats.booked))}${statCell("Est. revenue recovered", revenue, true)}</tr>
          </table>
          <p style="margin:6px 12px 0;font-size:12px;color:#4f75b5">Estimated revenue = booked jobs × your average ticket (${escapeHtml(formatUsd(stats.avgTicketUsd))}). Change it any time under Settings → Business.</p>
        </td></tr>
        <tr><td style="padding:16px 6px 0">
          <div style="background:#fff;border:1px solid ${LINE};border-radius:12px;padding:16px 18px">
            <div style="font-size:13px;font-weight:700;color:${NAVY}">What callers needed this week</div>
            ${issuesHtml}
          </div>
        </td></tr>
        <tr><td style="padding:16px 6px 0" align="center">
          <a href="${escapeHtml(appUrl)}/dashboard" style="display:inline-block;background:${ORANGE};color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:12px">Open your dashboard</a>
        </td></tr>
        <tr><td style="padding:20px 6px 0">
          <div style="background:#fff4ee;border:1px solid #ffc5a6;border-radius:12px;padding:14px 18px;font-size:14px;color:#7a2e0c">
            <strong>Know another contractor who misses calls?</strong> When they join with your link, you both get a month free.<br>
            <a href="${escapeHtml(stats.referralUrl)}" style="color:#bf4208;font-weight:600;word-break:break-all">${escapeHtml(stats.referralUrl)}</a>
          </div>
        </td></tr>
        <tr><td style="padding:20px 12px 0;font-size:12px;color:#7f9dcf;line-height:1.5">
          You're receiving this because you have a CallCatch account. To stop the weekly report, turn it off under Settings → Alerts, or reply to this email and we'll take care of it.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `CallCatch — calls recovered (${range})`,
    `${name}`,
    "",
    headline,
    "",
    `Missed calls: ${stats.missedCalls}`,
    `Texted back: ${stats.textedBack}`,
    `Replied: ${stats.replied}`,
    `Qualified: ${stats.qualified}`,
    `Booked: ${stats.booked}`,
    `Estimated revenue recovered: ${revenue} (booked × ${formatUsd(stats.avgTicketUsd)} avg ticket)`,
    "",
    stats.topIssues.length > 0 ? "Top issues:" : "No qualified issues logged this week.",
    ...stats.topIssues.map((t) => `  - ${t.issue} (${t.count})`),
    "",
    `Dashboard: ${appUrl}/dashboard`,
    `Refer a contractor, you both get a month free: ${stats.referralUrl}`,
    "",
    "To stop the weekly report, turn it off under Settings → Alerts or reply to this email.",
  ].join("\n");

  return { subject, html, text };
}
