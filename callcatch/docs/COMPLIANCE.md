# Compliance

Scope: SMS consent (TCPA / CTIA / carrier rules), Twilio Toll-Free Verification, 10DLC for sole proprietors, Meta App Review. This document is operational guidance written by a non-lawyer. **The legal characterization of any message as "informational" vs "marketing" is `[U]`; have counsel review §1-§4 before month 2 (spec §5, budget $300-500 `[U]`, week 10 of `LAUNCH_PLAN_90_DAYS.md`). Nothing here is legal advice.**

---

## 1. Consent model

CallCatch only texts people who initiated contact with the business. Two consent sources, each stored per contact in `contacts.consent_source` + `contacts.consent_evidence`:

| Source | How consent arises | Evidence stored | First message must |
|---|---|---|---|
| **Caller-initiated** (`inbound_call`) | The homeowner dialed the business's published number; the call forwarded to CallCatch; the greeting says a text is coming. | `{ call_sid, from, to, forwarded_from, started_at, greeting_version }` | Identify the business, say it is an automated assistant, include "Reply STOP to opt out" |
| **Form-initiated** (`lead_form` / `web_form`) | The homeowner submitted the business's web form or Meta Instant Form that carries the SMS disclosure the customer agreed (in our ToS) to add. | `{ form_id or url, submitted_at, disclosure_text, raw payload hash }` | Same, plus reference the form ("you asked about…") |
| Manual (`manual`) | Owner types a number into the inbox to start a thread. | `{ user_id, typed_at }` | Owner-authored only; the AI does not initiate manual threads |

Rules enforced in code, not by the model (spec §4.4):
- Never message a contact with `opted_out=true`.
- Never send outside quiet hours **08:00-21:00 local** (queued via `messages.send_after`).
- Max **3 unanswered** outbound messages per conversation; max **8 AI turns** then hand-off.
- First outbound always contains the business name + STOP language.
- Emergency keywords → fixed template + voice call to owner; the AI does not improvise safety advice.
- Owner alerts go from our own verified number to our own subscriber — our brand messaging our customer.
- Each end business is its own TFV (or 10DLC brand). No shared sending number, no shared campaign.

The customer's obligations are in the ToS and SMS Terms: keep the forwarding greeting enabled, add the disclosure line to any form they route to us, and not upload lists.

**Required disclosure line on customer forms (verbatim in the ToS and the onboarding step 4):**
> By submitting this form you agree that *[Business]* may call or text you at the number provided about your request. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.

## 2. Voice greeting (informational, not telemarketing)

> "Hi, you've reached *[Business]*. Sorry we missed you — we'll text you at this number in a few seconds so we can help. You can leave a message after the tone, or just hang up."

Recorded via `<Say>` (Polly voice per tone setting) then `<Record maxLength="120">`. Test-forwarding calls use the same greeting with "This is a CallCatch test" prefixed.

## 3. Exact sample messages

All messages ≤ 160 GSM-7 characters where possible (one segment). `*[Business]*` = `accounts.dba` or `legal_name`.

### 3.1 First text-back (missed call)
> Hi, this is the automated assistant for *[Business]* — sorry we missed your call. What's going on, and what's the address? Reply STOP to opt out.

### 3.2 First text-back (web / Meta form, Pro)
> Hi *[First name]*, this is the automated assistant for *[Business]* — thanks for your request about *[topic]*. What's the address, and how soon do you need someone? Reply STOP to opt out.

### 3.3 Qualification turns (order: issue → address/ZIP → urgency → window → name)
> Got it — *[issue restated in ≤ 8 words]*. What's the ZIP or street address so we can check the service area?

> Thanks. Is this an emergency, something for today, or can it wait a few days?

> Would mornings or afternoons work better, and which day? We'll confirm the exact window when the office calls.

> And your name, so the office knows who to ask for?

> Perfect, *[Name]*. *[Owner first name]* at *[Business]* has your details and will call you at this number shortly. *(Pro, if booking link:)* You can also pick a time here: *[booking URL]*

Rules for the model: no prices unless the profile's "starting at" ranges are enabled; no ETAs; no diagnosis; never claim to be a person; if asked "is this a bot?" answer "Yes — I'm *[Business]*'s automated assistant; the owner will call you."

### 3.4 STOP / HELP / START replies
- STOP (and STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT):
  > You've been unsubscribed from *[Business]* texts and won't receive any more. Reply START to opt back in.
- HELP:
  > *[Business]* texting via CallCatch. Reply STOP to opt out. Msg & data rates may apply. Help: *[business phone]* or help@callcatch.co
- START / UNSTOP:
  > You're re-subscribed to *[Business]* texts. Reply STOP any time to opt out.

Twilio's built-in opt-out handling sends its own default replies unless disabled; we keep Twilio's default **on** for the carrier-level block and suppress our duplicate reply when Twilio's `OptOutType` parameter is present in the inbound webhook.

### 3.5 Emergency template (hard-coded; sent on keyword match, model not consulted)
> If anyone is in danger or you smell gas, leave the building and call 911 or your gas utility now. *[Business]* is being called right now about your emergency and will reach you at this number. Reply STOP to opt out.

