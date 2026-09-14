# Runbook (on-call)

Solo founder is on call. Severity: **P1** = customers' texts or alerts not going out, billing charging wrongly, data exposure; **P2** = one customer degraded; **P3** = cosmetic / delayed. P1 gets worked immediately; P2 within the business day; P3 in the weekly review.

Where to look first: Vercel → Logs (filter by route), Twilio → Monitor → Debugger, Stripe → Developers → Events, Supabase → Logs → Postgres, `/api/health`, `/admin`.

---

## 1. Toll-Free Verification pending > 5 business days

Trigger: `/api/cron/verification-poll` emails admins when `numbers.verification_submitted_at` is older than 5 business days and `verification_status in ('pending','in_review')`. Twilio quotes "a few days to a week or more" `[V]`; operators report 3-10 business days.

1. [ ] Confirm status in Console → Messaging → Regulatory Compliance → Toll-Free Verification (or `GET /v1/Tollfree/Verifications/{sid}`). If `TWILIO_REJECTED` go to §2.
2. [ ] Check the customer is not blocked on us: the account's status is `pending_verification`, alerts/voicemail are working (they have day-0 value), and the "verification in progress" banner is showing.
3. [ ] Open a Twilio support ticket (Console → Help → Support → Messaging → Toll-Free Verification) with this template:

   > **Subject:** Toll-Free Verification pending 5+ business days — SID `HH…`
   >
   > Hello, we are an ISV (Trust Hub Primary Business Profile `BU…`) submitting verifications on behalf of our end business customers. Verification `HH…` for number `+1888…` (end business: *Legal Name, EIN on file*) was submitted on *date* and is still in `PENDING_REVIEW` after *n* business days. Use case: customer-initiated missed-call text-back for a home-service contractor; opt-in is caller-initiated and documented at `https://callcatch.co/sms-terms`. Sample messages, opt-in flow and volume estimate are in the submission. Could you confirm whether any additional information is needed, or provide an ETA? Thank you.

4. [ ] Tell the customer the same day (template): "Carrier verification for your number is taking longer than usual. Your alerts and voicemail transcripts are live; texting turns on automatically the moment it clears and your billing starts that day. I've escalated it with the carrier and will update you by *date*."
5. [ ] Log the ticket id in `admin_notes` for the account. Re-check daily. If a customer passes **10 business days**, offer the 10DLC local-number path (§2 step 5) as an interim second line.
6. [ ] Track the median days-to-verified in `/admin`. If the median exceeds **8 days after 10 submissions**, switch the default in onboarding to local numbers + 10DLC standard brand (spec §11 risk 1) — integrator change, file it.

## 2. TFV rejected

Trigger: verification status `TWILIO_REJECTED`; `numbers.rejection_reason` filled by the poll/webhook; admin email.

Common rejection reasons and fixes (`COMPLIANCE.md` §5 has the full field mapping):

| Rejection text | Fix |
|---|---|
| Business name / EIN mismatch | `legal_name` must match the IRS letter exactly (punctuation, "LLC"). Re-collect from the customer. |
| Website unreachable / no SMS terms | Customer site must resolve; if they have none, use `https://callcatch.co/for/<trade>?biz=<code>` (their public CallCatch profile page) and ensure the opt-in language is visible. |
| Opt-in not clear / missing opt-in image | Set `optInType=VERBAL` for call-initiated plus the screenshot URL of the forwarding greeting + first message disclosure page (`https://callcatch.co/sms-terms#opt-in`). For form-initiated, `WEB_FORM` with a screenshot of the customer's form showing the disclosure checkbox. |
| Sample messages missing business name or STOP | Regenerate with the account's DBA and "Reply STOP to opt out" on the first message. |
| Use-case category inconsistent with description | Category `CUSTOMER_CARE` (or `ACCOUNT_NOTIFICATIONS` if Twilio pushes back); description must say "customer-initiated". |
| Volume too high for a new business | Lower `messageVolume` to `1,000` (monthly). |

1. [ ] Fix the account fields in `/admin` → account → Compliance (or ask the customer in the app; the wizard step 4 is re-openable).
2. [ ] Resubmit from the app (admin "Resubmit verification" button → `/api/onboarding/submit-verification`). A new `verification_sid` is stored; the old one stays in `verification_events`.
3. [ ] If rejected twice for the same reason, open a support ticket quoting both SIDs and the fix applied.
4. [ ] If the customer has **no EIN** (sole prop): move them to the 10DLC sole-proprietor path — buy a local number, register a Sole Proprietor brand ($4 + $15 vetting `[V]`) and campaign ($2/mo `[V]`), attach the number; approval minutes-days for brand, 1-7 business days for campaign vetting `[V2]`. Cap 1,000 segments/day.

