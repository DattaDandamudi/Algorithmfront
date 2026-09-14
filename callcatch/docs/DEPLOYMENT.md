# Deployment

Production stack: Vercel Pro ($20/seat/mo `[V]`) + Supabase Pro ($25/mo `[V]`) + Stripe Billing + Twilio + Resend Pro ($20/mo `[V]`) + Anthropic + Deepgram + Meta. Follow the sections **in order**: each one produces values the next one needs. Budget one working day; Twilio verification steps then run in the background for 3-10 business days.

Keep a scratch file (not committed) with every id/secret you collect; at the end you paste it into Vercel as one batch (§6). Prerequisites from `COMPANY_FORMATION.md`: LLC docs, EIN letter, domain, Google Workspace mailbox, legal pages live.

---

## 1. Supabase

1. [ ] Create a project at supabase.com → New project. Name `callcatch-prod`, region **us-east-1** (closest to Vercel's default `iad1` and to Twilio's US edge), generate a strong DB password and store it. Upgrade the org to **Pro** (Settings → Billing) so the project is never paused and you get daily backups + PITR add-on option.
2. [ ] Apply the migration:
   ```bash
   cd callcatch
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push          # applies supabase/migrations/20260914000000_init.sql
   ```
   Verify in Dashboard → Table Editor that `accounts … admin_notes` (17 tables) exist and that Database → Replication shows `messages`, `conversations`, `leads` in the `supabase_realtime` publication.
3. [ ] Auth providers (Authentication → Providers):
   - **Email**: enabled. Confirm email: ON. Secure email change: ON. Under Email Templates set the sender to the Resend SMTP later (§4.6) — the default Supabase mailer is rate-limited to ~4/hour and is not acceptable for production signups.
   - **Google**: create OAuth credentials in Google Cloud Console (APIs & Services → Credentials → OAuth client → Web). Authorized JavaScript origin `https://callcatch.co`; authorized redirect URI is the one Supabase shows in the Google provider panel (`https://<ref>.supabase.co/auth/v1/callback`). Paste client id + secret into Supabase. Publish the OAuth consent screen (External, app name "CallCatch", support email, privacy URL `https://callcatch.co/privacy`).
4. [ ] URL configuration (Authentication → URL Configuration): Site URL `https://callcatch.co`. Redirect URLs (add every one):
   ```
   https://callcatch.co/auth/callback
   https://callcatch.co/**
   https://*-<vercel-team>.vercel.app/auth/callback
   http://localhost:3000/auth/callback
   ```
5. [ ] Keys (Settings → API): copy **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`, **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`, **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (server-only; never in a `NEXT_PUBLIC_` var, never in the client bundle).
6. [ ] Seed the demo account (used for the Meta App Review screencast and every sales demo): create the user `demo@callcatch.co` via Authentication → Users → Add user (auto-confirm), then run `supabase/seed.sql` in the SQL editor. See `supabase/README.md`.
7. [ ] Settings → Database → enable **Point in Time Recovery** (Pro add-on, ~$100/mo) only after 20 customers; until then rely on daily backups.

## 2. Stripe

Use **test mode** first, do the whole flow, then repeat in **live mode** (ids differ per mode; the app reads them from env).

