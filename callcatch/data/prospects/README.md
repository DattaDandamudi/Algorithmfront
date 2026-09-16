# Prospect data — sourcing and rules (2026-09-16)

**Seed only from public records.** State contractor license boards publish every licensed HVAC / plumbing / electrical
contractor. Google Places / Yelp API output may **not** be stored as a marketing list (their terms), so the prospector
ingests license boards and enriches from the business's own website.

| State | Source | What you get | How |
|---|---|---|---|
| TX | TDLR "All Licenses" (Socrata `7358-krk7`) | name, address, **phone**, owner, license type/status | `prospector` tool `fetch_tx_licenses` (HVAC + electrical; plumbing is TSBPE) |
| AZ | ROC posting list CSV (roc.az.gov/posting-list) | name, DBA, class, address (no phone) | `import_license_csv {url, state:"AZ"}` |
| FL | DBPR construction-industry extracts | name, license prefix (CAC/CFC/EC), city (no phone) | `import_license_csv {url, state:"FL"}` |
| GA / NC | roster request by mail (fee) | names, no phones | import the CSV via `/admin/prospects` |

Enrichment (per record, in the prospector): website fetch → software badges, 24/7, emergency, contact email; Twilio Lookup
→ line type (mandatory before calling); fit score 0-100 (`lib/agents/pipelines/scoring.ts`).

**Contact rules (from `docs/research/prospecting-data-2026.md`):**
- Cold **email** to business addresses only, CAN-SPAM footer + one-click unsubscribe (executor enforces).
- **Calls**: human-dialed, business landlines / fixed VoIP freely (TSR B2B exemption); mobiles manual-dial only after a DNC scrub; never in TX/AZ/FL mobiles until counsel confirms the B2B exemption.
- **Never cold SMS** (TCPA; Texas SB 140). Never autodial, ringless voicemail or AI voice.
- Every "don't call / unsubscribe / STOP" → `do_not_contact` the same day.

Seed file `seed_YYYY-MM-DD.csv` (if present) uses the import columns:
`business_name,trade,phone,email,website,address,city,state,zip,rating,review_count,source,external_ref,owner_name`.
