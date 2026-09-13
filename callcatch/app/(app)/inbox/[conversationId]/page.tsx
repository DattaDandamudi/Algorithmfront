import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Phone, PhoneMissed, Wallet } from "lucide-react";
import { businessName, getAppContext, loadNumbers } from "@/components/dashboard/context";
import { formatDate, formatDateTime, formatTime, titleCase } from "@/components/dashboard/format";
import { btn, Card, Notice } from "@/components/dashboard/primitives";
import { StatusPill, conversationPill, urgencyPill } from "@/components/dashboard/StatusPill";
import { Bubble } from "@/components/dashboard/Bubble";
import { ReplyBox } from "@/components/dashboard/ReplyBox";
import { ThreadControls } from "@/components/dashboard/ThreadControls";
import { ConversationRealtime } from "@/components/dashboard/ConversationRealtime";
import { formatPhone } from "@/lib/telephony/client";
import { formatUsd } from "@/lib/utils";

export const metadata: Metadata = { title: "Conversation" };
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConversationPage(props: PageProps<"/inbox/[conversationId]">) {
  const { conversationId } = await props.params;
  if (!UUID_RE.test(conversationId)) notFound();
  const ctx = await getAppContext();
  const { account, db } = ctx;
  const name = businessName(account);

  const { data: conv } = await db.from("conversations").select("*").eq("id", conversationId).eq("account_id", account.id).maybeSingle();
  if (!conv) notFound();

  const [{ data: contact }, { data: messages }, { data: lead }, { data: calls }, numbers] = await Promise.all([
    db.from("contacts").select("*").eq("id", conv.contact_id).eq("account_id", account.id).maybeSingle(),
    db.from("messages").select("*").eq("conversation_id", conv.id).eq("account_id", account.id).order("created_at", { ascending: true }).limit(500),
    db.from("leads").select("*").eq("conversation_id", conv.id).eq("account_id", account.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("calls").select("id, status, started_at, summary, is_emergency").eq("account_id", account.id).eq("contact_id", conv.contact_id).order("started_at", { ascending: false }).limit(3),
    loadNumbers(db, account.id),
  ]);

  const smsEnabled = numbers.some((n) => n.sms_enabled);
  const pill = conversationPill(conv.status);
  const urgency = urgencyPill(lead?.urgency);
  const displayName = contact?.name?.trim() || formatPhone(contact?.phone);
  const disabledReason = contact?.opted_out
    ? "This customer opted out of texts (STOP). Call them instead."
    : !smsEnabled
      ? "Texting is off until your number passes carrier verification."
      : account.status !== "live" && account.status !== "pending_verification"
        ? "Your account is paused — resume it under Billing to send texts."
        : ctx.impersonating
          ? "Read-only while viewing as an admin."
          : undefined;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <ConversationRealtime conversationId={conv.id} />
      <div className="mb-4">
        <Link href="/inbox" className={btn.ghost}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Inbox
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="flex min-h-[60vh] flex-col lg:col-span-2" aria-label="Message thread">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-brand-900">{displayName}</h1>
              <p className="text-sm text-brand-500">
                {contact?.name ? `${formatPhone(contact.phone)} · ` : ""}
                {titleCase(conv.source)} · started {formatDateTime(conv.created_at, account.timezone)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
              {conv.ai_paused ? <StatusPill tone="warning">AI paused</StatusPill> : null}
              {contact?.opted_out ? <StatusPill tone="danger">Opted out</StatusPill> : null}
              {contact?.phone ? (
                <a href={`tel:${contact.phone}`} className={btn.primary}>
                  <Phone className="h-4 w-4" aria-hidden /> Call
                </a>
              ) : null}
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-brand-100 bg-brand-50/40 p-4 sm:p-5">
            {(messages ?? []).length === 0 ? (
              <p className="py-10 text-center text-sm text-brand-500">No messages yet. {smsEnabled ? "Send the first one below." : "The text-back goes out automatically once your number is verified."}</p>
            ) : (
              (messages ?? []).map((m) => <Bubble key={m.id} message={m} businessName={name} time={formatTime(m.created_at, account.timezone)} />)
            )}
          </div>

          <div className="mt-3">
            <ReplyBox conversationId={conv.id} disabled={Boolean(disabledReason)} disabledReason={disabledReason} businessName={name} />
          </div>
        </section>

        <aside className="space-y-4" aria-label="Conversation details">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-brand-900">Handle this thread</h2>
            <ThreadControls conversationId={conv.id} aiPaused={conv.ai_paused} status={conv.status} readOnly={ctx.impersonating} />
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-brand-900">Lead details</h2>
            {lead ? (
              <dl className="space-y-2.5 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-brand-500">Issue</dt>
                  <dd className="text-right font-medium text-brand-900">{lead.issue ?? "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-brand-500">Urgency</dt>
                  <dd>{urgency ? <StatusPill tone={urgency.tone}>{urgency.label}</StatusPill> : "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-brand-500">Address</dt>
                  <dd className="text-right font-medium text-brand-900">
                    {lead.address || lead.zip ? (
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent([lead.address, lead.zip].filter(Boolean).join(" "))}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                      >
                        <MapPin className="h-3.5 w-3.5" aria-hidden /> {[lead.address, lead.zip].filter(Boolean).join(", ")}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-brand-500">Preferred window</dt>
                  <dd className="text-right font-medium text-brand-900">{lead.preferred_window ?? "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-brand-500">Est. value</dt>
                  <dd className="inline-flex items-center gap-1 font-medium text-brand-900">
                    <Wallet className="h-3.5 w-3.5 text-brand-400" aria-hidden />
                    {lead.est_value_usd != null ? formatUsd(Number(lead.est_value_usd)) : `~${formatUsd(Number(account.avg_ticket_usd))} avg`}
                  </dd>
                </div>
                {lead.booked_at ? (
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-brand-500">Booked</dt>
                    <dd className="font-medium text-brand-900">{formatDate(lead.booked_at, account.timezone)}</dd>
                  </div>
                ) : null}
                {lead.lost_reason ? (
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-brand-500">Lost reason</dt>
                    <dd className="font-medium text-brand-900">{titleCase(lead.lost_reason)}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="text-sm text-brand-500">The AI fills this in as the caller answers: issue, address, urgency and preferred window.</p>
            )}
            <Link href={`/leads?q=${encodeURIComponent(contact?.phone ?? "")}`} className="mt-3 inline-block text-xs font-semibold text-brand-700 underline-offset-2 hover:underline">
              Open in Leads
            </Link>
          </Card>

          {(calls ?? []).length > 0 ? (
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-brand-900">Calls from this number</h2>
              <ul className="space-y-2 text-sm">
                {(calls ?? []).map((c) => (
                  <li key={c.id} className="flex items-start gap-2">
                    <PhoneMissed className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-brand-900">
                        {titleCase(c.status)} · {formatDateTime(c.started_at, account.timezone)}
                        {c.is_emergency ? (
                          <StatusPill tone="danger" className="ml-2">
                            Emergency
                          </StatusPill>
                        ) : null}
                      </p>
                      {c.summary ? <p className="text-xs text-brand-600">{c.summary}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
              <Link href="/calls" className="mt-3 inline-block text-xs font-semibold text-brand-700 underline-offset-2 hover:underline">
                All calls
              </Link>
            </Card>
          ) : null}

          {contact?.consent_source ? (
            <Notice tone="info">
              Consent: {titleCase(contact.consent_source)} on {formatDate(contact.created_at, account.timezone)}. Every first text includes “Reply STOP to opt out”.
            </Notice>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
