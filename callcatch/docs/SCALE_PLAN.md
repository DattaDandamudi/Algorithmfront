# CallCatch — Scale plan: $0 to a highly profitable online business

**Date:** 2026-09-16. **Owner:** founder + the Company OS (10 agents). **Inputs:** `docs/PRODUCT_SPEC.md`, `docs/FINANCIAL_MODEL.md`, and the 2026 web research in `docs/research/` (competitors, channels, multi-agent operations, prospecting data & compliance). Research that did not complete (telecom cost alternatives, growth-playbook case studies, vertical expansion) is marked `[U]` and queued for the content and board agents.

## 1. Thesis and what must be true

CallCatch sells a $79-$149/month, 86%-gross-margin product into a market of ~117,000 HVAC contractor businesses plus plumbing and electrical [1], where 27-62% of inbound calls go unanswered [spec §1] and no incumbent under $150 combines missed-call trigger, SMS qualification and owner alerts [2]. The business becomes highly profitable when four things are true:

1. **CAC ≤ $450 (3-4 months of gross profit at 4.5% monthly churn).** Founder outbound (~$0 cash), Meta lead ads with a 5-minute founder callback (CAC $300-550), the in-product referral ($214) and success-only affiliates ($321) clear that bar inside 90 days [3]. Google Search, marketplaces and associations are month-4+ channels.
2. **Time-to-live ≤ 10 business days** (carrier verification) with day-0 value (alerts, voicemail transcripts), so trials do not stall. Compliance is the moat: the category's loudest complaints are contracts, per-minute meters and silent A2P failures [2].
3. **Gross margin ≥ 80% including agents.** Product COGS $14.80/customer/month; the Company OS costs ~$155/month at 10 customers, ~$220 at 100, ~$670 at 1,000 (0.6% of MRR) [4].
4. **Net revenue retention ≥ 100%** by month 9 through Pro upgrades (web/Meta leads, after-hours routing), the AI-voice fallback inside Pro, and multi-line accounts.

## 2. Stages

| Stage | MRR | Channels & budget | Product scope | Team | Unit-economics targets | Gate to next stage |
|---|---|---|---|---|---|---|
| **0 → $10k** (Sep 2026 – Feb 2027) | $0-10k | Founder outbound 250 dials/wk from license-board lists; Meta lead ads $750 → $2,500/mo (warm-up ≤ $30/day for 14 days); referral coupon; first 20 affiliates | Starter/Pro as built; verification speed; weekly report; demo line | Founder (30 h/wk) + agents: prospector, outreach, closer, support, revops, compliance, orchestrator | CPL ≤ $55, lead→customer ≥ 8%, trial→paid ≥ 35%, churn ≤ 5%, agent cost ≤ 15% of MRR | 50 paying customers, 3 case studies, CPL and conversion stable 60 days |
| **$10k → $100k** (Mar 2027 – Q1 2028) | $10k-100k | Meta $4k/mo, Google brand + 10 exact terms $1k, Jobber App Marketplace (~$0 CAC), GoHighLevel agency wholesale tier ($99 Pro → resold $199-297), Service Roundtable partner, Johnstone counter days, affiliates 25% recurring | AI-voice fallback in Pro ("answers after 4 rings, then texts"); Jobber/HCP booking hand-off; Spanish threads; annual default at checkout | Founder + 1 sales/onboarding hire at $25k MRR; agents run ads, content, RevOps, support tier 1 | CAC ≤ $400 blended, payback ≤ 4 months, NRR ≥ 100%, support ≤ 1 FTE per 400 customers | 500 customers, ≥ 20% of new customers partner-sourced, gross margin ≥ 80% all-in |
| **$100k → $1M** (2028) | $100k-1M | Marketplaces (HCP, Workiz, FieldPulse, ServiceTitan Silver if ≥ 3 ST shops ask), association sponsorships, distributor programs, YouTube retargeting, TikTok organic | Multi-location plan, review requests, quote follow-up add-on, CSR analytics; API | 6-10 people (sales, success, 2 engineers, marketing) + agents for tier-1 everything | CAC ≤ $600 with 12-month payback, NRR ≥ 110%, churn ≤ 3% | $1M MRR run-rate, ≥ 40% margin |
| **$1M+** | $1M+ | Adjacent trades (roofing, pest, garage doors), Canada/UK/AU `[U]`, franchise groups (Nexstar) | Voice + text platform for the whole front desk | — | Rule of 40 | — |

