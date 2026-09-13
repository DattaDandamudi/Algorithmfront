# Financial model

Source: `PRODUCT_SPEC.md` §8, computed by `docs/model/model.py`, output in `docs/model/model_out.json`, CSVs in `docs/model/*.csv`. Re-run instructions: `docs/model/README.md`.

**Definition of $20,000:** cumulative **cash collected through Stripe** — successful charges for subscriptions, annual prepays and setup fees, **gross of Stripe fees, net of refunds**, counted from LLC formation (Sep 14, 2026). $20k **MRR** is not reachable in this window: base-case MRR is ~$6.8k at end of March 2027 and ~$9.8k by May; $20k MRR needs ~185 customers at $107 and lands in month 14-18 on this reinvestment rate `[U]`.

---

## 1. How the model works (`model.py`)

One function `run(name, cpl, lead_to_cust, outbound, annual_take, setup_attach, churn, refund, reinvest, cap, seed_m1=750, seed_m2=250, months=8)` produces 9 rows (month 0 = Sep 14-30, months 1-8 = Oct 2026 … May 2027). Per month:

1. **Ad spend** = $750 (M1) · $250 + `reinvest` × prior-month collected (M2) · `reinvest` × prior-month collected (M3+), capped at `cap` ($2,500).
2. **Leads** = spend / CPL. **Ad customers** = leads × lead→customer. **Demos** (reported column) = leads × 25%.
3. **Outbound customers** from the `outbound` list; **referrals** = 3% of the active base per month from month 3 (Dec).
4. **Cash timing:** 50% of ad customers pay in the acquisition month (pay-now on demo), 50% the following month (trial / late verification); outbound + referral customers pay 70% in-month, 30% next month (`carry_cust`).
5. **Churn** = `churn` × monthly base, applied before new customers land; annual customers never churn inside the window.
6. **New cash** = annual new × $1,070 × (1 − refund) + monthly new × ($107 + `setup_attach` × $149) × (1 − refund). **Recurring** = monthly base × $107. **Collected** = recurring + new cash.
7. **MRR** = monthly base × $107 + annual base × $1,070 / 12. **COGS** = active × $14.80 + $90. **GM%** = (MRR − COGS) / MRR.
8. **Crossing** = first row whose cumulative ≥ $20,000.

Fractional customers are expected values; real months are lumpy. Month 0 is 2 outbound customers with no ads.

## 2. Assumptions (every number with its spec tag)

| Assumption | Base | Downside | Upside | Tag / source |
|---|---|---|---|---|
| CPL | $30 | $45 | $22 | `[V]` WordStream 2025 $27.66; `[V2]` B2B SMB $28-60 |
| Lead → paying customer | 10% | 7% | 14% | product of lead→demo 25% `[U]` × demo→customer 40% (`[V2]` card-required trial 30-48%; pay-now close `[U]`) |
| Outbound customers (Sep, Oct … May) | 2, 3, 5, 6, 7, 7, 7, 7, 7 | 2, 2, 3, 4, 4, 4, 4, 4, 4 | 2, 4, 6, 8, 8, 8, 8, 8, 8 | `[U]` ~250 dials/wk → 6% → 35% → 45% |
| Referrals | 3% of base/month from Dec | same | same | `[U]` |
| Annual take rate | 20% | 12% | 30% | `[U]` |
| DFY setup attach (monthly plans) | 30% | 20% | 40% | `[U]` |
| Monthly logo churn | 4.5% | 6% | 3.5% | `[V2]` SMB SaaS 3-7% (Kalungi / Recurly / Vena) |
| Refunds on first payment | 5% | 8% | 3% | `[U]` |
| Blended monthly ARPU | $107 (60% Starter $79 / 40% Pro $149) | same | same | `[U]` mix; prices are ours |
| Annual price (blended) | $1,070 | same | same | 10 × ARPU (2 months free) |
| DFY setup fee | $149 | same | same | ours |
| Reinvestment | 60% of prior-month collected, cap $2,500 | same | same | plan rule |
| Seed | $750 Oct + $250 Nov | same | same | plan rule |
| Cash timing | 50/50 ad, 70/30 outbound | same | same | `[U]` |
| Variable COGS / customer / month | $14.80 | same | same | see §5; `[V]`/`[V2]` per line |
| Fixed tools | $90/mo | same | same | Supabase $25 `[V]` + Vercel $20 `[V]` + Resend $20 `[V]` + Zapier $19.99 `[V]` + Workspace $7 `[U]` |
| Founder time | $0 in CAC | same | same | stated |

