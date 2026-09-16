# Running CallCatch's Company OS on Anthropic's agent platform (Sept 2026)

**Date:** 2026-09-14. **Scope:** how to run sales, ads, support, onboarding, finance and engineering for CallCatch with a multi-agent system on Anthropic's platform; what production "AI SDR / AI ads / AI support" deployments delivered in 2025-26; a concrete architecture and monthly token budget at 10 / 100 / 1,000 customers.
**Legend:** `[V]` verified on the cited page today; `[V2]` secondary source; `[U]` assumption. All prices are Anthropic list prices seen 2026-09-14.

---

## 1. Executive summary

1. Anthropic sells three ways to run agents. **Managed Agents** (public beta since 2026-04-08) hosts the loop and a sandbox and adds cron **scheduled deployments**, **vaults**, hard **dollar session budgets** and server-evaluated **permission policies** (`always_allow` / `always_ask` / `auto`). The **Messages API tool runner** (`client.beta.messages.toolRunner`) is a harness-only loop for tools you host, which CallCatch's `lib/agents/core/runner.ts` already uses. The **Claude Agent SDK** and **Claude Code Routines** (research preview 2026-04-14) cover engineering.
2. Cost is dominated by cached input. Cache reads are 0.1x input price on every model and 0.025x ($0.25/MTok) on Claude Fable 5.1 (released 2026-09-01); Managed Agents adds only **$0.08 per session-hour** of `running` time, idle is free; web search is $10 per 1,000. `[V]`
3. Production evidence: Klarna's assistant still handles two-thirds of inquiries, yet the CEO reversed the human hiring freeze in May 2025 because "the result was lower quality"; 11x (AI SDR, $74M raised) was reported at 70-80% churn within 3 months and ~$3M surviving contracts against ~$14M claimed ARR; a 2026 AI-SDR survey found positive reply rates of 1.3% vs a 2.1% human baseline with ~50% of pilots shut down within 90 days. Every failure shares one shape: autonomous action on customers with no human gate and no quality metric.
4. Recommendation: keep the existing `propose_task` / policy-gate design (it is the "custom tools are executed by your application and controlled by you" model Anthropic documents), run eight roles on Claude Sonnet 5 + Claude Haiku 4.5 with Claude Opus 5 only for weekly judgment, move long-running research/content jobs to Managed Agents scheduled deployments with per-deployment budgets, and put engineering on Claude Code Routines. Estimated ops-agent spend: **~$155/mo at 10 customers, ~$220 at 100, ~$670 at 1,000** (product SMS LLM COGS is separate and already inside the $14.80/customer model).

---

## 2. Platform inventory (verified 2026-09-14)