## 3. The Company OS (multi-agent system)

Implemented in `lib/agents/**`, `/admin/agents`, `/api/cron/agents` (hourly). Every agent reads the same company context and compliance rules, proposes actions through `propose_task`, and `lib/agents/core/policy.ts` decides what executes without a human. Daily model budget `AGENT_DAILY_BUDGET_USD` (default $25), per-run budgets, email cap `AGENT_MAX_EMAILS_PER_DAY`, ad-change cap `AGENT_MAX_ADS_CHANGE_USD`. Kill switch: `AGENT_AUTONOMY=draft_only` + disable the cron.

| Role | Mission | Cadence (UTC) | Autonomy (default `approval_required`) | KPI | $/run |
|---|---|---|---|---|---|
| Orchestrator | daily plan + founder blockers | 12:00 daily | notify only | plan by 8:15am ET | 1.00 |
| Prospector | license-board ingest, enrichment, line type, scoring | 13:00 weekdays | data writes auto | 200 queued/metro | 1.50 |
| Outreach | 4-step email sequence, reply handling | 14:00 & 20:00 weekdays | step emails need approval until `autonomous` | reply rate ≥ 4% | 1.50 |
| Closer | replies → demos → trials → annual | 15:00 & 21:00 weekdays | drafts + call scheduling | trial→paid ≥ 35% | 1.00 |
| Ads | CPL guard, pause/scale within caps, creative angles | 13:00 & 22:00 daily | pause/scale auto only when `autonomous`; create_ad always human | CPL ≤ $45 | 0.75 |
| Content | 2 pages/week, web-verified | Tue/Thu 16:00 | drafts | organic demo calls | 2.00 |
| Support | tickets from support@ | every 3 h | replies auto only when `autonomous`; credits always human | FRT < 3 h | 1.00 |
| RevOps | metrics, dunning, at-risk accounts | 11:00 daily | flags + digest | at-risk resolved | 0.75 |
| Compliance | opt-out, quiet-hours, disclosure, SLA audits | 11:00 daily | flags + digest | score 100 | 0.75 |
| Board | Monday memo | Mon 12:00 | notify | memo by 8:30am ET | 2.00 |

**Founder's remaining job** (hours/week by stage: 30 → 20 → 10): identity and money (LLC, EIN, bank, Stripe, Twilio ISV profile), the demo call, approving the queue (10 min, twice a day), the weekly ad creative shoot, and the decisions the board memo asks for.

## 4. 12-month projection

Base case (financial model base for months 1-8, extended with the channel plan; marketing = Meta + Google + partner payouts + tools per `docs/research/channels-2026.md` §6; agents per `docs/research/multi-agent-ops-2026.md` §6; fixed SaaS tools ~$220/mo). Collected = cash through Stripe.

| Month | Active | MRR | Collected | Marketing | COGS | Agents | Net cash | Cumulative |
|---|---|---|---|---|---|---|---|---|
| Oct 2026 | 5 | $546 | $1,231 | $750 | $168 | $155 | $-62 | $1,231 collected / $-62 net |
| Nov 2026 | 12 | $1,280 | $2,755 | $988 | $274 | $157 | $1,116 | $3,986 collected / $1,054 net |
| Dec 2026 | 22 | $2,305 | $4,309 | $1,653 | $420 | $164 | $1,852 | $8,295 collected / $2,906 net |
| Jan 2027 | 36 | $3,688 | $6,333 | $2,585 | $618 | $174 | $2,736 | $14,628 collected / $5,642 net |
| Feb 2027 | 51 | $5,236 | $8,076 | $3,800 | $840 | $184 | $3,032 | $22,704 collected / $8,674 net |
| Mar 2027 | 66 | $6,773 | $9,417 | $4,846 | $1,061 | $195 | $3,095 | $32,121 collected / $11,769 net |
| Apr 2027 | 80 | $8,300 | $10,742 | $5,650 | $1,281 | $206 | $3,385 | $42,863 collected / $15,154 net |
| May 2027 | 95 | $9,819 | $12,050 | $6,445 | $1,500 | $217 | $3,668 | $54,913 collected / $18,822 net |
| Jun 2027 | 110 | $11,424 | $13,300 | $7,230 | $1,722 | $225 | $3,903 | $68,213 collected / $22,725 net |
| Jul 2027 | 125 | $13,029 | $14,550 | $7,980 | $1,944 | $233 | $4,173 | $82,763 collected / $26,898 net |
| Aug 2027 | 140 | $14,634 | $15,800 | $8,700 | $2,166 | $240 | $4,474 | $98,563 collected / $31,372 net |
| Sep 2027 | 155 | $16,239 | $17,050 | $9,420 | $2,388 | $248 | $4,774 | $115,613 collected / $36,146 net |

