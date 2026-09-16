import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, CircleDollarSign, ListChecks, ShieldAlert } from "lucide-react";
import { isAdminEmail, requireUser } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/db/client";
import { currentAutonomy, dailyBudgetUsd, loadAllDefinitions, spentTodayUsd } from "@/lib/agents/core";
import { loadMemory } from "@/lib/agents/core/memory";
import { formatDateTime, timeAgo, truncate } from "@/components/dashboard/format";
import { Card, CardTitle, PageHeader, btn } from "@/components/dashboard/primitives";
import { StatTile } from "@/components/dashboard/StatTile";
import { StatusPill, type PillTone } from "@/components/dashboard/StatusPill";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { BlockersForm, RunRoleForm, TaskDecisionForm } from "./AgentForms";

export const metadata: Metadata = { title: "Company OS" };
export const dynamic = "force-dynamic";

function runTone(status: string): PillTone {
  return status === "succeeded" ? "success" : status === "failed" ? "danger" : status === "running" ? "info" : status === "skipped" ? "warning" : "neutral";
}
function riskTone(risk: string): PillTone {
  return risk === "high" ? "danger" : risk === "medium" ? "warning" : "neutral";
}

export default async function AgentsAdminPage() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) redirect("/dashboard");
  const db = createAdminSupabase();
  const [defs, spent, memory, runsRes, tasksRes, metricsRes] = await Promise.all([
    loadAllDefinitions(),
    spentTodayUsd(),
    loadMemory("orchestrator"),
    db.from("agent_runs").select("id, role, trigger, status, cost_usd, iterations, summary, output, error, started_at, finished_at, created_at").order("created_at", { ascending: false }).limit(40),
    db.from("agent_tasks").select("id, role, kind, risk, title, rationale, payload, status, estimated_cost_usd, created_at, expires_at").eq("status", "proposed").order("created_at", { ascending: true }).limit(50),
    db.from("metrics_daily").select("day, metrics").order("day", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const runs = runsRes.data ?? [];
  const queue = tasksRes.data ?? [];
  const lastByRole = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (!lastByRole.has(r.role)) lastByRole.set(r.role, r);
  const blockers = (memory.founder_blockers as string[] | undefined) ?? [];
  const plan = memory.daily_plan as string | string[] | undefined;
  const m = (metricsRes.data?.metrics ?? {}) as Record<string, number | null>;
  const autonomy = currentAutonomy();

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Company OS"
        title="Agents"
        sub={`Autonomy: ${autonomy}. Agents propose; policy and you decide. Budget resets at 00:00 UTC.`}
        action={
          <>
            <Link href="/admin/prospects" className={btn.secondary}>Prospects</Link>
            <Link href="/admin" className={btn.secondary}>Accounts</Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Model spend today" value={`$${spent.toFixed(2)}`} hint={`of $${dailyBudgetUsd()} daily cap`} icon={<CircleDollarSign className="h-4 w-4" aria-hidden />} />
        <StatTile label="Awaiting approval" value={queue.length} hint="proposed tasks" icon={<ListChecks className="h-4 w-4" aria-hidden />} tone={queue.length ? "accent" : "default"} />
        <StatTile label="MRR / active" value={`$${m.mrr_usd ?? 0} / ${m.customers_active ?? 0}`} hint={metricsRes.data ? `metrics for ${metricsRes.data.day}` : "no metrics yet — run revops"} icon={<Bot className="h-4 w-4" aria-hidden />} />
        <StatTile label="Verification SLA breaches" value={m.verification_sla_breaches ?? 0} hint={`${m.verification_pending ?? 0} pending`} icon={<ShieldAlert className="h-4 w-4" aria-hidden />} tone={(m.verification_sla_breaches ?? 0) > 0 ? "accent" : "default"} />
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-brand-900">Approval queue</h2>
        {queue.length === 0 ? (
          <EmptyState title="Nothing waiting" body="Proposed tasks that need you will show up here with the agent's rationale." />
        ) : (
          <ul className="mt-3 space-y-3">
            {queue.map((t) => (
              <li key={t.id} className="rounded-2xl border border-brand-100 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={riskTone(t.risk)}>{t.risk}</StatusPill>
                  <span className="text-xs font-semibold uppercase tracking-wide text-brand-500">{t.role} · {t.kind}</span>
                  <span className="text-xs text-brand-400">{timeAgo(t.created_at)}{t.estimated_cost_usd ? ` · est. $${t.estimated_cost_usd}` : ""}</span>
                </div>
                <p className="mt-1 font-semibold text-brand-900">{t.title}</p>
                {t.rationale ? <p className="mt-1 text-sm text-brand-700">{t.rationale}</p> : null}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-brand-500">payload</summary>
                  <pre className="mt-1 max-h-64 overflow-auto rounded-xl bg-brand-50 p-3 text-xs text-brand-800">{JSON.stringify(t.payload, null, 2)}</pre>
                </details>
                <div className="mt-3">
                  <TaskDecisionForm taskId={t.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle sub="What the orchestrator wrote this morning.">Today&apos;s plan</CardTitle>
          {plan ? <pre className="whitespace-pre-wrap text-sm text-brand-800">{Array.isArray(plan) ? plan.join("\n") : plan}</pre> : <p className="text-sm text-brand-500">No plan yet — run the orchestrator.</p>}
        </Card>
        <Card>
          <CardTitle sub="Read by the orchestrator each morning.">Founder blockers</CardTitle>
          <BlockersForm initial={blockers} />
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-brand-900">Roles</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {defs.map((d) => {
            const last = lastByRole.get(d.role);
            return (
              <Card key={d.role}>
                <CardTitle sub={d.mission}>
                  <span className="flex items-center gap-2">{d.title}{last ? <StatusPill tone={runTone(last.status)}>{last.status}</StatusPill> : <StatusPill tone="neutral">never ran</StatusPill>}</span>
                </CardTitle>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-brand-600">
                  <dt className="font-semibold text-brand-500">Cadence</dt><dd>{d.cadence}</dd>
                  <dt className="font-semibold text-brand-500">KPI</dt><dd>{d.kpi}</dd>
                  <dt className="font-semibold text-brand-500">Last run</dt><dd>{last ? `${timeAgo(last.finished_at ?? last.created_at)} · $${Number(last.cost_usd).toFixed(2)} · ${last.iterations} it.` : "—"}</dd>
                </dl>
                {last?.summary ? <p className="mt-2 text-sm text-brand-800">{truncate(last.summary, 220)}</p> : null}
                {last?.error ? <p className="mt-1 text-xs text-red-700">{truncate(last.error, 200)}</p> : null}
                <div className="mt-3">
                  <RunRoleForm role={d.role} />
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-brand-900">Recent runs</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-brand-100 bg-white">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-brand-50/60 text-left text-xs font-semibold uppercase tracking-wide text-brand-500">
              <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Cost</th><th className="px-3 py-2">Summary</th></tr>
            </thead>
            <tbody className="divide-y divide-brand-100">
              {runs.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-brand-500" title={formatDateTime(r.created_at)}>{timeAgo(r.created_at)} · {r.trigger}</td>
                  <td className="px-3 py-2 font-medium text-brand-900">{r.role}</td>
                  <td className="px-3 py-2"><StatusPill tone={runTone(r.status)}>{r.status}</StatusPill></td>
                  <td className="px-3 py-2 tabular-nums">${Number(r.cost_usd).toFixed(2)}</td>
                  <td className="px-3 py-2 text-brand-800">
                    <details>
                      <summary className="cursor-pointer">{truncate(r.summary ?? r.error ?? "(no summary)", 120)}</summary>
                      <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-brand-50 p-3 text-xs">{r.summary}{"\n\n"}{JSON.stringify((r.output as { notes?: string[] } | null)?.notes ?? [], null, 1)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
              {runs.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-brand-500">No runs yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
