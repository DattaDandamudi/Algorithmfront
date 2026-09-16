# CallCatch — Competitive landscape, September 2026

**Scope:** missed-call text-back and AI receptionist products a US HVAC / plumbing / electrical owner-operator (2-15 techs) could buy instead of CallCatch ($79 Starter / $149 Pro, $149 optional DFY setup, annual = 10× monthly).
**Date researched:** 2026-09-14. **Method:** WebSearch across vendor pages, G2/Capterra/Trustpilot/BBB summaries and 2026 third-party pricing guides. Direct WebFetch of vendor domains (goodcall.com, smith.ai, servicetitan.com, help.getjobber.com, help.housecallpro.com, cloudtalk.io, nimbata.com and others) was blocked by the session's egress proxy, so vendor-page facts below are tagged `[V2]` (seen via search snippet / secondary source) unless noted. `[U]` = unverified.

---

## 1. Summary table

| Vendor | Entry price (2026) | What the entry tier buys | Modality | Target segment | Porting required? | Fit vs CallCatch ICP |
|---|---|---|---|---|---|---|
| **Podium** | Core $399/mo, Pro $599/mo (annual contract); AI Employee +$99-399/mo; +$5/mo 10DLC; phone seats $30/user. Real single-location bill $500-800/mo `[V2]` | Reviews + unified inbox + webchat + payments + AI replies | Text-first suite | Multi-location SMB, 9,000+ home-service accounts | No; port into Podium Phones or forward. 12-month auto-renew contract | 4-8× CallCatch price; annual lock-in |
| **CallRail** | $50 / $95 / $150 / $195 per mo; 5 numbers, 250 min, 25 texts; +$0.03/text, +$0.05/min, +$3/number `[V2]` | Call tracking & attribution, call recording, form tracking | Analytics | Marketers/agencies | No (tracking numbers) | Adjacent; tells you the call was missed, does not recover it |
| **Textline** | Essentials $149/mo (3 agents, 600 credits), Pro $349/mo; $0.03/credit; +$15/mo 10DLC; quote-only now `[V2]` | Team SMS inbox, automations | Text inbox | Support/ops teams | No | No missed-call trigger, no trade-specific AI |
| **Goodcall** | $79 / $129 / $249 per agent per mo (100/250/500 unique callers; $0.50 per extra caller); 14-day trial `[V2]` | AI voice agent, unlimited minutes, Zapier/Sheets | Voice AI | Restaurants, dental, salons, auto | **Porting not supported**; conditional call forwarding only `[V2]` help.goodcall.com | Same price as CallCatch Starter; no SMS channel |
| **Smith.ai** | AI Receptionist ~$95/mo (~50-60 calls, $1.60-1.90/call, $2.40 overage); human receptionist $292.50/mo for 30 calls, $9.75-11 overage; $95 setup `[V2]` | AI or human answering, booking +$1.50/call, SMS +$0.50/call | Voice (AI + human) | Law, professional services, some trades | No; forwarding, porting optional `[V2]` docs.smith.ai | Bills 20-30% above plan; add-on stacking |
| **Ruby** | Call Ruby 50 $250/mo (50 min) → $1,725/mo (500 min); $3.30-5.90/min overage; 30-day rolling, no annual discount `[V2]` | Human receptionists, chat | Human voice | Law, small professional firms | No; forwarding | 3-20× CallCatch; minute-metered |
| **Slang.ai** | Core $399/location/mo, Premium $599 ($379/$539 annual) `[V2]` | Voice AI for reservations/FAQs | Voice AI | **Restaurants only** | No | Not a trades competitor |
| **Loman.ai** | ~$199-299/mo, unlimited calls, quote-only `[V2]` | Voice AI order-taking, POS injection | Voice AI | **Restaurants only** | No | Not a trades competitor |
| **Avoca** | Quote-only, ~$1,000-3,500/mo, per-minute billing, no trial; 4-12 week onboarding `[V2]` | Voice AI + CSR coaching, deep ServiceTitan integration | Voice AI | $3M-10M+ HVAC/plumbing, 5-20+ CSRs | No; SIP/forwarding | Enterprise; wrong segment |
| **Rilla** | ~$199-349 per rep per mo, annual, 5-user minimums `[V2]` | In-home sales conversation recording/coaching | Sales analytics | Comfort advisors at $5M+ shops | n/a | Not a competitor (different job) |
| **ServiceTitan Contact Center Pro** | Quote-only; third parties cite $245-500/tech/mo for Pro bundles `[U]`; SMS Agent added Apr-Jun 2026 `[V2]` | AI voice agents, universal inbox, SMS agent, manager assist | Voice + SMS | ServiceTitan shops, $3M+ | Runs on ST phones | Wrong segment; owner-operators are rarely on ST |
| **Housecall Pro** | Basic $59 / Essentials $149 / MAX $299 per mo annual (+20-25% monthly); Voice + CSR AI add-ons "contact for pricing" `[V2]` | Missed-call text automation in Voice settings, sent to **existing customers** `[V2]` help.housecallpro.com | FSM + text | HCP users | Calls must hit the HCP Voice number `[U]` | Canned message, no qualification, HCP-only |
| **Jobber** | Built-in missed-call text-back from Connect ($139/mo); Receptionist add-on $29/mo for 30 conversations, $0.79 each after (features page also lists $99/mo tier) `[V2]`; included on Plus ($440/mo) | AI answers calls and texts, books visits, captures details | Voice + text AI | Jobber users | Uses Jobber phone number `[U]` | Nearest low-price threat, Jobber-only |
| **GoHighLevel (agency)** | Platform $97 / $297 / $497 per mo; LC Phone $1.15/number, $0.0079/segment; A2P 10DLC $4-19 registration; agencies resell at $97-297+/mo `[V2]` | Native Missed Call Text Back toggle + CRM/pipelines | Text (canned) | Agencies reselling to SMBs | Calls must ring an LC Phone number (forward or port); text-back silently fails without A2P approval `[V2]` | Generic message, agency dependency |
| **Rosie** (added, low-end analogue) | $49/mo 250 min, $149/mo 1,000 min, $299/mo 2,000 min; $0.25/min overage; no setup fee, 7-day trial `[V2]` | AI voice answering, spam filter, booking from $149 tier | Voice AI | Solo/small contractors | No; forwarding | Direct price anchor below Starter |
| **Sameday AI** | $449-789/mo flat, no contract `[V2]` | AI voice, books into ServiceTitan/HCP | Voice AI | Multi-truck trades | No | 3-5× CallCatch |