## 3. Error 30032 / 30007 on outbound SMS

- **30032 "Toll-Free Number Has Not Been Verified"**: the sending number is unverified. `/api/twilio/sms/status` sets `numbers.sms_enabled=false` and emails admins. Investigate why we sent: (a) verification flipped to verified in our DB but Twilio disagrees (re-poll the SID, correct `verification_status`), or (b) a manual send from the inbox bypassed the guard (bug: file it). Re-queue the failed message rows once verified (`messages.status='queued'`, `send_after=null`).
- **30007 "Message filtered"**: carrier spam filtering on a verified number. Look at the body: URLs from public shorteners, all-caps, "$$$", or too many messages to the same handset. Fixes: use the full `callcatch.co` link, reduce nudges, ensure the business name is in the message. If it persists across contacts on one number, open a Twilio ticket with 5 message SIDs; carriers can be asked to review. Do **not** rotate numbers to evade filtering — it violates TFV terms.
- **30034 (unregistered 10DLC)** on a local number: campaign not attached; fix in Messaging → Services → the customer's service → Sender pool.
- **21610 (recipient opted out)**: correct behavior; make sure `contacts.opted_out=true` was set. If not, set it and file a bug.

## 4. STOP / complaint handling

- STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT: Twilio's default opt-out handles the carrier-level block; our `/api/twilio/sms/inbound` also sets `contacts.opted_out=true, opted_out_at=now()` and closes the conversation. Verify both happened. Nothing further is sent to that contact from that number, ever, unless they text START.
- **A homeowner complains to the customer or to us** ("why is your bot texting me"):
  1. [ ] Find the contact in `/admin` → search phone. Confirm `consent_source` and `consent_evidence` (call SID + timestamp, or form id + disclosure text).
  2. [ ] Opt them out immediately regardless of merit.
  3. [ ] Reply (email or via the customer): "We're sorry for the bother. That text was sent because a call was placed from your number to *Business* on *date/time* and went unanswered; we have removed your number and you will not hear from that service again."
  4. [ ] Log in `admin_notes`. If we cannot show consent evidence, treat as P1 and audit the intake path that created the contact.
- **Carrier complaint / complaint-rate warning from Twilio**: pause `sms_enabled` on the affected number, review the last 50 outbound messages for that number, fix the cause (usually nudges to non-responders — cap is 3 unanswered outbound), reply to Twilio within 24 h with the remediation.

## 5. Emergency-message audit

The AI never handles emergencies alone: keyword hits (gas, smell, sparks, flooding, no heat with infant/elderly, CO alarm) trigger a hard-coded template with a safety line and an immediate voice call to the owner / on-call number (spec §4.4).

Weekly (Monday, 15 min):
1. [ ] `/admin` → Emergencies: list `calls.is_emergency=true` and conversations whose messages contain the emergency template in the last 7 days.
2. [ ] For each: was the owner call placed (`alerts.channel='voice'`, status completed)? Did the owner respond within 15 min? Was the template text exactly the approved one (`COMPLIANCE.md` §3.5)?
3. [ ] False negatives: search inbound message bodies for the keyword list where `is_emergency=false`; add missed phrasings to the keyword list (integrator change) and note it.
4. [ ] Any case where the AI gave safety advice beyond the template, quoted a price, or promised an ETA: mark the golden-test suite with that transcript and open a bug. Notify the customer the same day if a homeowner was affected.

## 6. Stripe dunning / `past_due`

Stripe Smart Retries run 4 attempts over 2 weeks; `invoice.payment_failed` → `subscriptions.status='past_due'`; `/api/cron/dunning` sends reminder emails on day 1, 3, 7 and the app shows a banner with an "Update card" portal link.

