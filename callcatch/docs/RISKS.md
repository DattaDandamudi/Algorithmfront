# Risk register

Source: `PRODUCT_SPEC.md` §11. Owner is always the founder (solo) unless the mitigation is a code change (then engineer/integrator on the founder's request). **Trigger** = the observable condition that moves the risk from "monitored" to "acting". Review monthly at the 1st-of-month review; update likelihood with actuals.

Scales: Likelihood Low / Med / High. Impact Low / Med / High (on reaching $20k collected by Feb 2027).

| # | Risk | Likelihood | Impact | Mitigation | Owner | Trigger (act when…) | Playbook |
|---|---|---|---|---|---|---|---|
| 1 | Toll-free verification takes > 10 business days or rejects, leaving customers without SMS and stalling billing (trial clock / anchor waits on `verified`) | Med | High | Complete TFV data collected at signup with pre-written samples; day-0 value without SMS (greeting, voicemail transcript, owner alerts, email replies); 10DLC sole-prop / low-volume fallback; escalate to Twilio support at day 5; track median days in `/admin` | F (E for default switch) | Any TFV pending > 5 business days → escalate. Median > 8 days after 10 submissions → switch onboarding default to local numbers + 10DLC standard brand | `RUNBOOK.md` §1-2, `COMPLIANCE.md` §5-6 |
| 2 | Meta CPL for trade owners lands at $45+ and lead→customer < 7% (downside case) | Med | Med | Kill/scale rules; retargeting + demo-line ad; 2-week decision windows; declare downside at month-2 review → 40% reinvestment, +10 founder hours/week outbound; $20k still crosses May 2027 | F | Month-2 review (Dec 1): trailing CPL > $45 or lead→customer < 7% | `META_ADS.md` §12, `FINANCIAL_MODEL.md` §4 |
| 3 | Founder cannot hold the 5-minute callback SLA and 250 dials/week alongside onboarding and support | High | High | Cal.com self-booking on the thank-you page; Loom onboarding replaces most screen-shares by week 6; DFY setup batched twice a week; SDR hire at $6k MRR | F | Two consecutive weeks with < 80% of ad leads called within 5 min, or dials < 150/week | `SALES.md` §3, §10 |
| 4 | AI quotes a price, promises an ETA, or mishandles an emergency | Med | High | Never-say list in the cached system prompt; hard-coded emergency template + voice call to owner/on-call; max 8 turns; owner takeover pauses AI; ToS states AI-assisted messaging; 20 golden test conversations per trade; weekly emergency audit | F + E | Any audited thread with a price/ETA/safety improvisation, or an emergency with no owner call placed | `RUNBOOK.md` §5, `COMPLIANCE.md` §3 |
| 5 | TCPA / carrier complaints | Low-Med | High | Only reply to inbound-initiated contacts; STOP honored instantly; quiet hours 8am-9pm; consent evidence per contact; complaint rate per number monitored; counsel review by week 10 `[U]` | F | Any complaint without consent evidence; Twilio complaint-rate warning; error 30007 clustering on one number | `RUNBOOK.md` §3-4, `COMPLIANCE.md` §1, §9 |
| 6 | Meta App Review delayed or rejected → Pro Meta-lead feature stays on the Zapier bridge | High | Low-Med | Zapier bridge is the marketed day-1 path ("minutes, not seconds"); resubmit with fixes; web-form leads unaffected | F | Review > 25 days without decision, or rejection notice | `COMPLIANCE.md` §8 |
| 7 | Ad account restriction or ban | Low-Med | Med | Backup ad account + Page; no income claims; domain verified; outbound engine independent of Meta; warm-up rules | F | Account Quality shows "restricted"/"disabled" | `RUNBOOK.md` §10, `META_ADS.md` §10-11 |
| 8 | Churn above 4.5% because owners forget it is running | Med | Med | Weekly report + first-booked milestone; pause instead of cancel; annual push; referral loop; founder cancel-call within 24 h | F | Monthly logo churn > 6% for 2 months, or > 30% of cancels cite "didn't notice it" | `RUNBOOK.md` §8-9 |
| 9 | Late-September launch hits HVAC shoulder season | Med | Low-Med | Sun Belt first (AC through Oct, heating tune-ups from Oct); plumbing/electrical year-round; winter "no heat" creative (#6) from week 6 | F | HVAC share of leads < 40% in Oct while CPL rises → shift ad sets to plumbing/electrical creative | `META_ADS.md` §5 #6, `SALES.md` §1 |
| 10 | Incumbents (Podium, GoHighLevel agencies) copy the wedge and outspend | Low (in window) | Med | Win on setup friction, price, trade-specific qualification; referral loop; CAPI pass-back to the customer's Ads Manager (Pro) as a retention hook | F | Competitor ad in the Ad Library targeting "missed call text-back" for trades at < $99 | — |
| 11 | Stripe rolling reserve or payout delay on a new account taking annual prepays | Low-Med | Med | Full verification day 0; itemized invoices; refund policy published; founder $500 buffer; monthly plans dominate cash anyway | F | Stripe notice of reserve, or payout > 10 days late | `COMPANY_FORMATION.md` §5 |
| 12 | Claude pricing/model drift vs the numbers in proposals | Low | Low | Model ids and prices read from the `claude-api` skill at build time; env-var driven (`CLAUDE_MODEL_CHAT` / `CLAUDE_MODEL_FAST`); Haiku fallback halves cost; refusal → safe template | F + E | Anthropic invoice / active customers > $1.50/customer/month for a month | `RUNBOOK.md` §11 |
| 13 | Name/trademark collision ("CallCatch") | Med | Low | TESS + domain check day 0; two fallbacks (MissedCallBack, TextBackHQ); brand not load-bearing | F | Cease-and-desist or TESS live mark in class 42 found on Day 0 | `COMPANY_FORMATION.md` §2 |
| 14 | Vendor outage (Supabase, Anthropic, Twilio, Vercel) drops calls or texts | Low-Med | Med | Twilio fallback TwiML for voice; safe-template mode for AI; idempotent crons re-runnable; uptime ping on `/api/health`; daily backups | F + I | `/api/health` failing > 15 min | `RUNBOOK.md` §11-12 |
| 15 | Secret leak (auth token, service-role key) | Low | High | All secrets server-side; signature verification on every webhook; rotation procedure; no secrets in logs | F + I | Any secret in a commit, log, screenshot, or shared Loom | `RUNBOOK.md` §13 |

## Watch list (not yet risks)

- FinCEN BOI rule changes for domestic LLCs `[U]` — check on formation day.
- State mini-TCPA laws (FL, OK, WA) as the customer base grows outside the initial Sun Belt set — counsel at week 10.
- Sales-tax nexus for SaaS — not reached in the window; revisit at $50k with the CPA `[U]`.
- Twilio toll-free price changes or new verification requirements — read Twilio's changelog monthly.

## Review log

```
2026-10-01 — reviewed by F — changes: ____
2026-11-01 — …
```
