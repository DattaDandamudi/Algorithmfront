# Prospecting data & B2B outreach compliance for CallCatch (US HVAC / plumbing / electrical), September 2026

**Scope:** how to build an outbound list of 2-15-tech contractor owners in TX, FL, AZ, GA, NC legally and cheaply, what each record costs to enrich, and which outreach channel is allowed for each record type. All URLs were seen on 2026-09-14. `[V2]` = confirmed only through a secondary source (most primary sites were unreachable from this sandbox); `[U]` = unverified assumption.

## 1. Bottom line

1. **Seed the list from state license boards, not from Google or Yelp.** TX (data.texas.gov), FL (DBPR extract) and AZ (ROC posting list) publish free bulk CSVs of every licensed HVAC/plumbing/electrical contractor with name, license class and address; TX also includes a phone. GA and NC sell full rosters by mail-in form. These are public records with no usage restriction beyond state public-records law, so they are the only fully clean foundation for a marketing database.
2. **Do not warehouse Google Places API output.** The Places API (New) is priced at $20-35 per 1,000 for the phone/website/rating fields, but the Service Terms forbid storing anything except `place_id` (lat/lng for 30 days), so a Places-built prospect table is a contract breach even if every call is paid. Yelp Fusion ($7.99/1k) is cheaper but its API Terms explicitly ban "direct marketing and/or telemarketing" use. Use a Maps scraper ($0.40-$2.10/1k) as a website/rating enrichment layer on top of the license records, accepting a low ToS risk (no contract with Google when logged off; CFAA not implicated for public data per *hiQ* and *Meta v. Bright Data*).
3. **Recommended pipeline cost: about $45-60 per 1,000 raw license records, or roughly $110-150 per 1,000 fully enriched, line-typed, email-verified owner records** (see §4).
4. **Channels:** cold email (CAN-SPAM opt-out model), human-dialed calls to business landlines, human-dialed calls to mobiles with DNC scrub, and postcards are allowed. **Cold SMS is not allowed on any record type** (TCPA prior-express-written-consent, 10DLC carrier rules, and Texas SB 140 since 2025-09-01). No autodialer, no ringless voicemail, no AI voice to any number.

## 2. Data sources compared

