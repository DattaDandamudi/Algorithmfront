import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Inbox,
  MessageSquareReply,
  MessagesSquare,
  PhoneMissed,
  PhoneOutgoing,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { businessName, getAppContext, loadNumbers, overallVerification } from "@/components/dashboard/context";
import { formatDateTime, timeAgo, truncate } from "@/components/dashboard/format";
import { btn, Card, CardTitle, Notice } from "@/components/dashboard/primitives";
import { StatTile } from "@/components/dashboard/StatTile";
import { StatusPill, conversationPill } from "@/components/dashboard/StatusPill";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { TrendBars } from "@/components/dashboard/TrendBars";
import { ForwardingInstructions } from "@/components/dashboard/ForwardingInstructions";
import { computeWeekStats, recentWeekStarts } from "@/lib/reports/weekly";
import { formatPhone } from "@/lib/telephony/client";
import { formatUsd } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function weekLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const ctx = await getAppContext();
  const { account, db } = ctx;
  const sp = await props.searchParams;
  const welcome = sp.welcome === "1";
  const name = businessName(account);

  const weeks = recentWeekStarts(4, new Date(), account.timezone);
  const [numbers, weekStats, recent] = await Promise.all([
    loadNumbers(db, account.id),
    Promise.all(weeks.map((w) => computeWeekStats(db, account, w))),
    db
      .from("conversations")
      .select("id, status, source, ai_paused, last_message_at, created_at, contacts(name, phone, opted_out)")
      .eq("account_id", account.id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(6),
  ]);

  const thisWeek = weekStats[weekStats.length - 1];
  const verification = overallVerification(numbers);
  const primaryNumber = numbers[0] ?? null;
  const verifiedAt = numbers.find((n) => n.verification_status === "verified")?.verified_at ?? null;

  const recentIds = (recent.data ?? []).map((c) => c.id);
  const previews = new Map<string, string>();
  if (recentIds.length > 0) {
    const { data: msgs } = await db
      .from("messages")
      .select("conversation_id, body, created_at")
      .eq("account_id", account.id)
      .in("conversation_id", recentIds)
      .order("created_at", { ascending: false })
      .limit(60);
    for (const m of msgs ?? []) if (!previews.has(m.conversation_id)) previews.set(m.conversation_id, m.body);
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-600">This week</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-900 sm:text-3xl">{welcome ? `Welcome aboard, ${name}` : name}</h1>
          <p className="mt-1 text-sm text-brand-600">
            Week of {weekLabel(thisWeek.weekStart)} · {account.timezone ?? "America/Chicago"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/inbox" className={btn.secondary}>
            <Inbox className="h-4 w-4" aria-hidden /> Open inbox
          </Link>
          <Link href="/leads" className={btn.primary}>
            <Users className="h-4 w-4" aria-hidden /> Leads
          </Link>
        </div>
      </header>

      {welcome ? (
        <Card tone="navy" className="mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent-300">
                <Sparkles className="h-4 w-4" aria-hidden /> You&apos;re set up
              </p>
              <h2 className="mt-2 text-xl font-bold">Your front desk is on duty.</h2>
              <p className="mt-2 max-w-2xl text-sm text-brand-100">
                From now on every call you can&apos;t answer gets a greeting, a voicemail transcript and an alert on your phone
                {verification === "verified" ? ", and the caller gets a text back within seconds." : ". Text-backs switch on automatically the moment your number passes carrier verification (usually 3–10 business days)."}
              </p>
            </div>
            <Link href="/onboarding?step=5" className={btn.primary}>
              Test my forwarding <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </Card>
      ) : null}

      {verification === "verified" ? (
        <Notice tone="success" className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              <span>
                <strong>You&apos;re live.</strong> {primaryNumber ? formatPhone(primaryNumber.phone_number) : "Your number"} is verified — missed calls text back in seconds
                {verifiedAt ? ` (since ${formatDateTime(verifiedAt, account.timezone)})` : ""}.
              </span>
            </span>
            <Link href="/settings?tab=ai" className="text-sm font-semibold underline-offset-2 hover:underline">
              Tune the AI profile
            </Link>
          </div>
        </Notice>
      ) : (
        <Card tone="accent" className="mb-6">
          <CardTitle
            icon={<Clock className="h-5 w-5" aria-hidden />}
            sub={
              verification === "rejected"
                ? `The carrier rejected the verification${primaryNumber?.rejection_reason ? `: ${primaryNumber.rejection_reason}` : ""}. Fix the business details and resubmit from onboarding.`
                : verification === "not_submitted"
                  ? "Finish the compliance step in onboarding to submit your number for toll-free verification."
                  : "Carrier verification usually takes 3–10 business days. Until then, callers still hear your greeting and you still get every voicemail transcribed and alerted — only the SMS text-back waits."
            }
          >
            {verification === "rejected" ? "Verification needs attention" : verification === "not_submitted" ? "Number not yet submitted" : "Text-backs turn on when your number is verified"}
          </CardTitle>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusPill tone={verification === "rejected" ? "danger" : "warning"}>
              {primaryNumber ? formatPhone(primaryNumber.phone_number) : "No number yet"} · {verification.replace("_", " ")}
            </StatusPill>
            {primaryNumber?.verification_submitted_at ? <span className="text-xs text-brand-600">Submitted {formatDateTime(primaryNumber.verification_submitted_at, account.timezone)}</span> : null}
          </div>
          <details className="group rounded-xl border border-accent-200 bg-white/70 p-3" open={welcome}>
            <summary className="cursor-pointer text-sm font-semibold text-brand-900">Make sure your calls forward while you wait</summary>
            <div className="mt-3 space-y-3">
              <ForwardingInstructions number={primaryNumber?.phone_number ?? null} />
              <Link href="/onboarding?step=5" className={btn.primary}>
                <PhoneOutgoing className="h-4 w-4" aria-hidden /> Test my forwarding
              </Link>
            </div>
          </details>
        </Card>
      )}

      <section aria-label="This week's numbers" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatTile label="Missed calls" value={thisWeek.missedCalls} icon={<PhoneMissed className="h-4 w-4" aria-hidden />} hint="Forwarded to CallCatch" />
        <StatTile label="Texted back" value={thisWeek.textedBack} icon={<MessagesSquare className="h-4 w-4" aria-hidden />} hint={verification === "verified" ? "Within seconds" : "Starts on verification"} />
        <StatTile label="Replied" value={thisWeek.replied} icon={<MessageSquareReply className="h-4 w-4" aria-hidden />} hint="Callers who texted back" />
        <StatTile label="Booked" value={thisWeek.booked} icon={<CheckCircle2 className="h-4 w-4" aria-hidden />} hint={`${thisWeek.qualified} qualified`} />
        <StatTile
          label="Est. revenue recovered"
          value={formatUsd(thisWeek.estimatedRevenueUsd)}
          tone="accent"
          icon={<Wallet className="h-4 w-4" aria-hidden />}
          hint={
            <>
              Booked × {formatUsd(thisWeek.avgTicketUsd)} avg ticket ·{" "}
              <Link href="/settings?tab=business" className="font-semibold underline-offset-2 hover:underline">
                edit
              </Link>
            </>
          }
          className="col-span-2 lg:col-span-1"
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardTitle sub="Last four weeks, Monday to Sunday.">Trend</CardTitle>
          <div className="grid gap-5">
            <TrendBars title="Missed calls" points={weekStats.map((w, i) => ({ label: weekLabel(w.weekStart), value: w.missedCalls, highlight: i === weekStats.length - 1 }))} />
            <TrendBars title="Booked jobs" points={weekStats.map((w, i) => ({ label: weekLabel(w.weekStart), value: w.booked, highlight: i === weekStats.length - 1 }))} />
            <TrendBars
              title="Est. revenue recovered"
              points={weekStats.map((w, i) => ({ label: weekLabel(w.weekStart), value: w.estimatedRevenueUsd, highlight: i === weekStats.length - 1 }))}
              valueLabel={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`)}
            />
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <CardTitle
            sub="Newest activity across text-backs, web forms and manual threads."
            action={
              <Link href="/inbox" className={btn.ghost}>
                All conversations <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            }
          >
            Recent conversations
          </CardTitle>
          {(recent.data ?? []).length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-6 w-6" aria-hidden />}
              title="No conversations yet"
              body="When a call gets forwarded and the caller texts back, the thread shows up here. Try the forwarding test to see it in action."
              action={
                <Link href="/onboarding?step=5" className={btn.secondary}>
                  Test my forwarding
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-brand-100">
              {(recent.data ?? []).map((c) => {
                const contact = c.contacts;
                const pill = conversationPill(c.status);
                return (
                  <li key={c.id}>
                    <Link href={`/inbox/${c.id}`} className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-3 transition hover:bg-brand-50/60">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                        {(contact?.name?.trim().charAt(0) || "#").toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-brand-900">{contact?.name?.trim() || formatPhone(contact?.phone)}</p>
                          <span className="shrink-0 text-xs text-brand-400">{timeAgo(c.last_message_at ?? c.created_at)}</span>
                        </div>
                        <p className="truncate text-sm text-brand-600">{truncate(previews.get(c.id), 80) || "No messages yet"}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <StatusPill tone={pill.tone} dot={false}>
                            {pill.label}
                          </StatusPill>
                          {c.ai_paused ? (
                            <StatusPill tone="warning" dot={false}>
                              AI paused
                            </StatusPill>
                          ) : null}
                          {contact?.opted_out ? (
                            <StatusPill tone="danger" dot={false}>
                              Opted out
                            </StatusPill>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
