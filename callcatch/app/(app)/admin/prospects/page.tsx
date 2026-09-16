import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminEmail, requireUser } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/db/client";
import { formatDate } from "@/components/dashboard/format";
import { Card, CardTitle, PageHeader, btn, selectClass, inputClass } from "@/components/dashboard/primitives";
import { StatusPill, type PillTone } from "@/components/dashboard/StatusPill";
import { BulkForm, ImportForm } from "./ProspectForms";

export const metadata: Metadata = { title: "Prospects" };
export const dynamic = "force-dynamic";

const STATUSES = ["new", "enriched", "queued", "contacted", "replied", "demo_booked", "trial", "customer", "lost", "disqualified", "do_not_contact"] as const;

function tone(status: string): PillTone {
  if (["customer", "trial", "demo_booked"].includes(status)) return "success";
  if (["replied", "queued"].includes(status)) return "accent";
  if (["contacted"].includes(status)) return "info";
  if (["lost", "disqualified", "do_not_contact"].includes(status)) return "danger";
  return "neutral";
}
function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ProspectsAdminPage(props: PageProps<"/admin/prospects">) {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) redirect("/dashboard");
  const sp = await props.searchParams;
  const status = first(sp.status) ?? "";
  const trade = first(sp.trade) ?? "";
  const state = (first(sp.state) ?? "").toUpperCase();
  const minFit = Number(first(sp.min_fit) ?? "0") || 0;
  const q = (first(sp.q) ?? "").trim();
  const db = createAdminSupabase();
  let query = db.from("prospects").select("id, business_name, trade, city, state, phone, phone_type, email, website, rating, review_count, fit_score, status, source, last_touch_at, next_touch_at").order("fit_score", { ascending: false }).order("created_at", { ascending: false }).limit(300);
  if (status) query = query.eq("status", status);
  if (trade) query = query.eq("trade", trade);
  if (state) query = query.eq("state", state);
  if (minFit) query = query.gte("fit_score", minFit);
  if (q) query = query.ilike("business_name", `%${q}%`);
  const [{ data: rows }, countsRes] = await Promise.all([query, db.from("prospects").select("status").limit(20000)]);
  const counts: Record<string, number> = {};
  for (const r of countsRes.data ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const exportHref = `/admin/prospects/export?${new URLSearchParams({ ...(status ? { status } : {}), ...(trade ? { trade } : {}), ...(state ? { state } : {}) }).toString()}`;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Company OS"
        title="Prospects"
        sub={`${Object.values(counts).reduce((a, b) => a + b, 0)} total · ${counts.queued ?? 0} queued · ${counts.contacted ?? 0} contacted · ${counts.replied ?? 0} replied · ${counts.customer ?? 0} customers`}
        action={
          <>
            <a href={exportHref} className={btn.secondary}>Export CSV</a>
            <Link href="/admin/agents" className={btn.secondary}>Agents</Link>
          </>
        }
      />

      <Card className="mb-6">
        <CardTitle sub="Public license-board records or your own list. Cold email + human-dialed calls only; never SMS.">Import prospects</CardTitle>
        <ImportForm />
      </Card>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-brand-500">Status<select name="status" defaultValue={status} className={`${selectClass} mt-1 w-40 text-xs`}><option value="">all</option>{STATUSES.map((s) => <option key={s} value={s}>{s} ({counts[s] ?? 0})</option>)}</select></label>
        <label className="text-xs font-semibold text-brand-500">Trade<select name="trade" defaultValue={trade} className={`${selectClass} mt-1 w-32 text-xs`}><option value="">all</option>{["hvac", "plumbing", "electrical", "roofing", "other"].map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
        <label className="text-xs font-semibold text-brand-500">State<input name="state" defaultValue={state} maxLength={2} className={`${inputClass} mt-1 w-20 text-xs uppercase`} /></label>
        <label className="text-xs font-semibold text-brand-500">Min fit<input name="min_fit" type="number" min={0} max={100} defaultValue={minFit || ""} className={`${inputClass} mt-1 w-24 text-xs`} /></label>
        <label className="text-xs font-semibold text-brand-500">Name<input name="q" defaultValue={q} className={`${inputClass} mt-1 w-44 text-xs`} /></label>
        <button type="submit" className={btn.secondary}>Filter</button>
      </form>

      <BulkForm>
        <div className="overflow-x-auto rounded-2xl border border-brand-100 bg-white">
          <table className="w-full min-w-[60rem] text-sm">
            <thead className="bg-brand-50/60 text-left text-xs font-semibold uppercase tracking-wide text-brand-500">
              <tr><th className="px-3 py-2"><span className="sr-only">Select</span></th><th className="px-3 py-2">Business</th><th className="px-3 py-2">Trade</th><th className="px-3 py-2">Where</th><th className="px-3 py-2">Contact</th><th className="px-3 py-2">Reviews</th><th className="px-3 py-2">Fit</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Touch</th></tr>
            </thead>
            <tbody className="divide-y divide-brand-100">
              {(rows ?? []).map((p) => (
                <tr key={p.id} className="align-top">
                  <td className="px-3 py-2"><input type="checkbox" name="ids" value={p.id} aria-label={`Select ${p.business_name}`} /></td>
                  <td className="px-3 py-2"><div className="font-medium text-brand-900">{p.business_name}</div>{p.website ? <a href={p.website} target="_blank" rel="noreferrer" className="text-xs text-brand-500 underline">{p.website.replace(/^https?:\/\//, "")}</a> : null}<div className="text-[11px] text-brand-400">{p.source}</div></td>
                  <td className="px-3 py-2">{p.trade}</td>
                  <td className="px-3 py-2">{[p.city, p.state].filter(Boolean).join(", ")}</td>
                  <td className="px-3 py-2 text-xs"><div>{p.phone ?? "—"}{p.phone_type ? <span className="ml-1 text-brand-400">({p.phone_type})</span> : null}</div><div className="text-brand-600">{p.email ?? "—"}</div></td>
                  <td className="px-3 py-2 tabular-nums">{p.review_count ?? "—"}{p.rating ? <span className="text-brand-400"> · {p.rating}★</span> : null}</td>
                  <td className="px-3 py-2 tabular-nums font-semibold">{p.fit_score}</td>
                  <td className="px-3 py-2"><StatusPill tone={tone(p.status)}>{p.status}</StatusPill></td>
                  <td className="px-3 py-2 text-xs text-brand-500">last {p.last_touch_at ? formatDate(p.last_touch_at) : "—"}<br />next {p.next_touch_at ? formatDate(p.next_touch_at) : "—"}</td>
                </tr>
              ))}
              {(rows ?? []).length === 0 ? <tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-brand-500">No prospects match. Import a CSV or run the prospector.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </BulkForm>
    </div>
  );
}
