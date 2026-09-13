# CallCatch — Product Spec (build-ready)

**Status:** synthesized from 5 proposals + 3 judge reports. Winner by judge totals: CallCatch (82) over QuoteSprint (81), QuoteChaser (78), KeepTelling (78), Leadloop (66). Every red flag the judges raised against CallCatch is fixed in this document (see §12 "Red-flag fixes"); the best mechanics from the other four are grafted in.

**Date:** 2026-09-13. **Founder:** US-based, solo, ~30 hrs/week. **Engineer:** Claude (1-2 build days). **Seed ad budget:** $1,000 on Meta.

**Verification legend:** `[V]` = verified this session against a vendor page or a current (2026) third-party source; `[V2]` = verified via a secondary/blog source only; `[U]` = unverified assumption. Every number that drives the model is tagged.

---

## 1. Product

**Name:** CallCatch (working name; `[U]` USPTO/domain availability — check TESS and buy `callcatch.co`/`.com` or fall back to `MissedCallBack`, `TextBackHQ` on Day 0).

**Tagline:** Every missed call texts back in 10 seconds.

**One-liner:** CallCatch is an AI text-back front desk for HVAC, plumbing and electrical contractors: when the owner can't pick up, the caller gets an on-brand SMS in under 10 seconds, gets qualified (issue, address, urgency, preferred window) and lands as a booking-ready lead on the owner's phone — with no number change, a 10-minute setup, and a weekly "calls recovered / revenue saved" report.

**ICP (buyer = user):** Owner-operator of a US residential HVAC, plumbing or electrical company, 2-15 techs, $500k-$5M revenue, where the owner or spouse still answers the business line from a truck. Already spends on Google LSA / Meta / Angi, uses Jobber / Housecall Pro / ServiceTitan or paper, and knows they miss 20-60 calls a month (industry studies: 27%-62% of contractor calls go unanswered `[V2]` Invoca 2024 / ServiceTitan 2024 via oncrew.ai). Ticket size $350 repair to $8-12k changeout, so one recovered call pays for a year. Sun Belt metros first (TX, FL, AZ, GA, NC): AC season runs through October and heating tune-up season starts in October, so the late-September launch is not dead season; plumbing/electrical are year-round. Secondary ICP (month 3+): garage-door, pest, roofing owners with the same phone-in-truck profile.

**Positioning vs 3 named competitors (prices verified this session):**

| Competitor | Verified price | What they sell | Why CallCatch wins the one-truck owner |
|---|---|---|---|
| Podium | Core $399/mo, Pro $599/mo (annual billing), AI add-on $99/mo, +$5/mo 10DLC, phone seats $30/user; real single-location cost $450-600/mo `[V]` socialpilot/astucia 2026 | Reviews + inbox + webchat + text-to-pay suite, sales-call onboarding | $79-149, self-serve, one job (missed-call recovery) done end-to-end with AI qualification, no contract |
| Textline | Essentials $149/mo (3 agents, 600 credits), Pro $349/mo, $0.03/credit, quote-only now `[V]` businessnewsdaily 2026 | Team SMS inbox; no missed-call trigger, no AI qualification | Automatic trigger from the missed call itself; AI does the first 4 messages, owner takes over |
| CallRail | $50-195/mo annual, +$0.03/text, +$0.06/min, +$3/number `[V]` cloudtalk/nimbata 2026 | Call tracking/attribution for marketers | CallRail tells you that you missed the call; CallCatch recovers it |
| (also) GoHighLevel via agencies | $97-297/mo platform + agency setup `[U]` not re-verified | Agency-configured CRM; missed-call text-back is a workflow you build | Trade-specific out of the box, no agency, 10-minute setup |

**What is NEW here:** the combination of (1) conditional call-forwarding onboarding with no number change, (2) trade-specific AI qualification (not a canned "sorry we missed you"), (3) instant owner alert with one-tap callback, (4) a "revenue recovered" report that makes the value legible weekly, (5) the ad-is-the-demo acquisition loop, at a price point below every incumbent's entry tier.

---

## 2. Pricing & packaging

| | Starter | Pro |
|---|---|---|
| Monthly | **$79** | **$149** |
| Annual (2 months free) | **$790** | **$1,490** |
| Done-for-you setup (optional, monthly plans only) | $149 | $149 (waived on annual) |
| Numbers | 1 toll-free (or 1 local via 10DLC fallback) | 2 numbers |
| Conversations / month | 150, then $0.25 each | 500, then $0.20 each |
| Missed-call text-back + AI qualification | yes | yes |
| Owner alert SMS + email, one-tap "call them now" | yes | yes |
| Shared inbox, human takeover | yes | yes |
| Voicemail transcription + email summary | yes | yes |
| Web-form / email-lead instant SMS reply | — | yes (instant for web forms; Meta Instant Forms within ~5 min via Zapier until App Review passes, then real-time) |
| Booking hand-off (Jobber/HCP/Calendly link or CallCatch scheduling page) | — | yes |
| After-hours emergency routing (call the on-call tech) | — | yes |
| Weekly "calls recovered / est. revenue saved" report | email | email + SMS + PDF |
| Meta Conversions API pass-back of Lead/Schedule events to the customer's own dataset | — | yes (month 2+) |

**Blended ARPU assumption:** 60% Starter / 40% Pro = **$107/mo** `[U]` (set by the upsell on the onboarding call).

**Trial and close mechanics (two paths, both live day 1):**