1. [ ] Day 0-3: automated. Nothing to do unless the customer writes in.
2. [ ] Day 7: personal text from the founder (from the notification number is fine — they are our subscriber): "Hey *name*, your CallCatch card bounced on *date*. Missed-call texts keep running for now; update it here so it doesn't pause: *portal link*."
3. [ ] Day 14 (Stripe marks `unpaid`): the dunning cron sets `accounts.status='paused'`, pauses the AI on every open thread and records which ones (`events` row `dunning_ai_paused` with the conversation ids); voice greeting continues so callers are not dropped. Customer gets the "paused for non-payment" email.
4. [ ] Recovery: when `invoice.paid` / `customer.subscription.updated` arrives with the subscription `active`, the webhook sets `accounts.status='live'` and resumes exactly the threads the cron paused (`dunning_ai_resumed` event) — threads the owner took over stay paused. Confirm the number is still `sms_enabled` and send a "you're back on" note. If a thread the customer expects to be live still shows "AI paused" in the inbox, it was paused by the owner or by safe mode, not by dunning: the owner's "Resume AI" button clears it.
5. [ ] Day 45 unpaid: cancel in Stripe (immediately), release the number after 30 more days (Twilio keeps it billed at $2.15/mo `[V]` until released).

## 6a. "Duplicate Stripe subscription" admin email

Trigger: `lib/billing/sync.ts` received a live subscription event for an account whose `subscriptions` row already tracks a *different* live subscription (Checkout refuses to create a second one, so this means a subscription was created in the Stripe dashboard or a webhook raced a restart). The app keeps mirroring the tracked subscription, ignores the newcomer (`duplicate_subscription_detected` event) and never lets a terminal event for the untracked one flip the account to cancelled.

1. [ ] Stripe → Customer → Subscriptions: identify the one the customer should keep (usually the older, already-paid one — the email names both ids).
2. [ ] Cancel the other **immediately** and refund any charge it made; Stripe sends `customer.subscription.deleted`, which the app ignores for the untracked id (nothing changes for the customer).
3. [ ] If the *tracked* one is the wrong one: cancel it instead — the app then marks the account cancelled — and make any small edit to the survivor in the Stripe dashboard (e.g. add a metadata key `resync=1`): the resulting `customer.subscription.updated` is a new event, so the webhook mirrors the survivor and the account comes back to live/pending_verification. (Resending the old event from Stripe → Events does nothing: the webhook is idempotent on event id.)

## 6b. Trial ending before verification

Trigger: `customer.subscription.trial_will_end` (3 days before `trial_end`) for a self-serve trial with no verified customer number. The webhook extends the trial by 7 days at most **twice** (`grace_extensions` in the subscription metadata; 14-day trial + 14 days of grace = 28 days from checkout), emailing the owner each time ("we extended your trial"). If the customer already clicked cancel (`cancel_at_period_end`), nothing is extended so the cancellation lands on time.

After the second extension the trial ends on schedule and the card is charged, verified or not: the owner gets "your trial ends *date* — verification is still pending" and admins get "Trial ending unverified: *business*" (`trial_ending_unverified` event).

1. [ ] Escalate the verification first (§1 / §2) — the customer has been waiting 3+ weeks.
2. [ ] If verification is still weeks away, extend by hand: Stripe → Subscription → Update → trial end date (no proration), and tell the customer. Or, if they would rather wait: cancel at period end, and re-subscribe them with pay-now when the number clears.
3. [ ] If the card was charged and the number verifies within the money-back window, `onVerified()` starts their first paid month on the verification day for monthly plans; for a charge they dispute, refund per §7.

## 7. Refund within 30 days

Policy: 30-day money-back on any **first** payment; no refunds on renewals; setup fee refundable with the first payment only if setup was not delivered (spec §2).

1. [ ] Verify eligibility: first invoice date ≤ 30 days ago (`subscriptions.created_at`, Stripe invoice). Ask one question only: "Anything we could have done differently?" — log the answer in `admin_notes` (churn reasons feed the product). Note for annual pay-now: the term runs from the checkout date and the days spent in carrier verification were credited to the customer balance on `verified` (`annual_verification_credited` event) — a full refund inside 30 days includes that credit implicitly; outside 30 days the credit stays on the balance for the next invoice.
2. [ ] Stripe → Customer → Subscription → **Cancel immediately** (not at period end), then Payments → the charge → **Refund** full amount. `charge.refunded` + `customer.subscription.deleted` webhooks set `subscriptions.status='canceled'`, `accounts.status='cancelled'`.
3. [ ] Tell the customer: refund posts in 5-10 business days; forwarding removal codes (Verizon `*73`, AT&T `##61#`, T-Mobile `##61#`) so calls stop routing to us; their number is released after 30 days unless they return.
4. [ ] Annual refunds after a partial month: still full refund inside 30 days. Outside 30 days: no refund, offer pause (§8) or plan downgrade.

