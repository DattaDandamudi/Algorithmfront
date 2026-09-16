# Company OS — the multi-agent system that runs CallCatch

The Company OS is ten Claude agents that run sales, marketing, support and operations against the same
Supabase database the product uses. Agents **propose**; a deterministic policy decides what runs without a human;
the founder approves the rest from `/admin/agents`. Nothing an agent does is invisible: every run, tool result,
proposal and execution is stored.

## Architecture

```mermaid
flowchart LR
  cron[Vercel cron /api/cron/agents hourly] --> runner[lib/agents/core/runner.ts]
  cli[npx tsx scripts/agent.ts run role] --> runner
  admin[/admin/agents Run now/] --> runner
  runner --> role[lib/agents/roles/*.ts\nsystem prompt (cached) + tools]
  role --> propose[propose_task]
  propose --> policy[lib/agents/core/policy.ts\nautonomy + caps]
  policy -- auto --> exec[lib/agents/executors/*\nResend · Meta API · Stripe · DB]
  policy -- approval --> queue[(agent_tasks: proposed)]
  queue --> admin
  admin --> exec
  runner --> runs[(agent_runs: cost, summary, notes)]
  role --> memory[(agent_memory)]
  role --> metrics[(metrics_daily)]
```

## Roles

| Role | Reads | Proposes | Cadence (UTC) | Effort / budget |
|---|---|---|---|---|
| `orchestrator` | metrics, last runs, approval queue, `founder_blockers` | `notify_founder` (daily plan) | 12:00 | medium / $1 |
| `prospector` | license boards (TX Socrata, AZ/FL CSVs), websites, Twilio Lookup | writes prospects directly (data hygiene) | 13:00 Mon–Fri | medium / $1.50 |
| `outreach` | due prospects, sequence templates, replies | `send_outreach_email`, `schedule_call`, `update_prospect` | 14:00, 20:00 Mon–Fri | medium / $1.50 |
| `closer` | pipeline (replied/demo/trial) + account/verification state | follow-up emails, calls, status changes | 15:00, 21:00 Mon–Fri | medium / $1 |
| `ads` | Meta insights + ad sets | `pause_ad`, `update_ad_budget`, `draft` (creatives), `create_ad` (always human) | 13:00, 22:00 | low / $0.75 |
| `content` | topic queue, web search | `publish_content` (draft stored in the task result) | Tue/Thu 16:00 | medium / $2 |
| `support` | tickets (from `/api/support/inbound`), customer context | `reply_support_email`, `apply_credit` (human), `flag_account` | every 3 h | medium / $1 |
| `revops` | accounts, subscriptions, calls, outreach, agent runs | `compute_metrics` (direct), `flag_account`, `notify_founder` | 11:00 | low / $0.75 |
| `compliance` | messages, contacts, numbers | `flag_account`, `notify_founder` | 11:00 | low / $0.75 |
| `board` | week summary, metrics | `notify_founder` (Monday memo) | Mon 12:00 | high / $2 |

## Lifecycle of an action

1. An agent calls `propose_task({ kind, title, rationale, payload })`.
2. `policy.decide(kind, autonomy, payload)`:
   - `AGENT_AUTONOMY=draft_only` → only `draft` executes; everything else waits.
   - `approval_required` (default) → low-risk internal actions execute (`update_prospect`, `schedule_call`, `flag_account`, `notify_founder`); anything that emails a prospect/customer or touches ads waits.
   - `autonomous` → emails, ad pauses and budget changes within `AGENT_MAX_ADS_CHANGE_USD` execute; `create_ad` and `apply_credit` **always** wait.
   - Daily caps: `AGENT_MAX_EMAILS_PER_DAY` (executions per UTC day) flip a task to approval when reached.
3. Approved tasks run through `lib/agents/executors/*` with an atomic claim (`approved → executing → executed|failed`), idempotent on retry.
4. Proposals expire after 72 h (`expireStaleTasks`, hourly).

## Budgets and cost

- `AGENT_DAILY_BUDGET_USD` (default $25): a run is skipped when the day's spend leaves less than the role's per-run budget.
- Per-run: `budgetUsdPerRun` (stops the loop at 1.5×) and `maxIterations`.
- Caching: each role's system prompt is a frozen block with `cache_control: ephemeral`; run-specific facts (time, autonomy, budget) come after it. Check `agent_runs.tokens_in` vs cost to confirm cache hits.
- Model: `CLAUDE_MODEL_CHAT` (default `claude-opus-5`); set `claude-sonnet-5` to cut agent cost ~60% once prompts are stable.

## Memory and observability

- `agent_memory(role, key)`: durable notes (`learnings`, `subject_lines`, `coverage`, `flagged`, `daily_plan`, `founder_blockers`, `topics`, `published`, `score`, `winloss`).
- `agent_runs`: status, iterations, tokens, cost, summary, notes, proposed task ids. `/admin/agents` shows the last 40.
- `metrics_daily`: the KPI snapshot (`lib/agents/metrics/daily.ts`), computed by the metrics cron and the revops agent.

## Operating it

- **Approve twice a day** at `/admin/agents` (or `npx tsx scripts/agent.ts tasks list|approve|reject`).
- **Run a role by hand**: `/admin/agents` → Run now, or `npx tsx scripts/agent.ts run prospector --input '{"city":"Houston","trade":"hvac"}'`.
- **Pause everything**: set `AGENT_AUTONOMY=draft_only` and remove the `/api/cron/agents` entry in `vercel.json` (or the cron in the Vercel dashboard).
- **Graduate to autonomous** only after 2 weeks with reply rate ≥ 4%, zero compliance flags and no rejected proposals.

## Adding a role

Create `lib/agents/roles/<role>.ts` exporting `definition: AgentDefinition`, add the role to `AGENT_ROLES` in `core/types.ts`, the loader in `core/registry.ts`, a slot in `core/schedule.ts`, and (if it needs a new action) a `TaskKind` + policy rule + executor. Write a test for any pure logic.

## Moving to Anthropic Managed Agents

The runtime is the Messages API tool runner (self-hosted, no runtime fee). When a role needs a sandbox, files or a hard dollar cap per session, port it to a Managed Agents **scheduled deployment** (cron + IANA timezone, `budget.max_list_cost`, vault credentials, `always_ask` on write tools) — see `docs/research/multi-agent-ops-2026.md` §2 and §5.2. Keep PII in Supabase; pass ids, not transcripts.
