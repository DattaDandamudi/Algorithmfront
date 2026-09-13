# Meta ads plan

Source: `PRODUCT_SPEC.md` §6. Budget $1,000 seed, ads on **Oct 1, 2026**, account created Sep 14. Weeks 1-4 are a creative test at ≤ $30/day, not a scaled channel: event volume stays far below Meta's ~50 events/ad set/week learning threshold, so expect ±40% week-to-week noise and decide on 2-week windows.

Copy rules (all concepts): no income guarantees, no second-person "you're missing calls" phrasing that reads as a personal attribute (Meta policy), no competitor logos, no before/after health-style claims. "Podium" may be named in text (#4) but not shown as a logo.

---

## 1. Account setup (Day 0-2)

- [ ] Business Portfolio under CallCatch LLC → Page "CallCatch" + backup Page → ad account + backup ad account → payment = Mercury virtual card (ads only) → domain `callcatch.co` verified → Pixel "CallCatch web" → CAPI token → Business Verification started (`DEPLOYMENT.md` §5).
- [ ] Ad account settings: currency USD, timezone America/Chicago, 2-factor on every admin, second admin login.
- [ ] Instant Form "CallCatch demo request" (Leads → Forms Library): type **Higher intent** (adds a review screen). Intro: "Get a 12-minute demo on your own phone line." Questions: full name, phone, email (prefill), **Trade** (multiple choice: HVAC / Plumbing / Electrical / Other), **Number of techs** (1 / 2-5 / 6-15 / 16+), **How many calls do you miss a week?** (short answer). Privacy policy `https://callcatch.co/privacy`. Custom disclaimer (required): "By submitting you agree CallCatch may call or text you about your request." Thank-you screen: "We'll call within 5 minutes during business hours." + button "Book a time" → Cal.com link. Also enable **Instant Form CRM integration → Zapier** (our own lead flow into `/admin`).
- [ ] Custom conversions: none needed; standard events only (§2).
- [ ] Audience exclusions: upload the Stripe customer list weekly (Audiences → Customer list, hashed by Meta on upload).

## 2. Pixel / CAPI events map

Every server event carries an `event_id` (uuid) that the browser Pixel also fires so Meta deduplicates (`lib/meta/capi.ts`, `components/marketing/MetaPixel.tsx`). PII (email, phone) is SHA-256 hashed server-side; `fbc`/`fbp`, client IP and user agent are captured at signup from the attribution cookie.

| Event | Fires when | Browser Pixel | Server CAPI (route) | Value |
|---|---|---|---|---|
| `PageView` | any marketing page | yes | no | — |
| `ViewContent` | `/pricing`, `/demo`, `/for/[trade]` | yes | no | — |
| `Lead` | Instant Form submit (Meta-native, no pixel needed); landing form submit; **demo-line caller** | landing form: yes | landing form: `/api/leads/*`; demo caller: `/api/demo/call` | — |
| `Schedule` | demo booked (Cal.com webhook or admin "Demo booked" button) | no | admin action | — |
| `CompleteRegistration` | Supabase signup completes | yes | signup Server Function | — |
| `StartTrial` | checkout with trial completes, or number `verified` for pay-now | checkout success page: yes | `/api/stripe/webhook`, `onVerified` | — |
| `Purchase` | `invoice.paid` (first payment) | no | `/api/stripe/webhook` | first payment amount, USD |
| `Subscribe` | `invoice.paid` (subscription) | no | `/api/stripe/webhook` | plan MRR, USD |

Verification: Events Manager → Test events with `META_CAPI_TEST_EVENT_CODE` set on Preview, then remove it. Target Event Match Quality ≥ 6 for `Lead`/`Purchase` (email + phone + fbc + fbp + IP + UA).

## 3. Campaign structure (ABO, no CBO until month 2)

**Campaign 1 — `CC-Leads`** · objective Leads · conversion location Instant Forms · optimize for Leads · attribution 7-day click / 1-day view · ABO.

| Ad set | Audience | Budget | Start |
|---|---|---|---|
| A `Trade interests` | US, 25-60, interests: HVAC, Plumbing, Electrician, Jobber, Housecall Pro, ServiceTitan, NATE, Small business owners. Advantage+ audience expansion **off** weeks 1-2, **on** from week 3. | $10/day | Oct 1 |
| B `Advantage+ broad` | US, 25-60, no interests; creative does the targeting. | $10/day | Oct 1 |
| A2 `Sun Belt` (duplicate of A) | TX, FL, AZ, GA, NC only | $10/day (moved from A or B) | Week 3, only if A's CPL < B's |
| C `Retargeting` | 50% video viewers 30d + Page/IG engagers 30d + site visitors 30d + demo-line callers (CAPI custom audience `Lead` from `/api/demo/call`), **excluding customers**. Frequency cap 2 / 7 days. | $5/day | Week 3 |

Ads in A and B (week 1): #1, #3, #4, #6, #7 — same five in both. Ad naming: `CC-<concept#>-<format>-<v1>`; ad set naming as above; campaign naming `CC-Leads-2026-10`.

**Campaign 2 — `CC-Demo`** · objective Traffic (landing page views) → `/demo` with the demo number · $5/day test in **week 2 only once the demo number is verified** · scale only if cost per `Lead` (demo call, CAPI) beats Campaign 1's CPL. Ad #2 only.

**Placements (all ad sets):** Advantage+ placements, then **remove** Audience Network, Messenger, Right Column. Deliver 9:16 for Reels/Stories and 4:5 for Feed (upload both; placement customization).

**Month 2+:** duplicate the winning ad set into a Lookalike 1-3% of `Lead` + `Purchase` once 100+ events exist; switch to CBO with 2 ad sets when spend > $60/day.

## 4. Audiences (summary)

1. Interest stack (HVAC, Plumbing, Electrician, Jobber, Housecall Pro, ServiceTitan, NATE, Small business owners), US, 25-60.
2. Advantage+ broad, US, 25-60.
3. Sun Belt geo duplicate of 1 (TX, FL, AZ, GA, NC).
4. Retargeting: video 50% 30d, engagers 30d, site 30d, demo callers (CAPI), minus customers.
5. Lookalike 1-3% of Lead / Purchase (month 2+, needs 100+ source events).
6. Exclusion: Stripe customers uploaded weekly.
7. Not targetable in Ads Manager but used for outbound: contractors running "Call now" ads in the Ad Library (`SALES.md` §2).

## 5. The 12 ad concepts

Each concept: **Primary text** = hook (≤ 125 characters, shown before "…See more") + body; **Headline** (≤ 40 chars); **Description** (Feed only, ≤ 30 chars); **CTA** button; **Format**; **Creative brief** = a 15-30 s vertical Reel you can film with a phone in one session (a real van, a real phone, a kitchen, a crawlspace — no actors needed beyond the founder and one friend). Landing page per concept in §6.

Always on screen for video: captions burned in (85% watch muted), the first frame is the hook text, the CallCatch phone mock with the text thread appears by second 4-6, end card "callcatch.co · $79/mo · keep your number".

### #1 — Under the house
- **Hook:** You were under a house. Your phone rang twice. That $4,800 changeout just booked with the guy who answered.
- **Body:** CallCatch texts every missed call back in 10 seconds, asks what's wrong and where, and hands you a ready-to-book lead. No new number. 10-minute setup. Alerts and voicemail transcripts from day one; texting turns on when carriers verify your number.
- **Headline:** Every missed call texts back in 10 seconds
- **Description:** Keep your number. $79/mo.
- **CTA:** Get a demo (Instant Form)
- **Format:** 20 s UGC vertical, phone POV, 9:16 + 4:5 crop
- **Brief / shot list:** (0-3 s) POV from a crawlspace or under a sink, flashlight on, phone buzzing on the floor just out of reach — hook text on screen. (3-7 s) Phone screen: "Missed call (512) 555-0134" then the CallCatch alert appears: "Missed call — 'AC not cooling, 78704, wants today' — Call now". (7-14 s) Cut to the homeowner's phone (second phone, kitchen counter): the text-back thread, three bubbles typed in real time. (14-18 s) Owner climbs out, taps "Call now", phone to ear, nods. (18-20 s) End card. Audio: ambient + phone buzz; VO optional: "You can't answer every call. It can."

### #2 — Call this number
- **Hook:** Call this number right now. Don't answer when we call back. Watch your phone.
- **Body:** (large demo number) This is what your customers get when you can't pick up. Texts back in 10 seconds, asks what's wrong and where, sends you the lead. $79/mo. No new number.
- **Headline:** (8xx) xxx-xxxx — try it now
- **Description:** Live demo line. No signup.
- **CTA:** Call now (static, click-to-call) / Learn more → `/demo` (video)
- **Format:** Static 4:5 + 10 s video 9:16. **Launches only when the demo number is verified** (week 2 test in CC-Demo).
- **Brief / shot list:** Static: white card, navy headline, the number in 96-pt orange, a small phone mock with the first demo text. Video: (0-2 s) hook text; (2-6 s) finger dials the number on screen, ring, hang up; (6-10 s) text arrives: "Hi — this is CallCatch. You just called our demo line…". No people needed.

### #3 — The math
- **Hook:** Miss 10 calls a week × $450 average ticket = $18,000 a month walking to the next plumber.
- **Body:** Studies put contractor missed-call rates between 27% and 62% (Invoca 2024, ServiceTitan 2024). Do the math on your own number: calls missed × your close rate × your ticket. CallCatch texts every missed call back in 10 seconds and sends you the lead. $79/mo, keep your number, 30-day money-back.
- **Headline:** What a missed call actually costs
- **Description:** Run the math on your line.
- **CTA:** See my number (Instant Form) / Learn more → `/#roi`
- **Format:** Carousel 1:1, 4 cards
- **Brief:** Card 1 "10 × $450 × 4 = $18,000" big type on navy. Card 2 "27-62% of contractor calls go unanswered" stat card with sources in small type. Card 3 screenshot of the demo thread (labeled "demo"). Card 4 pricing card "$79/mo · $149/mo Pro · 30-day money-back". No video needed; build in Figma/Canva at 1080×1080.

### #4 — Podium wanted $399
- **Hook:** Podium wanted $399 a month and a sales call. This is $79 and a call-forwarding code.
- **Body:** Same missed-call text-back. Same AI qualification. No suite, no contract, no seats, no onboarding call unless you want one. Forward your missed calls, keep your number, done in 10 minutes.
- **Headline:** Missed-call text-back for $79, not $399
- **Description:** No contract. Cancel any time.
- **CTA:** Compare → `/pricing`
- **Format:** 25 s founder talking head, captioned, 9:16
- **Brief / shot list:** Founder in front of a service van or a plain wall, phone held up. (0-3 s) hook spoken and on screen. (3-12 s) "Here's what it does" — phone screen insert: missed call → text → lead card. (12-20 s) "Here's what it costs" — pricing card overlay. (20-25 s) "Forward your missed calls, keep your number. That's the whole setup." End card. One take, natural light, lav mic or phone mic close.

### #5 — Facebook leads on a roof
- **Hook:** Your Facebook leads answered in under a minute. Even when you're on a roof.
- **Body:** Pro tier: web-form and Meta leads get a text in minutes, get qualified (issue, address, urgency), and land on your calendar link. Missed calls too. $149/mo.
- **Headline:** Leads texted back before you climb down
- **Description:** Pro · web + Meta leads.
- **CTA:** Start Pro → `/signup?plan=pro&interval=month&path=trial`
- **Format:** 15 s screen recording, 9:16
- **Brief:** (0-2 s) hook. (2-6 s) screen: an Instant Form submitted on a phone. (6-11 s) screen: CallCatch inbox shows the lead + outbound text within seconds (use the seeded account and the Meta Lead Ads testing tool). (11-15 s) the booking link opens on the homeowner's phone; end card. Optional live-action cover: phone on a roof ledge, ladder in frame.

### #6 — 6:40pm, no heat
- **Hook:** It's 6:40pm. No heat. She called three companies. The one that texted back got the job.
- **Body:** Fall and winter no-heat calls come after hours. CallCatch texts back in 10 seconds, asks what's wrong and where, and — on Pro — rings your on-call tech for emergencies. Get set up before the cold.
- **Headline:** Be the one that texts back
- **Description:** After-hours + emergency routing.
- **CTA:** Get set up before the cold (Instant Form)
- **Format:** 15 s vertical, dark kitchen, phone glow
- **Brief / shot list:** (0-3 s) dark kitchen, only the phone lights the face of a friend in a hoodie, hook on screen. (3-8 s) her phone: three outgoing calls, three "no answer". (8-12 s) a text arrives from "Summit Air": "Hi, this is the automated assistant for Summit Air — sorry we missed your call. What's going on, and what's the address?" She types "no heat, 2 kids". (12-15 s) cut to the tech's phone ringing with "CallCatch emergency"; end card. Shoot at dusk with lights off; phone brightness max.

### #7 — Forward your missed calls
- **Hook:** Forward your missed calls. Keep your number. That's the whole setup.
- **Body:** Verizon *71. AT&T *61*. T-Mobile **61*. We handle the rest: greeting, text-back, qualification, owner alert, weekly report. 10 minutes. $79/mo.
- **Headline:** Set up in 10 minutes
- **Description:** No new number. No app for callers.
- **CTA:** Set up in 10 minutes → `/signup?plan=starter&interval=month&path=trial`
- **Format:** Static 4:5 and 9:16, plain text on white; screenshot of the forwarding screen
- **Brief:** Plain white card, navy monospace-style text listing the three carrier codes, a phone-screen screenshot of the onboarding "Test my forwarding — green" state. Second variant: 6 s video of a thumb dialing `*71` then the green check.

### #8 — 9 seconds later
- **Hook:** Here's the text a homeowner got 9 seconds after the owner missed the call.
- **Body:** (Real anonymized thread, with the customer's written permission, once one exists; until then the seeded demo thread, labeled "demo".) That's the whole product: missed call → text → qualified lead → you call back. $79/mo.
- **Headline:** Missed call → qualified lead, in one screen
- **Description:** Try it on your line.
- **CTA:** Try it on your line → `/demo`
- **Format:** Screenshot ad, 4:5
- **Brief:** iPhone-style thread screenshot, names and numbers redacted, timestamp visible ("2:14 PM missed call" / "2:14 PM text"). Small "demo" label until a real thread with permission replaces it (week 9). Add a 1-line caption under the screenshot: "Replace with your business name."

### #9 — The office closes at 5
- **Hook:** The office closes at 5. Your phone doesn't.
- **Body:** After-hours callers get a text back, get qualified, and wait for you — no 9pm texts thanks to quiet hours. You see everything Monday morning in one inbox.
- **Headline:** After-hours calls, handled
- **Description:** Quiet hours built in.
- **CTA:** Get a demo (Instant Form)
- **Format:** 12 s Reel, timelapse of night sky over a service van
- **Brief / shot list:** (0-2 s) hook. (2-9 s) phone-timelapse (Hyperlapse / native timelapse, 8 min → 7 s) of dusk-to-night over a parked van, phone screen inserts show 3 incoming texts stacking up in the inbox with timestamps 6:12, 7:40, 9:05. (9-12 s) sunrise, owner opens the inbox on his phone with coffee; end card.

### #10 — What your voicemail costs
- **Hook:** What your voicemail costs you: 80% of callers won't leave one. They'll text, though.
- **Body:** (`[U]` stat — replace the 80% with the customer's own voicemail rate from their call log during the demo before scaling this ad.) A text-back gets a reply where a voicemail box gets a hang-up. See the difference on your own line.
- **Headline:** Voicemail vs. text-back
- **Description:** See the difference.
- **CTA:** See the difference → `/demo`
- **Format:** Static two-frame comparison, 4:5
- **Brief:** Left frame: "Voicemail — 0 new messages" grey. Right frame: the CallCatch thread with a reply. Because the 80% figure is `[U]`, run this only in week 3+ with the founder's own logged voicemail rate substituted (e.g. "Only 3 of 14 callers left a voicemail last week").

### #11 — Weekly report
- **Hook:** Weekly report: 14 missed calls, 11 texted back, 6 booked, $3,900 recovered.
- **Body:** The Monday email that tells you what CallCatch made you. Missed, texted back, replied, booked, and estimated revenue at your ticket size. Numbers shown are from the demo account.
- **Headline:** Know what your missed calls were worth
- **Description:** Every Monday, 7am.
- **CTA:** Get my report (Instant Form)
- **Format:** Screenshot of the report email, 4:5
- **Brief:** Screenshot of the real weekly email from the seeded account (`renderWeeklyEmail`), phone frame, subtle drop shadow, "demo account" label. Numbers must match the seed (edit the seed if needed so the screenshot and hook agree).

### #12 — Your competitor is texting (retargeting only)
- **Hook:** Plumbers: your competitor is already texting your missed callers.
- **Body:** 14-day trial, card required, cancel any time. 30-day money-back on annual. Keep your number; forward your missed calls; done in 10 minutes.
- **Headline:** Start the 14-day trial
- **Description:** Card required. Cancel any time.
- **CTA:** Start trial → `/signup?plan=starter&interval=month&path=trial`
- **Format:** Static 4:5, **retargeting set C only**
- **Brief:** Navy card, orange headline, a single phone mock with the first text-back bubble. Variants for HVAC/Electricians by swapping the first word. Frequency cap 2 / 7 days.

## 6. Landing page mapping

| Concept | Destination | UTM `utm_content` |
|---|---|---|
| #1, #6, #9, #11 | Instant Form (in-app) → thank-you with Cal.com; Zapier → `/admin` lead log | `c01` … |
| #2, #8, #10 | `/demo` (demo number + animated thread; CAPI `Lead` on call) | `c02`, `c08`, `c10` |
| #3 | `/#roi` (ROI calculator section) | `c03` |
| #4 | `/pricing` | `c04` |
| #5 | `/signup?plan=pro&interval=month&path=trial` | `c05` |
| #7, #12 | `/signup?plan=starter&interval=month&path=trial` | `c07`, `c12` |
| Trade-specific variants | `/for/hvac`, `/for/plumbing`, `/for/electrical` | `c##-hvac` |

URL parameters on every link: `utm_source=meta&utm_medium=paid&utm_campaign=cc-leads&utm_content=c##&utm_term={{adset.name}}` — captured by `AttributionCapture` into the attribution cookie and written to `events` at signup.

## 7. $1,000 pacing by week

| Week | Dates | Spend | Daily | Goal |
|---|---|---|---|---|
| 1 | Oct 1-7 | $150 | ~$21 | 5 creatives (#1, #3, #4, #6, #7) in ad sets A + B at ~$10/day each; confirm Pixel/CAPI events; ≥ 5 leads; founder 5-minute callback SLA on every lead |
| 2 | Oct 8-14 | $175 | ~$25 | Kill/scale per §8; add #2 in CC-Demo ($5/day) if the demo number is verified; ≥ 6 leads, 2 demos → 1-2 closes |
| 3 | Oct 15-21 | $200 | ~$29 | Retargeting set C at $5/day; Sun Belt duplicate A2 if A's CPL < B's; ≥ 7 leads |
| 4 | Oct 22-31 | $225 | ~$22 (10 days) | Winner + retargeting; month-1 total ≈ 25 leads, ~6 demos, ~2.5 paid from ads |
| 5 | Nov 1-7 | $250 seed remainder + reinvestment | — | From here ad spend = 60% of prior-month collected cash, cap $2,500/mo (Nov ≈ $988 in the base case) |

Weeks 1-4 stay ≤ ~$30/day so a fresh-account daily cap does not throttle delivery.

## 8. Kill / scale rules

- After **$40** on an ad: kill if link CTR < 0.9% or cost per Instant Form open > $3.
- After **$70** on an ad: kill if CPL > $50 or lead-to-answered-call < 40% (founder logs every lead in `/admin`).
- After **7 days** on an ad set: kill if CPL > $45; scale the winner +20%/day while CPL ≤ $35.
- Retargeting frequency cap 2 per 7 days.
- Do not judge on CTR alone; the founder's **"demo booked"** flag in `/admin` is the real signal.
- Decisions on 2-week windows except obvious losers (rule 1).
- Never edit a winning ad in place (resets learning); duplicate and change one thing.

## 9. KPI targets (base case) and sources

| KPI | Base | Source / status |
|---|---|---|
| CPM | $18 | All-industry 2026 median ~$13-14 `[V2]` foundrycro / adriselab; B2B/SMB-owner audiences price above median; `[U]` for this niche |
| CPC (link) | $1.90 | Leads-objective CPC ~$1.92 `[V2]` foundrycro / visiblefactors |
| Instant Form completion | 7.7-8.3% of clicks | WordStream 2025 lead-ads CVR 7.72% `[V]` |
| **CPL** | **$30** | WordStream 2025 all-industry leads CPL $27.66 (+21% YoY) `[V]`; B2B SMB $28-60 `[V2]` admanage |
| Lead → demo held | 25% | `[U]` (5-min callback; judges' range 20-25%) |
| Demo → customer | 40% | Card-required trial → paid 30-48% `[V2]` ChartMogul / FirstPageSage; pay-now close `[U]` |
| **Lead → paying customer** | **10%** | product of the two |
| **Paid CAC** | **$300** | $30 / 0.10 |
| Monthly logo churn | 4.5% | SMB SaaS 3-7% `[V2]` Kalungi / Recurly / Vena |
| Refunds on first payment | 5% | `[U]` |
| Annual take rate | 20% | `[U]` |
| DFY setup attach (monthly) | 30% | `[U]` |
| LTV (gross margin) | $107 × 0.86 / 0.045 ≈ $2,045 | computed; LTV/CAC ≈ 6.8 |

Downside triggers (declare at the month-2 review): CPL > $45 or lead → customer < 7%. Upside markers: CPL ≤ $22, lead → customer ≥ 14%.

## 10. New-account warm-up rules

- Account created Sep 14, payment method added, domain verified, Pixel firing on organic traffic for 2+ weeks before the first ad (pixel "seasoning").
- $0 spend until Oct 1; then ≤ $25-30/day for weeks 1-2 (new accounts are often capped at ~$25-50/day `[U]`).
- Increase any ad set by at most +20%/day; never more than one structural change per day.
- Run 2 ad sets max in week 1; add the third (A2/C) in week 3.
- Keep all ads on the primary Page; the backup Page only publishes organic posts until needed.
- Pay the first Meta invoice threshold promptly (card on file with room; Mercury virtual card limit $1,000, raise to $2,500 in month 3).
- No policy-edge creative in weeks 1-4 (#10's unverified stat waits; #12 waits for retargeting).

## 11. Backup account

Second ad account + second Page under the same Business Portfolio, same Pixel, same virtual card. If the primary is restricted: appeal first (24-48 h), then rebuild the winning campaign in the backup (`RUNBOOK.md` §10). Pacing restarts at week-1 levels. Outbound (`SALES.md`) continues unchanged.

## 12. Reading the results after week 2 (decision tree)

Compute over Oct 1-14 in Ads Manager (columns: amount spent, impressions, CPM, link CTR, link CPC, leads, cost per lead) and in `/admin` (leads called ≤ 5 min, demos booked, demos held, closes).

```
Spend ≥ $300 and ≥ 10 leads?
├─ No  → not enough signal. Keep A + B, no new sets, re-read at day 21. If < 5 leads at $300: check Pixel/CAPI + form (broken?), then kill the two worst ads by CTR and add #9 and #11.
└─ Yes → CPL?
   ├─ ≤ $35  → lead→demo?
   │   ├─ ≥ 25% → BASE/UPSIDE track. Week 3: add C retargeting $5/day, add A2 Sun Belt if A < B on CPL, scale winner +20%/day to $35/day cap. Test #2 in CC-Demo if the number is verified.
   │   └─ < 25% → creative is attracting the wrong people or callback is late. Check 5-min SLA first (fix scheduling); then swap hooks toward #4/#7 (price/setup clarity), add "2-15 techs" to the form's intro text. Hold budget flat.
   ├─ $35-45 → decide on 2-week window. Kill worst 2 ads, keep 3, add #9 + #11. Flat budget. If still > $45 at day 28 → downside track.
   └─ > $45  → demo→customer?
       ├─ ≥ 40% (leads are good, just expensive) → move budget from B (broad) to A (interests) and A2 (Sun Belt); try #3 carousel and #6; hold at $25/day. Re-read at day 28.
       └─ < 40% or lead→customer < 7% → DOWNSIDE. Declare it at the month-2 review: cut reinvestment from 60% → 40% of prior-month cash, move +10 founder hours/week to outbound, keep only retargeting + best ad at $10/day. $20k still crosses in May 2027 (`FINANCIAL_MODEL.md`).
```

Also at week 2: confirm Events Manager shows `Lead` deduplicated (Pixel + CAPI, not double counted), Event Match Quality ≥ 6, and that every lead in Ads Manager has a matching row in `/admin` (Zapier path working). If Ads Manager leads > admin leads, the Zapier zap is off — fix before touching budget.