Not modeled (small at this scale, stated for honesty): Stripe disputes ($15 each), failed-payment leakage beyond Smart Retries (5-10% of SMB renewals before retry), sales tax, Twilio price changes, ad-account bans, overage revenue.

## 3. Base case

Crosses **$20,000 in February 2027 (month 5)**. Linear interpolation inside the month (need $4,735 of February's $8,076) puts the day at ~Feb 17; the spec says "around Feb 18". Cumulative ad spend to that point ≈ $8,400 ($750 + $988 + $1,653 + $2,500 + $2,500), of which $1,000 is seed; net cash after ads, COGS and fees at the crossing ≈ $11-12k.

| Month | Ad spend | Leads | Demos | New cust. | Churned | Active | MRR | Collected | Cumulative | COGS | GM % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 · Sep 14-30 2026 | $0 | 0 | — | 2 | 0 | 2.0 | $207 | $637 | $637 | $120 | n/a |
| 1 · Oct 2026 | $750 | 25.0 | 6.2 | 5.5 | 0.1 | 5.3 | $546 | $1,231 | $1,868 | $168 | 69.2 |
| 2 · Nov 2026 | $988 | 32.9 | 8.2 | 8.3 | 0.2 | 12.4 | $1,280 | $2,755 | $4,623 | $273 | 78.7 |
| 3 · Dec 2026 | $1,653 | 55.1 | 13.8 | 11.9 | 0.4 | 22.3 | $2,305 | $4,309 | $8,931 | $420 | 81.8 |
| 4 · Jan 2027 | $2,500 | 83.3 | 20.8 | 16.0 | 0.8 | 35.7 | $3,688 | $6,333 | $15,265 | $619 | 83.2 |
| **5 · Feb 2027** | $2,500 | 83.3 | 20.8 | 16.4 | 1.3 | 50.7 | $5,236 | $8,076 | **$23,341** | $841 | 83.9 |
| 6 · Mar 2027 | $2,500 | 83.3 | 20.8 | 16.9 | 1.8 | 65.6 | $6,773 | $9,417 | $32,758 | $1,061 | 84.3 |
| 7 · Apr 2027 | $2,500 | 83.3 | 20.8 | 17.3 | 2.3 | 80.5 | $8,300 | $10,742 | $43,500 | $1,281 | 84.6 |
| 8 · May 2027 | $2,500 | 83.3 | 20.8 | 17.7 | 2.8 | 95.3 | $9,819 | $12,050 | $55,551 | $1,500 | 84.7 |

## 4. Downside

CPL $45, lead→customer 7%, outbound 2/2/3/4/4/4/4/4/4, annual 12%, DFY 20%, churn 6%, refunds 8%. Crosses **$20,000 in May 2027 (month 8)** — interpolated ~May 17 (need $2,738 of May's $4,998).

Trigger to declare downside: month-2 CPL > $45 or lead→customer < 7% → cut ad reinvestment to 40% and move 10 more founder hours/week to outbound (`META_ADS.md` §12).

| Month | Ad spend | Leads | Demos | New cust. | Churned | Active | MRR | Collected | Cumulative | COGS | GM % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 · Sep 14-30 2026 | $0 | 0 | — | 2 | 0 | 2.0 | $210 | $458 | $458 | $120 | n/a |
| 1 · Oct 2026 | $750 | 16.7 | 4.2 | 3.2 | 0.1 | 3.9 | $406 | $631 | $1,089 | $147 | 63.7 |
| 2 · Nov 2026 | $629 | 14.0 | 3.5 | 4.0 | 0.2 | 7.4 | $780 | $1,205 | $2,294 | $200 | 74.3 |
| 3 · Dec 2026 | $723 | 16.1 | 4.0 | 5.3 | 0.4 | 12.0 | $1,253 | $1,779 | $4,073 | $267 | 78.7 |
| 4 · Jan 2027 | $1,067 | 23.7 | 5.9 | 6.0 | 0.6 | 17.0 | $1,785 | $2,357 | $6,430 | $342 | 80.8 |
| 5 · Feb 2027 | $1,414 | 31.4 | 7.9 | 6.7 | 0.9 | 22.6 | $2,360 | $2,957 | $9,387 | $424 | 82.0 |
| 6 · Mar 2027 | $1,774 | 39.4 | 9.9 | 7.4 | 1.2 | 28.5 | $2,980 | $3,596 | $12,983 | $512 | 82.8 |
| 7 · Apr 2027 | $2,158 | 47.9 | 12.0 | 8.2 | 1.5 | 34.9 | $3,645 | $4,279 | $17,262 | $606 | 83.4 |
| **8 · May 2027** | $2,500 | 55.6 | 13.9 | 8.9 | 1.8 | 41.7 | $4,355 | $4,998 | **$22,260** | $707 | 83.8 |

## 5. Upside

CPL $22, lead→customer 14%, outbound 2/4/6/8/8/8/8/8/8, annual 30%, DFY 40%, churn 3.5%, refunds 3%. Crosses **$20,000 in the first days of January 2027 (month 4)** — December ends at $19,629, so only $371 of January's $13,499 is needed (~Jan 1-2).

| Month | Ad spend | Leads | Demos | New cust. | Churned | Active | MRR | Collected | Cumulative | COGS | GM % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 · Sep 14-30 2026 | $0 | 0 | — | 2 | 0 | 2.0 | $203 | $849 | $849 | $120 | n/a |
| 1 · Oct 2026 | $750 | 34.1 | 8.5 | 8.8 | 0.0 | 7.1 | $725 | $2,346 | $3,195 | $196 | 73.0 |
| 2 · Nov 2026 | $1,658 | 75.3 | 18.8 | 16.5 | 0.2 | 20.0 | $2,034 | $6,059 | $9,254 | $386 | 81.0 |
| 3 · Dec 2026 | $2,500 | 113.6 | 28.4 | 24.5 | 0.5 | 40.6 | $4,122 | $10,376 | $19,629 | $691 | 83.2 |
| **4 · Jan 2027** | $2,500 | 113.6 | 28.4 | 25.1 | 1.0 | 64.5 | $6,551 | $13,499 | **$33,128** | $1,045 | 84.0 |
| 5 · Feb 2027 | $2,500 | 113.6 | 28.4 | 25.8 | 1.6 | 88.6 | $8,989 | $15,492 | $48,620 | $1,401 | 84.4 |
| 6 · Mar 2027 | $2,500 | 113.6 | 28.4 | 26.6 | 2.1 | 112.8 | $11,439 | $17,489 | $66,109 | $1,760 | 84.6 |
| 7 · Apr 2027 | $2,500 | 113.6 | 28.4 | 27.3 | 2.7 | 137.2 | $13,902 | $19,481 | $85,590 | $2,120 | 84.7 |
| 8 · May 2027 | $2,500 | 113.6 | 28.4 | 28.0 | 3.3 | 161.7 | $16,378 | $21,468 | $107,057 | $2,483 | 84.8 |

## 6. Ads-only counterfactual

Two versions, because the script and the spec differ:

**(a) As emitted by `model.py` (`ads_only_no_reinvest`, key `ads_only` in `model_out.json`).** The run passes `cap=0`, which clamps ad spend to $0 in every month, and zero outbound; it therefore shows "the two September customers and nothing else", not "$1,000 of ads". Reproduced as-is:

| Month | Ad spend | Leads | Demos | New cust. | Churned | Active | MRR | Collected | Cumulative | COGS | GM % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 · Sep 14-30 2026 | $0 | 0 | — | 2 | 0 | 2.0 | $214 | $203 | $203 | $120 | n/a |
| 1 · Oct 2026 | $0 | 0.0 | 0.0 | 0.0 | 0.1 | 1.9 | $204 | $204 | $408 | $118 | 42.1 |
| 2 · Nov 2026 | $0 | 0.0 | 0.0 | 0.0 | 0.1 | 1.8 | $195 | $195 | $603 | $117 | 40.1 |
| 3 · Dec 2026 | $0 | 0.0 | 0.0 | 0.1 | 0.1 | 1.8 | $190 | $190 | $793 | $116 | 38.9 |
| 4 · Jan 2027 | $0 | 0.0 | 0.0 | 0.1 | 0.1 | 1.8 | $188 | $187 | $981 | $116 | 38.2 |
| 5 · Feb 2027 | $0 | 0.0 | 0.0 | 0.1 | 0.1 | 1.7 | $185 | $185 | $1,165 | $116 | 37.5 |
| 6 · Mar 2027 | $0 | 0.0 | 0.0 | 0.1 | 0.1 | 1.7 | $182 | $182 | $1,347 | $115 | 36.8 |
| 7 · Apr 2027 | $0 | 0.0 | 0.0 | 0.1 | 0.1 | 1.7 | $179 | $179 | $1,526 | $115 | 36.0 |
| 8 · May 2027 | $0 | 0.0 | 0.0 | 0.1 | 0.1 | 1.7 | $177 | $176 | $1,703 | $114 | 35.3 |

**(b) The spec's counterfactual (§8.1): $1,000 of ads at $30 CPL and 10% lead→customer, no reinvestment, no outbound.** Running `run("ads_only_true", 30, 0.10, [0]*8, 0.0, 0.0, 0.045, 0.05, 0.0, 750)` gives $750 → 25 leads → 2.5 customers in Oct, $250 → 8.3 leads → 0.8 in Nov, ≈ 3.3 ad customers total, MRR ≈ $340-530 (with the 2 September customers), cumulative collected **$1,558 by Dec, $2,600 by Feb, $4,105 by May 2027** — never crossing. The spec's "≈ $2.3k collected over 6 months" is the same order of magnitude. Either way: the $1,000 alone cannot reach $20k; the plan reaches it on reinvested revenue plus ~30 founder hours/week of outbound, and it says so.

Fix for (a) is a one-line change in `model.py` (`cap=750` for the ads-only run) — see `docs/model/README.md`; the file is not owned by this doc.

## 7. Crossing month summary

| Case | Crossing month | Approx. day | Cumulative at crossing | Active customers | MRR |
|---|---|---|---|---|---|
| Base | **Feb 2027 (month 5)** | ~Feb 17-18 | $23,341 (month end) | 50.7 | $5,236 |
| Downside | **May 2027 (month 8)** | ~May 17 | $22,260 | 41.7 | $4,355 |
| Upside | **Jan 2027 (month 4)** | ~Jan 1-2 | $33,128 | 64.5 | $6,551 |
| Ads only ($1,000, no reinvest, no outbound) | not within horizon | — | ~$4.1k by May 2027 | ~5 | ~$0.5k |

## 8. Unit economics

| Metric | Value | Derivation |
|---|---|---|
| ARPU (monthly plans, blended) | **$107** | 0.6 × $79 + 0.4 × $149 `[U]` mix |
| Annual ARPU normalized | $89.17/mo | $1,070 / 12 |
| Variable COGS / customer / month | **$14.80** | table below |
| Variable gross margin | **86.2%** | ($107 − $14.80) / $107 |
| Fixed tools | $90/mo | §2 |
| Fully loaded GM | 69% (M1, 5.3 cust) → 79% (M2, 12.4) → 82% (M3, 22.3) → 84% (M6) | model column; crosses 80% between months 2 and 3 (~15 active on the model's MRR basis; spec cites ~22 = the month-3 headcount) |
| Paid CPL | $30 | `[V]` |
| Lead → customer | 10% | 25% × 40% |
| **Paid CAC** | **$300** | $30 / 0.10; founder time $0 |
| Blended CAC (base, Oct-Feb) | ≈ $8,400 ads / 58 new customers ≈ **$145** | includes outbound + referral customers at $0 cash CAC |
| CAC payback (gross-margin basis) | **3.3 months** | $300 / ($107 × 0.862 = $92.2) |
| CAC payback (revenue basis) | 2.8 months | $300 / $107 |
| Pay-now annual: cash payback | immediate | $1,070 collected day 0 vs $300 CAC |
| LTV (gross margin, monthly cohort, 4.5% churn) | **≈ $2,045** | $107 × 0.86 / 0.045 (22.2-month expected life) |
| LTV / CAC | **≈ 6.8** | $2,045 / $300 |
| LTV at downside churn 6% | $1,534 → LTV/CAC 5.1 at $300 CAC, 2.4 at $643 CAC ($45 / 7%) | sensitivity |
| Contribution per customer-month after CAC amortized over 12 months | $92.2 − $25 = $67 | — |

COGS per customer per month ($14.80 at 60 conversations/month):

| Item | Calc | $ |
|---|---|---|
| Twilio toll-free number | $2.15/mo `[V]` | 2.15 |
| SMS outbound 300 segments | $0.0083 + ~$0.004 carrier `[V]` | 3.69 |
| SMS inbound 180 segments | $0.0083 `[V]` | 1.49 |
| Voice inbound ~20 min + recording + Deepgram | $0.0085/min + $0.0025/min + $0.0043/min `[V2]` | 0.30 |
| Claude (Sonnet/Haiku, cached) | ~240 turns | 0.90 |
| Stripe fees on $107 | 2.9% + $0.30 + 0.7% | 4.15 |
| Resend, Zapier, misc allocated | | 2.12 |
| **Total variable** | | **14.80** |

Claude budget detail (spec §4): ~240 turns × (2k cached input + 300 uncached + 120 output) on `claude-sonnet-5` ($2 / $10 per MTok, cache reads ~10%) ≈ $0.90; Haiku fallback ≈ $0.40; Opus 5 ($5 / $25) ≈ $2.25, still inside 80% margin.

## 9. What would have to be true for a month-3 (December 2026) crossing

Base ends December at $8,931 — less than half. Upside ends December at **$19,629**, $371 short. Running the model with single changes on top of the upside inputs (`docs/model/README.md` shows how):

| Scenario | Dec cumulative | Crosses |
|---|---|---|
| Upside as specified | $19,629 | Jan 2027 |
| Upside + annual take 35% (from 30%) | $21,709 | **Dec 2026** |
| Upside + one more outbound close per month (5/7/9 for Oct-Dec) | $21,490 | **Dec 2026** |
| Upside + CPL $20 (from $22) | $20,913 | **Dec 2026** |
| Upside + lead→customer 16% (from 14%) | $21,475 | **Dec 2026** |
| Base + annual take 40% | $13,818 | Jan 2027 |
| Base + outbound 8/10/12 (Oct-Dec) | $15,738 | Jan 2027 |

So a December crossing requires **all** of the upside conditions simultaneously — CPL ≤ $22, lead→customer ≥ 14% (i.e. lead→demo ~30% and demo→close ~47%), outbound at 4/6/8 closes/month, annual take ≥ 30%, DFY attach 40%, churn ≤ 3.5%, refunds ≤ 3% — **plus one more**: ~35% annual take, or one extra outbound close per month, or CPL $20. No single lever moves the base case there. The realistic path to pull the base case forward by a month is the annual take rate (pay-now annual on the demo, `SALES.md` §7), because it moves cash, not customers.

## 10. Month-end review procedure (1st of each month, 45 min)

1. [ ] Export Stripe balance transactions for the month; sum successful charges net of refunds → **Collected**. Compare with the model row.
2. [ ] Ads Manager: spend, leads, CPL. `/admin`: leads called ≤ 5 min, demos held, closes → lead→demo, demo→customer.
3. [ ] Stripe: new subscriptions, canceled (monthly), annual count → churn, annual take, DFY attach.
4. [ ] Twilio + Anthropic + Deepgram invoices ÷ active customers → variable COGS vs $14.80.
5. [ ] Re-run `python3 docs/model/model.py` with actuals substituted for months elapsed (edit the `outbound` list and CPL/lead→customer) and record the new crossing month in `LAUNCH_PLAN_90_DAYS.md`'s review notes.
6. [ ] Declare track: base / downside / upside per the triggers (`META_ADS.md` §12). Set next month's ad budget = 60% (or 40% on downside) of this month's collected, cap $2,500.