## 8. Pause up to 2 months

Offered in the cancel flow for the winter dip (spec §2).

1. [ ] Stripe → Subscription → **Pause payment collection** → "Resume automatically on *date*" (≤ 2 months out). Behavior: `customer.subscription.updated` with `pause_collection` set → webhook sets `subscriptions.status='paused'`, `pause_until`, `accounts.status='paused'`.
2. [ ] While paused: no charges, AI and text-back off, voice greeting + voicemail + owner alerts stay on (they cost cents and keep the habit), weekly report says "paused". Number is kept.
3. [ ] Resume: Stripe resumes collection on the date → `updated` webhook → `active` / `live`. Or the customer clicks "Resume now" in `/billing`.
4. [ ] Never pause twice in a row without a conversation; the second request is a cancel in disguise — ask what changed.

## 9. Cancel

1. [ ] Self-serve: Customer Portal → cancel at period end → `cancel_at_period_end=true`; at period end `customer.subscription.deleted` → `canceled` / `accounts.status='cancelled'`; AI and text-back stop; voice greeting is replaced by a plain "this number is no longer in service" after 7 days so callers are not stranded.
2. [ ] Founder call within 24 h of every cancel: offer pause (§8), offer Starter downgrade if Pro, ask for the reason, ask for a referral anyway.
3. [ ] Send forwarding removal codes. Release the Twilio number after 30 days (`/admin` → number → Release) unless the customer asks to keep it reserved (then keep charging $2.15/mo pass-through or waive).
4. [ ] Export their leads to CSV on request (`/leads` → Export) — promise it in the cancel email.
5. [ ] Data deletion request (privacy page): delete `accounts` row (cascades everything), confirm by email within 30 days; keep Stripe records (legal retention).

## 10. Meta ad account disabled → backup switch

1. [ ] Read the reason in Ads Manager → Account Quality. Request review immediately (usually 24-48 h) — most new-account disables are automated and reverse on appeal. Do not create ads elsewhere while the appeal is open if the reason cites policy; do switch immediately if the reason is "unusual activity"/payment.
2. [ ] Backup: the second ad account under the same Business Portfolio (`DEPLOYMENT.md` §5.2). Copy the winning campaign via Ads Manager → Export/Import (or rebuild from `META_ADS.md` §3), pointing at the same Pixel and the backup Page if the primary Page is also restricted. Re-add the Mercury virtual card.
3. [ ] Pacing restarts at week-1 levels (≤ $25-30/day) — the backup account is also "new" to Meta.
4. [ ] Outbound (`SALES.md`) does not depend on Meta; move 5 founder hours from ad management to dials for the week.
5. [ ] If both are disabled: stop paid Meta for 30 days, rely on outbound; consider Google LSA-style search ads only after month 2 review.

## 11. Anthropic API outage → safe template mode

Symptoms: `/api/health` shows `anthropic: false`, `messages` rows for AI turns failing, Vercel logs `529`/`overloaded` or timeouts.

Automatic behavior (module c): on API error or `stop_reason: 'refusal'` the engine sends the **safe template** ("Thanks — got it. *Business* will call you shortly. Reply STOP to opt out.") and escalates to the owner alert instead of crashing; the first text-back never depends on the API.

1. [ ] Check status.anthropic.com. If the outage is > 15 min, set `AI_SAFE_TEMPLATE_MODE=true` in Vercel env (integrator: expose this flag in module c if not present) and redeploy — every AI turn becomes the template + owner alert; conversations are marked `ai_paused=true` with reason `outage` so the owner knows to reply personally.
2. [ ] Fallback model: if only the chat model is degraded, point `CLAUDE_MODEL_CHAT` at the fast model id (`claude-haiku-4-5`) and redeploy; quality drops but turns continue.
3. [ ] When recovered: unset the flag, redeploy, run `/api/cron/ai-followups` by hand, bulk-resume paused conversations from `/admin` (only those paused with reason `outage`).
4. [ ] Post-incident: count affected conversations; email affected owners a one-liner.

## 12. Supabase outage

Symptoms: `/api/health` `supabase: false`, 5xx on every page, Twilio debugger shows 5xx from our webhooks.

