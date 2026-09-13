# 90-day launch plan

Source: `PRODUCT_SPEC.md` §10. Owners: **F** = founder, **E** = engineer (Claude build sessions), **I** = integrator (merges, deploys, env). Everything is dated from formation on **Sunday Sep 14, 2026**. Review every Saturday (`SALES.md` §10) and every 1st (`FINANCIAL_MODEL.md` §10).

Targets are the base case. If the month-2 review declares downside, targets shift to `FINANCIAL_MODEL.md` §4 and the ad rules in `META_ADS.md` §12 apply.

---

## Day 0 — Sunday Sep 14, 2026

| # | Task | Owner | Done |
|---|---|---|---|
| 1 | TESS + domain check; buy `callcatch.co` (fallbacks: MissedCallBack, TextBackHQ) | F | [ ] |
| 2 | Wyoming LLC filed online; Articles PDF saved | F | [ ] |
| 3 | EIN obtained; CP575 PDF saved | F | [ ] |
| 4 | Operating agreement signed | F | [ ] |
| 5 | Google Workspace: `hello@`, founder, `dmarc@`, `demo@callcatch.co` | F | [ ] |
| 6 | Mercury application submitted (Relay as backup); virtual card for ads planned | F | [ ] |
| 7 | Stripe account created under the LLC; products/prices (Starter $79/$790, Pro $149/$1,490, DFY $149, overage metered); Customer Portal; Smart Retries; descriptor CALLCATCH | F | [ ] |
| 8 | Legal pages drafted and published (Terms, Privacy, SMS Terms, Refund 30-day, Data Deletion) — placeholder site if the app is not deployed yet | F | [ ] |
| 9 | Twilio: upgrade; ISV Primary Business Profile submitted with LLC docs + EIN; notification + demo toll-free numbers bought | F | [ ] |
| 10 | Meta: Business Portfolio, Page + backup, ad account + backup, payment method, domain verification, Pixel, CAPI token, developer app (Business) with Lead Ads, Business Verification started | F | [ ] |
| 11 | Anthropic key + spend limit; Supabase Pro project created; Vercel Pro project created | F | [ ] |
| 12 | Repo ready: `.env.example` filled into Vercel env as far as values exist | I | [ ] |
| 13 | Outbound sheet started: first 50 Ad Library contractors (TX/FL/AZ) | F | [ ] |
| 14 | Records folder in Drive with every PDF above | F | [ ] |

Cash: ~$300-400 one-time from the founder; the $1,000 seed sits on the Mercury ads card untouched until Oct 1.

## Week by week