| Capability | Surface | Facts |
|---|---|---|
| Hosted loop + sandbox | Managed Agents (beta header `managed-agents-2026-04-01`) | Agent = model + system + tools + MCP + skills, created once, versioned; bash/file/web tools built in; not ZDR/HIPAA eligible. `[V]` |
| Cron | Scheduled deployments (`POST /v1/deployments`) | POSIX cron + IANA timezone; jitter up to 15% of interval (max 9 min); each firing writes a `drun_` record; pause/unpause/archive; 1,000/org. Beta announced 2026-06-09. `[V]` |
| Hard spend cap | `budget: {type:"limit", max_list_cost:{amount,currency}}` on sessions and deployments | Priced at list (tokens + $10/1k searches + $0.08/h); session pauses with `stop_reason: budget_reached` and resumes when raised. `[V]` |
| Credentials | Vaults (`mcp_oauth`, `static_bearer`, `environment_variable`) | Secrets never enter the sandbox; substituted at egress in headers/body only (URL-path secrets cannot be vaulted). `[V]` |
| Approval gates | Permission policies | Agent toolset defaults `always_allow`, MCP toolsets `always_ask`; `auto` = server runs / denies / pauses each call. Doc warning: "`auto` is not a human checkpoint... configure `always_ask`" where a person must review. Custom tools are not governed; your app decides. `[V]` |
| Fan-out, memory, notifications | Multiagent roster (`{"type":"self"}` + Haiku worker); memory stores (`memstore_`); Console-registered HMAC webhooks | Threads share the container; memories are versioned text files (never store credentials); webhook payloads are thin. `[V]` |
| Self-hosted loop | Messages API tool runner (`betaZodTool` + `toolRunner`) | Per-turn hooks for approval/logging/retries; no runtime fee; Batch API 50% off (not on Managed Agents). `[V]` |
| Pacing and effort | `output_config.task_budget` (beta `task-budgets-2026-03-13`, min 20,000 tokens, advisory); `output_config.effort` low..max (GA) | `low` for sub-agents and monitors, `high`/`xhigh` for long-horizon work. `[V]` |
| Caching | `cache_control`, 5-min or 1-h TTL | Writes 1.25x / 2x input; reads 0.1x (0.025x Fable 5.1). `[V]` |
| Engineering agents | Claude Agent SDK; Claude Code Routines | SDK permission flow: hooks -> deny -> ask -> mode -> allow -> `canUseTool`; modes `default/dontAsk/acceptEdits/bypassPermissions/plan/auto`. Routines: cloud-run, schedule/API/GitHub triggers, 5-25 runs/day by plan. `[V]` |
| Observability | Console session trace; Usage & Cost Admin API (curl-only); OTel receivers (Honeycomb, Elastic) | `[V]` |

**Prices ($/MTok in / out / cache read):** Fable 5.1 10 / 50 / 0.25; Opus 5 5 / 25 / 0.50; Sonnet 5 2 / 10 / 0.20 (introductory price made permanent; the 2026-09-01 rise to $3/$15 was cancelled); Haiku 4.5 1 / 5 / 0.10. Runtime $0.08/session-hour. Web search $10/1k. `[V]`

---

## 3. Human-in-the-loop patterns that hold up

1. **Policy-in-code (deterministic).** Money, customer and prospect actions go through the `propose_task` custom tool and `lib/agents/core/policy.ts`. This is the only layer provably enforced; Anthropic's docs say the same of custom tools. Keep `create_ad`, `apply_credit`, budget changes above a cap and any first-touch outreach on **always approve**.
2. **Platform gate.** In Managed Agents set `always_ask` on `bash` and MCP write tools; in the Agent SDK use a `PreToolUse` hook, because "auto-approved tools never reach `canUseTool`" and `allowedTools` does not constrain `bypassPermissions`. `[V]`
3. **Server classifier (`auto`).** Cuts prompts on read-only tools, but Anthropic states it is not a human checkpoint, denials cannot be overridden, and "if you relay untrusted end-user input in `user.message` events, the server reads that input as your intent." Never pipe a customer SMS into an agent holding write tools.

Rules from the case studies: a daily send cap, a per-run dollar budget, a kill switch (`deployments.pause`), and a quality metric (reply rate, CSAT, repeat-contact rate) that can stop the agent.

---

## 4. What real companies got in production, and what failed

