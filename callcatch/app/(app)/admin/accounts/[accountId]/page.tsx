import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Eye, ExternalLink } from "lucide-react";
import { z } from "zod";
import { isAdminEmail, requireUser } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/db/client";
import { getPlan } from "@/lib/plans";
import { formatPhone } from "@/lib/telephony/client";
import { formatUsd } from "@/lib/utils";
import { businessDaysSince, formatDateTime, titleCase } from "@/components/dashboard/format";
import { Card, CardTitle, btn } from "@/components/dashboard/primitives";
import { StatusPill, accountStatusPill, subscriptionPill, verificationPill } from "@/components/dashboard/StatusPill";
import { AdminNoteForm } from "@/components/dashboard/AdminNoteForm";
import { impersonateAction } from "../../actions";

export const metadata: Metadata = { title: "Account · Admin" };
export const dynamic = "force-dynamic";

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <dt className="text-brand-500">{label}</dt>
      <dd className="text-right font-medium text-brand-900">{value ?? "—"}</dd>
    </div>
  );
}

export default async function AdminAccountPage(props: PageProps<"/admin/accounts/[accountId]">) {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) redirect("/dashboard");
  const { accountId } = await props.params;
  if (!z.string().uuid().safeParse(accountId).success) notFound();

  const db = createAdminSupabase();
  const { data: account } = await db.from("accounts").select("*").eq("id", accountId).maybeSingle();
  if (!account) notFound();

  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}-01`;
  const [{ data: numbers }, { data: sub }, { data: notes }, { data: events }, { data: usage }, { data: sources }, counts] = await Promise.all([
    db.from("numbers").select("*").eq("account_id", accountId).order("created_at", { ascending: true }),
    db.from("subscriptions").select("*").eq("account_id", accountId).maybeSingle(),
    db.from("admin_notes").select("*").eq("account_id", accountId).order("created_at", { ascending: false }).limit(50),
    db.from("events").select("id, name, props, occurred_at").eq("account_id", accountId).order("occurred_at", { ascending: false }).limit(25),
    db.from("usage_monthly").select("*").eq("account_id", accountId).eq("period", period).maybeSingle(),
    db.from("lead_sources").select("id, type, enabled, inbound_email").eq("account_id", accountId),
    Promise.all([
      db.from("calls").select("id", { count: "exact", head: true }).eq("account_id", accountId),
      db.from("conversations").select("id", { count: "exact", head: true }).eq("account_id", accountId),
      db.from("leads").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "booked"),
    ]),
  ]);

  const name = account.dba?.trim() || account.legal_name?.trim() || "Unnamed account";
  const status = accountStatusPill(account.status);
  const subPill = subscriptionPill(sub?.status);
  const plan = getPlan(sub?.plan ?? account.plan);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-4">
        <Link href="/admin" className={btn.ghost}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> All accounts
        </Link>
      </div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-600">Admin · account</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-900 sm:text-3xl">{name}</h1>
          <p className="mt-1 text-sm text-brand-600">
            {account.legal_name} · {titleCase(account.trade)} · {account.city ? `${account.city}, ${account.state}` : "no address"} · {account.timezone ?? "no tz"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            <StatusPill tone={subPill.tone}>
              {plan.name} · {subPill.label}
            </StatusPill>
          </div>
        </div>
        <form action={impersonateAction}>
          <input type="hidden" name="accountId" value={account.id} />
          <button type="submit" className={btn.primary}>
            <Eye className="h-4 w-4" aria-hidden /> View dashboard as this account
          </button>
        </form>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardTitle sub="Customer numbers and their toll-free verification state.">Numbers</CardTitle>
            {(numbers ?? []).length === 0 ? (
              <p className="text-sm text-brand-500">No number provisioned yet.</p>
            ) : (
              <ul className="divide-y divide-brand-100">
                {(numbers ?? []).map((n) => {
                  const v = verificationPill(n.verification_status);
                  const open = n.verification_status === "pending" || n.verification_status === "in_review";
                  const age = open ? businessDaysSince(n.verification_submitted_at) : 0;
                  return (
                    <li key={n.id} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-mono text-sm font-semibold text-brand-900">
                          {formatPhone(n.phone_number)} <span className="ml-1 text-xs font-sans font-normal text-brand-500">{n.type} · {n.purpose}</span>
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusPill tone={v.tone}>{v.label}</StatusPill>
                          <StatusPill tone={n.sms_enabled ? "success" : "neutral"}>{n.sms_enabled ? "SMS on" : "SMS off"}</StatusPill>
                          {age >= 5 ? <StatusPill tone="danger">{age} bd — escalate</StatusPill> : age > 0 ? <StatusPill tone="warning">{age} bd</StatusPill> : null}
                        </div>
                      </div>
                      <dl className="mt-2 grid gap-x-6 text-xs text-brand-600 sm:grid-cols-2">
                        <div>SID: <span className="font-mono">{n.twilio_sid ?? "—"}</span></div>
                        <div>Verification SID: <span className="font-mono">{n.verification_sid ?? "—"}</span></div>
                        <div>Submitted: {formatDateTime(n.verification_submitted_at)}</div>
                        <div>Verified: {formatDateTime(n.verified_at)}</div>
                        {n.rejection_reason ? <div className="text-red-700 sm:col-span-2">Rejected: {n.rejection_reason}</div> : null}
                        {n.tendlc_brand_sid ? (
                          <div className="sm:col-span-2">
                            10DLC brand {n.tendlc_brand_sid} · campaign {n.tendlc_campaign_sid ?? "—"}
                          </div>
                        ) : null}
                      </dl>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle sub="Internal only — the customer never sees these.">Admin notes</CardTitle>
            <AdminNoteForm accountId={account.id} />
            <ul className="mt-4 divide-y divide-brand-100">
              {(notes ?? []).length === 0 ? <li className="py-3 text-sm text-brand-500">No notes yet.</li> : null}
              {(notes ?? []).map((n) => (
                <li key={n.id} className="py-3">
                  <p className="whitespace-pre-wrap text-sm text-brand-900">{n.note}</p>
                  <p className="mt-1 text-xs text-brand-500">
                    {formatDateTime(n.created_at)}
                    {n.author_user_id === user.id ? " · you" : ""}
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardTitle sub="Latest product events (signup, checkout, forwarding test, verification, first text-back…).">Activity</CardTitle>
            {(events ?? []).length === 0 ? (
              <p className="text-sm text-brand-500">No events recorded.</p>
            ) : (
              <ul className="divide-y divide-brand-100 text-sm">
                {(events ?? []).map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                    <span className="font-medium text-brand-900">{e.name}</span>
                    <span className="text-xs text-brand-500">{formatDateTime(e.occurred_at)}</span>
                    {e.props && typeof e.props === "object" && Object.keys(e.props).length > 0 ? (
                      <code className="w-full truncate text-[11px] text-brand-500">{JSON.stringify(e.props).slice(0, 200)}</code>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardTitle>Subscription</CardTitle>
            <dl className="divide-y divide-brand-100">
              <KV label="Plan" value={`${plan.name} / ${sub?.interval ?? "—"}`} />
              <KV label="Status" value={<StatusPill tone={subPill.tone}>{subPill.label}</StatusPill>} />
              <KV label="Paid now" value={sub ? (sub.paid_now ? "yes" : "trial path") : "—"} />
              <KV label="Trial end" value={formatDateTime(sub?.trial_end)} />
              <KV label="Period end" value={formatDateTime(sub?.current_period_end)} />
              <KV label="Cancel at end" value={sub?.cancel_at_period_end ? "yes" : "no"} />
              <KV label="Paused until" value={sub?.pause_until ?? "—"} />
              <KV
                label="Stripe"
                value={
                  account.stripe_customer_id ? (
                    <a href={`https://dashboard.stripe.com/customers/${account.stripe_customer_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                      {account.stripe_customer_id.slice(0, 14)}… <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  ) : (
                    "—"
                  )
                }
              />
              <KV label="Sub id" value={<span className="font-mono text-xs">{sub?.stripe_subscription_id ?? "—"}</span>} />
            </dl>
          </Card>

          <Card>
            <CardTitle>Contact & setup</CardTitle>
            <dl className="divide-y divide-brand-100">
              <KV label="Owner email" value={account.alert_email} />
              <KV label="Alert phone" value={`${formatPhone(account.alert_phone)}${account.alert_phone_verified ? " ✓" : " (unverified)"}`} />
              <KV label="Business phone" value={formatPhone(account.business_phone)} />
              <KV label="EIN" value={account.is_sole_prop ? "sole prop (10DLC)" : account.ein ? `••••${account.ein.slice(-4)}` : "missing"} />
              <KV label="Avg ticket" value={formatUsd(Number(account.avg_ticket_usd))} />
              <KV label="Quiet hours" value={`${account.quiet_start.slice(0, 5)}–${account.quiet_end.slice(0, 5)}`} />
              <KV label="Referral code" value={<span className="font-mono text-xs">{account.referral_code}</span>} />
              <KV label="Referred by" value={account.referred_by_account_id ? <Link href={`/admin/accounts/${account.referred_by_account_id}`} className="hover:underline">account</Link> : "—"} />
              <KV label="Created" value={formatDateTime(account.created_at)} />
            </dl>
          </Card>

          <Card>
            <CardTitle>This month</CardTitle>
            <dl className="divide-y divide-brand-100">
              <KV label="Conversations" value={`${usage?.conversations ?? 0} / ${plan.includedConversations}`} />
              <KV label="SMS out / in" value={`${usage?.sms_segments_out ?? 0} / ${usage?.sms_segments_in ?? 0}`} />
              <KV label="Voice minutes" value={Number(usage?.voice_minutes ?? 0).toFixed(1)} />
              <KV label="AI cost" value={`$${Number(usage?.ai_cost_usd ?? 0).toFixed(2)}`} />
              <KV label="Overage reported" value={usage?.overage_reported ? "yes" : "no"} />
            </dl>
            <dl className="mt-3 divide-y divide-brand-100 border-t border-brand-100 pt-1">
              <KV label="Calls (all time)" value={counts[0].count ?? 0} />
              <KV label="Conversations (all time)" value={counts[1].count ?? 0} />
              <KV label="Booked leads" value={counts[2].count ?? 0} />
              <KV label="Lead sources" value={(sources ?? []).map((s) => `${s.type}${s.enabled ? "" : " (off)"}`).join(", ") || "none"} />
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}
