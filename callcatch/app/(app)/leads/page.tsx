import type { Metadata } from "next";
import Link from "next/link";
import { Download, MessageSquare, Phone, Users } from "lucide-react";
import { getAppContext } from "@/components/dashboard/context";
import { formatDateTime, titleCase } from "@/components/dashboard/format";
import { PageHeader, btn, inputClass, selectClass } from "@/components/dashboard/primitives";
import { StatusPill, leadPill, urgencyPill } from "@/components/dashboard/StatusPill";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Tabs } from "@/components/dashboard/Tabs";
import { LeadStatusActions, LeadValueEditor } from "@/components/dashboard/LeadRowActions";
import type { LeadRow } from "@/lib/db/types";
import { formatPhone, normalizePhone } from "@/lib/telephony/client";
import { cn, formatUsd } from "@/lib/utils";

export const metadata: Metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

const STATUSES = ["all", "new", "qualified", "booked", "lost"] as const;
const URGENCIES = ["emergency", "today", "this_week", "flexible"] as const;
type StatusFilter = (typeof STATUSES)[number];

export default async function LeadsPage(props: PageProps<"/leads">) {
  const ctx = await getAppContext();
  const { account, db } = ctx;
  const sp = await props.searchParams;
  const status: StatusFilter = STATUSES.includes(sp.status as StatusFilter) ? (sp.status as StatusFilter) : "all";
  const urgency = URGENCIES.includes(sp.urgency as (typeof URGENCIES)[number]) ? (sp.urgency as string) : "";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const avgTicket = Number(account.avg_ticket_usd) || 450;

  let query = db.from("leads").select("*").eq("account_id", account.id).order("created_at", { ascending: false }).limit(200);
  if (status !== "all") query = query.eq("status", status);
  if (urgency) query = query.eq("urgency", urgency);
  if (q) {
    const phone = normalizePhone(q);
    const safe = q.replace(/[%_,()]/g, "");
    query = phone ? query.eq("phone", phone) : query.or(`name.ilike.%${safe}%,issue.ilike.%${safe}%,address.ilike.%${safe}%`);
  }

  const [{ data: rows }, counts] = await Promise.all([
    query,
    Promise.all((["new", "qualified", "booked", "lost"] as const).map((s) => db.from("leads").select("id", { count: "exact", head: true }).eq("account_id", account.id).eq("status", s))),
  ]);
  const leads = rows ?? [];
  const pipelineValue = leads.filter((l) => l.status !== "lost").reduce((sum, l) => sum + (l.est_value_usd != null ? Number(l.est_value_usd) : avgTicket), 0);

  const keep = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    const merged = { status, urgency, q, ...over };
    for (const [k, v] of Object.entries(merged)) if (v && v !== "all") p.set(k, v);
    const s = p.toString();
    return `/leads${s ? `?${s}` : ""}`;
  };

  const columns: Column<LeadRow>[] = [
    {
      key: "who",
      header: "Lead",
      cell: (l) => {
        const pill = leadPill(l.status);
        const u = urgencyPill(l.urgency);
        return (
          <div className="min-w-[12rem]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-brand-900">{l.name?.trim() || formatPhone(l.phone)}</span>
              {u ? (
                <StatusPill tone={u.tone} dot={false}>
                  {u.label}
                </StatusPill>
              ) : null}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-brand-500">
              <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
                <Phone className="h-3 w-3" aria-hidden /> {formatPhone(l.phone)}
              </a>
              <span className="sm:hidden">
                <StatusPill tone={pill.tone} dot={false}>
                  {pill.label}
                </StatusPill>
              </span>
            </div>
            <p className="mt-1 text-xs text-brand-600 md:hidden">{l.issue ?? "No issue captured yet"}</p>
          </div>
        );
      },
    },
    {
      key: "issue",
      header: "Issue",
      hideBelow: "md",
      cell: (l) => (
        <div className="max-w-[18rem]">
          <p className="text-brand-900">{l.issue ?? <span className="italic text-brand-400">Not captured yet</span>}</p>
          <p className="mt-0.5 text-xs text-brand-500">
            {[l.address, l.zip].filter(Boolean).join(", ") || "No address"}
            {l.preferred_window ? ` · ${l.preferred_window}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      hideBelow: "sm",
      cell: (l) => {
        const pill = leadPill(l.status);
        return (
          <div className="flex flex-col gap-1">
            <StatusPill tone={pill.tone} dot={false}>
              {pill.label}
            </StatusPill>
            {l.status === "lost" && l.lost_reason ? <span className="text-xs text-brand-500">{titleCase(l.lost_reason)}</span> : null}
          </div>
        );
      },
    },
    {
      key: "value",
      header: "Est. value",
      align: "right",
      cell: (l) => <LeadValueEditor leadId={l.id} value={l.est_value_usd != null ? Number(l.est_value_usd) : null} fallbackUsd={avgTicket} readOnly={ctx.impersonating} />,
    },
    {
      key: "when",
      header: "Received",
      hideBelow: "lg",
      cell: (l) => (
        <div className="text-xs text-brand-600">
          <p>{formatDateTime(l.created_at, account.timezone)}</p>
          <p className="text-brand-400">{titleCase(l.source)}</p>
        </div>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (l) => (
        <div className="flex flex-col items-end gap-1.5">
          <LeadStatusActions leadId={l.id} status={l.status} readOnly={ctx.impersonating} />
          {l.conversation_id ? (
            <Link href={`/inbox/${l.conversation_id}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-900 hover:underline">
              <MessageSquare className="h-3 w-3" aria-hidden /> Thread
            </Link>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        eyebrow="Leads"
        title="Booking-ready leads"
        sub={`${leads.length} shown · ${formatUsd(pipelineValue)} open pipeline (est. value, or your ${formatUsd(avgTicket)} average ticket when blank)`}
        action={
          <a href={`/leads/export${keep({}).slice("/leads".length)}`} className={btn.secondary} download>
            <Download className="h-4 w-4" aria-hidden /> Export CSV
          </a>
        }
      />

      <Tabs
        ariaLabel="Filter leads by status"
        active={status}
        items={[
          { id: "all", label: "All", href: keep({ status: "all" }) },
          { id: "new", label: "New", href: keep({ status: "new" }), count: counts[0].count ?? 0 },
          { id: "qualified", label: "Qualified", href: keep({ status: "qualified" }), count: counts[1].count ?? 0 },
          { id: "booked", label: "Booked", href: keep({ status: "booked" }), count: counts[2].count ?? 0 },
          { id: "lost", label: "Lost", href: keep({ status: "lost" }), count: counts[3].count ?? 0 },
        ]}
      />

      <form action="/leads" method="get" className="mt-4 flex flex-wrap items-end gap-2">
        {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
        <div className="flex-1 min-w-[12rem]">
          <label htmlFor="leads-q" className="sr-only">
            Search leads
          </label>
          <input id="leads-q" name="q" defaultValue={q} placeholder="Search name, phone, issue or address" className={inputClass} />
        </div>
        <div>
          <label htmlFor="leads-urgency" className="sr-only">
            Urgency
          </label>
          <select id="leads-urgency" name="urgency" defaultValue={urgency} className={cn(selectClass, "w-40")}>
            <option value="">Any urgency</option>
            <option value="emergency">Emergency</option>
            <option value="today">Today</option>
            <option value="this_week">This week</option>
            <option value="flexible">Flexible</option>
          </select>
        </div>
        <button type="submit" className={btn.secondary}>
          Filter
        </button>
        {q || urgency ? (
          <Link href={keep({ q: "", urgency: "" })} className={btn.ghost}>
            Clear
          </Link>
        ) : null}
      </form>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={leads}
          rowKey={(l) => l.id}
          caption="Leads"
          rowClassName={(l) => (l.urgency === "emergency" && l.status !== "booked" && l.status !== "lost" ? "bg-red-50/40" : undefined)}
          empty={
            <EmptyState
              icon={<Users className="h-6 w-6" aria-hidden />}
              title={q || urgency || status !== "all" ? "No leads match those filters" : "No leads yet"}
              body={
                q || urgency || status !== "all"
                  ? "Loosen the filters or clear the search."
                  : "As callers answer the AI's questions, each one shows up here with the issue, address and urgency — ready to book."
              }
              action={
                q || urgency || status !== "all" ? (
                  <Link href="/leads" className={btn.secondary}>
                    Show all leads
                  </Link>
                ) : (
                  <Link href="/inbox" className={btn.secondary}>
                    Open inbox
                  </Link>
                )
              }
            />
          }
        />
      </div>
    </div>
  );
}
