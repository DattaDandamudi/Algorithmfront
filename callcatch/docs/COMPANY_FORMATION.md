# Company formation — week 1

Source: `PRODUCT_SPEC.md` §9. Founder is US-based with an SSN. Everything below is checkable in one day except the bank account and the Twilio/Meta reviews, which run in the background. Costs are `[V2]`/`[U]` as tagged; confirm on the vendor page when you pay.

**Founder cash needed outside the $1,000 ad budget:** ~$300-400 one-time + ~$90/month tools, plus a **$500 buffer** for the Stripe first-payout delay (spec §5, §9).

---

## 1. Entity decision

| | Wyoming LLC (recommended) | Home-state LLC | Delaware C-corp |
|---|---|---|---|
| Formation cost | $100 state `[V2]` + $50-125/yr registered agent `[V2]` | $50-500 depending on state (CA $70 + $800/yr franchise tax; TX $300; FL $125) | $110 + $400/yr franchise tax minimum `[V2]`; legal for 83(b), bylaws |
| Annual | $60 report `[V2]` | varies | franchise tax + separate federal return (1120) |
| Taxes | Pass-through (Schedule C on your 1040); no state income tax in WY | Pass-through; you likely still owe home-state tax and may need to **foreign-register** the WY LLC there if you operate from home (adds $50-300) `[U]` | Double taxation unless QSBS/exit; payroll setup needed to pay yourself |
| Stripe / Twilio TFV / Meta trust | Fine: US entity + EIN + US address | Fine | Fine |
| Raising VC | Convert later (WY → DE conversion is routine) | Convert later | Native |
| Time to form | Same/next business day online `[V2]` | Same day to 2 weeks | Same day via Stripe Atlas ($500) or Clerky |
| **Verdict** | **Do this** unless you live in a state that requires foreign registration and the combined cost exceeds a home-state LLC | Do this if home state is cheap (TX, FL, AZ, GA, NC all fine) and you will not move | Only if you have a signed term sheet |

Sole proprietorship (no entity) is **not** viable: Twilio TFV wants a registered business + EIN, Stripe and Mercury want the entity, Meta Business Verification wants documents. Non-US entities are worse for Stripe US, TFV and Meta trust (spec §9).

## 2. Day-0 checklist (Sep 14, 2026)