1. [ ] status.supabase.com. Twilio retries voice webhooks poorly: a failing `/api/twilio/voice/inbound` means callers hear an error tone. **Mitigation:** in Twilio → each number's Voice config there is a **Primary handler fails** fallback URL — set it at deploy time to a TwiML Bin that says "Sorry, we can't take your call right now, please try again shortly" (`DEPLOYMENT.md` §3 does not set this; add it now for the notification/demo numbers and have module b set it on provisioning — integrator request).
2. [ ] SMS inbound during the outage is retried by Twilio for a limited time; inbound replies may be lost. After recovery, look at Twilio → Monitor → Messaging logs for the window and re-create missing `messages` rows from the log if a conversation depended on them.
3. [ ] Crons will fail loudly (Vercel Cron shows non-200); they are idempotent — run them by hand after recovery in the order followups → verification-poll → dunning.
4. [ ] If the outage exceeds 4 h or is a data incident, restore from the daily backup into a new project and switch `NEXT_PUBLIC_SUPABASE_URL`/keys — note the anon key changes the auth cookies; users re-login.

## 13. Key rotation

Rotate on suspicion of leak, on any contractor offboarding, and every 6 months. Rotate one at a time, redeploy, run the relevant smoke test (`DEPLOYMENT.md` §8).

| Secret | Where | Rotation notes |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` / anon | Supabase → Settings → API → "Generate new JWT secret" | Rotating the JWT secret invalidates **all** keys and sessions; do it off-hours; update both env vars |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → Roll key | Old key can be kept alive 24 h during rollout |
| `STRIPE_WEBHOOK_SECRET` | Webhook endpoint → Roll secret | Same 24 h overlap option |
| `TWILIO_AUTH_TOKEN` | Console → Account → Auth tokens → Create secondary, promote | Signature validation uses it: deploy the new token **before** promoting, or webhooks 403 |
| `ANTHROPIC_API_KEY` | console.anthropic.com → Keys | Create new, deploy, delete old |
| `RESEND_API_KEY` / `RESEND_WEBHOOK_SECRET` | Resend → API keys / Webhooks | Webhook secret: regenerate in the endpoint panel |
| `META_CAPI_ACCESS_TOKEN` | Events Manager → Settings → Generate token | Old token stays valid until deleted in Business Settings → System users |
| `META_APP_SECRET` | App → Settings → Basic → Reset | Leadgen POSTs 403 until deployed |
| `META_WEBHOOK_VERIFY_TOKEN` | Our env | Change in env first, then re-save the webhook subscription in the app dashboard (Meta re-verifies) |
| `CRON_SECRET`, `INTERNAL_API_SECRET` | Our env | Change and redeploy; Vercel Cron picks up the new value automatically |
| Per-account `lead_sources.webhook_secret` | `/settings?tab=sources` → Regenerate | Customer must update Zapier |
| `DEEPGRAM_API_KEY` | Deepgram console | Create new, deploy, delete old |

After any rotation: `git log -p` is not the place to check for leaks — search Vercel logs for the old value's first 6 characters and confirm zero hits.

---

## Incident log

Keep `admin_notes` with `account_id = null` for platform-level incidents: start time, detection, impact (accounts, messages), fix, follow-up. Review at the month-end meeting with `RISKS.md`.


## 13. Message states, limiter counters, and deleted accounts (post-review)

- `messages.status = 'sending'` is the atomic claim taken before the Twilio API call. Rows stuck in `sending` for more than
  10 minutes are swept by `/api/cron/ai-followups` to `failed` / `send_state_unknown` and are **never re-sent**; reconcile in
  the Twilio console by To/From/time before resending manually.
- `error_code` values on `failed` rows: `canceled_by_owner` (owner replied or paused AI first), `superseded` (thread moved on
  before the queued text went out), `send_state_unknown` (sweep above). None of these are delivery failures.
- Alert-code and forwarding-test limiter counters live in `public.rate_limits` (service role only). To clear a stuck
  customer, delete that account's rows in the SQL editor.
- After deleting an `accounts` row (data-deletion request), a still-signed-in user lands on the `/onboarding`
  "No CallCatch account for this sign-in" page with a sign-out button; there is no redirect loop.
- `AI_SAFE_TEMPLATE_MODE=true` (README env table) forces every AI turn to the safe template + owner alert (see §11).
- 10DLC (sole-proprietor) numbers are polled alongside toll-free verifications; escalation emails carry the subject
  "Escalate 10DLC (sole proprietor): …".