Sources for each row are listed in §5. Prices seen 2026-09-14.

---

## 2. Per-competitor notes (weaknesses from G2 / Capterra / Trustpilot / BBB / Reddit)

**Podium.** G2 4.6/5 across 2,066 reviews, but Trustpilot 1.5/5 and BBB D- as of 2026; complaints concentrate on 12-month auto-renewal, 30-90 day cancellation windows, charges after written non-renewal (one BBB case: $2,269), and integrations failing while billing continued (Nov 2025-Feb 2026). G2 reviewers flag price as "a barrier for solo operators." No public pricing; sales-led. Number: port into Podium Phones or forward; not mandatory.

**CallRail.** G2 4.5/5 on 1,691 reviews. Dominant complaint is billing: per-minute charges on answered and unanswered calls "turn a $50 plan into a $200 bill" with no alerts; spam calls on tracking numbers listed in Google Business Profile count against minutes; cancellation friction (one $500 surprise charge); support rated subpar. Texting is not available during the 14-day trial. CallRail has no AI qualification; it is an attribution tool.

**Textline.** Tiny review base (15 G2/Trustpilot reviews, 4.9/5) but churn drivers are credit-based pricing, per-agent fees, $15/mo 10DLC fee, HIPAA surcharge. No missed-call trigger, no vertical AI. Quote-only since 2025-26.