1. [ ] Activate the account under the LLC (EIN, founder ID, business website `https://callcatch.co`, statement descriptor `CALLCATCH`, support phone = notification number, support email `hello@callcatch.co`). Product description: "SaaS subscription: automated missed-call text-back for home-service contractors."
2. [ ] Products & prices (Product catalog → Add product). Record every `price_…` id:

   | Product | Price | Billing | Env var |
   |---|---|---|---|
   | CallCatch Starter | $79.00 USD | Recurring, monthly | `STRIPE_PRICE_STARTER_MONTHLY` |
   | CallCatch Starter | $790.00 USD | Recurring, yearly | `STRIPE_PRICE_STARTER_ANNUAL` |
   | CallCatch Pro | $149.00 USD | Recurring, monthly | `STRIPE_PRICE_PRO_MONTHLY` |
   | CallCatch Pro | $1,490.00 USD | Recurring, yearly | `STRIPE_PRICE_PRO_ANNUAL` |
   | Done-for-you setup | $149.00 USD | One-time | `STRIPE_PRICE_SETUP_FEE` |
   | Conversation overage (Starter) | $0.25 USD per unit | Recurring monthly, **usage-based**, meter = the Billing Meter from step 2a, unit label `conversation` | `STRIPE_PRICE_OVERAGE_CONVERSATION` |
   | Conversation overage (Pro) | $0.20 USD per unit | Recurring monthly, **usage-based**, **same meter**, unit label `conversation` | `STRIPE_PRICE_OVERAGE_CONVERSATION_PRO` |

   Set tax behavior "exclusive" on all prices; Stripe Tax stays **off** at launch (spec §5, revisit at $50k).

   2a. [ ] **Billing Meter first** (Product catalog → Meters → Create meter) — usage-based prices on this API version are billed only through a meter; there are no legacy usage records:
      - Display name `Conversation overage`, event name `callcatch_conversation_overage` (the app reads the event name and payload keys from the meter attached to the price, so another name also works — but keep this one so logs and dashboards match).
      - Aggregation **Sum**, customer mapping key `stripe_customer_id` (the default), value key `value` (the default).
      - Then create the two overage prices above on one product "Conversation overage", choosing this meter in the "Usage-based" pricing model. **Both prices are required**: Pro accounts are billed on the Pro price; if `STRIPE_PRICE_OVERAGE_CONVERSATION_PRO` is missing the app logs an error on every overage run and bills Pro overage on the Starter price with the quantity scaled so the total still matches the published $0.20 rate.
      - How it is used: `/api/cron/usage-rollup` runs nightly and, for every closed month whose `usage_monthly.overage_reported` is still false, attaches the plan's overage price to the subscription (swapping the Starter item for the Pro one on upgrade — never two metered items), sends one meter event (`value` = conversations over the plan quota, `identifier` = `overage:<account>:<period>`) and flips the flag. A failed run is retried the next night; the flag, not the Stripe identifier, is the idempotency guard.
      - Sanity check in test mode: Billing → Meters → the meter shows events after the first cron run with overage; the customer's next invoice carries a "Conversation overage" line.
3. [ ] Coupons (Product catalog → Coupons): `REFERRAL-1MO` = 100% off, duration once, name "Referral: one free month". Used by the referral flow on both sides.
4. [ ] Billing settings (Settings → Billing → Subscriptions and emails):
   - Smart Retries ON, retry up to 4 times over 2 weeks; then "mark subscription as unpaid" (do **not** cancel — our dunning cron pauses AI and `RUNBOOK.md` §6 handles recovery).
   - Send emails: failed payments ON, upcoming renewals ON for yearly, receipts ON.
   - Invoice footer: "Refund policy: 30-day money-back on your first payment. Cancel any time at callcatch.co/billing."