| Week | Dates | Build / ops (owner) | Sales / ads (owner) | Success metric |
|---|---|---|---|---|
| **0** | Sep 14-20 | Company formation (`COMPANY_FORMATION.md`) (F). **Build days Sep 15-16:** modules a-g in parallel (E); integrator merges Sep 17 (I). Deploy to prod domain per `DEPLOYMENT.md` (I). Seed demo account; founder's own phone forwarded (F). ISV profile submitted Day 0; on approval submit TFV for our 2 numbers (F). | Build the outbound list: 200 Ad Library + 200 Maps contractors in TX/FL/AZ (F). Start calls **Sep 18** (F). | MVP live on `callcatch.co` Sep 17; 1 pay-now customer by Sep 20; both TFVs submitted |
| **1** | Sep 21-27 | QA end-to-end: missed call → text → lead → alert on the seeded account; Stripe live mode; Resend inbound; TFV status polling verified; Loom onboarding video recorded (F/I). **Submit Meta App Review** with the demo screencast (`COMPLIANCE.md` §8) (F). | 250 dials; 5 demos; close pay-now/annual (F). Ads still off (account warming, demo number pending). | 2 customers (Sep total); first customer TFV submitted; App Review submitted |
| **2** | Sep 28-Oct 4 | Our numbers verified (expected ~Sep 22-Oct 1); demo line live; weekly-report cron verified with real data Monday Sep 28 (F/I). | **Oct 1 ads on:** week-1 creative test $150 (#1, #3, #4, #6, #7 in sets A + B). Founder 5-minute callback SLA (F). | ≥ 5 leads, 2 demos; Pixel + CAPI `Lead` deduplicated in Events Manager |
| **3** | Oct 5-11 | Fix AI transcripts from real threads (golden tests updated); carrier-specific forwarding fixes; Zapier Meta-lead bridge documented for Pro customers (E/F). | Ads $175; kill/scale per rules; first ad-sourced close (F). | 3-4 cumulative customers; CPL read at day 14 |
| **4** | Oct 12-18 | Referral coupon flow (`REFERRAL-1MO`); CAPI `Purchase` verified in Events Manager (E/F). | Ads $200; retargeting set C on at $5/day; Sun Belt duplicate A2 if A < B on CPL (F). | Month-1 pace: 25 leads; retargeting audience > 1,000 |
| **5** | Oct 19-25 | Usage rollup + overage billing test (`usage-rollup` → Stripe usage record); dunning emails tested with a failing test card (E/F). | Ads $225; test #2 demo-line ad in CC-Demo (F). | 5-6 customers total; overage record visible in Stripe |
| **6** | Oct 26-Nov 1 | **Month-1 review** (Nov 1): CPL, lead→demo, demo→close, TFV median days. Decide base vs downside track (F). | Reinvest rule starts: Nov ads = $250 seed + 60% of Oct collected (≈ $988 base). Holiday creative #6 (no-heat) live (F). | ~$1.9k cumulative collected; track declared in writing |
| **7** | Nov 2-8 | Pro: Jobber/HCP booking-link polish; after-hours routing tested with a real on-call tech (E/F). | Ads ~$250/wk; outbound 250/wk; ask every live customer for one referral (F). | 8+ customers |
| **8** | Nov 9-15 | Meta App Review decision expected (or resubmit); flip `FEATURE_META_LEADGEN=true` for approved accounts, migrate Pro customers off Zapier one by one (F/I). | Pro upsell push to owners running Meta lead ads (F). | Pro mix ≥ 35% |
| **9** | Nov 16-22 | First "customer story" ad (#8) with written permission; pause-instead-of-cancel flow verified in the Portal (E/F). | Ads ~$250/wk; Thanksgiving-week dial-down (F). | 12+ customers |
| **10** | Nov 23-29 | **Counsel review** of SMS consent language + SMS Terms (budget $300-500 `[U]`) (F). | Light ads; outbound focus on plumbers (holiday emergencies) (F). | ~$4.6k cumulative collected |
| **11** | Nov 30-Dec 6 | Lookalike seeding when 100 `Lead` events reached; CBO test if spend > $60/day (F). **Month-2 review** Dec 1. | Ads ~$400/wk (F). | 16+ customers |
| **12** | Dec 7-13 | Admin health dashboard; TFV escalation SLA report (E). | "Winter no-heat" creative; annual push before year-end ("expense it in 2026") (F). | 20+ customers, ~$7k cumulative |
| **13** | Dec 14-20 | Retention: first-week milestone message; "revenue recovered" numbers audited with 5 customers (F/E). | Reduced Dec 20-Jan 3 pacing; prep January "new year pipeline" creative (F). | **Month-3 close:** ~22 active, ~$8.9k cumulative; go/no-go on a part-time SDR at $6k MRR (later) |

## Recurring cadences

| When | What | Doc |
|---|---|---|
| Every ad lead | Call within 5 minutes (business hours), log in `/admin` | `SALES.md` |
| Daily 9:30 | TFV queue, inbox exceptions, failed messages, dunning | `RUNBOOK.md` |
| Monday 07:00 | Weekly report emails go out (cron); check one landed | `DEPLOYMENT.md` §8 |
| Monday 15 min | Emergency-message audit | `RUNBOOK.md` §5 |
| Saturday 1 h | Sales scorecard; ad kill/scale pass; next week's dial list | `SALES.md` §10, `META_ADS.md` §8 |
| 1st of month | Month-end review, model re-run, track declaration, next-month ad budget | `FINANCIAL_MODEL.md` §10 |
| Day 5 after each TFV | Escalation ticket if still pending | `RUNBOOK.md` §1 |
| Weekly | Upload Stripe customer list to the Meta exclusion audience | `META_ADS.md` §1 |
| Monthly | Risk register review | `RISKS.md` |

## Review notes

Append one block per review (date, track, crossing month from the re-run, decisions):

```
2026-11-01 — Month-1 review — track: ____ — CPL ____ — lead→demo ____ — demo→close ____ — TFV median ____ days — re-run crossing: ____ — decisions: ____
2026-12-01 — Month-2 review — …
2027-01-01 — Month-3 review — …
```