| Source | What you get | Cost | Legal status for outbound marketing | Verdict |
|---|---|---|---|---|
| **TX: TDLR "All Licenses" on data.texas.gov** (Socrata dataset 7358-krk7) | Every TDLR license: license type (Air Conditioning Contractor, Electrical Contractor, etc.), number, business name, business county, business address, phone, owner/contact, status; refreshed ~daily `[V2]` | Free CSV/JSON export | Public record | **Primary seed for TX** |
| **FL: DBPR Construction Industry extract** (www2.myfloridalicense.com/construction-industry/public-records/) | Active + inactive CILB licensees by type: CAC (HVAC), CFC (plumbing), CMC (mechanical), EC/ER (electrical, ECLB file), with mailing address, county, status, dates; quote/comma CSV; **no phone or email in the file** `[V2]` | Free | Public record | **Primary seed for FL** (needs phone enrichment) |
| **AZ: ROC Posting List** (roc.az.gov/posting-list, e.g. `ROC_Posting-List_2025-12-24.csv`) | 56,718 active licenses (Dec 2025 file): License No, Business Name, DBA, Class, Class Detail, Class Type (Residential/Commercial/Dual), Address, City, State, Zip, Qualifying Party, Issued, Expiration, Status; **no phone** `[V2]` | Free | Public record | **Primary seed for AZ** (filter classes for HVAC/plumbing/electrical; exact class codes `[U]` — verify on roc.az.gov/license-classifications) |
| **GA: SoS Professional Licensing Boards roster request** (sos.ga.gov/page/licensing-roster-requests-form) | Full statewide roster per board (Conditioned Air, Master/Journeyman Plumbers, Electrical Contractors); **no phone, no email, no personal mailing address; no partial lists**; paid by check/money order; fee `[U]` | Fee `[U]` (typically tens of dollars per roster `[U]`) | Public record | Secondary seed; verify.sos.ga.gov for individual lookups |
| **NC: PHFS Board "Request License Roster"** (public.nclicensing.org) and **NCBEEC active license search** (arls-public.ncbeec.org/Public/Search) | PHFS roster by date range, paid by check only; NCBEEC offers search, no documented bulk file | Fee `[U]` | Public record | Secondary; budget one week of lead time |
| **Google Places API (New)** | Text Search Pro $32/1k, Enterprise $35/1k (adds rating, phone, website, hours); Place Details Pro $17/1k, Enterprise $20/1k, +Atmosphere $40/1k; 1,000 free Enterprise calls per SKU per month since March 2025 `[V2]` | $20-40 per 1k | Service Terms: no caching/storing beyond `place_id` (lat/lng 30 days); no "creating a database" of Places content | **Not usable as a stored prospect DB**; fine for live display |
| **Google Maps scrapers on Apify** (e.g. compass/crawler-google-places $2.10/1k Business tier; scraperlink $0.40/1k) | Name, address, phone, website, rating, review count, category | $0.40-$2.10 per 1k results `[V2]` | Breaches Google Maps ToS for logged-in users; logged-off public scraping is not a CFAA violation (*hiQ v. LinkedIn*, 9th Cir. 2022) and Meta's ToS did not bind a logged-off scraper (*Meta v. Bright Data*, N.D. Cal. Jan 2024). Risk = account bans, not litigation, at this scale `[U]` | **Enrichment layer** for website/rating/review count |
| **Yelp Fusion / Places API** | Starter $7.99/1k, Plus $9.99/1k, Enterprise $14.99/1k, 300-500 calls/day, 30-day trial | $8-15 per 1k | API Terms prohibit use for "unsolicited mass distributions of e-mail" and "direct marketing and/or telemarketing activities" | **Excluded** |
| **Meta Ad Library API** | Only political/social-issue ads outside the EU; `ad_type=ALL` works only for EU/UK `[V2]`; 200 calls/hour | Free | Scraping the web UI breaches Meta ToS | API useless for US contractor ads; use the **web UI manually** by keyword ("AC repair" + city) to tag advertisers |
| **Google Ads Transparency Center** | Search/YouTube/Display ads by advertiser name, payer name (since May 2025); no spend for commercial ads | Free | Manual use only | Manual "spends on ads" tag |
| **Apollo.io** | Free 0; Basic $49/user/mo annual ($59 monthly); Professional $79/$99; credit pools conflict across sources (5,000 vs 30,000/yr on Basic) `[V2]` | $49-99/mo | Licensed data | Owner-email/mobile lookup for the 20% of records with a website; coverage of 2-15-tech shops `[U]`, expect low |
| **ZoomInfo** | Professional ~$14,995/yr, 3-seat minimum, annual only `[V2]` | $15k+ | Licensed | **No** at this stage |
| **Clay** | Launch $185/mo (10,000 credits), Growth $495/mo (25,000); Data Credits vs Actions split since March 2026 `[V2]` | $185/mo | Orchestration | Optional; a Python script plus the vendors below does the same for less |
| **Lusha / Hunter / RocketReach** | Lusha Pro $49/user/mo; Hunter Starter $49/mo = 2,000 credits (~$24.50 per 1k found emails); RocketReach Essentials $25/mo `[V2]` | see §4 | Licensed | Hunter for domain-to-email |
| **Line-type lookup** | Telnyx Number Lookup from $0.0015/lookup; Twilio Lookup Line Type Intelligence $0.008/request `[V2]` | $1.50-$8 per 1k | — | **Mandatory** before any call |
| **Email verification** | NeverBounce $0.008/email under 10k ($8/1k); ZeroBounce $0.008-0.02 pay-go or $99/mo for 25k `[V2]` | $8-20 per 1k | — | Mandatory before sending |

## 3. Recommended pipeline (multi-agent friendly, one script per stage)