Base case: **$115,613 collected in 12 months**, cumulative net cash $36,146, exit MRR $16,239 with ~155 customers. The $20k collected milestone falls in **February 2027** (month 5).

Upside (CPL $22, lead→customer 14%, 30% annual, marketing scaled with collections):

| Month | Active | MRR | Collected | Marketing | COGS | Agents | Net cash | Cumulative |
|---|---|---|---|---|---|---|---|---|
| Oct 2026 | 7 | $725 | $2,346 | $750 | $195 | $155 | $1,026 | $2,346 collected / $1,026 net |
| Nov 2026 | 20 | $2,034 | $6,059 | $1,200 | $386 | $162 | $4,091 | $8,405 collected / $5,117 net |
| Dec 2026 | 41 | $4,122 | $10,376 | $2,100 | $691 | $177 | $7,188 | $18,781 collected / $12,305 net |
| Jan 2027 | 64 | $6,551 | $13,499 | $3,300 | $1,045 | $194 | $8,740 | $32,280 collected / $21,045 net |
| Feb 2027 | 89 | $8,989 | $15,492 | $4,700 | $1,401 | $212 | $8,959 | $47,772 collected / $30,004 net |
| Mar 2027 | 113 | $11,439 | $17,489 | $5,900 | $1,759 | $226 | $9,384 | $65,261 collected / $39,388 net |
| Apr 2027 | 137 | $13,902 | $19,481 | $6,900 | $2,121 | $239 | $10,001 | $84,742 collected / $49,389 net |
| May 2027 | 162 | $16,378 | $21,468 | $7,800 | $2,483 | $251 | $10,714 | $106,210 collected / $60,103 net |
| Jun 2027 | 184 | $18,732 | $23,368 | $8,700 | $2,809 | $262 | $11,377 | $129,578 collected / $71,480 net |
| Jul 2027 | 206 | $21,086 | $25,268 | $9,500 | $3,134 | $273 | $12,141 | $154,846 collected / $83,621 net |
| Aug 2027 | 228 | $23,440 | $27,168 | $10,300 | $3,460 | $284 | $12,904 | $182,014 collected / $96,525 net |
| Sep 2027 | 250 | $25,794 | $29,068 | $11,000 | $3,786 | $295 | $13,767 | $211,082 collected / $110,292 net |

Upside: **$211,082 collected**, net $110,292, exit MRR $25,794. Downside (CPL $45, 7%, half outbound, 6% churn) crosses $20k in May 2027; the response is to hold Meta at $1,500 and move 10 founder hours/week back to outbound, never to cut outbound.

## 5. Pricing and packaging (evidence-based changes)

1. **Hold $79 / $149.** Goodcall $79/agent, Smith.ai AI $95, Podium's AI add-on $99 and Jobber's $99 tier put $79 at the market floor for "AI answers for you" [2].
2. **Headline "no contract, 30-day money-back, flat allowance"** on the pricing page — the category's #1 review-site complaint, free to fix.
3. **Publish overage math** ($0.25/$0.20 per conversation after 150/500) — opaque overage is why CallRail/Smith.ai/Ruby lose customers.
4. **Keep the $149 setup optional; waive it whenever a prospect mentions Rosie or Goodcall.** Do not add a $49 no-AI tier (loses to Jobber/HCP canned text-back).
5. **Agency wholesale tier**: Pro at $99 for GoHighLevel-style agencies reselling at $199-297 (their generic workflow costs the client $297) [3].
6. **Affiliates: 25% recurring for 12 months** ($321 per retained customer, paid only on collected cash) [3].
7. **AI-voice fallback inside Pro by month 4-6** (every trades incumbent shipped AI voice in 2025-26); price it inside Pro, not per minute [2].

## 6. Expansion sequence

