# Pulse — personal health/fitness log with an in-app coach

A mobile-first (390 px) dark-theme app that lives at **`/health`** (also `#/health`) inside this
Vite + React repo. It is fully client-side: all data is stored in `localStorage`, and the
Claude-powered coach / food estimator only run when the user adds an API key or a proxy URL in
Settings. Without a key the app still works end-to-end using a rule-based offline coach and a
local food database.

```
src/health/
  HealthApp.tsx        shell: providers, 5-tab bottom nav, onboarding gate
  nav.tsx              tab state + deep links (open Coach pre-filled, open Log section)
  health.css           design tokens (#0B0D0F / #14181C / #1E252B, WHOOP green/yellow/red)
  data/
    types.ts           THE contract: DailyRecord (compact short-key schema), Profile, Targets, CoachContext…
    defaults.ts        spec persona defaults (1,950 kcal, 180 g protein, 60 g fat floor, 4-day split, labs)
    storage.ts         sharded localStorage (hx:log:YYYY-MM + hx:log:index), FNV-1a checksums, quota handling, debounced writer
    store.tsx          React context; keeps meal totals + EWMA trend in sync; hooks useHealth/useRecords/useDay/useNow
    export.ts          JSON (full fidelity) + CSV (BOM, flattened) export/import
    seed.ts            deterministic 45-day demo dataset
    whoopImport.ts     WHOOP CSV export parser
  engine/              pure, deterministic logic (all unit-tested with vitest)
    weight.ts          EWMA trend (α = 0.10), weekly rate lb/wk & %BW/wk, 0.5–1 %BW target band
    expenditure.ts     MacroFactor-style weekly TDEE = intake − Δtrend×3500/7, ≥5 weigh-ins gate, smoothing, ±100–200 kcal steps, fat floor
    baseline.ts        30-day (RHR 28-day) personal baselines + good-direction deltas
    hrv.ts             ln(rMSSD), 7-day rolling mean, SWC = mean ± 0.5 SD, Balanced/Low/Unbalanced/Poor bands, CV trend
    readiness.ts       hero score: WHOOP recovery when present, else HRV-derived; 67/34 bands; training verdict
    sleep.ts           need = baseline + f(strain) + f(debt) − naps, debt, bedtime/midpoint SD, countdown, caffeine cutoff
    nutrition.ts       day type from split, macro targets, protein pacing (0.4–0.55 g/kg/meal), fat floor, late eating, hydration
    tobacco.ts         counts, streaks, next-morning HRV/RHR/recovery comparison
    adherence.ts       heatmap grid, streaks, weekly/monthly aggregation
    micronutrients.ts  retest reminders + display-only guidance (lead → physician escalation)
    insights.ts        the 14 insight templates, priorities and promotion rules; coach chips; empty-state copy
    context.ts         buildCoachContext(): one snapshot every screen, insight and the coach share
  ai/
    config.ts          dependency-free settings helpers (isAIConfigured, model list) — safe to import from screens
    client.ts          async Anthropic SDK client factory (lazy-imports the SDK; BYO key in browser, or proxy base URL)
    coach.ts           §8 system prompt, compact 30-day context, streaming askCoach with refusal fallbacks
    guardrails.ts      emergency detection, medical-ask cue, ≤120-word check, bold-action enforcement
    offlineCoach.ts    rule-based answers for the 8 chips when no key is configured
    food.ts            §9 strict-JSON food estimator (structured outputs)
    foodLocal.ts       offline natural-language food parser ("200 g chicken tikka and one roti")
    foodDb.ts          Indian / Middle-Eastern / basics food database (per 100 g)
    barcode.ts         Open Food Facts lookup for barcodes (the app's only non-AI third-party call, made only on a scan/lookup)
    foodImage.ts       photo estimation through Claude vision (same strict JSON schema, confidence capped at 0.6)
  ui/                  design-system primitives (Ring, Tile, Sparkline, MacroBar, Sheet, …) and charts/
  screens/             Today, Log, Trends, Coach, Settings, Onboarding
```

## Running

```bash
npm install
npm run dev          # open http://localhost:5173/health
npm run test         # vitest — engine, storage, AI prompt/guardrail tests
npm run typecheck
npm run build
```

Static hosts need an SPA rewrite so `/health` serves `index.html` (or use `/#/health`; tab
navigation keeps the `#/health/<tab>` hash so reloads land back in the app).

## AI configuration

* **None (default):** offline coach + local food parser. No network calls.
* **Anthropic key in this browser:** the key is stored in `localStorage` only and sent directly
  to the Anthropic API with `dangerouslyAllowBrowser`. Fine for a single-user personal app; do
  not ship a shared key this way.
* **Proxy:** point the app at a server that injects the key. A ready-made Supabase Edge Function
  lives in `supabase/functions/coach-proxy/` (set the `ANTHROPIC_API_KEY` secret).

Default model is `claude-opus-5`; the coach streams with server-side refusal fallbacks enabled.
The SDK is only downloaded when a key or proxy is configured (dynamic import in `ai/client.ts`).
Photo logging needs an AI client; barcode lookup does not (it calls Open Food Facts directly).

## Engine notes (v2)

* **Readiness:** WHOOP recovery when present (67/34 bands), else an HRV-derived score. A red
  "Light day" verdict is forced when recovery < 34 or the HRV 7-day mean sits below the SWC.
* **HRV:** ln(rMSSD); the SWC (mean ± 0.5 SD) is centred on a 28-day reference and the 7-day
  rolling mean is banded against it; a single day's reading only drives the "big drop" flag.
* **Sleep debt** accrues against baseline + f(strain) − naps and is paid back by surplus sleep;
  f(debt) only raises tonight's displayed need.
* **Expenditure** is published weekly on blocks anchored to the first weigh-in, gated on ≥ 5
  weigh-ins and ≥ 5 logged days per block and ≥ 14 days of trend history; intake suggestions
  only move after a full week outside the 0.5–1 %BW/wk band, in 100–200 kcal steps, never
  below the fat floor.

## Data & durability

* Records use the compact schema from the spec (≈250–450 bytes/day). Shards are keyed by month;
  the index stores per-shard counts and checksums which are validated on load.
* Writes are debounced (500 ms, 2 s max wait) and flushed on `visibilitychange`/`pagehide`.
* `QuotaExceededError` is caught, surfaced as a banner and retried with back-off; a second tab's
  writes are picked up through the `storage` event (last writer wins per month).
* JSON exports omit the API key; imports normalise ids and numeric fields.

## Medical boundary

The app is wellness information only. It never diagnoses, prescribes, or interprets labs as
disease; lab/medication/symptom questions get general lifestyle guidance plus a "confirm with your
doctor" cue, and emergency language stops the coach and points to professional care.