1. **Demo-closed (founder call) — pay now, 30-day money-back.** Grafted from QuoteChaser. After the 15-minute demo the founder sends a Stripe Checkout link: monthly (+ optional $149 DFY setup) or annual (2 months free, setup waived). Charged immediately. Full refund on request within 30 days, no questions. Why: it pulls cash forward so month-2 ads are funded from month-1 revenue (fixes the judges' "month 2 has zero ad spend" flag) and it removes the verification-gated trial clock from the sale. Because SMS from the customer's own number cannot go live until toll-free verification passes (3-10 business days), the first invoice is **prorated from the verification date** for monthly plans (Stripe `billing_cycle_anchor` set on `verified`; the customer pays a one-time $0 today, card saved, and the first $79/$149 charge fires the day the number verifies). For annual and DFY we charge on the call and the annual term starts on verification.
2. **Self-serve — 14-day free trial, card required.** Stripe Checkout `trial_period_days: 14`, `payment_method_collection: always`. The trial clock is written by our webhook only when Twilio reports the number `verified` (we call `subscriptions.update` to push `trial_end`). Card-required because opt-out trials convert 30-48% vs 8-18% for opt-in `[V2]` FirstPageSage / ChartMogul 2025-26. The customer sees day-0 value (voice greeting, voicemail transcription, owner alerts, web-lead email reply) before the clock even starts.

**Refund policy (published):** 30-day money-back on any first payment; no refunds on renewals; cancel any time in the Customer Portal; "pause up to 2 months" offered in the cancel flow (grafted from KeepTelling/QuoteSprint) for the winter dip.

**Referral:** one free month for both sides when a referred contractor pays (Stripe coupon), surfaced in the weekly report email from month 2.

**Unit economics at $107 ARPU** (see §8 for the COGS build): variable COGS $14.80/customer/month → **86% variable gross margin**; fully loaded (fixed $90/mo of tools) margin crosses 80% at ~22 customers (month 3 base case) and is 84% by month 6. Months 1-2 are 69-79% fully loaded because $90 of fixed tooling sits on 5-12 customers; this is stated, not hidden.

---

## 3. Core user journey

**Ad click → landing (0:00).** Reels/Feed ad → either (a) Instant Form (name, mobile, trade, # of techs, "calls missed per week") which triggers a founder call within 5 minutes and a CallCatch demo text from our own verified number, or (b) landing page with a live demo line: "Call (8xx) xxx-xxxx and don't answer when we call back." Both fire CAPI `Lead`.

**Signup (0:30-2:00).** Email + password or Google via Supabase Auth. Then Stripe Checkout (plan, monthly/annual, card). Webhook creates `accounts` + `subscriptions`.

**Onboarding wizard (2:00-8:00) — exact fields:**
1. Business: legal name (as on EIN letter), DBA, website URL, street address, city, state, ZIP, EIN (9 digits; if none → "I'm a sole proprietor" → 10DLC sole-prop path with local number), business phone (the one they forward from), timezone, trade (HVAC / plumbing / electrical / other), service area (ZIPs or radius), hours (Mon-Sun open/close), emergency service (y/n), after-hours on-call number (Pro).
2. Number: we auto-provision a toll-free number in their area's style (or a local number on the sole-prop path) and show it; they pick greeting tone (friendly / professional / plain-spoken).
3. Profile for the AI: services offered (multi-select + free text), things never to say (e.g. "no firm prices"), typical price ranges (optional, shown as "starting at"), booking link (Jobber/HCP/Calendly URL) or "use CallCatch scheduling page".
4. Compliance block (pre-filled from step 1, editable): use-case description, 3 sample messages (auto-generated), opt-in description ("Customer initiates by calling the business or submitting a lead form containing SMS disclosure"), monthly volume estimate. Submitted to Twilio Toll-Free Verification API on "Finish".
5. Forwarding: carrier-specific instructions (Verizon `*71`, AT&T `*61*`/`**61*`, T-Mobile `**61*`, Google Voice / RingCentral / Grasshopper portal steps) with a **"Test my forwarding"** button: we call their business line, they let it ring, and the page turns green when our webhook sees the forwarded call.
6. Alerts: owner mobile (verified by a code SMS from our own number), alert email, quiet hours (default 8am-9pm local).

**"Aha" within 5 minutes (day 0, before verification):** the "Test my forwarding" call lands, the owner's phone buzzes with an alert from CallCatch ("Missed call from (555) 123-4567 — voicemail: 'my AC is out' — tap to call back") and the inbox shows the transcribed voicemail. Once the number verifies (3-10 business days), the text-back turns on automatically and the owner gets a "You're live — your first text-back went out at 2:14pm" email.

**Daily use:** owner gets alert → taps "Call now" or reads the AI thread → replies from the inbox as the business → marks Booked/Lost. Pro: web-form and Meta leads flow into the same inbox with an instant SMS reply.

**Weekly:** Monday 7am local, "Calls recovered" email: missed calls, texted back, replied, booked, estimated revenue (booked × trade average ticket, editable), plus a referral link.

**Upgrade triggers:** hitting 150 conversations; enabling a second line; asking for booking links or after-hours routing → in-app upsell to Pro through the Customer Portal.

---

## 4. Architecture

**Stack:** Next.js 15 (App Router) + TypeScript + Tailwind on Vercel Pro ($20/seat/mo `[V]`); Supabase Pro ($25/mo `[V]`: Postgres, Auth, RLS, Storage, Realtime); Stripe Billing (Checkout, Customer Portal, webhooks; 2.9% + $0.30 + 0.7% Billing `[V]`); Anthropic Claude API; Twilio Programmable Voice + Messaging + Trust Hub / Toll-Free Verification API `[V]`; Resend (email out + inbound parsing, Pro $20/mo `[V]`); Meta Pixel + Conversions API (free); Zapier Professional $19.99/mo `[V]` as the Meta-lead bridge until App Review; Deepgram Nova-3 for voicemail transcription ($0.0043/min `[V2]`).

**Claude model choice:** `claude-sonnet-5` for the conversational qualification turns, tool calls and lead extraction — current-generation Sonnet, 1M context, $2.00 input / $10.00 output per MTok, cache reads ~10% of input price `[V]` (Anthropic first-party pricing table, `claude-api` skill cached 2026-06-24). It is the price/quality point for a guarded, tool-using SMS agent whose system prompt (~2k tokens of business profile) is cached per account with `cache_control: {type: "ephemeral"}`. `claude-haiku-4-5` ($1.00 / $5.00 per MTok `[V]`) for cheap classification (STOP/HELP/intent, emergency keyword scoring, voicemail summaries, weekly report copy). `claude-opus-5` ($5.00 / $25.00 `[V]`) is the upgrade path if golden-test quality on qualification turns is not met; at ~240 turns/customer/month it would cost ~$2.25/customer, still inside the 80% margin. Use adaptive thinking (`thinking: {type: "adaptive"}`) with `output_config.effort: "low"` for SMS turns (latency matters), structured outputs via `output_config.format` for extraction, and `strict: true` tools. Model ids are read from `CLAUDE_MODEL_CHAT` / `CLAUDE_MODEL_FAST` env vars, never hard-coded. Budget: ~240 AI turns/customer/month × (2k cached input + 300 uncached + 120 output) ≈ **$0.90/customer/month** on Sonnet 5; Haiku fallback ~$0.40.

### 4.1 Tables (Postgres, all with `created_at timestamptz default now()`, `updated_at`)

| Table | Columns |
|---|---|
| `accounts` | `id uuid pk`, `owner_user_id uuid → auth.users`, `legal_name text`, `dba text`, `website text`, `address_line1 text`, `city text`, `state char(2)`, `zip text`, `ein text null`, `is_sole_prop bool`, `trade text` (enum hvac/plumbing/electrical/other), `timezone text`, `business_phone text`, `service_area jsonb`, `hours jsonb`, `emergency_service bool`, `on_call_phone text null`, `booking_url text null`, `tone text`, `ai_profile jsonb` (services, never_say, price_ranges), `avg_ticket_usd numeric default 450`, `quiet_start time default 08:00`, `quiet_end time default 21:00`, `alert_phone text`, `alert_phone_verified bool`, `alert_email text`, `status text` (onboarding/pending_verification/live/paused/cancelled), `stripe_customer_id text`, `plan text` (starter/pro), `referral_code text unique`, `referred_by_account_id uuid null` |
| `account_members` | `account_id`, `user_id`, `role text` (owner/staff), pk (account_id,user_id) |
| `numbers` | `id uuid pk`, `account_id`, `phone_number text unique (E.164)`, `twilio_sid text`, `type text` (tollfree/local), `purpose text` (customer/notification/demo), `voice_enabled bool`, `sms_enabled bool default false`, `verification_status text` (not_submitted/pending/in_review/verified/rejected), `verification_sid text`, `verification_submitted_at`, `verified_at`, `rejection_reason text`, `tendlc_brand_sid text null`, `tendlc_campaign_sid text null` |
| `contacts` | `id uuid pk`, `account_id`, `phone text`, `name text null`, `email text null`, `address text null`, `opted_out bool default false`, `opted_out_at`, `consent_source text` (inbound_call/lead_form/web_form/manual), `consent_evidence jsonb`, unique (account_id, phone) |
| `conversations` | `id uuid pk`, `account_id`, `contact_id`, `number_id`, `channel text` (sms/email), `source text` (missed_call/lead_form/web_form/inbound_sms/manual), `status text` (open/qualified/booked/lost/closed), `ai_paused bool default false`, `paused_by_user_id`, `last_message_at`, `turn_count int default 0`, `counted_for_usage bool` |
| `messages` | `id uuid pk`, `conversation_id`, `account_id`, `direction text` (in/out), `author text` (ai/owner/contact/system), `body text`, `twilio_sid text null`, `status text` (queued/sent/delivered/failed/received), `error_code text null`, `segments int`, `model text null`, `tokens_in int`, `tokens_out int`, `cost_usd numeric` |
| `calls` | `id uuid pk`, `account_id`, `number_id`, `contact_id null`, `twilio_call_sid text unique`, `from_phone`, `to_phone`, `forwarded_from text null`, `status text` (missed/voicemail/answered_by_greeting/test), `recording_url text null`, `recording_duration int`, `transcript text null`, `summary text null`, `is_emergency bool`, `started_at` |
| `leads` | `id uuid pk`, `account_id`, `conversation_id null`, `contact_id`, `source text`, `name`, `phone`, `address`, `zip`, `issue text`, `urgency text` (emergency/today/this_week/flexible), `preferred_window text`, `status text` (new/qualified/booked/lost), `est_value_usd numeric`, `booked_at`, `lost_reason text`, `external_ref text` (Meta leadgen_id / form id), `raw jsonb` |
| `alerts` | `id`, `account_id`, `lead_id null`, `call_id null`, `channel text` (sms/email/voice), `sent_at`, `twilio_sid`, `status` |
| `subscriptions` | `id uuid pk`, `account_id unique`, `stripe_subscription_id text unique`, `stripe_price_id`, `plan text`, `interval text` (month/year), `status text` (trialing/active/past_due/paused/canceled/incomplete), `trial_end timestamptz null`, `current_period_end`, `setup_fee_paid bool`, `paid_now bool`, `cancel_at_period_end bool`, `pause_until date null` |
| `usage_monthly` | `account_id`, `period date` (first of month), `conversations int`, `sms_segments_out int`, `sms_segments_in int`, `voice_minutes numeric`, `ai_cost_usd numeric`, `overage_reported bool`, pk (account_id, period) |
| `verification_events` | `id`, `number_id`, `account_id`, `status text`, `payload jsonb`, `received_at` |
| `lead_sources` | `id`, `account_id`, `type text` (resend_inbox/webhook/zapier/meta_page), `inbound_email text unique null` (e.g. `acct-<code>@leads.callcatch.co`), `webhook_secret text`, `meta_page_id text null`, `meta_form_ids text[] null`, `enabled bool` |
| `events` | `id bigserial`, `account_id null`, `user_id null`, `name text` (signup, checkout_started, forwarding_tested, verification_submitted, verified, first_textback, first_booked, …), `props jsonb`, `occurred_at` — product analytics + CAPI source |
| `weekly_reports` | `id`, `account_id`, `week_start date`, `stats jsonb`, `sent_at`, unique (account_id, week_start) |
| `referrals` | `id`, `referrer_account_id`, `referred_account_id`, `status` (pending/rewarded), `stripe_coupon_id` |
| `admin_notes` | `id`, `account_id`, `note text`, `author_user_id` |

**RLS:** every table with `account_id` has `select/insert/update` policies `account_id in (select account_id from account_members where user_id = auth.uid())`; service-role key used only in server routes/webhooks. `auth.users` → `account_members` created by a trigger on first login. Realtime enabled on `messages`, `conversations`, `leads`.

### 4.2 API routes and webhooks (all under `app/api/`)

| Route | Method | Purpose | Verification |
|---|---|---|---|
| `/api/twilio/voice/inbound` | POST (TwiML) | Forwarded call arrives on customer number: `<Say>` greeting ("Sorry we missed you — we'll text you in a few seconds. Leave a message after the tone or hang up.") → `<Record maxLength=120 transcribe=false recordingStatusCallback=...>`; creates `calls`, `contacts`; enqueues text-back if `sms_enabled` | Twilio `X-Twilio-Signature` HMAC-SHA1 over URL + params with `TWILIO_AUTH_TOKEN` (`twilio.validateRequest`) |
| `/api/twilio/voice/recording` | POST | Recording ready → download → Deepgram transcript → Haiku summary + emergency flag → owner alert | Twilio signature |
| `/api/twilio/voice/status` | POST | Call status callbacks (completed/no-answer) → `calls.status` | Twilio signature |
| `/api/twilio/sms/inbound` | POST (TwiML empty) | Inbound SMS to any of our numbers → STOP/HELP/START handling → append message → AI turn (unless `ai_paused`) | Twilio signature |
| `/api/twilio/sms/status` | POST | Delivery status → `messages.status`, `error_code` (30032 = unverified toll-free → mark number not live, alert admin) | Twilio signature |
| `/api/twilio/verification/status` | POST | Toll-Free Verification status webhook (or polled by cron) → `numbers.verification_status`; on `verified`: set `sms_enabled`, push Stripe `trial_end` / `billing_cycle_anchor`, email "you're live", CAPI `StartTrial` | Twilio signature (webhook) / auth token (poll) |
| `/api/leads/inbound-email` | POST | Resend inbound webhook: parse Meta lead-notification / web-form emails to `leads` → instant SMS (Pro) | Resend Svix signature (`svix-id`, `svix-timestamp`, `svix-signature` with `RESEND_WEBHOOK_SECRET`) |
| `/api/leads/webhook/[accountCode]` | POST | Generic JSON / Zapier / Make lead intake | Per-account `webhook_secret` in header `X-CallCatch-Secret` (constant-time compare) |
| `/api/meta/leadgen` | GET/POST | Meta leadgen webhook (behind `FEATURE_META_LEADGEN`): GET verify challenge; POST → Graph API `GET /{leadgen_id}` → `leads` | GET: `hub.verify_token` = `META_WEBHOOK_VERIFY_TOKEN`; POST: `X-Hub-Signature-256` HMAC-SHA256 with `META_APP_SECRET` |
| `/api/meta/capi` | POST (internal) | Server-side CAPI events (Lead, StartTrial, Purchase, Subscribe) with hashed email/phone, `event_id` dedup with Pixel | Internal: called from server actions/webhooks only; `INTERNAL_API_SECRET` |
| `/api/stripe/webhook` | POST | `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.trial_will_end` → `subscriptions`, `accounts.plan/status`, CAPI Purchase/Subscribe | `stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET`; idempotent on `event.id` |
| `/api/stripe/checkout` | POST | Create Checkout Session (plan, interval, setup fee line item, `trial_period_days` or pay-now, `client_reference_id = account_id`) | Supabase session (server action) |
| `/api/stripe/portal` | POST | Customer Portal session | Supabase session |
| `/api/onboarding/provision-number` | POST | Buy toll-free (or local) number, attach voice/SMS webhooks, create `numbers` | Supabase session + account membership |
| `/api/onboarding/test-forwarding` | POST | Place an outbound test call from our notification number to `business_phone`; the forwarded leg should hit `/voice/inbound` within 30s; poll result | Supabase session |
| `/api/onboarding/submit-verification` | POST | Build TFV payload from account fields; `POST /v1/Tollfree/Verifications`; store SID | Supabase session |
| `/api/onboarding/verify-alert-phone` | POST | Send/check 6-digit code from notification number | Supabase session, rate-limited |
| `/api/demo/call` | POST (TwiML) | Public demo line: greeting → hang up → text-back demo thread from our verified demo number → link to trial; CAPI `Lead` | Twilio signature |
| `/api/cron/ai-followups` | GET | Every 5 min: send scheduled nudges (e.g. 20 min after unanswered text-back), respecting quiet hours | `Authorization: Bearer CRON_SECRET` (Vercel Cron) |
| `/api/cron/verification-poll` | GET | Every 30 min: poll pending TFV SIDs; escalate to admin at 5 business days | `CRON_SECRET` |
| `/api/cron/weekly-report` | GET | Mondays 07:00 per timezone bucket (run hourly, filter by tz) | `CRON_SECRET` |
| `/api/cron/usage-rollup` | GET | Nightly: usage per account; Stripe metered overage via `usage_records` on the overage price | `CRON_SECRET` |
| `/api/cron/dunning` | GET | Daily: past_due reminders (Resend), pause AI on `canceled` | `CRON_SECRET` |
| `/api/health` | GET | Twilio/Stripe/Supabase/Anthropic reachability for uptime pings | none |

**Queue needs:** Vercel functions are synchronous; use Postgres as the queue: `messages.status = queued` rows picked by `/api/cron/ai-followups` and by `after()` (Next 15 `unstable_after`) for immediate AI turns so the Twilio webhook returns TwiML within 1s. AI turn latency target: < 6s from inbound SMS; text-back target: < 10s from call end (fires from the voice webhook itself, not from the recording callback).

### 4.3 Env vars

```
NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_STARTER_MONTHLY, STRIPE_PRICE_STARTER_ANNUAL,
STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_ANNUAL, STRIPE_PRICE_SETUP_FEE, STRIPE_PRICE_OVERAGE_CONVERSATION,
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_NOTIFICATION_NUMBER, TWILIO_DEMO_NUMBER, TWILIO_ISV_PROFILE_SID,
TWILIO_MESSAGING_SERVICE_SID_NOTIFY, ANTHROPIC_API_KEY, CLAUDE_MODEL_CHAT, CLAUDE_MODEL_FAST, DEEPGRAM_API_KEY,
RESEND_API_KEY, RESEND_WEBHOOK_SECRET, RESEND_FROM_EMAIL, LEADS_INBOUND_DOMAIN,
META_PIXEL_ID, META_CAPI_ACCESS_TOKEN, META_APP_ID, META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN, FEATURE_META_LEADGEN,
CRON_SECRET, INTERNAL_API_SECRET, ADMIN_EMAILS, SENTRY_DSN (optional), POSTHOG_KEY (optional)
```

### 4.4 AI conversation engine (module c)

- System prompt (cached): business profile, hours, service area, tone, never-say list, booking link, trade-specific qualification order: **(1) what's going on, (2) address/ZIP, (3) how urgent, (4) preferred window, (5) name**. Max 8 AI turns per conversation, then "The owner will call you shortly."
- Tools (Claude tool use): `save_lead_fields`, `mark_qualified`, `mark_booked`, `escalate_to_owner(reason)`, `send_booking_link`.
- Guardrails hard-coded outside the model: never send outside quiet hours (queue), never message an `opted_out` contact, never exceed 3 unanswered outbound messages, first outbound always includes business name + "Reply STOP to opt out", emergency keywords (gas, smell, sparks, flooding, no heat + infant/elderly, CO alarm) → template with safety line + immediate voice call to the owner/on-call.
- Extraction: after each turn, Haiku structured-output pass updates `leads` fields.
- Owner takeover: any owner message in a thread sets `ai_paused = true`; "Resume AI" button.

---

## 5. Compliance gates and the day-1 workaround

| Gate | Realistic timeline | Day-1 workaround / plan |
|---|---|---|
| **LLC + EIN** (needed by Twilio Trust Hub, TFV, Stripe, Mercury) | Wyoming LLC online: same/next business day; EIN: instant online for a US-resident owner `[V2]` | Day 0 (Sep 14). Nothing else waits on this. |
| **Twilio Trust Hub ISV Primary Business Profile** (required to submit customers' verifications) | 1-3 business days `[U]` (Twilio does not publish; operator reports) | Submit Day 0 evening with LLC docs + EIN + live site (privacy, terms, SMS terms). Build continues in parallel. |
| **Twilio Toll-Free Verification per customer number.** Unverified toll-free SMS is fully blocked (error 30032) `[V]`. Business Registration Number (EIN) mandatory since early 2026 `[V]` twilio.com blog. | Twilio: "a few days to a week or more" `[V]`; operators report 3-10 business days. | **Value without SMS on day 0:** forwarded calls still get the greeting + voicemail + transcript + owner alert (alerts go from CallCatch's own verified notification number to CallCatch's own subscriber — that is our brand messaging our customer, which is compliant). Web-form leads get an instant **email** reply + owner alert. Trial clock / billing anchor start on `verified`. Escalate to Twilio support at day 5. |
| **Sole proprietors without an EIN** | TFV will reject `[V]` (EIN required). | 10DLC **sole-proprietor brand** on a local number: $4 brand + $15 vetting + $2/mo campaign `[V]`, ~1,000 segments/day cap; approval minutes-days for brand, campaign vetting 1-7 business days (surges longer) `[V2]`. Offered automatically in onboarding when EIN is blank. Twilio ISV rules require each end business to be its own brand/verification — we never send customer traffic from a shared number or a shared campaign (this closes the judges' flag on QuoteChaser's shortcut). |
| **Our own numbers** (notification + demo line) | Same TFV process: submit the day the ISV profile is approved (~Sep 17), expect verified ~Sep 22-Oct 1. | Ads that depend on the demo line start only when it is verified. Instant-Form ads with founder callback can start earlier but we hold all paid until **Oct 1** to stack: account warm-up, pixel seasoning, and the demo number. Sep 14-30 is outbound-only selling (see §7). |
| **TCPA / CTIA** (consent, STOP, quiet hours) — legal characterization `[U]`, consult counsel before month 2 | Ongoing | Only text people who initiated contact (called the business, or submitted a form carrying the customer's SMS disclosure); first message identifies the business and includes STOP language; STOP honored instantly; quiet hours 8am-9pm local; consent evidence stored per contact; ToS requires customers to add SMS disclosure to their forms. Voice greeting is informational and not telemarketing. |
| **Meta App Review** for `leads_retrieval` + `pages_manage_ads` + `pages_show_list` + `pages_read_engagement` + `pages_manage_metadata` (real-time Instant Form leads for customers' Pages) | ~20 days per review cycle in 2026; a rejection restarts the clock `[V]` bundle.social / LinkedIn 2026. Requires Business Verification first (2-10 business days `[U]`). Realistic: live month 2-3. | Pro tier day 1: (a) web-form leads are instant (webhook/email); (b) Meta Instant Form leads via **Zapier Professional ($19.99/mo `[V]`, Facebook Lead Ads is a premium app) → our per-account webhook**, typically < 2 minutes; the customer authorizes their Page in Zapier on the onboarding call. We market "Meta leads answered in minutes" until App Review, then "in seconds". Meta's built-in lead-notification emails are NOT relied on (documented 15 min-to-hours delay). Submit App Review by Day 4 with a screencast from the seeded demo account. |
| **Meta ad account** (new-account daily caps, learning phase) | New accounts often capped at ~$25-50/day for 1-2 weeks `[U]`; learning phase wants ~50 events/ad set/week, which no $150-350/week plan reaches. | Create the account Day 0, add payment method, verify domain, run $0 until Oct 1, then pace weeks 1-2 at ≤ $25-30/day. Treat weeks 1-4 as a creative test, not a scaled channel. Backup ad account + second Page under the Business Portfolio. |
| **Stripe activation + payouts** | Activation same day with EIN/SSN + live site; first payout ~7 days; new accounts taking annual prepays may see a rolling reserve `[U]` | Publish ToS, Privacy, Refund (30-day) before first charge; itemized invoices; founder keeps a $500 personal buffer for tools so a payout delay never blocks reinvestment. |
| **Sales tax on SaaS** | Nexus thresholds ($100k / 200 txns per state) not reached in the window. | Stripe Tax monitoring off at launch; revisit at $50k. `[U]` per-state rule, confirm with CPA. |

---

## 6. Meta ads plan

### 6.1 Account setup (Day 0-2)
- Meta Business Portfolio under the LLC → Page "CallCatch" + backup Page → ad account (+ backup) → payment method (Mercury virtual card) → domain verification → Pixel.
- **Conversions API** (server-side, from `app/api/meta/capi`, with `event_id` dedup against the browser Pixel):
  - `Lead` — Instant Form submission (via Meta) / landing-page form / demo-line caller (from `/api/demo/call`).
  - `Schedule` — demo call booked (Cal.com webhook or manual button in admin).
  - `StartTrial` — checkout completed with trial, or number `verified` for pay-now.
  - `Purchase` (value = first payment) and `Subscribe` — from `invoice.paid`.
  - Hash email + phone (SHA-256), pass `fbc`/`fbp`, `client_ip`, `client_user_agent` captured at signup.
- Instant Form: "Higher intent" type with review screen; fields: full name, phone, email, trade (multiple choice), number of techs, "How many calls do you miss a week?"; privacy policy link; disclosure line "By submitting you agree CallCatch may call or text you about your request."

### 6.2 Campaign structure (ABO, no CBO, until month 2)
**Campaign 1 — "CC-Leads" (Leads objective, Instant Forms, optimize for Leads, 7-day click / 1-day view).**
- Ad set A "Trade interests": US, 25-60, interests HVAC + Plumbing + Electrician + Jobber + Housecall Pro + ServiceTitan + NATE + "Small business owners"; Advantage+ audience expansion ON after week 2. Sun Belt states weighted (TX, FL, AZ, GA, NC) via a duplicate ad set in week 3 if CPL diverges.
- Ad set B "Advantage+ broad": US, 25-60, no interests; creative does the targeting.
- Ad set C "Retargeting" (from week 3, $5/day): 50% video viewers 30d + Page/IG engagers 30d + site visitors 30d + demo-line callers (CAPI custom audience), excluding customers.
- Placements: Advantage+ placements minus Audience Network, Messenger, Right Column; deliver 9:16 for Reels/Stories and 4:5 for Feed.

**Campaign 2 — "CC-Demo" (Traffic → landing page with demo line; only as a $5/day test in week 2 once the demo number is verified; scale only if cost per `Lead` (demo call) beats Campaign 1's CPL).**

Month 2+: winning ad set duplicated into a Lookalike 1-3% of `Lead` + `Purchase` events once 100+ events exist; switch to CBO with 2 ad sets when spend > $60/day.

### 6.3 Audiences (summary)
1. Interest stack (HVAC, Plumbing, Electrician, Jobber, Housecall Pro, ServiceTitan, NATE, Small business owners), US, 25-60.
2. Advantage+ broad, US, 25-60.
3. Sun Belt geo duplicate of 1.
4. Retargeting: video 50% 30d, engagers 30d, site 30d, demo callers, minus customers.
5. Lookalike 1-3% of Lead/Purchase (month 2+).
6. Exclusion list: Stripe customers uploaded weekly.
7. Not targetable in Ads Manager but used for outbound: contractors currently running "Call now" ads in the Meta Ad Library (see §7).

### 6.4 Twelve ad concepts

| # | Hook | Body | CTA | Format |
|---|---|---|---|---|
| 1 | "You were under a house. Your phone rang twice. That $4,800 changeout just booked with the guy who answered." | CallCatch texts every missed call back in 10 seconds, asks what's wrong and where, and hands you a ready-to-book lead. No new number. 10-minute setup. | Get a demo | 20s UGC vertical, phone POV, text thread appears on screen |
| 2 | "Call this number right now. Don't answer when we call back. Watch your phone." | (Large demo number.) This is what your customers get when you can't pick up. $79/mo. | Call now / Start free | Static + 10s video; launches when demo line is verified |
| 3 | "Miss 10 calls a week × $450 average ticket = $18,000 a month walking to the next plumber." | Studies put contractor missed-call rates between 27% and 62%. Do the math on your own number. | See my number | Carousel: math card, stat card, text thread screenshot, pricing card |
| 4 | "Podium wanted $399 a month and a sales call. This is $79 and a call-forwarding code." | Same missed-call text-back. Same AI qualification. No suite, no contract, no seats. | Compare | 25s founder talking head, captioned |
| 5 | "Your Facebook leads answered in under a minute. Even when you're on a roof." | Pro tier: web and Meta leads get a text in minutes, qualified, and booked to your calendar link. | Start Pro | 15s screen recording: form → SMS → booked lead |
| 6 | "It's 6:40pm. No heat. She called three companies. The one that texted back got the job." | Fall/winter angle for HVAC. Emergency routing calls your on-call tech. | Get set up before the cold | 15s vertical, dark kitchen, phone glow |
| 7 | "Forward your missed calls. Keep your number. That's the whole setup." | Verizon *71. AT&T *61. T-Mobile **61. We handle the rest. | Set up in 10 minutes | Static, plain text on white, screenshot of forwarding screen |
| 8 | "Here's the text a homeowner got 9 seconds after the owner missed the call." | (Real anonymized thread, with permission, once one exists; until then the seeded demo thread labeled "demo".) | Try it on your line | Screenshot ad, 4:5 |
| 9 | "The office closes at 5. Your phone doesn't." | After-hours text-back with quiet-hours logic; you see everything Monday morning. | Get a demo | 12s Reel, timelapse of night sky over service van |
| 10 | "What your voicemail costs you: 80% of callers won't leave one." | (`[U]` stat — replace with the customer's own voicemail rate from their call log in the demo.) They'll text, though. | See the difference | Static two-frame comparison |
| 11 | "Weekly report: 14 missed calls, 11 texted back, 6 booked, $3,900 recovered." | The Monday email that tells you what CallCatch made you. | Get my report | Screenshot of the report email |
| 12 | "Plumbers: your competitor is already texting your missed callers." | (Retargeting only.) 14-day trial, card required, cancel any time. 30-day money-back on annual. | Start trial | Static, retargeting set only |

Copy rules: no income guarantees, no "you're missing calls" second-person accusations that read as personal attributes, no competitor logos.

### 6.5 Landing page copy blocks (`app/(marketing)/page.tsx`)
1. **Hero:** "Every missed call texts back in 10 seconds." Sub: "AI front desk for HVAC, plumbing and electrical contractors. Keep your number. Set up in 10 minutes." CTA primary: "Start 14-day trial" / secondary: "Call (8xx) xxx-xxxx to see it work".
2. **Proof strip:** "27-62% of contractor calls go unanswered (Invoca 2024, ServiceTitan 2024)."
3. **How it works (3 steps):** Forward missed calls → Caller gets a text and gets qualified → You get a booking-ready lead.
4. **Live demo block:** the demo number + an animated thread.
5. **What the caller sees / what you see:** side-by-side phone frames.
6. **Pricing table** (Starter / Pro, monthly / annual toggle, DFY setup add-on).
7. **Trades:** HVAC, Plumbing, Electrical cards with sample qualification questions.
8. **FAQ:** Do I change my number? (No.) When does texting turn on? (After carrier verification, typically 3-10 business days; you get alerts and voicemail transcripts from day one.) Is it compliant? (Consent, STOP, quiet hours.) Can I take over a thread? (Yes.) What if I'm a sole prop with no EIN? (Local number path.)
9. **Founder note + guarantee:** 30-day money-back.
10. **Legal footer:** Terms, Privacy, SMS Terms, Refund Policy, Data deletion.

### 6.6 $1,000 pacing (ads start Oct 1; account created Sep 14)

| Week | Dates | Spend | Goal |
|---|---|---|---|
| 1 | Oct 1-7 | $150 (~$21/day) | 5 creatives (#1, #3, #4, #6, #7) across ad sets A and B at ~$10/day each; confirm Pixel/CAPI events; target ≥ 5 leads; founder 5-minute callback SLA on every lead |
| 2 | Oct 8-14 | $175 (~$25/day) | Kill/scale per rules; add #2 demo-line ad if number verified; target ≥ 6 leads, 2 demos → 1-2 closes |
| 3 | Oct 15-21 | $200 (~$29/day) | Retargeting set at $5/day; Sun Belt duplicate if interest set CPL < broad; target ≥ 7 leads |
| 4 | Oct 22-31 | $225 (~$22/day over 10 days) | Winner + retargeting; month-1 total ≈ 25 leads, ~6 demos, ~2.5 paid from ads |
| 5 | Nov 1-7 | $250 seed remainder + reinvestment begins | From here ad spend = 60% of prior-month collected cash, cap $2,500/mo |

Weeks 1-4 stay at or under ~$30/day so a fresh-account daily cap does not throttle delivery (fixes the "week-4 $50/day" flag).

### 6.7 Kill / scale rules
- After $40 on an ad: kill if CTR (link) < 0.9% or cost per Instant Form open > $3.
- After $70 on an ad: kill if CPL > $50 or lead-to-answered-call < 40% (founder logs every lead).
- After 7 days on an ad set: kill if CPL > $45; scale winner +20%/day while CPL ≤ $35.
- Retargeting frequency cap 2 per 7 days.
- Do not judge on CTR alone; the founder's "demo booked" flag in admin is the real signal.
- Because event volume is far below Meta's 50/week learning threshold, expect ±40% week-to-week noise; decisions are made on 2-week windows except for obvious losers.

### 6.8 KPIs (base case) and sources
| KPI | Base | Source / status |
|---|---|---|
| CPM | $18 | All-industry 2026 median ~$13-14 `[V2]` foundrycro/adriselab; B2B/SMB-owner audiences price above median; `[U]` for this niche |
| CPC (link) | $1.90 | Leads-objective CPC ~$1.92 `[V2]` foundrycro/visiblefactors |
| Instant Form completion | 7.7-8.3% of clicks | WordStream 2025: lead-ads CVR 7.72% `[V]` |
| **CPL** | **$30** | WordStream 2025 all-industry leads CPL $27.66 (+21% YoY) `[V]`; B2B SMB $28-60 `[V2]` admanage; $30 is at the benchmark, not below it (fixes the "$25 is optimistic" flag) |
| Lead → demo held | 25% | `[U]` (founder 5-min callback; judges' credible range 20-25%) |
| Demo → customer (pay-now or trial-that-converts) | 40% | Card-required trial → paid 30-48% `[V2]` ChartMogul/FirstPageSage; pay-now close on demo `[U]` |
| **Lead → paying customer** | **10%** | product of the two above |
| **Paid CAC** | **$300** | $30 / 0.10 |
| Monthly logo churn (monthly plans) | 4.5% | SMB SaaS 3-7% `[V2]` Kalungi/Recurly/Vena |
| Refunds on first payment | 5% | `[U]` |
| Annual take rate | 20% | `[U]` (not 40%; judges' guidance) |
| DFY setup attach (monthly) | 30% | `[U]` |
| LTV (gross margin, monthly cohort) | $107 × 0.86 / 0.045 ≈ $2,045 | computed; LTV/CAC ≈ 6.8 |

---

## 7. Sales playbook (founder-led, ~30 hrs/week)

**Where to find the ICP free:**
1. **Meta Ad Library** (grafted from Leadloop): filter active ads, US, keywords "AC repair", "plumber", "furnace", "water heater", CTA "Call now", in Sun Belt metros. Owners who already spend on ads and have a phone CTA. Call the ad's number at 6-7pm; if nobody answers, you have your opener. Target 40/day.
2. Google Maps / LSA listings with 20-200 reviews and an owner name in reviews ("Mike came out…"). Call at 12:00-1:30pm or after 5pm.
3. Facebook groups: HVAC Business Owners, Plumbing Business Owners, Service Business Mastery, Contractor Business Growth — value posts only (post the missed-call math, ask for their number to run a free missed-call audit), no links in-post; DM interested commenters.
4. Reddit r/HVAC, r/Plumbing, r/smallbusiness (owner threads on "missed calls" / "answering service").
5. Supply houses and trade-association meetings (ACCA, PHCC chapters) — month 2+.
6. Referrals: one free month both ways; ask on the day their first job books.

**Volume and yield assumption `[U]`:** ~250 dials/DMs per week → ~6% conversation → ~35% demo → ~45% close ≈ 3-7 customers/month (plan: 2 in Sep, then 3, 5, 6, 7, 7, 7).

**Phone opener (after an unanswered call to their ad number):**
"Hey, is this Mike? Mike, I'm [name] with CallCatch. I called your number from your Facebook ad at 6:40 last night and got voicemail — which is normal, you were probably on a job. Quick question: when that happens, does the homeowner get anything back from you? … We text them back in ten seconds, ask what's wrong and where, and send you the lead. Ten-minute setup, you keep your number. Got 15 minutes tomorrow at 7:30am or noon so I can show you on your own line?"

**DM / email (Ad Library or Maps sourced):**
"Subject: called your ad number at 6:40pm
Mike — called (555) 123-4567 from your Facebook ad last night, got voicemail. Not a knock; it's the normal outcome for owner-operators. We built CallCatch so those callers get a text back in 10 seconds, get asked what's wrong and where, and land on your phone as a booking-ready lead. No new number, 10-minute setup, $79/mo, 30-day money-back. Want me to run a free missed-call audit on your line this week? Takes 5 minutes. — [name], founder"

**Demo flow (15 min, screen share + their phone):**
1. (2 min) Ask: calls/week, who answers, what happens after hours, average ticket. Write the math on screen: missed/week × close rate × ticket.
2. (5 min) Live: forward their line to a demo account (or dial the demo line), let it ring out, show the text arriving, the AI qualifying, the owner alert. Show the inbox and takeover.
3. (3 min) Show the weekly report and the forwarding page with their carrier code.
4. (5 min) Close (see below) and do onboarding together if they say yes.

**Objections:**
- "I answer most calls." → "Great — then this only fires when you can't. Your carrier log will show how often. Let's run the audit; if you miss under 5 a week, I'll tell you not to buy."
- "Customers hate bots." → "The first text says it's an automated assistant for [Business], and the moment you reply, it stops. Callers would rather get a text than a voicemail box."
- "I already have Housecall Pro / Jobber." → "Keep it. We hand the lead to your HCP booking link. We're the front door, not the office."
- "Podium quoted me $399." → "Same text-back, without the suite. If you outgrow us, fine — most one-truck shops never do."
- "When does texting start?" → "Carriers verify your number in about a week; alerts and voicemail transcripts start today, and your billing starts the day the texts go live."
- "Is this legal?" → "We only text people who called you or filled in your form, we identify the business, and STOP is honored instantly. It's the same rules your dentist follows."

**Closing to annual:** "Two ways: $79 a month plus $149 for me to set it all up for you, or $790 for the year, setup included, two months free, 30-day money-back either way. Most owners take the annual because it's one less bill to think about." If they hesitate on annual: monthly + DFY. Never discount the monthly.

**Day-of-onboarding checklist (founder):** submit TFV during the call, test forwarding live, verify alert phone, set quiet hours, add Zapier Page connection for Pro, calendar a "you're live" check-in for verification day, ask for a referral name.

---

## 8. Financial model

**Definition of $20,000:** cumulative **cash collected through Stripe** — successful charges for subscriptions, annual prepays and setup fees, **gross of Stripe fees, net of refunds**, counted from LLC formation (Sep 14, 2026). This is the fastest honest definition because annual prepay and setup fees pull cash forward. **$20,000 in MRR** is not reachable in this window: base case MRR is ~$6.8k at the end of March 2027 and ~$9.8k by May; $20k MRR needs ~185 customers at $107 and lands in month 14-18 on this reinvestment rate `[U]`.

**Model rules:** ad spend M1 = $750 of seed; M2 = $250 seed remainder + 60% of M1 collected; M3+ = 60% of prior-month collected, cap $2,500. Leads = spend / $30. Ad customers = leads × 10%. Outbound customers 2 (Sep), 3, 5, 6, 7, 7, 7. Referrals 3% of base/month from Dec. Cash timing: 50% of ad customers pay in the acquisition month (pay-now on demo), 50% the following month (trial or late verification); outbound/referral 70% in-month. Annual take 20% at $1,070 blended; monthly ARPU $107; DFY $149 attached by 30% of monthly customers; refunds 5% of first payments; churn 4.5%/month of the monthly base; annual customers do not churn inside the window. COGS = $14.80 variable per active customer + $90 fixed. MRR normalizes annual at 1/12. Fractional customers are expected values; real months are lumpy.

**COGS per customer per month ($14.80, at 60 conversations/month):**
| Item | Calc | $ |
|---|---|---|
| Twilio toll-free number | $2.15/mo `[V]` | 2.15 |
| SMS outbound 300 segments | $0.0083 + ~$0.004 carrier `[V]` | 3.69 |
| SMS inbound 180 segments | $0.0083 `[V]` | 1.49 |
| Voice inbound ~20 min + recording + Deepgram | $0.0085/min + $0.0025/min + $0.0043/min `[V2]` | 0.30 |
| Claude (Sonnet/Haiku, cached) | ~240 turns | 0.90 |
| Stripe fees on $107 | 2.9% + $0.30 + 0.7% | 4.15 |
| Resend, Zapier, misc allocated | | 2.12 |
| **Total variable** | | **14.80** → 86.2% variable margin |
| Fixed tools | Supabase Pro $25 + Vercel Pro $20 + Resend Pro $20 + Zapier $20 + Workspace $7 ≈ $90/mo | |

### 8.1 Base case

| Month | Ads $ | Leads | Demos | New cust. | Churn | Active | MRR | Collected | Cumulative | COGS | GM (fully loaded) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 · Sep 14-30 | 0 | 0 | outbound | 2.0 | 0 | 2.0 | $207 | $637 | $637 | $120 | n/a |
| 1 · Oct | 750 | 25 | 6 | 5.5 | 0.1 | 5.3 | $546 | $1,231 | $1,868 | $168 | 69% |
| 2 · Nov | 988 | 33 | 8 | 8.3 | 0.2 | 12.4 | $1,280 | $2,755 | $4,623 | $273 | 79% |
| 3 · Dec | 1,653 | 55 | 14 | 11.9 | 0.4 | 22.3 | $2,305 | $4,309 | $8,931 | $420 | 82% |
| 4 · Jan | 2,500 | 83 | 21 | 16.0 | 0.8 | 35.7 | $3,688 | $6,333 | $15,265 | $619 | 83% |
| **5 · Feb** | 2,500 | 83 | 21 | 16.4 | 1.3 | 50.7 | $5,236 | $8,076 | **$23,341** | $841 | 84% |
| 6 · Mar | 2,500 | 83 | 21 | 16.9 | 1.8 | 65.6 | $6,773 | $9,417 | $32,758 | $1,061 | 84% |

**$20,000 cumulative collected is crossed in February 2027 (around Feb 18; month 5 of ads, ~5.5 months after formation).** Cumulative ad spend to that point ≈ $8,400, of which $1,000 is the seed; net cash after ads, COGS and fees at the crossing ≈ $11-12k.

**Ads-only counterfactual:** $1,000 at $30 CPL and 10% lead-to-customer ≈ 3.3 customers ≈ $350 MRR ≈ $2.3k collected over 6 months. The $1,000 alone cannot reach $20k; the plan reaches it on reinvested revenue plus ~30 founder hours/week of outbound, and it says so.

### 8.2 Downside (CPL $45, lead→customer 7%, outbound 2/3/4/4/4/4, annual 12%, DFY 20%, churn 6%, refunds 8%)

| Month | Ads $ | New | Active | MRR | Collected | Cumulative |
|---|---|---|---|---|---|---|
| 0 | 0 | 2.0 | 2.0 | $210 | $458 | $458 |
| 1 | 750 | 3.2 | 3.9 | $406 | $631 | $1,089 |
| 2 | 629 | 4.0 | 7.4 | $780 | $1,205 | $2,294 |
| 3 | 723 | 5.3 | 12.0 | $1,253 | $1,779 | $4,073 |
| 4 | 1,067 | 6.0 | 17.0 | $1,785 | $2,357 | $6,430 |
| 5 | 1,414 | 6.7 | 22.6 | $2,360 | $2,957 | $9,387 |
| 6 | 1,774 | 7.4 | 28.5 | $2,980 | $3,596 | $12,983 |
| 7 | 2,158 | 8.2 | 34.9 | $3,645 | $4,279 | $17,262 |
| 8 · May 2027 | 2,500 | 8.9 | 41.7 | $4,355 | $4,998 | **$22,260** |

Downside crosses $20k in **May 2027 (month 8)**. Trigger to declare downside: month-2 CPL > $45 or lead→customer < 7% → cut ad reinvestment to 40% and move 10 more founder hours/week to outbound.

### 8.3 Upside (CPL $22, lead→customer 14%, outbound 4/6/8/8/8/8, annual 30%, DFY 40%, churn 3.5%, refunds 3%)

| Month | Ads $ | New | Active | MRR | Collected | Cumulative |
|---|---|---|---|---|---|---|
| 0 | 0 | 2.0 | 2.0 | $203 | $849 | $849 |
| 1 | 750 | 8.8 | 7.1 | $725 | $2,346 | $3,195 |
| 2 | 1,658 | 16.5 | 20.0 | $2,034 | $6,059 | $9,254 |
| 3 | 2,500 | 24.5 | 40.6 | $4,122 | $10,376 | $19,629 |
| 4 · Jan 2027 | 2,500 | 25.1 | 64.5 | $6,551 | $13,499 | **$33,128** |

Upside crosses $20k in the first days of **January 2027 (month 4)**.

**Not modeled (small at this scale, stated for honesty):** Stripe disputes ($15 each), failed-payment leakage beyond Smart Retries (5-10% of SMB renewals before retry), sales tax, Twilio price changes, ad-account bans, founder time (valued at $0 in CAC).

---

## 9. Company formation checklist (week 1, with costs)

| Day | Item | Cost |
|---|---|---|
| 0 (Sep 14) | Wyoming LLC online (single-member; Delaware only if raising VC: $110 + $400/yr franchise tax; India/other entities are worse for Stripe US, Twilio TFV and Meta trust) | $100 state + ~$50-125/yr registered agent `[V2]`; $60/yr annual report |
| 0 | EIN at irs.gov (instant, US resident with SSN) | $0 |
| 0 | One-page operating agreement (template) | $0 |
| 0 | Domain (callcatch.co or fallback) + Google Workspace mailbox | ~$12 + $7/mo `[U]` |
| 0 | Mercury business checking application (formation docs + EIN + ID; 1-5 business days `[U]`) | $0 |
| 0 | Stripe account under the LLC (EIN + founder ID); Products/Prices: Starter $79/$790, Pro $149/$1,490, DFY $149, overage $0.25/$0.20 metered; Customer Portal; Smart Retries; statement descriptor CALLCATCH | 2.9% + $0.30 + 0.7% Billing |
| 0 | Legal pages live before anything else is submitted: Terms, Privacy, SMS Terms (consent, STOP, HELP, frequency, carrier fees), Refund (30-day), Data Deletion instructions (Meta requirement) | Termly free tier or template `[U]` |
| 0 (evening) | Twilio: upgrade account; Trust Hub ISV Primary Business Profile with LLC docs + EIN; buy notification number + demo number (toll-free $2.15/mo each) | ~$20 initial load |
| 0 | Meta Business Portfolio, Page + backup Page, ad account + backup, payment method, domain verification, Pixel, CAPI token; Meta developer app (Business type) with Lead Ads product; start Business Verification | $0 |
| 1-2 | Anthropic Console key, Supabase Pro, Vercel Pro, Resend (domain SPF/DKIM/DMARC; inbound domain `leads.callcatch.co`), Deepgram, Zapier Professional, Cal.com free | ~$90/mo |
| 2-3 (ISV approved) | Submit TFV for notification + demo numbers | $0 |
| 4 | Submit Meta App Review (`leads_retrieval`, `pages_manage_ads`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`) with screencast from the seeded demo account | $0 |
| 5 | Bookkeeping: Wave (free) or Mercury categories + Stripe export; set aside 25-30% of net for estimated taxes (Q4 2026 estimate due Jan 15, 2027); Mercury virtual card dedicated to Meta ads | $0 |
| 5 | FinCEN BOI: check current rule for domestic LLCs on formation day (`[U]` rules changed in 2025) | $0 |
| Skip for now | Insurance (revisit month 3), trademark filing (do a free TESS search only), sales-tax registration | — |

**Founder cash needed outside the $1,000 ad budget:** ~$300-400 one-time + ~$90/month, plus a $500 buffer for the Stripe first-payout delay.

---

## 10. 90-day plan (week by week)

| Week | Dates | Build / ops | Sales / ads | Target |
|---|---|---|---|---|
| 0 | Sep 14-20 | Company formation (§9). Build days Sep 15-16: modules a-g in parallel, integrator merges Sep 17. Seed demo account, founder's own phone forwarded. Submit ISV profile; on approval submit TFV for our 2 numbers. | Build the outbound list: 200 Ad Library contractors + 200 Maps contractors in TX/FL/AZ. Start calls Sep 18. | MVP live on prod domain Sep 17; 1 pay-now customer by Sep 20 |
| 1 | Sep 21-27 | QA: end-to-end missed call → text → lead → alert; Stripe live; Resend inbound; TFV status polling; Loom onboarding video. Submit Meta App Review. | 250 dials; 5 demos; close pay-now/annual. Ads still off (account warming, demo number pending). | 2 customers (Sep total), first customer TFV submitted |
| 2 | Sep 28-Oct 4 | Our numbers verified (expected); demo line live; weekly report cron verified with real data. | **Oct 1 ads on**: week-1 creative test $150. Founder 5-min callback SLA. | ≥ 5 leads, 2 demos |
| 3 | Oct 5-11 | Fix AI transcripts from real threads; add carrier-specific forwarding fixes; Zapier Meta-lead bridge documented. | Ads $175; kill/scale; first ad-sourced close. | 3-4 cumulative customers |
| 4 | Oct 12-18 | Referral coupon flow; CAPI Purchase verified in Events Manager. | Ads $200; retargeting on; Sun Belt duplicate. | Month-1 pace: 25 leads |
| 5 | Oct 19-25 | Usage rollup + overage billing test; dunning emails. | Ads $225; test #2 demo-line ad. | 5-6 customers total |
| 6 | Oct 26-Nov 1 | Month-1 review: CPL, lead→demo, demo→close, TFV median days. Decide base vs downside track. | Reinvest rule starts (60% of Oct collected). Holiday creative (#6 no-heat) live. | ~$1.9k cumulative collected |
| 7 | Nov 2-8 | Pro: Jobber/HCP booking link polish; after-hours routing tested with a real on-call tech. | Ads ~$250/wk; outbound 250/wk; ask every live customer for one referral. | 8+ customers |
| 8 | Nov 9-15 | Meta App Review decision expected (or resubmit); flip `FEATURE_META_LEADGEN` for approved accounts. | Pro upsell push to owners running Meta lead ads. | Pro mix ≥ 35% |
| 9 | Nov 16-22 | First "customer story" ad (#8) with permission; pause-instead-of-cancel flow. | Ads ~$250/wk; Thanksgiving week dial-down. | 12+ customers |
| 10 | Nov 23-29 | Counsel review of SMS consent language (budget $300-500 `[U]`). | Light ads; outbound focus on plumbers (holiday emergencies). | ~$4.6k cumulative |
| 11 | Nov 30-Dec 6 | Lookalike seeding when 100 Lead events reached; CBO test. | Ads ~$400/wk. | 16+ customers |
| 12 | Dec 7-13 | Admin health dashboard; TFV escalation SLA report. | "Winter no-heat" creative; annual push before year-end ("expense it in 2026"). | 20+ customers, ~$7k cumulative |
| 13 | Dec 14-20 | Retention: first-week milestone message; "revenue recovered" numbers audited with 5 customers. | Reduced Dec 20-Jan 3 pacing; prep Jan "new year pipeline" creative. | Month-3 close: ~22 active, ~$8.9k cumulative; go/no-go on hiring a part-time SDR at $6k MRR (later) |

---

## 11. Risk register

| # | Risk | Likelihood | Impact | Mitigation / trigger |
|---|---|---|---|---|
| 1 | Toll-free verification takes > 10 business days or rejects, leaving customers without SMS and stalling billing (trial clock / anchor waits) | Med | High | Complete TFV data collected at signup with pre-written samples; day-0 value without SMS; 10DLC sole-prop/low-volume fallback; escalate via Twilio support at day 5; track median days in admin; if median > 8 days after 10 submissions, switch default to local numbers + 10DLC standard brand |
| 2 | Meta CPL for trade owners lands at $45+ and lead→customer < 7% (downside case) | Med | Med | Kill rules; retargeting + demo-line ad; declare downside at month-2 review → 40% reinvestment, +10 founder hours/week outbound; $20k still crosses in May 2027 |
| 3 | Founder cannot hold the 5-minute callback SLA and 250 dials/week alongside onboarding | High | High | Cal.com self-booking on the thank-you page; Loom onboarding replaces most screen-shares by week 6; DFY setup batched twice a week; SDR hire at $6k MRR |
| 4 | AI quotes a price, promises an ETA, or mishandles an emergency | Med | High | Never-say list + hard-coded emergency template + voice call to owner; max 8 turns; owner takeover; ToS states AI-assisted messaging; 20 golden test conversations per trade |
| 5 | TCPA / carrier complaints | Low-Med | High | Only reply to inbound-initiated contacts; STOP honored; quiet hours; consent evidence per contact; complaint rate per number monitored; counsel review by week 10 `[U]` |
| 6 | Meta App Review delayed or rejected → Pro Meta-lead feature stays on the Zapier bridge | High | Low-Med | Zapier bridge is the marketed day-1 path ("minutes, not seconds"); resubmit with fixes; web-form leads are unaffected |
| 7 | Ad account restriction or ban | Low-Med | Med | Backup ad account + Page; no income claims; domain verified; outbound engine independent of Meta |
| 8 | Churn above 4.5% because owners forget it is running | Med | Med | Weekly report + first-booked milestone; pause instead of cancel; annual push; referral loop |
| 9 | Late-September launch hits HVAC shoulder season | Med | Low-Med | Sun Belt first (AC through Oct, heating tune-ups from Oct); plumbing/electrical year-round; winter "no heat" creative |
| 10 | Incumbents (Podium, GoHighLevel agencies) copy the wedge and outspend | Low (in window) | Med | Win on setup friction, price, trade-specific qualification; referral loop; CAPI pass-back to the customer's Ads Manager (Pro) as a retention hook |
| 11 | Stripe rolling reserve or payout delay on a new account taking annual prepays | Low-Med | Med | Full verification day 0; itemized invoices; refund policy published; founder $500 buffer; monthly plans dominate cash anyway |
| 12 | Claude pricing/model drift vs the numbers in proposals | Low | Low | Model ids and prices read from the `claude-api` skill at build time; env-var driven; Haiku fallback halves cost |
| 13 | Name/trademark collision ("CallCatch") | Med | Low | TESS + domain check day 0; two fallbacks; brand not load-bearing |

---

## 12. Red-flag fixes (traceability to the judge reports)

| Judge flag | Fix in this spec |
|---|---|
| Lead→trial 40% too high for a card-required, EIN-collecting trial | Lead→demo 25% × demo→customer 40% = 10% lead→customer; CAC $300 (not $179); modeled with downside 7% |
| $25 CPL below B2B SMB benchmarks | CPL $30 base (WordStream $27.66 verified), $45 downside |
| Month 2 has zero ad spend / learning phase resets | Pay-now closes and $250 held seed fund Nov ads (~$988); ads never pause |
| Sep 20 launch not credible (ISV → TFV chain) | Sep 14-30 = formation, build, outbound-only; ads start Oct 1; demo-line ad only when the demo number is verified |
| "Meta leads texted back in 60s" on day 1 relies on delayed notification emails | Day 1 = web-form instant + Meta via Zapier Professional ($19.99/mo, premium app verified) in minutes; real-time after App Review (~20 days/cycle verified) |
| App Review stated as 1-3 weeks | ~20 days per cycle, rejection restarts; live month 2-3 |
| Per-customer TFV needs EIN; sole props hit a wall | Sole-prop 10DLC local-number path in onboarding |
| Week-4 $50/day may exceed a fresh-account cap | Pacing ≤ $30/day for weeks 1-4 |
| Shoulder-season launch unaddressed | Sun Belt geo + plumbing/electrical + winter creative (§1, §11) |
| Competitor prices unverified | Podium, Textline, CallRail verified this session (§1) |
| Fixed costs make month 1-2 margin < 80% | Stated (69-79% fully loaded); variable margin 86%; ≥ 80% fully loaded from month 3 |
| Learning phase never reached at $150-350/week | Stated; weeks 1-4 treated as a creative test; 2-week decision windows |
| Founder outbound is load-bearing and unbenchmarked | Stated as `[U]`, volume and yield specified, downside at 60% of plan modeled |
| Shared-campaign / founder-number sending for customers (QuoteChaser) | Explicitly forbidden: each end business is its own TFV or 10DLC brand |