| When | Move | Trigger |
|---|---|---|
| Month 2 | Referral coupon live; Jobber developer app submitted | 10 paying customers |
| Month 3 | 20 GHL agencies on the wholesale tier | 3 case studies |
| Month 4-6 | AI-voice fallback (Pro); Spanish-language threads for Sun Belt | Pro share < 30% or churn cites "callers hang up" |
| Month 6 | Jobber Marketplace live; Service Roundtable partner application; Johnstone counter days | 50 customers |
| Month 7-9 | Roofing, pest control, garage doors (same Meta audiences, same phone behavior) `[U]` | CAC stable 90 days |
| Month 9-12 | HCP / Workiz / FieldPulse listings; PHCC/ACCA chapter sponsorships; review requests + quote follow-up add-ons | 200 customers |
| Year 2 | Canada (CASL consent regime), then UK/AU `[U]`; multi-location plan; Nexstar partner | NRR ≥ 110% |

## 7. Risk register (scaling)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Toll-free verification slower than 10 days stalls trials | medium | high | day-0 value, 5-day escalation template, 10DLC sole-prop path, trial extension cap (2×7 days) then charge |
| Meta CPL > $55 / account restrictions | medium | medium | warm-up caps, backup ad account, kill rule → outbound; never depend on one channel |
| AI SDR failure mode (volume over relevance) | medium | high | founder-quality templates, per-run send caps, reply-rate gate, approval_required default, weekly review by the board agent |
| Ads agent overspend | low | high | policy caps ($50/change, $85/day per ad set), create_ad always human, warm-up rule |
| TCPA / state telemarketing (TX SB 140, FL FTSA, AZ) | medium | high | no cold SMS ever; landline-first calling; counsel question before mobile calls in TX/AZ/FL; suppression same day |
| Churn from forwarding switched off | medium | medium | RevOps "no calls in 14 days" flag → re-test forwarding call within 48 h |
| Support load at scale | low | medium | support agent tier 1 with escalation rules; docs/RUNBOOK facts as its grounding |
| Platform dependence (Twilio, Meta, Anthropic) | low | high | Telnyx/Bandwidth evaluated `[U]`; model id configurable; AI_SAFE_TEMPLATE_MODE kill switch |
| Agent cost creep | low | low | daily budget, per-run budget, board memo tracks cost as % of MRR (alarm at 3%) |

## 8. Day one — 2026-09-16

**Agents (automatic once deployed with keys):** prospector ingests TX HVAC/electrical for Houston, Dallas, Austin, San Antonio; outreach drafts step-1 emails for the top 60 (approval queue); revops computes metrics; compliance audits; orchestrator emails the plan at 8am ET.

**Founder (90 minutes, in this order):**
1. LLC (Wyoming or home state) online + EIN (instant) → needed by Stripe, Twilio ISV profile, Mercury.
2. Stripe: activate, create the 4 prices + $149 setup + overage meter (`docs/DEPLOYMENT.md` §2).
3. Twilio: ISV Primary Business Profile, buy notification + demo toll-free numbers, submit their verifications (§3).
4. Resend: domain + `support@` inbound → `/api/support/inbound`; secondary domain for cold email.
5. Vercel: deploy from the repo (root directory `callcatch`), paste `.env.example` values, confirm crons.
6. Supabase: run both migrations (`supabase/migrations/*.sql`), create your admin user, run `supabase/seed_internal_numbers.sql`.
7. Meta: Business Portfolio, Pixel, ad account with payment method, $0 spend until the demo number verifies (target Oct 1).
8. Set `FOUNDER_NAME`, `FOUNDER_MOBILE`, `FOUNDER_BOOKING_URL` (Cal.com), `OUTREACH_*`, `AGENT_*`; open `/admin/agents` and click **Run now** on prospector, then outreach; approve the first 10 emails.
9. Make the first 10 calls from `/admin/prospects` (filter `state=TX`, `phone_type=landline`, fit ≥ 60) with `data/outreach/call_script_v1.md`.

**Tomorrow:** AZ and FL license CSVs imported; first ad creatives filmed (the "$51 LSA lead sent to voicemail" hook); support@ routing tested; Jobber developer account created.

## Sources
[1] docs/research/channels-2026.md (market size, channel benchmarks, marketplace terms) · [2] docs/research/competitors-2026.md · [3] docs/research/channels-2026.md §4-6 · [4] docs/research/multi-agent-ops-2026.md §6 · docs/research/prospecting-data-2026.md (data sourcing and outreach compliance) · docs/FINANCIAL_MODEL.md (base/downside/upside months 1-8).