Followed by an immediate outbound voice call to `on_call_phone` (Pro) or `alert_phone` with: "CallCatch emergency: a caller at *[number]* reported *[keyword]*. Press 1 to call them now."

### 3.6 Nudges (max 2, quiet hours respected, 20 min and 24 h after an unanswered first text)
> Still here if you need *[Business]* — just reply with what's going on and the address. Reply STOP to opt out.

### 3.7 Owner alert (from our notification number to the subscriber)
> CallCatch: missed call from (512) 555-0134 — "AC not cooling, 78704, wants today". Call now: tel:+15125550134 · Thread: callcatch.co/i/abc123

### 3.8 Demo line thread (from `TWILIO_DEMO_NUMBER`, caller-initiated by dialing the demo)
> Hi — this is CallCatch. You just called our demo line and we didn't answer, so this is what your customers would get. What kind of shop do you run: HVAC, plumbing or electrical? Reply STOP to opt out.

## 4. Quiet hours

- Default `quiet_start 08:00`, `quiet_end 21:00` in the account's `timezone`; editable in Settings.
- Outbound customer-facing SMS outside the window is inserted with `status='queued'`, `send_after = next 08:00 local`; `/api/cron/ai-followups` releases it.
- Exception: a **reply** to an inbound message received inside quiet hours is allowed within 5 minutes of the inbound (the homeowner is awake and asked); nudges are never sent in quiet hours.
- Owner alerts are not customer-facing and follow the owner's own quiet-hours setting (default: always on for emergencies, 07:00-22:00 for the rest).

## 5. Toll-Free Verification — field-by-field mapping

API: `POST https://messaging.twilio.com/v1/Tollfree/Verifications` (`/api/onboarding/submit-verification` builds this from the account row). Business Registration Number (EIN) is mandatory since early 2026 `[V]`.

| TFV field | Source | Value / rule |
|---|---|---|
| `TollfreePhoneNumberSid` | `numbers.twilio_sid` | The customer's number |
| `CustomerProfileSid` | `TWILIO_ISV_PROFILE_SID` | Our ISV profile (Twilio then treats the submission as on behalf of an end business) |
| `BusinessName` | `accounts.legal_name` | Exactly as on the IRS EIN letter |
| `BusinessRegistrationNumber` / `BusinessRegistrationIdentifier` | `accounts.ein` | 9 digits, `EIN` |
| `BusinessWebsite` | `accounts.website` | Must resolve over HTTPS; fallback = the account's public CallCatch page `https://callcatch.co/for/<trade>?biz=<code>` |
| `BusinessStreetAddress`, `BusinessCity`, `BusinessStateProvinceRegion`, `BusinessPostalCode`, `BusinessCountry` | `accounts.address_line1/city/state/zip` | `US` |
| `BusinessContactFirstName/LastName/Email/Phone` | owner user + `accounts.alert_email`, `alert_phone` | The owner, not us |
| `NotificationEmail` | `hello@callcatch.co` | We get the status emails |
| `UseCaseCategories` | fixed | `["CUSTOMER_CARE"]` (fallback `["ACCOUNT_NOTIFICATIONS"]` if a reviewer objects) |
| `UseCaseSummary` | generated | "*[Legal name]* is a residential *[trade]* contractor. When a customer calls the business and the call is not answered, the customer receives an automated SMS from this number acknowledging the missed call and asking for the service issue, address and preferred time so the business can call back. Messages are only sent to people who called the business or submitted its service-request form containing SMS disclosure. Conversational replies only; no promotions." |
| `ProductionMessageSample` | generated | The three messages in §3.1, §3.3 (first turn), §3.4 STOP reply — each with the business name |
| `OptInType` | derived | `VERBAL` for caller-initiated (the greeting announces the text); `WEB_FORM` when the account has a web/Meta form source |
| `OptInImageUrls` | fixed + per account | `https://callcatch.co/sms-terms#opt-in` screenshot (hosted PNG showing the greeting transcript + first message) and, for forms, a screenshot of the customer's form with the disclosure line uploaded in onboarding step 4 (stored in Supabase Storage, public URL) |
| `MessageVolume` | `accounts` monthly estimate | One of Twilio's buckets; default `1,000` (Starter) / `10,000` (Pro) |
| `AdditionalInformation` | fixed | "CallCatch (ISV) provides the platform. Each end business has its own number and verification. STOP/HELP handled automatically. Quiet hours 8am-9pm local." |
| `ExternalReferenceId` | `accounts.id` | For reconciliation |

Our own two numbers use the same payload with CallCatch LLC as the business, `UseCaseSummary` "Account notifications and verification codes to CallCatch subscribers" (notification) / "Interactive product demo initiated by the caller dialing this number" (demo), `OptInType=VERBAL`.

Status mapping (`numbers.verification_status`): `PENDING_REVIEW`/`IN_REVIEW` → `pending`/`in_review`; `TWILIO_APPROVED` → `verified` (sets `sms_enabled`, calls `onVerified`); `TWILIO_REJECTED` → `rejected` with `rejection_reason`.