| # | Item | Cost | Link | Notes |
|---|---|---|---|---|
| [ ] 1 | Name check: USPTO TESS search "CallCatch"; domain `callcatch.co` / `.com`. Fallbacks `MissedCallBack`, `TextBackHQ` `[U]` | $0 | tmsearch.uspto.gov, domains via Cloudflare Registrar / Namecheap | Free search only; no filing now (`RISKS.md` #13) |
| [ ] 2 | **Wyoming LLC** online, single-member, name "CallCatch LLC" | $100 + agent $50-125/yr `[V2]` | wyobiz.wyo.gov (file yourself) or Northwest Registered Agent / Wyoming Registered Agent | Use the agent's address as principal office if you don't want your home address public. Download the stamped Articles + Certificate of Organization PDF the same day. |
| [ ] 3 | **EIN** at irs.gov (online assistant, instant for SSN holders) | $0 | irs.gov/ein | Responsible party = you. Save the **CP575 letter PDF**: Twilio, Stripe, Mercury all want it. Legal name on it must match #2 exactly. |
| [ ] 4 | **Operating agreement**, single-member, one page | $0 | Template from the registered agent or Northwest's free form | Sign, date, keep with the LLC docs. Banks ask for it. |
| [ ] 5 | **Domain + Google Workspace** | ~$12 + $7/mo `[U]` (Starter) | workspace.google.com | Mailboxes: `hello@` (support, Resend replies), founder, `dmarc@` alias, `demo@callcatch.co` (seed user). Set MX/SPF/DMARC per `DEPLOYMENT.md` §7. |
| [ ] 6 | **Mercury** business checking (or Relay as backup) | $0 | mercury.com | Needs Articles, EIN letter, ID, operating agreement. 1-5 business days `[U]`. Create a **virtual card dedicated to Meta ads** with a $1,000 limit, and a second card for tools. Relay alternative if Mercury declines (new solo SaaS sometimes gets declined). Fund with the $1,000 seed + $500 buffer + ~$400 for one-time costs. |
| [ ] 7 | **Stripe** account under the LLC | 2.9% + $0.30 + 0.7% Billing `[V]` | dashboard.stripe.com | EIN + founder ID + live site. Products/prices per `DEPLOYMENT.md` §2. Statement descriptor `CALLCATCH`. Payouts to Mercury (daily). Publish Terms/Privacy/Refund first (#8) — Stripe reviews the site. |
| [ ] 8 | **Legal pages live**: Terms, Privacy, SMS Terms, Refund (30-day), Data Deletion | $0 (Termly free tier or template) `[U]` | termly.io; app routes `/terms`, `/privacy`, `/sms-terms`, `/refund`, `/data-deletion` | Twilio ISV profile, Meta App Review and Stripe all check these. SMS Terms content: `COMPLIANCE.md` §7. Privacy must mention Facebook data + deletion. |
| [ ] 9 | **Twilio** (evening): upgrade account; **Trust Hub ISV Primary Business Profile** with LLC docs + EIN; buy notification + demo toll-free numbers | ~$20 load; $2.15/mo per number `[V]` | console.twilio.com | Prerequisites: #2, #3, #5 (live site with #8), a founder phone that answers. Details `DEPLOYMENT.md` §3. ISV approval 1-3 business days `[U]`; then submit TFV for both numbers. |
| [ ] 10 | **Meta**: Business Portfolio under the LLC, Page + backup Page, ad account + backup, payment method (Mercury virtual card), domain verification, Pixel, CAPI token; developer app (Business) with Lead Ads; **start Business Verification** | $0 | business.facebook.com, developers.facebook.com | Details `DEPLOYMENT.md` §5, `META_ADS.md` §1. Run $0 in ads until Oct 1. |
| [ ] 11 | **Anthropic** Console key (add $50 credit, set a $200/mo spend limit) | usage | console.anthropic.com | Model ids from `.env.example` |
| [ ] 12 | Set aside: **estimated taxes** 25-30% of net profit; Q4 2026 estimate due **Jan 15, 2027** | — | irs.gov/payments (Direct Pay, 1040-ES) | Book a 30-min CPA intro call in week 2 ($0-150). |

## 3. Days 1-5

| Day | Item | Cost |
|---|---|---|
| [ ] 1-2 | Supabase Pro, Vercel Pro, Resend Pro (domain SPF/DKIM/DMARC; inbound `leads.callcatch.co`), Deepgram (pay-as-you-go), Zapier Professional, Cal.com free (demo booking page linked from the thank-you page) | ~$90/mo (Supabase $25 + Vercel $20 + Resend $20 + Zapier $19.99 + Workspace $7) `[V]`/`[U]` |
| [ ] 2-3 | ISV profile approved → submit TFV for notification + demo numbers (`COMPLIANCE.md` §5) | $0 |
| [ ] 4 | Submit Meta App Review with the seeded demo account screencast (`COMPLIANCE.md` §8) | $0 |
| [ ] 5 | **Bookkeeping**: Wave (free) or Mercury categories + monthly Stripe export. Chart: Revenue (Stripe payouts), Ads (Meta), Telephony (Twilio), Infra (Vercel/Supabase/Resend/Anthropic/Deepgram/Zapier), Formation, Refunds. Reconcile monthly on the 1st with the model review. | $0 |
| [ ] 5 | **FinCEN BOI**: check the current rule for domestic LLCs on formation day (`[U]` rules changed in 2025; domestic reporting companies were exempted in March 2025 — re-verify at fincen.gov/boi) | $0 |
| [ ] 5 | Business license / home-occupation permit: check your city; most SaaS-from-home needs none. Wyoming has no state business license. | $0-50 `[U]` |
| Skip | Insurance (revisit month 3: general liability + tech E&O ~$40-80/mo via Hiscox/Next `[U]`), trademark filing (TESS search only), **sales-tax registration** (SaaS nexus thresholds $100k / 200 transactions per state not reached; Stripe Tax off; revisit at $50k with the CPA `[U]`) | — |

## 4. Twilio ISV profile prerequisites (have these before #9)

- [ ] Legal name exactly as CP575; EIN; principal address (registered agent address is acceptable if it matches Articles).
- [ ] Website `https://callcatch.co` live with Terms, Privacy, **SMS Terms** visible in the footer.
- [ ] Authorized representative: founder, real title ("Founder / Member"), business email on the domain, mobile that answers Twilio's call.
- [ ] Business type LLC, industry Technology / Software, region US, "ISV / reseller" checked.
- [ ] PDFs: Articles/Certificate of Organization, CP575.

## 5. Accounting of the $1,000 seed (and the founder's side cash)

| Bucket | Amount | Source | Rule |
|---|---|---|---|
| Meta ads, Oct (M1) | $750 | seed | `META_ADS.md` §6 pacing: $150 / $175 / $200 / $225 |
| Meta ads, Nov (M2) top-up | $250 | seed | Plus 60% of October collected cash |
| One-time formation + tools | ~$300-400 | founder | LLC $100, agent $50-125, domain $12, Twilio load $20, Anthropic credit $50, misc |
| Monthly tools | ~$90/mo | founder until month 2, then revenue | Supabase, Vercel, Resend, Zapier, Workspace |
| Stripe payout buffer | $500 | founder | Untouched unless a payout is delayed (`RISKS.md` #11) |
| Counsel review (week 10) | $300-500 `[U]` | revenue | `COMPLIANCE.md` §9 |

From month 3, ad spend = 60% of prior-month collected cash, capped at $2,500/mo (`FINANCIAL_MODEL.md`). Every dollar of the seed is spent in Meta Ads Manager on the dedicated virtual card so the ad ledger reconciles to the Mercury statement without allocation.

## 6. Records folder (Google Drive → "CallCatch LLC / Formation")

Articles, Certificate of Organization, EIN CP575, Operating Agreement, registered-agent receipt, Mercury account letter, Stripe activation email, Twilio ISV approval email, TFV submission receipts (with dates — needed for the day-5 escalation), Meta Business Verification confirmation, App Review submission ids, domain receipt, Workspace invoice. Add: monthly Stripe export, Meta invoices, Twilio invoices.
