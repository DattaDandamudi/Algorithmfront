# Company OS — build contracts

The Company OS is the multi-agent system that runs CallCatch's sales, marketing, support and operations.
Core runtime (already written, do not rewrite): `lib/agents/core/**`, migration `supabase/migrations/20260914120000_company_os.sql`,
types in `lib/db/types.ts` (agent_runs, agent_tasks, prospects, outreach, agent_memory, metrics_daily).

## How an agent works
1. `runAgent(role, { trigger, input })` (`lib/agents/core/runner.ts`) loads `lib/agents/roles/<role>.ts` → `definition: AgentDefinition`.
2. It builds `system = [stable systemPrompt (cached), dynamic block (time, autonomy, budget)]`, the user `task`, and
   `tools = role tools + shared tools (propose_task, remember, recall, query_table, get_metrics, log_note) + web_search if enabled`.
3. It drives `client.beta.messages.toolRunner` (model from `env.models().chat`, adaptive thinking, effort per role, `max_iterations`),
   records tokens/cost/summary in `agent_runs`, stops when the per-run budget is exceeded.
4. Agents never act directly on the world: they call `propose_task({kind, title, rationale, payload})`. `lib/agents/core/policy.ts`
   decides (per `AGENT_AUTONOMY` and per-kind rules/caps) whether the task executes now or waits in `/admin/agents` for the founder.
   `lib/agents/core/tasks.ts` persists and executes; executors live in `lib/agents/executors/index.ts` (`EXECUTORS[kind]`).

## Definitions (exact shapes: `lib/agents/core/types.ts`)
- `AgentDefinition { role, title, mission, kpi, cadence, systemPrompt(ctx), task(ctx), tools(ctx), webSearch?, maxIterations?, effort?, budgetUsdPerRun? }`
- Role tools: build with `betaZodTool` from `@anthropic-ai/sdk/helpers/beta/zod` (`import { z } from "zod"`), return compact strings.
- Task kinds and payload contracts (executors must accept exactly these):
  - `send_outreach_email` `{ prospect_id, to, subject, body_text, body_html?, step, outreach_id? }` → sends via Resend from `OUTREACH_FROM_EMAIL`, appends CAN-SPAM footer (`OUTREACH_POSTAL_ADDRESS`, unsubscribe link `/u/<prospect_id>`), records `outreach` row status sent + `prospects.last_touch_at`, respects `prospects.status='do_not_contact'` and `AGENT_MAX_EMAILS_PER_DAY`.
  - `schedule_call` `{ prospect_id, when_iso?, script, reason }` → inserts an `outreach` row channel=call status=scheduled (founder's call list).
  - `update_prospect` `{ prospect_id, patch: { status?, fit_score?, next_touch_at?, notes?, owner_name?, email?, phone?, uses_software?, runs_meta_ads?, disqualify_reason? } }`.
  - `update_ad_budget` `{ ad_set_id, current_daily_budget_usd, new_daily_budget_usd, reason }` → Meta Marketing API (`lib/agents/integrations/meta-ads.ts`).
  - `pause_ad` `{ ad_id?|ad_set_id?, reason }`.
  - `create_ad` `{ campaign_id?, ad_set: {...}, creative: { primary_text, headline, description, cta, image_hash?|video_id? }, daily_budget_usd }` (always approval).
  - `publish_content` `{ slug, title, kind: 'city_page'|'blog'|'comparison', markdown, meta_description }` → writes `content_pages` (create the table in a new migration if you own content) or files under `content/` committed by the founder — builder decides; document it.
  - `reply_support_email` `{ to, subject, body_text, in_reply_to?, account_id? }` → Resend from `RESEND_FROM_EMAIL`.
  - `apply_credit` `{ account_id, amount_usd, reason }` (always approval) → Stripe customer balance credit via `lib/billing/stripe.ts`.
  - `flag_account` `{ account_id, severity, reason, suggested_action }` → events row + admin note.
  - `notify_founder` `{ subject, body_text, channel: 'email'|'sms' }` → email to `ADMIN_EMAILS[0]`, SMS to `FOUNDER_MOBILE` if set.
  - `draft` `{ kind, title, body, meta? }` → stored in the task result only.
- Executors return `{ ok, result?, error? }` and must be idempotent on retry (check `outreach.provider_id`, task result, etc.).

## Data contracts
- `prospects.status` pipeline: new → enriched → queued → contacted → replied → demo_booked → trial → customer | lost | disqualified | do_not_contact.
- `outreach.step`: 1..N within a sequence; `scheduled_for` in UTC; the outreach agent must never schedule outside 8am–6pm in the prospect's local time (derive from state).
- `metrics_daily.metrics` = `DailyMetrics` from `lib/agents/metrics/daily.ts` (revops implements `computeDailyMetrics`).
- Founder identity for outreach: `OUTREACH_FROM_EMAIL`, `OUTREACH_REPLY_TO`, `OUTREACH_POSTAL_ADDRESS`, `NEXT_PUBLIC_APP_URL`; demo line `NEXT_PUBLIC_DEMO_NUMBER`; booking link `FOUNDER_BOOKING_URL` (Cal.com).

## Compliance rules the agents must encode
- Cold **email** to businesses only (CAN-SPAM: accurate header, physical address, working unsubscribe honored within 10 days — we honor instantly). No cold **SMS** ever (TCPA). Calls: business landlines only; skip numbers flagged mobile; honor do_not_contact.
- Never fabricate reviews, case studies, or customer counts. Claims must come from `metrics_daily` or the spec's sourced numbers.
- Customer-facing support replies: never promise prices/ETAs on behalf of a customer's business; escalate refunds to `apply_credit`.

## Admin surface (owner: the admin builder)
- `/admin/agents`: runs (role, status, cost, summary), approval queue (approve/reject with reason), per-role KPI + last run, budget used today, "Run now" per role.
- `/admin/prospects`: table with filters, CSV import (columns: business_name, trade, phone, email, website, city, state, zip, rating, review_count, source), CSV export, bulk "queue for outreach".
- Routes: `GET /api/cron/agents` (hourly, `CRON_SECRET`; runs `dueRoles(now)` sequentially, expires stale tasks, `maxDuration=300`), `GET /api/cron/metrics-daily` (`upsertDailyMetrics(yesterday)` + today), `POST /api/agents/run` (admin session; `{ role, input }`), `POST /api/agents/tasks/[id]` (admin; `{ action: 'approve'|'reject', reason? }`), `GET /u/[prospectId]` (one-click unsubscribe → do_not_contact).
- CLI: `npx tsx scripts/agent.ts run <role> [--input '{...}']`, `... tasks list|approve <id>|reject <id>`, `... prospects import <csv>`, `... metrics today`.