5. [ ] Customer Portal (Settings → Billing → Customer portal):
   - Allow: update payment method, view invoice history, cancel subscription (**at end of period**), switch plans between the four recurring prices (proration ON), update billing email.
   - Cancellation reasons ON (feeds the "pause instead" offer in the app's cancel flow).
   - Business info: `https://callcatch.co/terms`, `/privacy`. Headline "CallCatch billing".
6. [ ] Webhook endpoint (Developers → Webhooks → Add endpoint): URL `https://callcatch.co/api/stripe/webhook`, API version = the version pinned by the installed `stripe` package. Events:
   ```
   checkout.session.completed
   customer.subscription.created
   customer.subscription.updated
   customer.subscription.deleted
   customer.subscription.trial_will_end
   customer.subscription.paused
   customer.subscription.resumed
   invoice.paid
   invoice.payment_failed
   invoice.payment_action_required
   charge.refunded
   ```
   Copy the signing secret → `STRIPE_WEBHOOK_SECRET`. Copy the secret key → `STRIPE_SECRET_KEY`.
7. [ ] Radar: leave defaults; add a rule "Block if :card_country: != 'US'" only if you see fraud (the ICP is US-only).

## 3. Twilio

Unverified toll-free SMS is fully blocked by carriers (error **30032**) `[V]`, so nothing customer-facing texts until §3.4 completes. Voice works immediately.

1. [ ] Upgrade the account (billing → add card, load $20). Account SID → `TWILIO_ACCOUNT_SID`, Auth token → `TWILIO_AUTH_TOKEN`. Enable **Public Key Client Validation** later if you want; the app validates `X-Twilio-Signature` with the auth token.
2. [ ] **Trust Hub → ISV Primary Business Profile** (required to submit customers' verifications on their behalf). Console → Trust Hub → Customer Profiles → Create → "I'm an ISV / reseller". Fields: legal name exactly as the EIN letter, EIN, address, website `https://callcatch.co`, business type LLC, industry "Technology", authorized representative = founder with a real email/phone. Attach: EIN letter (CP575) and the Wyoming Certificate of Organization. Submit. Expect 1-3 business days `[U]`. When approved, copy the profile SID (`BU…`) → `TWILIO_ISV_PROFILE_SID`.
3. [ ] Buy two toll-free numbers (Phone Numbers → Buy → Toll-free, capabilities Voice + SMS):
   - **Notification number** → `TWILIO_NOTIFICATION_NUMBER`. Sends owner alerts, alert-phone verification codes and the founder's demo texts.
   - **Demo number** → `TWILIO_DEMO_NUMBER` and `NEXT_PUBLIC_DEMO_NUMBER`. The public "call this and don't answer" line.
   Configure each (Phone Numbers → Active numbers → the number):

   | Field | Notification number | Demo number |
   |---|---|---|
   | Voice → A call comes in | Webhook `https://callcatch.co/api/twilio/voice/inbound` POST | Webhook `https://callcatch.co/api/demo/call` POST |
   | Voice → Call status changes | `https://callcatch.co/api/twilio/voice/status` POST | same |
   | Messaging → A message comes in | `https://callcatch.co/api/twilio/sms/inbound` POST | same |
4. [ ] **Toll-Free Verification** for both numbers the day the ISV profile is approved (~Sep 17). Console → Messaging → Regulatory Compliance → Toll-Free Verification → Submit. Use the field values in `COMPLIANCE.md` §5 (notification-number variant and demo-number variant). Twilio quotes "a few days to a week or more" `[V]`; operators report 3-10 business days. Track in `RUNBOOK.md` §1.
5. [ ] (Optional) Messaging Service for alerts: not used by the app — owner alerts go directly from `TWILIO_NOTIFICATION_NUMBER`. Only create one if you want Advanced Opt-Out management in the console.
6. [ ] Status callbacks: the app passes `statusCallback=https://callcatch.co/api/twilio/sms/status` on every send (`lib/telephony/client.ts`), so no console setting is needed. Verification status changes are polled by `/api/cron/verification-poll` and additionally pushed if you set the Trust Hub webhook: Trust Hub → Settings → Status callback URL `https://callcatch.co/api/twilio/verification/status`.
7. [ ] Customer numbers are bought by the app at onboarding (`/api/onboarding/provision-number`) and their webhooks are set programmatically to the three URLs above. Ensure the account has "Programmable Voice → Recording" enabled and Geo Permissions → Messaging → United States only.
8. [ ] Alerts: Monitor → Alerts → email on error codes 30032, 30007, 30034, 21610 and on debugger events > 10/hour. Add `hello@callcatch.co`.

**Error 30032 means:** "Toll-Free Number Has Not Been Verified" — the message was blocked at Twilio because the sending toll-free number has no approved verification. In our app, `/api/twilio/sms/status` marks the number `sms_enabled=false` and emails admins. Procedure: `RUNBOOK.md` §3.

## 4. Resend

1. [ ] Create the account, upgrade to **Pro** ($20/mo `[V]`, needed for the inbound/receiving quota and 50k emails). API key with "Sending + Receiving" → `RESEND_API_KEY`.
2. [ ] Domains → Add `callcatch.co`, region US. Publish the records Resend shows at your DNS host (§7 has the full table): DKIM (`resend._domainkey` TXT), SPF on the `send` subdomain (`send.callcatch.co` TXT `v=spf1 include:amazonses.com ~all` + MX), and DMARC `_dmarc.callcatch.co` TXT `v=DMARC1; p=quarantine; rua=mailto:dmarc@callcatch.co; pct=100`. Wait for "Verified".
3. [ ] `RESEND_FROM_EMAIL=CallCatch <hello@callcatch.co>`. Create the mailbox `hello@callcatch.co` in Google Workspace so replies land somewhere.
4. [ ] Inbound routing: Domains → Add `leads.callcatch.co` → enable **Receiving**. Publish the MX record Resend gives (`leads.callcatch.co MX 10 inbound-smtp.us-east-1.amazonaws.com` or whatever the panel shows). `LEADS_INBOUND_DOMAIN=leads.callcatch.co`. Each account gets `acct-<code>@leads.callcatch.co`; customers forward their web-form and Meta lead-notification emails there.
5. [ ] Webhooks → Add endpoint `https://callcatch.co/api/leads/inbound-email`, event `email.received` (plus `email.bounced`, `email.complained` if you want them logged). Copy the signing secret (`whsec_…`) → `RESEND_WEBHOOK_SECRET`. The route verifies Svix headers `svix-id`, `svix-timestamp`, `svix-signature`.
6. [ ] Supabase Auth SMTP (back in Supabase → Authentication → SMTP settings): host `smtp.resend.com`, port 465, user `resend`, password = the Resend API key, sender `CallCatch <hello@callcatch.co>`. Raise the Auth rate limit to 100 emails/hour.

## 5. Meta

1. [ ] **Business Portfolio** under the LLC (business.facebook.com → Create). Add the founder as admin and a second admin login (backup phone/email) so a locked personal profile does not lock the business. Start **Business Verification** (Security Center → Business verification) with the LLC docs — needed for App Review and to lift some ad limits; 2-10 business days `[U]`.
2. [ ] Pages: "CallCatch" + a backup Page "CallCatch HQ" (used only if the first is restricted). Ad accounts: primary + backup, currency USD, timezone America/Chicago, payment method = Mercury virtual card dedicated to ads.
3. [ ] Brand Safety → Domains → add `callcatch.co`, verify via DNS TXT (§7) or the meta-tag (module f's layout can render it if you pass the token — prefer DNS).
4. [ ] Events Manager → Connect data sources → Web → **Pixel**. Name "CallCatch web". Pixel/dataset id → `META_PIXEL_ID` and `NEXT_PUBLIC_META_PIXEL_ID`.
5. [ ] Conversions API: Events Manager → the dataset → Settings → "Generate access token" (creates a system user) → `META_CAPI_ACCESS_TOKEN`. Copy the **Test event code** → `META_CAPI_TEST_EVENT_CODE` while testing, then **remove it** in prod. Event map is in `META_ADS.md` §2.
6. [ ] Developer app: developers.facebook.com → Create app → type **Business**, name "CallCatch Lead Sync", connect to the portfolio. Add products **Webhooks** and **Facebook Login for Business**. App id → `META_APP_ID`, App secret → `META_APP_SECRET`. Set Privacy Policy URL `https://callcatch.co/privacy`, Terms `https://callcatch.co/terms`, **Data deletion instructions URL** `https://callcatch.co/data-deletion` (required for review).
7. [ ] Webhooks → Page → Subscribe to `leadgen`. Callback URL `https://callcatch.co/api/meta/leadgen`, Verify token = a long random string → `META_WEBHOOK_VERIFY_TOKEN`. Meta sends a GET challenge on save; the route answers it only when the token matches. POST bodies are verified with `X-Hub-Signature-256` (HMAC-SHA256, app secret).
8. [ ] Generate a long-lived **Page access token** for each customer Page you sync (Graph API Explorer → user token with `pages_show_list`,`leads_retrieval` → exchange for long-lived → `/me/accounts` page token) → `META_PAGE_ACCESS_TOKEN` (single-tenant until App Review; per-page tokens later).
9. [ ] Keep `FEATURE_META_LEADGEN=false` until App Review approves `leads_retrieval`, `pages_manage_ads`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`. Submission script: `COMPLIANCE.md` §8. Until then, Pro customers' Meta leads flow through Zapier (Facebook Lead Ads trigger → Webhooks by Zapier POST → `https://callcatch.co/api/leads/webhook/<accountCode>` with header `X-CallCatch-Secret`), configured on the onboarding call.

## 6. Vercel

1. [ ] Import the Git repo. If you deploy **from the monorepo**, set **Root Directory = `callcatch`** (Settings → General) and "Include source files outside of the Root Directory" OFF. If you ran `scripts/split-to-new-repo.sh`, the root is the repo root. Framework preset Next.js, Node 22, install `npm ci`, build `npm run build`.
2. [ ] Plan: **Pro** ($20/seat/mo `[V]`) — required for cron schedules more frequent than daily (`*/5` and `*/30` in `vercel.json`) and for function `maxDuration` up to 300s.
3. [ ] Environment variables: paste every variable in `.env.example` (the README table describes each one) for **Production**, and a test-mode set for **Preview** (test Stripe keys, a Twilio subaccount, `META_CAPI_TEST_EVENT_CODE`). `NEXT_PUBLIC_APP_URL` must be `https://callcatch.co` in Production — Twilio signature validation is computed against it. Mark all non-`NEXT_PUBLIC_` values as Sensitive.
4. [ ] Cron: `vercel.json` already declares:

   | Path | Schedule (UTC) | Purpose |
   |---|---|---|
   | `/api/cron/ai-followups` | `*/5 * * * *` | Drain queued messages, scheduled nudges, quiet-hours release |
   | `/api/cron/verification-poll` | `*/30 * * * *` | Poll pending TFVs, escalate at 5 business days |
   | `/api/cron/weekly-report` | `0 * * * *` | Monday 07:00 per timezone bucket |
   | `/api/cron/usage-rollup` | `15 2 * * *` | Nightly usage; reports every closed month's unreported overage (retried nightly until reported) |
   | `/api/cron/dunning` | `30 14 * * *` | Past-due reminders, pause AI on `unpaid`/`canceled` (recorded so the webhook resumes exactly those threads on recovery) |

   Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when the `CRON_SECRET` env var is set on the project. Verify in Settings → Cron Jobs after the first deploy.
5. [ ] Function settings: routes that do AI work declare `export const maxDuration = 60;` (Twilio SMS inbound, voice inbound, recording, cron routes). Nothing else to set; region `iad1` default.
6. [ ] Deployment Protection: Production = none (webhooks must reach it); Preview = Vercel Authentication ON. Add the Protection Bypass secret to Twilio/Stripe test endpoints only if you test webhooks against previews.
7. [ ] Deploy `main`. Watch the build log for `next typegen` and the migration-independent build; the first deploy needs no data.

## 7. DNS

At the registrar (or Cloudflare with proxy **off** for the Vercel records):

| Type | Name | Value | Purpose |
|---|---|---|---|
| A | `callcatch.co` | `76.76.21.21` | Vercel apex |
| CNAME | `www` | `cname.vercel-dns.com` | Vercel www (redirects to apex in Vercel → Domains) |
| TXT | `_vercel` | value Vercel shows | Domain ownership (if asked) |
| MX | `callcatch.co` | Google Workspace MX set (`smtp.google.com` priority 1, per current Google docs) | Founder mailbox |
| TXT | `callcatch.co` | `v=spf1 include:_spf.google.com include:amazonses.com ~all` | SPF for Workspace + Resend (only if Resend sends from the apex; otherwise Resend's SPF lives on `send`) |
| TXT | `resend._domainkey` | DKIM value from Resend | Resend DKIM |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com` priority 10 | Resend bounce handling |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | Resend SPF |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@callcatch.co; pct=100` | DMARC |
| MX | `leads` | value from Resend receiving panel, priority 10 | Inbound lead mail |
| TXT | `callcatch.co` | `facebook-domain-verification=<token>` | Meta domain verification |
| TXT | `callcatch.co` | `google-site-verification=<token>` | Google Search Console / Workspace |

Propagation 5-60 minutes. Confirm with `dig +short TXT _dmarc.callcatch.co` and `dig +short MX leads.callcatch.co`.

---

## 8. Post-deploy smoke test

Do these in order on the production domain with **live** keys and a real card (charge yourself, then refund in Stripe). Tick every box before the first customer call.

**Health**
- [ ] `curl -s https://callcatch.co/api/health | jq` → every vendor `ok: true`.
- [ ] Landing page renders, demo number shown matches `NEXT_PUBLIC_DEMO_NUMBER`, Pixel fires `PageView` (Events Manager → Test events, with your browser).

**Demo line** (only after its TFV is verified; before that expect voice only)
- [ ] Call `TWILIO_DEMO_NUMBER` from your mobile, hear the greeting, hang up. Within 10 s a demo text arrives from the demo number with the business name and "Reply STOP to opt out". Reply "my AC is out" → qualification reply arrives in < 6 s. Reply STOP → confirmation and no further messages. Events Manager shows a `Lead` event with the same `event_id` from Pixel and CAPI (dedup shows 1).

**Signup + billing (test card in test mode first, then live with a real card)**
- [ ] `/signup?plan=starter&interval=month&path=trial` → email + password → redirected to `/billing/checkout` → Stripe Checkout shows "$0 due today, 14-day trial" and collects a card → `/onboarding?checkout=success`.
- [ ] Stripe → Developers → Webhooks → endpoint shows `checkout.session.completed` and `customer.subscription.created` delivered 200. Supabase `subscriptions` row exists with `status='trialing'`, `accounts.plan='starter'`.
- [ ] Repeat with `path=paynow&interval=year` → charged $790 (or $1,490 Pro) immediately; `paid_now=true`. Refund it in Stripe → `charge.refunded` delivered 200.
- [ ] Customer Portal opens from `/billing`, plan switch Starter → Pro prorates, cancel shows "at period end".
- [ ] While subscribed, open `/signup?plan=pro` and `/billing/checkout?plan=pro` → both land on `/billing` with the "you already have a subscription" notice; `POST /api/stripe/checkout` returns 409 `already_subscribed`. Stripe shows exactly one subscription on the customer.

**Onboarding + telephony**
- [ ] Wizard step 2 provisions a toll-free number; Twilio console shows the three webhooks set on it.
- [ ] Step 4 "Finish" submits TFV: `numbers.verification_status='pending'`, `verification_sid` set, Twilio console → Toll-Free Verification lists it.
- [ ] Step 5: forward your own mobile with the carrier code (Verizon `*71<number>`, AT&T `*61*<number>#`, T-Mobile `**61*<number>#`). Click **Test my forwarding**: your mobile rings from the notification number, let it ring, page turns green within 30 s, a `calls` row with `status='test'` exists. Remove forwarding after (`*73`, `##61#`, `##61#`).
- [ ] Step 6: alert phone receives a 6-digit code from the notification number; wrong code rejected; 6th send in 10 minutes rejected (rate limit).
- [ ] Forward again, have a friend call your mobile, let it go to CallCatch: greeting plays, they leave a voicemail, hang up. Within ~60 s you get an alert SMS from the notification number ("Missed call from … — voicemail: … — tap to call back") and the inbox shows the transcript and Haiku summary. Because the number is not yet verified, no text-back goes out and `messages` shows none queued to the caller (or a `queued` row that is released on verification, depending on the number's state).
- [ ] After the customer number verifies (use the seeded demo account's already-verified number if you need to test today): the same call produces a text-back within 10 s; the reply thread qualifies; `leads` row fills `issue/zip/urgency/preferred_window/name`; alert SMS + email arrive; "Booked" in the inbox sets `leads.status='booked'` and `est_value_usd`.
- [ ] Owner takeover: reply from the inbox → `conversations.ai_paused=true`; "Resume AI" flips it back.
- [ ] Quiet hours: set quiet hours to now, trigger a missed call → message row `status='queued'` with `send_after` set; run the followups cron below → still queued (correct), move quiet hours away → cron sends it.

**Lead intake (Pro)**
- [ ] Email a fake web-form lead to `acct-<code>@leads.callcatch.co` → Resend webhook 200 → `leads` row → instant SMS (if verified) or email reply + owner alert.
- [ ] `curl -X POST https://callcatch.co/api/leads/webhook/<accountCode> -H "X-CallCatch-Secret: <secret>" -H "Content-Type: application/json" -d '{"name":"Test Lead","phone":"+15125550123","message":"water heater leaking","zip":"78704"}'` → 200 and a lead; wrong secret → 401.
- [ ] `curl "https://callcatch.co/api/meta/leadgen?hub.mode=subscribe&hub.verify_token=$META_WEBHOOK_VERIFY_TOKEN&hub.challenge=123"` → `123`; wrong token → 403.

**Crons** (replace the secret; each must return 200 JSON and log a run)
```bash
S=$CRON_SECRET; B=https://callcatch.co
curl -s -H "Authorization: Bearer $S" $B/api/cron/ai-followups | jq
curl -s -H "Authorization: Bearer $S" $B/api/cron/verification-poll | jq
curl -s -H "Authorization: Bearer $S" $B/api/cron/weekly-report | jq
curl -s -H "Authorization: Bearer $S" $B/api/cron/usage-rollup | jq
curl -s -H "Authorization: Bearer $S" $B/api/cron/dunning | jq
curl -s -o /dev/null -w "%{http_code}\n" $B/api/cron/dunning        # no header → 401
```
- [ ] Weekly report: temporarily set the demo account's timezone so that "now" is Monday 07:xx local, run the cron, receive the email, `weekly_reports` row inserted; run again → no duplicate.

**Security**
- [ ] `curl -X POST https://callcatch.co/api/twilio/sms/inbound -d "From=%2B15551234567&Body=hi"` (no signature) → 403.
- [ ] `curl -X POST https://callcatch.co/api/stripe/webhook -d '{}'` → 400 (signature missing).
- [ ] Log in as a second user with no membership; hitting another account's `/inbox/<conversationId>` returns 404/empty (RLS).
- [ ] Vercel logs show no auth tokens, card data or full message bodies at info level.

**Sign-off**
- [ ] Record the TFV submission dates for the notification + demo numbers in `RUNBOOK.md` §1's tracking table (admin → numbers).
- [ ] Uptime ping on `/api/health` every 5 min (Better Stack / UptimeRobot free tier) to `hello@callcatch.co` + SMS.
- [ ] Set a calendar reminder for day 5 after each TFV submission (escalation, `RUNBOOK.md` §1).

## 9. Internal account and CallCatch's own numbers (required for the demo line)

The public demo line (`/api/demo/call`) and the alert line both need a `numbers` row so inbound webhooks can resolve
them (`purpose = 'demo'` and `purpose = 'notification'`). They belong to an **internal account** — sign up with the
founder email, note the account id, then run `supabase/seed_internal_numbers.sql` in the SQL editor after replacing
the account id, the two phone numbers (must equal `TWILIO_NOTIFICATION_NUMBER`, `TWILIO_DEMO_NUMBER`, and
`NEXT_PUBLIC_DEMO_NUMBER`) and the Twilio `PN…` SIDs. Point the demo number's voice webhook at
`/api/demo/call` and its SMS webhook at `/api/twilio/sms/inbound`; the notification number's SMS webhook also goes
to `/api/twilio/sms/inbound` (STOP/HELP handling for owners). Until both numbers are toll-free verified, the demo
line plays its greeting but logs `demo_number_not_configured` instead of texting back.