1. **Ingest (free).** Nightly job pulls TX Socrata export (filter LICENSE TYPE in Air Conditioning Contractor, Electrical Contractor, Plumbing is TSBPE not TDLR — plumbing for TX comes from the Texas State Board of Plumbing Examiners `[U]` check tsbpe.texas.gov for a roster), FL DBPR CILB/ECLB CSVs, AZ ROC posting CSV. Normalize to `prospects(license_no, state, trade, class, business_name, dba, address, city, zip, county, phone_raw, status, expires)`. Drop inactive/expired, drop classes that are not HVAC/plumbing/electrical, dedupe on normalized name+zip.
2. **Size filter (free).** Keep firms that are companies (LLC/Inc/DBA present) rather than individual journeymen; AZ "Class Type = Residential or Dual" and FL "certified" (CAC/CFC/EC) over "registered" county-scope licenses prioritize established shops. Target ~30-40% of raw rows survive `[U]`.
3. **Web/rating enrichment ($2.10/1k).** Apify Maps scraper by "business name + city": website, rating, review count, category, primary phone. Rule: keep only rating/review count/website/phone; do not store reviews or photos. Review count 20-300 is a proxy for a 2-15-tech shop `[U]`.
4. **Line-type ($1.50/1k Telnyx; $8/1k Twilio).** Tag every phone `landline | fixed_voip | non_fixed_voip | mobile`. This tag drives the channel matrix in §5.
5. **DNC scrub (mobiles only).** National DNC registry access: free for up to 5 area codes, then per-area-code annual fee (2025 fee schedule `[U]`; budget $80/area code). Scrub only mobile-tagged numbers; keep an internal DNC list for every number.
6. **Owner email ($24.50/1k found + $8/1k verify).** Hunter Domain Search on website domains; fall back to Apollo Basic for the owner name. Verify with NeverBounce; send only `valid`, never `catch-all` on a new domain.
7. **Ad-spend signal (manual, free).** Founder or a VA spends 1 hr/week in Meta Ad Library and Google Ads Transparency Center per metro, tagging advertisers `spends_on_ads = true`. These are the ICP ("already spends on LSA/Meta"). Google LSA badge presence can be checked by search `[U]`.
8. **Suppression and consent log.** Every email opt-out, verbal "don't call", STOP or complaint written to `suppressions` within 24 h (law allows 10 business days for both CAN-SPAM and TCPA revocation; do it same day).

## 4. Cost per 1,000 records

| Stage | Vendor | Cost / 1,000 in | Notes |
|---|---|---|---|
| License-board seed (TX/FL/AZ) | state portals | $0 | GA/NC rosters: one-time fee `[U]`, no phones |
| Maps enrichment | Apify Compass | $2.10 | or $0.40 on the cheapest actor; quality `[U]` |
| Line-type | Telnyx | $1.50 | Twilio LTI $8.00 |
| DNC scrub | FTC registry | ~$0 amortized | 5 free area codes covers 1 metro |
| Email find | Hunter Starter | ~$24.50 per 1k *found*; at ~40% find rate ≈ $10 per 1k records `[U]` | |
| Email verify | NeverBounce | $8.00 per 1k emails ≈ $3.20 per 1k records | |
| Owner name/mobile (optional) | Apollo Basic | $49-59/mo flat | credits, not per-record |
| **Total, raw record → callable + emailable** | | **≈ $17-25 per 1,000 raw records** (before the ~35% keep-rate); **≈ $50-70 per 1,000 kept ICP records**; add Apollo and it lands **≈ $110-150 per 1,000 fully enriched owner records** `[U]` | vs Google Places Enterprise $35 per 1k *per field group* with no right to store, or ZoomInfo $15k/yr minimum |

For the financial model's outbound line (~250 dials/week ≈ 1,000 dials/month), the list budget is under $100/month all-in, which is negligible against the $14.80 COGS line.

## 5. Compliance: which channel is allowed per record type

### Federal rules that matter