## 6. 10DLC sole-proprietor path

When `accounts.ein` is empty and `is_sole_prop=true` (onboarding step 1):

1. Provision a **local** number instead of toll-free.
2. Create a Trust Hub **Sole Proprietor** customer profile for the end business under our ISV profile: owner name, mobile (OTP verified by Twilio), address, email. Brand registration $4 + one-time vetting $15 `[V]`.
3. Create a Sole Proprietor **campaign** ($2/mo `[V]`) with use case "Low volume mixed / customer care", the same description and samples as §5, opt-in `VERBAL`+`WEB_FORM`. Vetting 1-7 business days `[V2]`, longer in surges.
4. Attach the number to the campaign via a Messaging Service. Throughput cap ~1,000 segments/day — fine for one truck.
5. Costs pass through to the customer only via the plan; no separate line item.
6. The same fallback is offered when TFV median exceeds 8 days (`RISKS.md` #1).

## 7. Twilio ISV prerequisites (ours)

Live before submitting the ISV profile: `https://callcatch.co/terms`, `/privacy`, `/sms-terms` (program name, message types, frequency "varies", "Msg & data rates may apply", STOP/HELP, support contact, carriers not liable), `/refund`, `/data-deletion`. LLC docs + EIN letter as PDFs. Founder as authorized representative with a phone that answers.

## 8. Meta App Review submission script

Submit by **Day 4** (Sep 18) from the seeded demo account; expect ~20 days per cycle, a rejection restarts the clock `[V]`. Business Verification must be complete first.

**App:** Business type, "CallCatch Lead Sync". Products: Facebook Login for Business, Webhooks (Page → `leadgen`).

**Permissions requested and the one-line justification for each:**

| Permission | Justification text |
|---|---|
| `leads_retrieval` | "Retrieve the lead's name, phone and answers from Instant Forms on the customer's own Page in real time so our service can text the lead back within seconds on the customer's behalf." |
| `pages_show_list` | "Let the customer pick which of their Pages to connect during onboarding." |
| `pages_manage_ads` | "Read the Page's lead forms (form ids/names) so the customer can select which forms feed their inbox." |
| `pages_read_engagement` | "Read Page metadata (name, id) to display the connected Page and validate leadgen webhook payloads." |
| `pages_manage_metadata` | "Subscribe the connected Page to the `leadgen` webhook so lead notifications reach our server." |

**Screencast checklist (one ≤ 3-minute video, English captions, no cuts inside a step):**
- [ ] Start logged out at `https://callcatch.co`, log in as `demo@callcatch.co`.
- [ ] Settings → Integrations → "Connect Facebook Page" → the Facebook Login for Business dialog shows every permission above → accept.
- [ ] Page picker lists the test Page → select it → form picker lists its lead forms → select one → "Subscribed" badge.
- [ ] In a second tab: Meta Lead Ads Testing Tool (developers.facebook.com/tools/lead-ads-testing) → submit a test lead for that Page/form.
- [ ] Back in CallCatch: the lead appears in `/leads` within seconds with name/phone, and the inbox shows the outbound SMS (use the seeded verified number so a real text goes to the founder's phone; show the phone on camera).
- [ ] Show `/settings?tab=sources` → "Disconnect" → the Page subscription is removed (demonstrates `pages_manage_metadata` cleanup).
- [ ] Show `https://callcatch.co/data-deletion` and the in-app "Delete my account" button.

**Written notes for the reviewer:** step-by-step matching the video; test user credentials (create a Test User under App Roles with a Page and a lead form); explain that the app only acts on Pages the customer administers and stores lead fields for the customer's own CRM use; no data is used for ads targeting.

**Required URLs:** Privacy `https://callcatch.co/privacy` (must mention Facebook data, retention, deletion), Terms `https://callcatch.co/terms`, Data deletion `https://callcatch.co/data-deletion` (instructions page; a callback URL is optional — if used, implement the signed-request handshake).

**Common rejection causes:** video shows an error state; permission requested but not demonstrated (each one must be visibly used); login dialog not shown; privacy policy missing "deletion" language; app in Development mode with a non-test user.

After approval: switch the app to **Live** mode, set `FEATURE_META_LEADGEN=true`, migrate Pro customers off Zapier one by one on a call, keep Zapier as the fallback path.

## 9. TCPA note

TCPA (47 U.S.C. § 227) and the FCC's rules restrict autodialed/prerecorded calls and texts without the recipient's consent; the 2025 FCC one-to-one consent rule was vacated, and the "informational vs. marketing" boundary, the status of AI-generated texts, and state mini-TCPA laws (e.g. Florida, Oklahoma) keep moving. Our design choices (only respond to people who contacted the business, identify the business, STOP honored instantly, quiet hours, consent evidence per contact) are the conservative industry pattern, not a legal opinion. **Consult counsel** before the month-2 review; have counsel check the SMS Terms, the disclosure line in §1 and the nudge cadence in §3.6. `[U]`
