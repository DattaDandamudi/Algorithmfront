import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, Search } from "lucide-react";
import { getAppContext } from "@/components/dashboard/context";
import { timeAgo, truncate } from "@/components/dashboard/format";
import { PageHeader, btn, inputClass } from "@/components/dashboard/primitives";
import { StatusPill, conversationPill } from "@/components/dashboard/StatusPill";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Tabs } from "@/components/dashboard/Tabs";
import { InboxRealtime } from "@/components/dashboard/ConversationRealtime";
import { formatPhone, normalizePhone } from "@/lib/telephony/client";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

const FILTERS = ["all", "open", "qualified", "booked", "lost", "paused"] as const;
type Filter = (typeof FILTERS)[number];

const SOURCE_LABEL: Record<string, string> = {
  missed_call: "Missed call",
  lead_form: "Lead form",
  web_form: "Web form",
  inbound_sms: "Inbound text",
  manual: "Manual",
};

export default async function InboxPage(props: PageProps<"/inbox">) {
  const ctx = await getAppContext();
  const { account, db } = ctx;
  const sp = await props.searchParams;
  const filter: Filter = FILTERS.includes(sp.status as Filter) ? (sp.status as Filter) : "all";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";

  let query = db
    .from("conversations")
    .select("id, status, source, ai_paused, last_message_at, created_at, turn_count, contact_id, contacts!inner(name, phone, opted_out)")
    .eq("account_id", account.id)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);
  if (filter === "paused") query = query.eq("ai_paused", true);
  else if (filter !== "all") query = query.eq("status", filter);
  if (q) {
    const phone = normalizePhone(q);
    query = phone ? query.eq("contacts.phone", phone) : query.ilike("contacts.name", `%${q.replace(/[%_]/g, "")}%`);
  }

  const [{ data: rows }, counts] = await Promise.all([
    query,
    Promise.all(
      (["open", "qualified", "booked"] as const).map((s) =>
        db.from("conversations").select("id", { count: "exact", head: true }).eq("account_id", account.id).eq("status", s)
      )
    ),
  ]);
  const list = rows ?? [];

  const previews = new Map<string, { body: string; direction: string }>();
  if (list.length > 0) {
    const { data: msgs } = await db
      .from("messages")
      .select("conversation_id, body, direction, created_at")
      .eq("account_id", account.id)
      .in(
        "conversation_id",
        list.map((c) => c.id)
      )
      .order("created_at", { ascending: false })
      .limit(400);
    for (const m of msgs ?? []) if (!previews.has(m.conversation_id)) previews.set(m.conversation_id, { body: m.body, direction: m.direction });
  }

  const tabHref = (id: Filter) => `/inbox?status=${id}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <InboxRealtime accountId={account.id} />
      <PageHeader
        eyebrow="Inbox"
        title="Conversations"
        sub="Every text-back, web-form reply and inbound text, in one place. Reply as the business any time — the AI steps aside."
        action={
          <form action="/inbox" method="get" className="flex items-center gap-2">
            {filter !== "all" ? <input type="hidden" name="status" value={filter} /> : null}
            <label htmlFor="inbox-q" className="sr-only">
              Search by name or phone
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" aria-hidden />
              <input id="inbox-q" name="q" defaultValue={q} placeholder="Name or phone" className={cn(inputClass, "w-56 pl-9")} />
            </div>
            <button type="submit" className={btn.secondary}>
              Search
            </button>
          </form>
        }
      />

      <Tabs
        ariaLabel="Filter conversations"
        active={filter}
        items={[
          { id: "all", label: "All", href: tabHref("all") },
          { id: "open", label: "Open", href: tabHref("open"), count: counts[0].count ?? 0 },
          { id: "qualified", label: "Qualified", href: tabHref("qualified"), count: counts[1].count ?? 0 },
          { id: "booked", label: "Booked", href: tabHref("booked"), count: counts[2].count ?? 0 },
          { id: "lost", label: "Lost", href: tabHref("lost") },
          { id: "paused", label: "AI paused", href: tabHref("paused") },
        ]}
      />

      <div className="mt-4">
        {list.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-6 w-6" aria-hidden />}
            title={q ? `Nothing matches “${q}”` : filter === "all" ? "Your inbox is empty — for now" : `No ${filter === "paused" ? "paused" : filter} conversations`}
            body={
              q
                ? "Try the phone number in any format, or part of the customer's name."
                : "Forward your business line, miss a call, and the thread lands here with the caller's texts and the AI's replies."
            }
            action={
              q || filter !== "all" ? (
                <Link href="/inbox" className={btn.secondary}>
                  Clear filters
                </Link>
              ) : (
                <Link href="/onboarding?step=5" className={btn.secondary}>
                  Test my forwarding
                </Link>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-brand-100 overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-[0_1px_2px_rgba(11,31,58,0.04)]">
            {list.map((c) => {
              const contact = c.contacts;
              const pill = conversationPill(c.status);
              const preview = previews.get(c.id);
              const displayName = contact?.name?.trim() || formatPhone(contact?.phone);
              return (
                <li key={c.id}>
                  <Link href={`/inbox/${c.id}`} className="flex items-start gap-3 px-4 py-3.5 transition hover:bg-brand-50/60 sm:px-5">
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold", c.status === "open" ? "bg-accent-100 text-accent-800" : "bg-brand-50 text-brand-700")}>
                      {(contact?.name?.trim().charAt(0) || "#").toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-brand-900">
                          {displayName}
                          {contact?.name ? <span className="ml-2 font-normal text-brand-400">{formatPhone(contact.phone)}</span> : null}
                        </p>
                        <span className="shrink-0 text-xs text-brand-400">{timeAgo(c.last_message_at ?? c.created_at)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-brand-600">
                        {preview ? (
                          <>
                            <span className="text-brand-400">{preview.direction === "out" ? "You: " : ""}</span>
                            {truncate(preview.body, 110)}
                          </>
                        ) : (
                          <span className="italic text-brand-400">No messages yet</span>
                        )}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <StatusPill tone={pill.tone} dot={false}>
                          {pill.label}
                        </StatusPill>
                        <StatusPill tone="neutral" dot={false}>
                          {SOURCE_LABEL[c.source] ?? c.source}
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
      </div>
    </div>
  );
}