- **CAN-SPAM (email).** Opt-out model, no B2B exemption: truthful header and subject, identify as an ad, physical postal address (street, USPS PO box or CMRA box), working unsubscribe honored within 10 business days, no sending after opt-out. Civil penalty up to $53,088 per email (2025 inflation figure) `[V2]`. One-to-one, plain-text cold email from a person is compliant if these six items are present.
- **TSR B2B exemption (16 CFR 310.6(b)(7)).** Calls to a business to induce a purchase *by the business* are exempt from the TSR and the **National Do-Not-Call Registry**, except sales of nondurable office/cleaning supplies. The 2024 TSR amendments made material misrepresentations in B2B calls a violation and added record-keeping duties `[V2]`.
- **TCPA autodialer/prerecorded rules.** *Facebook v. Duguid* (2021) limits "ATDS" to systems that randomly or sequentially generate numbers; a human dialing from a list is not an ATDS. Prior express **written** consent is still required for any autodialed or prerecorded/AI-voice call or **any marketing text** to a cell phone, and a cell phone used for business is treated as a consumer line by most courts `[V2]`.
- **One-to-one consent rule: dead.** Vacated by the Eleventh Circuit on 2025-01-24 (*Insurance Marketing Coalition v. FCC*); the FCC declined to appeal (April 2025) and in September 2025 issued a final rule deleting the vacated language and restoring the pre-2024 definition of prior express written consent `[V2]`. Irrelevant to CallCatch's outbound (no consent-based texting) but relevant to customers' lead forms: one lead-form consent can again cover multiple named sellers.
- **Revocation rule (47 CFR 64.1200(a)(10)).** In force since 2025-04-11: consumers may revoke by "any reasonable means" (STOP, QUIT, END, REVOKE, OPT OUT, CANCEL, UNSUBSCRIBE, voicemail, email), and callers must honor it within 10 business days; a revocation via text applies to calls too. The **"revoke-all"** clause (one revocation cancels consent for unrelated messages) is waived until **2027-01-31** by a CGB order of 2026-01-06 `[V2]`. CallCatch's own product must implement this for customers' texts.
- **Mailbox-provider rules (not law, but enforced).** Gmail/Yahoo (Feb 2024) and Microsoft (May 2025): SPF+DKIM+DMARC, RFC 8058 one-click unsubscribe, spam complaints < 0.3% (target < 0.1%), bounces < 2%; failure now means rejection, not spam-foldering `[V2]`. Stay under 5,000/day/domain (bulk-sender threshold) — at CallCatch's volume that is automatic.

### State overlays for the five launch states

| State | Rule | Effect on CallCatch outbound |
|---|---|---|
| **TX** | SB 140 (eff. 2025-09-01) makes sales *texts* "telephone solicitations" under Bus. & Com. Code ch. 302: SoS registration (Form 3401, $200/yr, $10,000 bond) and DTPA private right of action with treble damages; Nov 2025 AG settlement exempts consent-based texting. Whether B2B texts/calls are exempt under ch. 302 `[U]` — get counsel before any Texas texting | **No cold SMS in TX, full stop.** Human-dialed calls to business lines: proceed; log purpose as B2B |
| **FL** | FTSA as amended by HB 761 (2023): written consent needed only for *unsolicited* autodialed calls/texts; broad "autodialer" definition (any automated selection or dialing); STOP must be honored within 15 days; B2B/EBR exempt from automated provisions `[V2]` | Human click-to-dial only; no dialer that auto-selects numbers; no cold texts |
| **AZ** | HB 2498 added texts to the telemarketing statute (effective April `[U]` year); telemarketer registration with SoS (annual, expires June 30) and $100,000 bond for solicitations into AZ `[V2]`; B2B exemption `[U]` | Verify the AZ B2B exemption before calling AZ mobiles; no texts |
| **GA** | 2024 amendments removed damage caps and the "knowing" element, added vicarious liability and class actions; B2B communications exempt `[V2]` | Calls OK on business lines; no texts |
| **NC** | No enacted mini-TCPA as of Sept 2026 `[V2]`; federal rules govern | Federal matrix applies |

### Channel matrix

