import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ShieldCheck, Users } from "lucide-react";
import { isAdminEmail, requireUser } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/db/client";
import { getPlan } from "@/lib/plans";
import { businessDaysSince, formatDateTime, timeAgo } from "@/components/dashboard/format";
import { PageHeader, btn } from "@/components/dashboard/primitives";
import { StatTile } from "@/components/dashboard/StatTile";
import { StatusPill, accountStatusPill, verificationPill } from "@/components/dashboard/StatusPill";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Tabs } from "@/components/dashboard/Tabs";
import { impersonateAction } from "./actions";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

const VIEWS = ["all", "pending", "live", "stalled", "attention"] as const;
type View = (typeof VIEWS)[number];
/** Escalate to Twilio support at day 5 (spec §5). */
const SLA_BUSINESS_DAYS = 5;

type AdminRow = {
  id: string;
  name: string;
  email: string | null;
  status: string;
  plan: string | null;
  trade: string | null;
  createdAt: string;
  verification: string;
  submittedAt: string | null;
  slaDays: number;
  lastActivity: string | null;
  subscription: string | null;
};

export default async function AdminPage(props: PageProps<"/admin">) {
  const osLinks = (
    <>
      <Link href="/admin/agents" className={btn.secondary}>Company OS</Link>
      <Link href="/admin/prospects" className={btn.secondary}>Prospects</Link>
    </>
  );
  const user = await requireUser();
  if (!isAdminEmail(user.email)) redirect("/dashboard");
  const sp = await props.searchParams;
  const view: View = VIEWS.includes(sp.view as View) ? (sp.view as View) : "all";

  const db = createAdminSupabase();
  const [{ data: accounts }, { data: numbers }, { data: subs }, { data: events }] = await Promise.all([
    db.from("accounts").select("id, legal_name, dba, alert_email, status, plan, trade, created_at").order("created_at", { ascending: false }).limit(1000),
    db.from("numbers").select("account_id, verification_status, verification_submitted_at, verified_at").eq("purpose", "customer"),
    db.from("subscriptions").select("account_id, status"),
    db.from("events").select("account_id, occurred_at").order("occurred_at", { ascending: false }).limit(5000),
  ]);

  const lastActivity = new Map<string, string>();
  for (const e of events ?? []) if (e.account_id && !lastActivity.has(e.account_id)) lastActivity.set(e.account_id, e.occurred_at);
  const subByAccount = new Map((subs ?? []).map((s) => [s.account_id, s.status]));
  const numbersByAccount = new Map<string, { verification_status: string; verification_submitted_at: string | null; verified_at: string | null }[]>();
  for (const n of numbers ?? []) {
    const list = numbersByAccount.get(n.account_id) ?? [];
    list.push(n);
    numbersByAccount.set(n.account_id, list);
  }
  const rank: Record<string, number> = { verified: 4, rejected: 3, in_review: 2, pending: 1, not_submitted: 0 };

  const rows: AdminRow[] = (accounts ?? []).map((a) => {
    const nums = numbersByAccount.get(a.id) ?? [];
    const top = nums.slice().sort((x, y) => (rank[y.verification_status] ?? 0) - (rank[x.verification_status] ?? 0))[0];
    const verification = top?.verification_status ?? "not_submitted";
    const submittedAt = top?.verification_submitted_at ?? null;
    const open = verification === "pending" || verification === "in_review";
    return {
      id: a.id,
      name: a.dba?.trim() || a.legal_name?.trim() || "Unnamed account",
      email: a.alert_email,
      status: a.status,
      plan: a.plan,
      trade: a.trade,
      createdAt: a.created_at,
      verification,
      submittedAt,
      slaDays: open ? businessDaysSince(submittedAt) : 0,
      lastActivity: lastActivity.get(a.id) ?? null,
      subscription: subByAccount.get(a.id) ?? null,
    };
  });

  const stalled = rows.filter((r) => r.slaDays >= SLA_BUSINESS_DAYS);
  const attention = rows.filter((r) => r.verification === "rejected" || r.subscription === "past_due" || r.subscription === "unpaid");
  const filtered =
    view === "pending"
      ? rows.filter((r) => r.verification === "pending" || r.verification === "in_review")
      : view === "live"
        ? rows.filter((r) => r.status === "live")
        : view === "stalled"
          ? stalled
          : view === "attention"
            ? attention
            : rows;

  const columns: Column<AdminRow>[] = [
    {
      key: "account",
      header: "Account",
      cell: (r) => (
        <div className="min-w-[12rem]">
          <Link href={`/admin/accounts/${r.id}`} className="font-semibold text-brand-900 hover:underline">
            {r.name}
          </Link>
          <p className="text-xs text-brand-500">
            {r.email ?? "no email"} · {r.trade ?? "—"} · joined {timeAgo(r.createdAt)}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => {
        const p = accountStatusPill(r.status);
        return (
          <div className="flex flex-col gap-1">
            <StatusPill tone={p.tone}>{p.label}</StatusPill>
            <span className="text-xs text-brand-500">
              {getPlan(r.plan).name} · {r.subscription ?? "no sub"}
            </span>
          </div>
        );
      },
    },
    {
      key: "verification",
      header: "Verification",
      cell: (r) => {
        const p = verificationPill(r.verification);
        return (
          <div className="flex flex-col gap-1">
            <StatusPill tone={p.tone}>{p.label}</StatusPill>
            {r.submittedAt ? <span className="text-xs text-brand-500">Submitted {formatDateTime(r.submittedAt)}</span> : null}
          </div>
        );
      },
    },
    {
      key: "sla",
      header: "SLA age",
      hideBelow: "sm",
      cell: (r) =>
        r.slaDays > 0 ? (
          <span className={`inline-flex items-center gap-1 text-sm font-semibold tabular-nums ${r.slaDays >= SLA_BUSINESS_DAYS ? "text-red-600" : r.slaDays >= 3 ? "text-amber-700" : "text-brand-800"}`}>
            {r.slaDays >= SLA_BUSINESS_DAYS ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> : null}
            {r.slaDays} bd
          </span>
        ) : (
          <span className="text-xs text-brand-400">—</span>
        ),
    },
    {
      key: "activity",
      header: "Last activity",
      hideBelow: "md",
      cell: (r) => <span className="text-sm text-brand-700">{r.lastActivity ? timeAgo(r.lastActivity) : "none"}</span>,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-1.5">
          <Link href={`/admin/accounts/${r.id}`} className={btn.small}>
            Details
          </Link>
          <form action={impersonateAction}>
            <input type="hidden" name="accountId" value={r.id} />
            <button type="submit" className={btn.small}>
              View as
            </button>
          </form>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader eyebrow="Admin" title="Accounts" sub={`Signed in as ${user.email}. Verification SLA: escalate to Twilio support at ${SLA_BUSINESS_DAYS} business days.`} action={osLinks} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Accounts" value={rows.length} icon={<Users className="h-4 w-4" aria-hidden />} />
        <StatTile label="Live" value={rows.filter((r) => r.status === "live").length} icon={<ShieldCheck className="h-4 w-4" aria-hidden />} />
        <StatTile label="Awaiting verification" value={rows.filter((r) => r.verification === "pending" || r.verification === "in_review").length} />
        <StatTile label="Past SLA" value={stalled.length} tone={stalled.length > 0 ? "accent" : "default"} icon={<AlertTriangle className="h-4 w-4" aria-hidden />} />
      </div>

      <Tabs
        ariaLabel="Account views"
        active={view}
        items={[
          { id: "all", label: "All", href: "/admin", count: rows.length },
          { id: "pending", label: "Pending verification", href: "/admin?view=pending" },
          { id: "stalled", label: "Past SLA", href: "/admin?view=stalled", count: stalled.length },
          { id: "attention", label: "Needs attention", href: "/admin?view=attention", count: attention.length },
          { id: "live", label: "Live", href: "/admin?view=live" },
        ]}
      />

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.id}
          caption="Accounts"
          rowClassName={(r) => (r.slaDays >= SLA_BUSINESS_DAYS ? "bg-red-50/40" : undefined)}
          empty={<EmptyState icon={<Users className="h-6 w-6" aria-hidden />} title="Nothing here" body="No accounts match this view." />}
        />
      </div>
    </div>
  );
}
