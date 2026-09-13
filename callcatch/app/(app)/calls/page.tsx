import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, MessageSquare, Phone, PhoneIncoming, PhoneMissed, Voicemail } from "lucide-react";
import { getAppContext } from "@/components/dashboard/context";
import { formatDateTime, formatDuration, titleCase } from "@/components/dashboard/format";
import { PageHeader, btn } from "@/components/dashboard/primitives";
import { StatusPill, type PillTone } from "@/components/dashboard/StatusPill";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Tabs } from "@/components/dashboard/Tabs";
import { formatPhone } from "@/lib/telephony/client";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Calls" };
export const dynamic = "force-dynamic";

const FILTERS = ["all", "voicemail", "missed", "emergency", "test"] as const;
type Filter = (typeof FILTERS)[number];

function callPill(status: string): { tone: PillTone; label: string } {
  switch (status) {
    case "voicemail":
      return { tone: "info", label: "Voicemail" };
    case "answered_by_greeting":
      return { tone: "neutral", label: "Heard greeting" };
    case "test":
      return { tone: "accent", label: "Forwarding test" };
    default:
      return { tone: "warning", label: "Missed" };
  }
}

export default async function CallsPage(props: PageProps<"/calls">) {
  const ctx = await getAppContext();
  const { account, db } = ctx;
  const sp = await props.searchParams;
  const filter: Filter = FILTERS.includes(sp.status as Filter) ? (sp.status as Filter) : "all";

  let query = db.from("calls").select("*, contacts(name)").eq("account_id", account.id).order("started_at", { ascending: false }).limit(150);
  if (filter === "emergency") query = query.eq("is_emergency", true);
  else if (filter !== "all") query = query.eq("status", filter);
  const { data: rows } = await query;
  const calls = rows ?? [];

  // "Texted back?" = an outbound message exists in a missed_call conversation for the caller's contact.
  const contactIds = [...new Set(calls.map((c) => c.contact_id).filter((id): id is string => Boolean(id)))];
  const textedBack = new Map<string, string>(); // contact_id -> conversation_id
  if (contactIds.length > 0) {
    const { data: convs } = await db.from("conversations").select("id, contact_id, created_at").eq("account_id", account.id).in("contact_id", contactIds).order("created_at", { ascending: false });
    const convIds = (convs ?? []).map((c) => c.id);
    if (convIds.length > 0) {
      const { data: outs } = await db.from("messages").select("conversation_id").eq("account_id", account.id).eq("direction", "out").neq("status", "failed").in("conversation_id", convIds);
      const withOut = new Set((outs ?? []).map((m) => m.conversation_id));
      for (const c of convs ?? []) if (withOut.has(c.id) && !textedBack.has(c.contact_id)) textedBack.set(c.contact_id, c.id);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader eyebrow="Calls" title="Forwarded calls" sub="Every call that reached CallCatch, with the voicemail, transcript and summary." />

      <Tabs
        ariaLabel="Filter calls"
        active={filter}
        items={[
          { id: "all", label: "All", href: "/calls" },
          { id: "voicemail", label: "Voicemails", href: "/calls?status=voicemail" },
          { id: "missed", label: "Missed", href: "/calls?status=missed" },
          { id: "emergency", label: "Emergencies", href: "/calls?status=emergency" },
          { id: "test", label: "Tests", href: "/calls?status=test" },
        ]}
      />

      <div className="mt-4 space-y-3">
        {calls.length === 0 ? (
          <EmptyState
            icon={<PhoneIncoming className="h-6 w-6" aria-hidden />}
            title={filter === "all" ? "No forwarded calls yet" : `No ${filter} calls`}
            body={
              filter === "all"
                ? "Once your business line forwards unanswered calls, each one shows up here with the recording and a transcript. Run the forwarding test to confirm it's working."
                : "Try another filter."
            }
            action={
              filter === "all" ? (
                <Link href="/onboarding?step=5" className={btn.secondary}>
                  Test my forwarding
                </Link>
              ) : (
                <Link href="/calls" className={btn.secondary}>
                  All calls
                </Link>
              )
            }
          />
        ) : (
          calls.map((c) => {
            const pill = callPill(c.status);
            const texted = c.contact_id ? textedBack.get(c.contact_id) : undefined;
            const name = c.contacts?.name?.trim();
            return (
              <article key={c.id} className={cn("rounded-2xl border bg-white p-4 shadow-[0_1px_2px_rgba(11,31,58,0.04)] sm:p-5", c.is_emergency ? "border-red-200" : "border-brand-100")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", c.is_emergency ? "bg-red-50 text-red-600" : "bg-brand-50 text-brand-600")}>
                      {c.is_emergency ? <AlertTriangle className="h-5 w-5" aria-hidden /> : c.status === "voicemail" ? <Voicemail className="h-5 w-5" aria-hidden /> : <PhoneMissed className="h-5 w-5" aria-hidden />}
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-brand-900">
                        {name || formatPhone(c.from_phone)}
                        {name ? <span className="ml-2 text-sm font-normal text-brand-500">{formatPhone(c.from_phone)}</span> : null}
                      </h2>
                      <p className="text-xs text-brand-500">
                        {formatDateTime(c.started_at, account.timezone)}
                        {c.forwarded_from ? ` · forwarded from ${formatPhone(c.forwarded_from)}` : ""}
                        {c.recording_duration ? ` · ${formatDuration(c.recording_duration)}` : ""}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <StatusPill tone={pill.tone} dot={false}>
                          {pill.label}
                        </StatusPill>
                        {c.is_emergency ? (
                          <StatusPill tone="danger" dot={false}>
                            Emergency
                          </StatusPill>
                        ) : null}
                        {c.status !== "test" ? (
                          texted ? (
                            <StatusPill tone="success" dot={false}>
                              <MessageSquare className="h-3 w-3" aria-hidden /> Texted back
                            </StatusPill>
                          ) : (
                            <StatusPill tone="neutral" dot={false} title="No SMS went out for this call (number not verified, opted out, or quiet hours)">
                              Not texted
                            </StatusPill>
                          )
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {texted ? (
                      <Link href={`/inbox/${texted}`} className={btn.secondary}>
                        <MessageSquare className="h-4 w-4" aria-hidden /> Thread
                      </Link>
                    ) : null}
                    <a href={`tel:${c.from_phone}`} className={btn.primary}>
                      <Phone className="h-4 w-4" aria-hidden /> Call back
                    </a>
                  </div>
                </div>

                {c.summary ? (
                  <p className={cn("mt-3 rounded-xl px-3 py-2 text-sm", c.is_emergency ? "bg-red-50 text-red-900" : "bg-brand-50/70 text-brand-900")}>
                    <span className="font-semibold">Summary: </span>
                    {c.summary}
                  </p>
                ) : null}

                {c.recording_url ? (
                  <div className="mt-3">
                    {/* Voicemail audio; the transcript below is the text alternative. */}
                    <audio controls preload="none" className="w-full" src={`/calls/recording/${c.id}`} aria-label={`Voicemail from ${name || formatPhone(c.from_phone)}`} />
                  </div>
                ) : null}

                {c.transcript ? (
                  <details className="mt-3 rounded-xl border border-brand-100 bg-white">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-brand-800">Transcript</summary>
                    <p className="whitespace-pre-wrap border-t border-brand-100 px-3 py-2 text-sm leading-relaxed text-brand-700">{c.transcript}</p>
                  </details>
                ) : c.status === "voicemail" ? (
                  <p className="mt-3 text-xs text-brand-500">Transcript is on its way — usually ready within a minute of the call.</p>
                ) : c.status === "missed" ? (
                  <p className="mt-3 text-xs text-brand-500">Caller hung up without leaving a message ({titleCase(c.status)}).</p>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