| Record type (after §3 step 4) | Cold email | Human-dialed call | Autodialer / prerecorded / AI voice | Cold SMS / MMS | Ringless VM | Postcard |
|---|---|---|---|---|---|---|
| Business **landline** or **fixed VoIP** on license/Maps record | Yes (CAN-SPAM) | Yes; TSR/DNC exempt as B2B; keep internal DNC; 8am-9pm local | No | No | No | Yes |
| **Mobile** number listed as the business line (common for 1-5 truck shops) | Yes | Yes, manual dial only, scrub National DNC first, no dialer that auto-selects (FL/AZ), never after "don't call" | No | No | No | Yes |
| **Non-fixed VoIP** (Google Voice etc.) | Yes | Yes, treat as mobile | No | No | No | Yes |
| Owner **personal** mobile from Apollo/Lusha | Yes (work email only) | Only manual, DNC-scrubbed, and only about the business; avoid in FL/AZ/TX until counsel clears `[U]` | No | No | No | n/a |
| Owner **personal** email | Avoid `[U]` (still legal under CAN-SPAM but hurts domain reputation) | — | — | — | — | — |
| Any number/email on `suppressions` | No | No | No | No | No | Yes (mail is unregulated) `[U]` |
| Inbound reply / demo request (consent captured with SMS disclosure) | Yes | Yes | Still no prerecorded | **Yes, transactional/conversational** (Twilio 10DLC or toll-free verified) | No | Yes |

Practical rules of thumb: 1 email + 1 call + 1 postcard per record in 14 days, then a 90-day hold; all calls from a named human with company name in the first 10 seconds and a real callback number; record the disposition, line type, and date on every attempt (the 2024 TSR amendments require 5-year records `[U]`).

## 6. What to set up this week

1. Stripe-fee-level budget: $49 Hunter Starter, $39 Smartlead Base (2,000 leads, unlimited mailboxes), 3 Google Workspace mailboxes on 2 secondary domains ($6-18/inbox), $49 Apollo Basic (month 2), $5 Apify, $5 Telnyx. Under $200/month.
2. Write `ingest_tx.py`, `ingest_fl.py`, `ingest_az.py` (CSV → Supabase `prospects`), `enrich_maps.py`, `linetype.py`, `emails.py`, `suppress.py`; run as a nightly cron from the existing Vercel/Supabase stack.
3. Register a physical mailing address (CMRA box) for CAN-SPAM footers; publish the internal DNC policy page; add "Reply STOP / don't call" handling to the outbound inbox before the first send.
4. Mail the GA and NC roster request forms with checks now; they arrive in 2-4 weeks `[U]`.
5. Ask counsel one bounded question ($300-500): "Do TX ch. 302, AZ 44-1271 et seq. and FL FTSA exempt human-dialed B2B calls to mobile numbers listed as the business line?" Until answered, call only landline/fixed-VoIP records in TX/AZ/FL.

## 7. Sources (all seen 2026-09-14)