**Goodcall.** G2 3.5/5. Reviewers cite: no SMS at all ("can't send or receive text messages"), no public API/webhooks, Zapier-only integrations, no mobile app, "rules-based" behaviour that degrades off-script. Per-agent billing (one agent = one line). Explicitly does not port numbers; setup is conditional forwarding (*71 Verizon, *90/*92 on other carriers). This is the same onboarding path CallCatch uses, which validates the mechanism.

**Smith.ai.** Trustpilot 4.3/5 (336 reviews), G2 4.6-4.7. Repeated complaints: bills run 20-30% above plan once per-call add-ons stack (booking +$1.50, SMS +$0.50, bilingual +$1.00, recording +$0.25), unauthorized escalations to human agents, script changes must go through support, $2,000 custom AI training fee on monthly plans. Forwarding-based; porting optional.

**Ruby.** Capterra/G2 reviewers cite high cost, frequent price increases, wrap-up time billed as minutes, 3% card surcharge, forfeited unused minutes, and a 2021 $12M class-action settlement over billing disclosure. $720/mo for ~150 calls before overage.

**Slang.ai / Loman.ai.** Both are restaurant voice agents (reservations, order-taking, POS). Neither markets to trades; listed here only to close the question. Not competitors.

**Avoca.** Now a $1B-valuation company (raised $125M, April 2026). Reviews cite 4-12 week onboarding, per-minute bill surprises in peak season, and pricing calibrated for $3M+ revenue / 5+ CSR shops. Strength is native ServiceTitan booking. Wrong segment for a two-truck owner.

**Rilla.** Ride-along sales coaching for comfort advisors, $199-349/rep/mo with annual commitments and user minimums. Not a front-desk product; not a competitor.

**ServiceTitan Contact Center Pro.** AI voice agents, universal inbox, and (since Apr-Jun 2026) an SMS Agent; ST claims up to 60% fewer missed calls and +11% booking rate. Pricing undisclosed; ST core itself starts in the hundreds per tech. Relevant only when a prospect is already on ServiceTitan.

**Housecall Pro.** Missed-call text automation lives in Voice settings; the help-center wording is "send a text message to your existing customers when you miss a call" (July 2026), so a brand-new caller who is not yet a customer record is at risk of getting nothing `[V2]`; message is canned, no qualification, must include company name. Third parties place it on Essentials ($149/mo annual, $189 monthly). Voice and CSR AI add-ons are "contact for pricing." HCP itself claims 37% of missed-call leads recovered within 24h with text-back (2024 data) — useful proof that the category works.

**Jobber.** Built-in canned text-back from Connect ($139/mo). Receptionist (launched Aug 2025) answers calls and texts, books visits, filters junk; help center says $29/mo for 30 conversations then $0.79 each, while the features page lists $99/mo — the two figures are both live on Jobber properties and I could not reconcile them `[V2]`. The only substantive user review (Jobber Community, Jan 2026): "rigidity in conversations, impersonal… isn't quite what I really need yet." Reddit (r/sweatystartup, 66 upvotes / 83 comments) describes Jobber as "nickel-and-dimed." Jobber's own text-back "doesn't qualify leads."

**GoHighLevel agencies.** Native "Missed Call Text Back" toggle (Settings → Business Profile) sends one pre-written SMS within ~15 s of a missed call to a GHL LC Phone number. Requirements: SMS plan, LC Phone number, and completed A2P 10DLC registration — "the most common reason Missed Call Text Back silently fails." SMS $0.0079/segment. The contractor is buying an agency relationship: platform $97-297 plus agency markup, and the message is generic unless the agency builds an AI workflow.

**Rosie / Sameday (low-end voice analogues).** Rosie is the sharpest price anchor: $49/mo for 250 minutes with spam blocking; booking and live transfer only from $149. Sameday is $449-789 flat for trades with native FSM booking.

---

## 3. Where CallCatch wins

1. **Price/packaging gap is real, but only against suites.** Podium ($400-800), Smith.ai human ($292+), Ruby ($250+), Sameday ($449+), Avoca ($1k+) are 3-10× CallCatch. Against them the pitch "one job, $79, no contract" holds. Against Rosie ($49), Goodcall ($79/agent) and Jobber Receptionist ($29 add-on) it does **not** win on sticker price; it must win on outcome.
2. **Text is the channel owners already use from the truck.** Every sub-$100 rival is voice-first (Goodcall has no SMS at all). CallCatch is the only product in the table that combines (a) missed-call trigger, (b) trade-specific AI qualification over SMS, (c) owner one-tap callback, (d) weekly revenue-recovered report, at under $150.
3. **No number change is table stakes, not a differentiator.** Goodcall, Smith.ai, Ruby, Rosie all onboard by conditional forwarding. Keep "keep your number" in copy but do not lead with it as unique.
4. **Contract and billing honesty is a wedge.** The loudest complaints in the category are Podium's auto-renewal, CallRail's per-minute surprises, Smith.ai's add-on stacking, Ruby's minute forfeiture. CallCatch's published 30-day money-back, cancel-anytime, flat conversation allowance, and pause option directly answer the top review-site grievances.
5. **FSM-native text-back is canned.** Jobber and HCP fire one sentence and stop; HCP's is scoped to existing customers. CallCatch's four-turn qualification (issue, address, urgency, window) plus alert is a different product; the demo should show a Jobber/HCP owner what their own text-back does *not* do.
6. **Speed of go-live vs Avoca/ST (weeks) and GHL (A2P silent failures).** CallCatch's "Test my forwarding" green-light plus automatic toll-free verification is a legitimate onboarding advantage; the 3-10 business-day TFV wait is the one place Goodcall/Rosie (voice-only, no SMS compliance) are faster — be explicit about it.

---

## 4. Pricing / packaging recommendation

**Hold $79 / $149.** The evidence does not support cutting price: Goodcall sits at exactly $79 per agent, Smith.ai AI at $95, Podium's AI add-on alone is $99, and Jobber's $99 tier exists. $79 is the market's floor for "AI answers for you"; only Rosie ($49) and Jobber's $29 add-on are lower, and both are minute/conversation-capped with booking withheld until the next tier.

Three changes the evidence does support:

1. **Make "no contract, 30-day money-back, flat allowance" a pricing-page headline**, not fine print. It is the category's number-one review-site complaint and costs nothing.
2. **Show the overage math up front** ($0.25/$0.20 per conversation after 150/500). CallRail, Smith.ai and Ruby lose customers to opaque overage; publishing it is a differentiator.
3. **Reconsider the $149 DFY setup fee on monthly Pro.** Of 15 vendors, only Smith.ai ($95) and Avoca (bundled) charge setup; Goodcall, Rosie, Sameday, Jobber, HCP do not. Keep it as an optional "we do it on a call" concierge, waive it whenever a prospect mentions Rosie/Goodcall. Do **not** add a $49 no-AI tier: it would compete with Jobber/HCP's free canned text-back and GHL, where CallCatch cannot win.

Roadmap implication (not pricing): every trades incumbent (ST, HCP, Jobber, Avoca, Sameday) shipped AI *voice* answering in 2025-26. A Pro-tier "AI answers after 4 rings, then texts" fallback by month 4-6 will be needed to defend the $149 tier; price it inside Pro, not as a per-minute add-on.

---

## 5. Three positioning lines

1. **"Your competitors' text-back says 'sorry we missed you.' Ours books the job."** (vs Jobber, Housecall Pro, GoHighLevel)
2. **"$79 a month. No contract. No per-minute meter. Cancel from your phone."** (vs Podium, CallRail, Smith.ai, Ruby)
3. **"Built for the owner who answers from the truck: keep your number, forward on no-answer, get a qualified lead in your texts in 10 seconds."** (vs Goodcall, Rosie voice bots)

---

## 6. Sources (all viewed 2026-09-14)

- Podium pricing: https://astucia.io/blog/podium-pricing-2026-what-smbs-actually-pay ; https://wiserreview.com/blog/podium-pricing/ ; https://checkthat.ai/brands/podium/pricing ; https://contractortoolstack.com/software/podium/
- Podium complaints: https://www.bbb.org/us/ut/lehi/profile/computer-software-developers/podium-1126-90023083/complaints ; https://proreviewcards.com/2026-review-mgmt-etf-disclosure ; https://www.g2.com/products/podium/reviews ; https://www.reputation-insider.com/podium-review/
- Podium porting/forwarding: https://www.podium.com/whats-new/25-9 ; https://podium.my.site.com/knowledgebase/s/article/Setting-Up-Call-Groups-and-Routing
- CallRail: https://www.cloudtalk.io/blog/callrail-pricing/ ; https://www.nimbata.com/blog/callrail-pricing-guide ; https://calltracker.io/blog/2026-08-08-callrail-pricing/ ; https://www.g2.com/products/callrail/reviews ; https://hackceleration.com/labs/review/callrail
- Textline: https://www.businessnewsdaily.com/textline-review ; https://www.business.com/reviews/textline/ ; https://hackceleration.com/labs/review/textline ; https://www.falkonsms.com/post/textline-alternatives
- Goodcall: https://www.cloudtalk.io/blog/goodcall-pricing/ ; https://solvea.cx/blog/goodcall-ai-receptionist-pricing ; https://contractortoolstack.com/software/goodcall/ ; https://aicxstack.com/blog/goodcall-review ; https://help.goodcall.com/en/articles/9749214-can-i-port-my-phone-number-to-goodcall ; https://help.goodcall.com/en/articles/8007555-can-i-set-up-my-current-phone-to-forward-to-goodcall
- Smith.ai: https://loman.ai/blog/smith-ai-pricing ; https://schedulingkit.com/pricing-guides/smith-ai-pricing ; https://contractortoolstack.com/software/smith-ai/ ; https://serviceagent.ai/blogs/smith-ai-pricing/ ; https://docs.smith.ai/category/x81do6jeud-number-forwarding-porting
- Ruby: https://www.cloudtalk.io/blog/ruby-receptionist-pricing/ ; https://servicehawkai.com/compare/ruby-pricing.html ; https://serviceagent.ai/blogs/ruby-receptionist-pricing/ ; https://trtc.io/blog/details/ruby-receptionist-review-alternatives
- Slang.ai: https://www.cloudtalk.io/blog/slang-ai-review/ ; https://loman.ai/blog/slang-ai-reviews-pricing-alternatives
- Loman.ai: https://www.cloudtalk.io/blog/loman-ai-pricing/ ; https://restauranttools.ai/tools/loman-ai
- Avoca: https://getdriive.com/blog/avoca-ai-pricing ; https://contractortoolstack.com/software/avoca-ai/ ; https://www.idlen.io/news/avoca-ai-1-billion-valuation-kleiner-perkins-services-economy-voice-agents-april-2026/ ; https://www.thareja.ai/alternatives/avoca-review-2026-features-pricing-pros-cons
- Rilla: https://www.salesask.com/alternatives/rilla/rilla-pricing-guide-2026 ; https://www.outdoo.ai/blog/rilla-review-and-pricing
- ServiceTitan: https://www.servicetitan.com/features/pro/contact-center ; https://www.stork.ai/en/servicetitan-pro-ai-virtual-agent ; https://servicebusinessacademy.org/top-10-best-missed-call-text-back-software-contractors-2026/
- Housecall Pro: https://help.housecallpro.com/en/articles/6750234-voice-settings-overview ; https://projul.com/blog/housecall-pro-pricing-analysis-2026/ ; https://serviceagent.ai/blogs/housecall-pro-pricing/ ; https://blog.salescaptain.com/missed-call-text-back-cost-per-month-2026-guide/
- Jobber: https://help.getjobber.com/hc/en-us/articles/25315927533847-Receptionist-powered-by-Jobber-AI ; https://www.getjobber.com/features/ai-receptionist/ ; https://www.beside.com/blog/jobber-ai-phone-answering ; https://morgansystems.org/jobber-ai-receptionist-review/ ; https://fieldcamp.ai/reviews/jobber/
- GoHighLevel: https://www.ghlscaleup.com/blog/gohighlevel-missed-call-text-back ; https://ghlcrms.com/gohighlevel-missed-call-text-back/ ; https://netpartners.marketing/gohighlevel-phone/ ; https://pipelineon.com/blog/gohighlevel-pricing/ ; https://autogencrm.com/gohighlevel-sms-pricing/
- Rosie / Sameday / category lists: https://oncrew.ai/blog/rosie-ai-pricing-2026 ; https://www.cloudtalk.io/blog/rosie-ai-answering-service-pricing/ ; https://www.withallo.com/blog/best-ai-receptionists-for-contractors ; https://agentplace.io/blog/8-best-missed-call-text-back-tools-for-hvac-contractors-2026
