# CallCatch docs

Everything an operator needs, in the order you will need it. Numbers in these docs trace to `PRODUCT_SPEC.md`; tags `[V]` (verified against a vendor page), `[V2]` (secondary source) and `[U]` (unverified assumption) are carried over from the spec.

| Doc | Read when |
|---|---|
| [`PRODUCT_SPEC.md`](PRODUCT_SPEC.md) | Before anything else. Product, pricing, journey, architecture, compliance, ads, sales, model, 90-day plan, risks. |
| [`BUILD_CONTRACTS.md`](BUILD_CONTRACTS.md) | Writing code. Module ownership, shared libs, Next.js 16 facts, cross-module contracts, security rules. |
| [`COMPANY_FORMATION.md`](COMPANY_FORMATION.md) | Day 0 (Sep 14, 2026). LLC, EIN, bank, Stripe, domain, legal pages, Twilio ISV prerequisites, seed accounting. |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Days 1-3. Supabase → Stripe → Twilio → Resend → Meta → Vercel → DNS, then the smoke test. |
| [`COMPLIANCE.md`](COMPLIANCE.md) | Before submitting any Toll-Free Verification or Meta App Review. Consent model, sample messages, TFV field mapping, 10DLC sole-prop path, TCPA note. |
| [`RUNBOOK.md`](RUNBOOK.md) | Something is wrong. TFV stuck/rejected, 30032, STOP complaints, dunning, refunds, pause/cancel, vendor outages, key rotation. |
| [`SALES.md`](SALES.md) | Every weekday 6am-9pm. Where the ICP is, the 30-hour week, scripts, demo, objections, closes, referral ask. |
| [`META_ADS.md`](META_ADS.md) | Oct 1 onward. Account setup, event map, structure, 12 concepts with copy and shot lists, pacing, kill/scale, KPIs, decision tree. |
| [`FINANCIAL_MODEL.md`](FINANCIAL_MODEL.md) | Month-end reviews. Base/downside/upside/ads-only tables, assumptions, $20k crossing month, unit economics. |
| [`model/README.md`](model/README.md) | Re-running `model.py` and regenerating the CSVs. |
| [`LAUNCH_PLAN_90_DAYS.md`](LAUNCH_PLAN_90_DAYS.md) | Monday mornings. Week-by-week owner / deliverable / success metric, day-0 checklist. |
| [`RISKS.md`](RISKS.md) | Monthly review. Risk register with likelihood, impact, mitigation, owner, trigger. |

Root [`../README.md`](../README.md) has the architecture diagram, module map, local setup, scripts and the env var table.