| Function | Deployment | Result numbers | What failed |
|---|---|---|---|
| AI support | Klarna (OpenAI, Feb 2024) | 2.3M conversations month 1; resolution 11 min -> <2 min; repeat inquiries -25%; two-thirds of inquiries and "the work of 853 FTEs" per Q3 2025 call `[V2]` | May 2025: "focused too much on cost. The result was lower quality"; CSAT fell, repeat contacts rose; humans rehired for disputes, refunds, hardship. AI kept for the routine tier. |
| AI support | Intercom Fin | $0.99 per resolution, 50-outcome minimum (~$49/mo); Intercom-published averages 67% (2025) -> 76% (2026) `[V2]` | Production case studies cluster at 42-50%; a 500-ticket small-business test landed at 38%. |
| AI SDR | 11x ($74M raised) | TechCrunch 2025-03-24: ZoomInfo was a one-month trial shown as a logo; ex-employees put churn at 70-80% in 3 months, ~$3M surviving contracts vs ~$14M claimed ARR `[V2]` | Emails "not working as expected", hallucinations, customers used break clauses. |
| AI SDR | 2026 multi-vendor surveys | Winners: 2.4% -> 8.2% reply rate by month 6 across 75 companies (vendor study). Losers: 6.4x more volume, positive reply 1.3% vs 2.1% human, ~50% of pilots shut down within 90 days; one case ~$250k pipeline loss with reps spending ~40% of the week editing AI sequences `[V2]` | Volume over relevance; multi-turn quality collapse. |
| AI ads | Meta Advantage+ / Business AI (agents in Ads Manager Mar 2026; assistant to all advertisers 2026-04-24) | Meta claims +22% ROAS (4.52x vs 3.70x), ~$60B annualised, 82% of advertisers `[V2]` | Reports of near-100% budget concentration into one ad, unsanctioned creative edits, spend above daily budget; a DTC brand's bidding agent spent $22k overnight on a $6k/day cap `[V2]`. |
| Multi-agent research | Anthropic Research (June 2025) | Orchestrator + 3-5 subagents beat single Opus 4 by 90.2% at ~15x the tokens of a chat `[V2]` | Not for tightly coupled tasks; fan-out only when the task is worth it. |

**Applied to CallCatch:** humans stay on money and the customer relationship; agents execute only capped, reversible, pre-approved actions; every role reports a quality KPI weekly and is paused when it drops; no claims absent from `metrics_daily`.

---

## 5. Recommended Company OS architecture

**Principle:** the runtime exists (`runAgent` + `toolRunner` + `propose_task` + policy + `agent_runs`). Do not rewrite it. Add Managed Agents scheduled deployments for long-running sandbox work, Claude Code Routines for engineering, and budgets, observability and kill switches everywhere.

### 5.1 Roles

| Role (`lib/agents/roles/`) | Surface | Model / effort | Cadence | Tools | Gate | $/run |
|---|---|---|---|---|---|---|
| `chief_of_staff` | tool runner | Sonnet 5 `medium` daily; Opus 5 `high` weekly | 07:00 CT; Mon | `get_metrics`, `query_table`, `recall`, `notify_founder` | none (read + notify) | 0.50 / 3 |
| `outreach` (SDR) | tool runner + web_search | Sonnet 5 `medium` | 09:00 CT weekdays | enrich, `update_prospect`, `send_outreach_email`, `schedule_call` | step 1 approve; later steps auto once the sequence is approved; daily cap; 8am-6pm local; no SMS | 0.75 |
| `ads_manager` | tool runner + Meta Marketing API | Sonnet 5 `low` daily; Opus 5 `high` weekly | 06:30 CT; Sun | insights, `update_ad_budget` (auto if delta <= 20% and daily <= $85), `pause_ad` (auto if CPL > 1.5x target 3 days), `create_ad` | creative always approve; day/week spend caps | 0.50 / 3 |
| `support` | tool runner | Haiku 4.5 `low` triage; Sonnet 5 `medium` drafts | Resend webhook + 15-min sweep | `query_table`, `reply_support_email`, `apply_credit`, `flag_account` | auto for FAQ/how-to; approve on refund, cancel, legal, TCPA; credits always approve | 0.10 / 0.50 |
| `onboarding` | tool runner | Sonnet 5 `medium` | signup event + 10:00 CT sweep | Twilio verification status, forwarding test, `reply_support_email`, `notify_founder` | nudges auto; billing approve | 0.60 |
| `revops` | tool runner (Batch API nightly) | Haiku 4.5 `low` nightly; Sonnet 5 weekly | 02:00 UTC; Fri | Stripe failed payments, dunning drafts, `computeDailyMetrics`, churn scoring | dunning auto after template approval | 0.10 / 0.50 |
| `content` | Managed Agents deployment | Opus 5 `high` + Haiku 4.5 research roster | Wed weekly (daily at 1,000) | web_search/web_fetch with `allowed_domains`, `publish_content` draft | founder publishes | budget $3 |
| `engineer` | Claude Code Routines | Opus 5 | nightly + GitHub webhook | repo, tests, Vercel logs via MCP | PRs only; founder merges; `disallowedTools: ["Bash(rm *)"]` | plan-included or 2 |

