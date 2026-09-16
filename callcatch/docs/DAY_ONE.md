# Day one — 2026-09-16 (the day the company started operating)

## Shipped today
- **Company OS** (`lib/agents/**`): runtime, policy, budgets, memory, ten roles (orchestrator, prospector, outreach, closer, ads, content, support, revops, compliance, board), executors (Resend email with CAN-SPAM footer + one-click unsubscribe, prospect updates, call scheduling, Meta ad budget/pause, support replies, Stripe credits, founder notifications), integrations (Texas TDLR license API, AZ/FL license CSVs, website enrichment, Twilio line-type lookup, Meta Marketing API).
- **Admin console**: `/admin/agents` (budget, approval queue, run-now, daily plan, founder blockers, run log) and `/admin/prospects` (filters, CSV import/export, bulk queue).
- **Routes**: hourly `/api/cron/agents`, `/api/cron/metrics-daily`, `/api/agents/run`, `/api/agents/tasks/[id]`, `/api/support/inbound`, `/u/[prospectId]`.
- **CLI** `scripts/agent.ts`, 16 unit tests (`npm test`), migration `20260914120000_company_os.sql`.
- **Plans and research**: `docs/SCALE_PLAN.md` (stages, 12-month projection, pricing, expansion, risks), `docs/COMPANY_OS.md`, `docs/research/` (competitors, channels, multi-agent ops, prospecting data & compliance — all web-verified 2026-09-14).
- **Sales assets**: `data/outreach/email_sequence_v1.md`, `data/outreach/call_script_v1.md`, `data/prospects/README.md`.

## What the agents do once the keys are in
Hour 1 after deploy: revops writes metrics; prospector pulls Texas HVAC/electrical licenses for Houston, Dallas, Austin, San Antonio, enriches websites, tags line types, queues the top 200; outreach drafts step-1 emails into the approval queue; compliance audits (nothing to flag yet); orchestrator emails the plan at 8am ET tomorrow.

## Founder — 90 minutes today
The ordered checklist with exact inputs is `docs/SCALE_PLAN.md` §8. Short form: LLC + EIN → Stripe prices → Twilio ISV profile + two toll-free numbers → Resend domains (product + a secondary cold-email domain) → Vercel deploy (root `callcatch`) → Supabase migrations + admin user → Meta portfolio/pixel/ad account (no spend until the demo number verifies) → env vars → `/admin/agents` Run now: revops, prospector, outreach → approve 10 emails → 10 calls from `/admin/prospects`.

## Not done today (honest)
- Four research reports (telecom cost alternatives, growth playbooks, vertical/geographic expansion, plus the synthesis) did not complete when subagent credits ran out; the scale plan marks those sections `[U]` and the content/board agents are queued to fill them.
- No real prospect seed CSV: the research established that license boards, not Google Places, are the legal seed, and those endpoints are blocked from this build environment. The prospector pulls them live from Vercel on the first run.
- Ads are created by the founder in Ads Manager from agent-drafted specs; the API executor for `create_ad` delivers the spec only (v1).
- Content pages are stored as task results; a `content_pages` table + renderer is the next iteration.
- A Claude Code Routine (cloud session) for engineering chores was not created: the operating agents run on the product's own Anthropic API key via Vercel cron and do not depend on Claude.ai usage credits.

## Tomorrow
AZ + FL license CSVs imported · first two ad creatives filmed ("$51 LSA lead sent to voicemail", voicemail-vs-text) · support@ routing test · Jobber developer account · counsel question on B2B mobile calls in TX/AZ/FL.