- Google Places API pricing tiers: https://www.woosmap.com/blog/google-places-api-pricing ; https://openplacesapi.com/blog/google-places-api-pricing ; https://www.safegraph.com/guides/google-places-api-pricing/ ; March 2025 per-SKU free caps: https://developers.google.com/maps/billing-and-pricing/march-2025
- Google Maps Platform caching/no-database terms: https://cloud.google.com/maps-platform/terms/maps-service-terms ; https://developers.google.com/maps/documentation/places/web-service/policies ; https://openplacesapi.com/blog/can-you-store-places-api-results
- Apify Google Maps scrapers: https://apify.com/compass/crawler-google-places ; https://apify.com/scraperlink/google-maps-scraper
- Yelp Fusion pricing and terms: https://business.yelp.com/data/resources/pricing/ ; https://docs.developer.yelp.com/docs/places-faq ; https://terms.yelp.com/developers/api_terms/20250113_en_us/ ; https://docs.developer.yelp.com/docs/policies
- TX TDLR open data: https://data.texas.gov/dataset/TDLR-All-Licenses/7358-krk7 ; https://www.tdlr.texas.gov/LicenseSearch/licfile.asp
- FL DBPR extracts: https://www2.myfloridalicense.com/construction-industry/public-records/ ; https://www2.myfloridalicense.com/public-records-read-medisclaimer/
- AZ ROC posting list: https://roc.az.gov/posting-list ; https://roc.az.gov/sites/default/files/ROC_Posting-List_2025-12-24.csv
- GA roster requests: https://sos.ga.gov/page/licensing-roster-requests-form ; https://sos.ga.gov/licensing-division-license-lookup
- NC boards: https://public.nclicensing.org/ ; https://arls-public.ncbeec.org/Public/Search
- Meta Ad Library API limits: https://adlibrary.com/posts/meta-ad-library-api-limitations ; https://swipekit.app/articles/meta-ad-library-api ; Google Ads Transparency Center: https://www.adsinsightpro.com/blog/google-ads-transparency-center-guide/
- Apollo pricing: https://www.landbase.com/blog/apollo-pricing ; https://salesmotion.io/blog/apollo-pricing ; ZoomInfo: https://scalelist.com/zoominfo-pricing/ ; Clay: https://www.cleanlist.ai/blog/2026-03-12-clay-pricing-changes-2026 ; Lusha/Hunter: https://www.cognism.com/blog/lusha-pricing ; https://marketbetter.ai/blog/hunter-io-pricing-breakdown-2026/
- Line type: https://www.twilio.com/docs/lookup/v2-api/line-type-intelligence ; https://telnyx.com/pricing/number-lookup ; email verification: https://puzzleinbox.com/blog/neverbounce-pricing-guide/ ; https://mailvalid.io/blog/the-real-cost-of-email-verification-in-2026
- Cold email tooling: https://woodpecker.co/blog/instantly-ai-pricing/ ; https://www.artisan.co/blog/instantly-vs-smartlead-which-should-you-choose-in-2026 ; sender rules: https://powerdmarc.com/bulk-email-sender-requirements/
- CAN-SPAM: https://www.ftc.gov/node/41978 ; https://www.adaptivesecurity.com/blog/can-spam-act-requirements
- TSR B2B exemption: https://www.law.cornell.edu/cfr/text/16/310.6 ; https://www.ftc.gov/business-guidance/resources/complying-telemarketing-sales-rule ; https://www.ftc.gov/system/files/ftc_gov/pdf/r411001_tsr_final_rule_2024.pdf ; https://www.dnc.com/faq/are-b2b-calls-exempt-tcpa-regulations
- TCPA/Duguid and B2B cell phones: https://supreme.justia.com/cases/federal/us/592/19-511/ ; https://skipcall.io/en/blog/cold-calling-cell-phones ; https://covelaw.com/b2b-calls-exemptions-the-dnc-list/
- One-to-one consent vacatur/repeal: https://www.daypitney.com/eleventh-circuit-vacates-fccs-one-to-one-consent-rule ; https://www.consumerfinancialserviceslawmonitor.com/2025/09/fccs-final-rule-on-consent-kills-one-to-one-consent-requirement/ ; https://www.womblebonddickinson.com/us/insights/blogs/fcc-repeals-one-one-consent-rule-following-eleventh-circuit-decision
- Revocation rule and revoke-all delay: https://www.bclplaw.com/en-US/events-insights-news/the-tcpas-new-opt-out-rules-take-effect-on-april-11-2025-what-does-this-mean-for-businesses.html ; https://www.fcc.gov/document/cgb-extends-effective-date-tcpas-consent-revocation-rule ; https://www.burr.com/telephone-consumer-protection-act/the-fcc-delays-effective-date-of-tcpa-revoke-all-rule-until-january-31-2027
- Texas SB 140: https://www.paulhastings.com/insights/ph-privacy/marketing-texts-in-texas-sb-140-broadens-state-telemarketing-regulations ; https://www.consumerfinancialserviceslawmonitor.com/2025/11/texas-attorney-general-confirms-opt-in-sms-is-outside-registration-under-sb-140/
- Florida FTSA: https://www.quarles.com/newsroom/publications/a-return-to-relative-sanity-amendments-to-the-florida-telephone-solicitation-act ; https://www.fransis.ai/articles/florida-ftsa-text-messaging-rules
- AZ/GA/NC mini-TCPA: https://www.manatt.com/insights/newsletters/tcpa-connect/state-mini-tcpa-telemarketing-laws-continue-to-p ; https://enzodialer.com/resources/compliance/state-mini-tcpa-laws ; https://leadcompliant.com/articles/state-laws/states-filing-their-own-tcpa-equivalent-laws-tracker
- Scraping case law: https://www.quinnemanuel.com/the-firm/news-events/client-alert-meta-v-bright-data-significant-decision-for-web-scraping-industry/ ; https://www.jenner.com/en/news-insights/publications/client-alert-data-scraping-in-hiq-v-linkedin-the-ninth-circuit-reaffirms-narrow-interpretation-of-cfaa