### 5.2 Schedules and triggers
Vercel Cron -> `POST /api/agents/run?role=...` for tool-runner roles; a Managed Agents deployment for `content` (cron `0 9 * * 3`, `America/Chicago`, budget `{"amount":"300","currency":"USD"}`); Routines for `engineer`. Event-driven runs (Resend inbound, Stripe `invoice.payment_failed`, Twilio verification) enqueue `agent_tasks` rather than calling the model inline, so a webhook storm cannot run up spend.

### 5.3 Budgets and cost controls
- Per-run `budgetUsdPerRun` + `max_iterations` (exist); add a daily org cap in `policy.ts` (e.g. $15/day at launch) read from `agent_runs` before each run.
- Managed Agents: `budget.max_list_cost` on every session/deployment; `deployments.pause()` is the kill switch.
- Caching: frozen `systemPrompt` + deterministic tool order under a `cache_control` breakpoint, dynamic block after it; assert `usage.cache_read_input_tokens > 0` in `agent_runs`.
- Effort `low` for monitors, `medium` for drafting, `high` for weekly Opus reviews. Batch API (50% off) for nightly rollups and report narration.

### 5.4 Observability
Extend `agent_runs` with `cache_read_input_tokens`, `stop_reason`, `iterations`, Console trace URL and a `quality` column (reply rate, resolution-without-reopen, CPL delta). Pull org truth nightly from the Usage & Cost Admin API into `metrics_daily`. `chief_of_staff` flags any role above 3% of MRR.

---

## 6. Estimated monthly token cost at 10 / 100 / 1,000 customers

**Session profiles (list prices, caching on):** L = Haiku 4.5, 20k uncached + 40k cached + 20k cache-write in, 3k out, 5 min -> **$0.07**. M = Sonnet 5, 50k + 150k + 50k in, 10k out, 15 min -> **$0.38**. H = Opus 5, 100k + 400k + 100k in, 25k out, 40 min -> **$2.00**. Runtime ($0.08/h) applies only to Managed Agents sessions; web search $0.01 each. Volumes `[U]`: 1.5 support tickets/customer/month, 30% needing a Sonnet draft; new customers 5 / 17 / 60 per month; SDR batches 1 / 2 / 4 per weekday.

| Line | 10 customers | 100 | 1,000 |
|---|---|---|---|
| chief_of_staff (26 M + 4 H) | $18 | $18 | $18 |
| outreach (22 x (M + 20 searches) x batches) | $13 | $26 | $51 |
| ads_manager (30 M + 4 H; 2x daily at 1,000) | $19 | $19 | $31 |
| content (H weekly -> 2/wk -> daily) | $8 | $16 | $60 |
| engineer (30 H nightly; $0 marginal as Routines on a Claude Max plan) | $60 | $60 | $60 |
| revops (30 L + 4 M) | $4 | $4 | $4 |
| support (1.5 L + 0.45 M per customer) | $3 | $28 | $276 |
| onboarding (M + 2 L per new customer) | $3 | $9 | $31 |
| health scans + weekly report narration (Batch) | $1 | $3 | $26 |
| **Subtotal** | **$129** | **$183** | **$557** |
| +20% retries / coordination / cache misses | **~$155** | **~$220** | **~$670** |
| Ops-agent cost per customer | $15.5 | $2.2 | $0.67 |
| Product SMS LLM COGS (spec §8: ~240 turns, $0.90/customer; already in $14.80) | $9 | $90 | $900 |
| Ops agents as % of MRR at $107 ARPU | 14.5% | 2.1% | 0.6% |

Reading: at 10 customers fixed roles dominate, so run `engineer` on a subscription and `content` fortnightly until month 3. At 1,000 customers `support` dominates; Haiku triage, "auto-reply only for FAQ" and Klarna's repeat-contact metric matter most there. One H session costs 29x an L session, so fan-out is for weekly work only.

---

## 7. Risks and open items

- Managed Agents is beta (no ZDR/HIPAA). Keep PII in Supabase; pass IDs, not transcripts, into sessions. `[V]`
- Deployment jitter (up to 9 min) and DST double-fire in the 1-3 AM local window: schedule nightly jobs in UTC. `[V]`
- `[U]` Ticket volume, new-customer counts and SDR batch sizes are assumptions; replace with `agent_runs` actuals after 30 days.
- Compliance unchanged from `COMPANY_OS_CONTRACTS.md`: no cold SMS (TCPA), CAN-SPAM footer, no fabricated claims.

---

## Sources (all accessed 2026-09-14)

- Pricing (models, caching, Batch, web search, Managed Agents runtime): https://platform.claude.com/docs/en/about-claude/pricing
- Managed Agents overview / tools / permission policies: https://platform.claude.com/docs/en/managed-agents/overview ; https://platform.claude.com/docs/en/managed-agents/tools ; https://platform.claude.com/docs/en/managed-agents/permission-policies
- Scheduled deployments, budgets, vaults, memory, multiagent, webhooks: https://platform.claude.com/docs/en/managed-agents/scheduled-deployments and the `claude-api` skill mirror (v2.1.270); beta announcement 2026-06-09: https://www.techtimes.com/articles/318163/20260610/claude-managed-agents-add-cron-schedules-credential-vaultsanthropic-beta-puts-agents-autopilot.htm
- Agent SDK: https://code.claude.com/docs/en/agent-sdk/permissions
- Routines: https://claude.com/blog/introducing-routines-in-claude-code
- Fable 5.1 (2026-09-01) cache-read cut: https://venturebeat.com/technology/anthropics-claude-fable-5-1-and-mythos-5-1-arrive-with-a-75-cost-reduction-for-fable-cache-reads
- Usage & Cost API / OTel: https://platform.claude.com/docs/en/manage-claude/usage-cost-api ; https://docs.honeycomb.io/send-data/use-cases/anthropic-usage-monitoring
- Anthropic multi-agent research (June 2025) via: https://www.zenml.io/llmops-database/building-production-multi-agent-research-systems-with-claude
- Klarna: https://www.usefini.com/blog/klarna-automates-two-thirds-of-customer-service-with-ai-assistant ; https://www.forbes.com/sites/quickerbettertech/2025/05/18/business-tech-news-klarna-reverses-on-ai-says-customers-like-talking-to-people/
- Intercom Fin: https://www.gleap.io/blog/intercom-fin-ai-pricing-2026 ; https://superframeworks.com/articles/best-ai-customer-support-tools
- 11x (TechCrunch 2025-03-24, proxy-blocked; read via secondary): https://techcrunch.com/2025/03/24/a16z-and-benchmark-backed-11x-has-been-claiming-customers-it-doesnt-have ; https://salesmotion.io/blog/turns-out-ai-sdrs-are-too-good-to-be-true-11x-might-face-legal-action
- AI SDR 2026 outcomes: https://www.harborbd.com/blogs/ai-sdr-outbound-results-2026 ; https://www.devcommx.com/blogs/ai-sdr-reply-rates-roi
- Meta AI ads and failures: https://www.mediapost.com/publications/article/414547/meta-rolls-out-ai-business-assistant-to-all-advert.html ; https://www.adcontrolcenter.com/learn/meta-ai-budget-concentration-one-ad-fix ; https://www.influencers-time.com/ai-bidding-agent-failures-a-post-mortem-framework-for-ad-ops/
- Internal: `docs/PRODUCT_SPEC.md` §1-§4, §8; `docs/FINANCIAL_MODEL.md`; `docs/COMPANY_OS_CONTRACTS.md`.
