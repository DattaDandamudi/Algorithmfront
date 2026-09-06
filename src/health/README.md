# Pulse — personal health/fitness log with an in-app coach

A mobile-first (390 px) dark-theme app that lives at **`/health`** (also `#/health`) inside this
Vite + React repo. It is fully client-side: all data is stored in `localStorage`, and the
Claude-powered coach / food estimator only run when the user adds an API key or a proxy URL in
Settings. Without a key the app still works end-to-end using a rule-based offline coach and a
local food database.

```
src/health/
  HealthApp.tsx        shell: providers, 6-tab bottom nav, onboarding gate
  nav.tsx              tab state + deep links (open Coach pre-filled, open Log section, open Train view/session)
  health.css           design tokens (#0B0D0F / #14181C / #1E252B, WHOOP green/yellow/red)
  data/
    types.ts           THE contract: DailyRecord (compact short-key schema), Profile, Targets, CoachContext…
    defaults.ts        spec persona defaults (1,950 kcal, 180 g protein, 60 g fat floor, 4-day split, labs)
    storage.ts         sharded localStorage (hx:log:YYYY-MM + hx:log:index), FNV-1a checksums, quota handling, debounced writer
    store.tsx          React context; keeps meal totals + EWMA trend in sync; hooks useHealth/useRecords/useDay/useNow
    export.ts          JSON (full fidelity) + CSV (BOM, flattened) export/import
    seed.ts            deterministic 45-day demo dataset
    whoopImport.ts     WHOOP CSV export parser
    workoutImport.ts   workout parsers: WHOOP workouts.csv, Strava activities.csv, Apple Health export.xml
  engine/              pure, deterministic logic (all unit-tested with vitest)
    stats.ts           median/MAD/robust SD, erf & normal CDF, quantiles, EWMA, linreg, Benjamini–Hochberg
    weight.ts          EWMA trend (α = 0.10), weekly rate lb/wk & %BW/wk, 0.5–1 %BW target band
    kalman.ts          local-linear-trend weight filter + RTS smoother, outlier gate, rate credible band
    expenditure.ts     MacroFactor-style weekly TDEE = intake − Δtrend×3500/7, ≥5 weigh-ins gate, smoothing, ±100–200 kcal steps, fat floor
    baseline.ts        30-day (RHR 28-day) personal baselines + good-direction deltas
    hrv.ts             ln(rMSSD), 7-day rolling mean, SWC = mean ± 0.5 SD, Balanced/Low/Unbalanced/Poor bands, CV trend
    readiness.ts       hero score: WHOOP recovery when present, else HRV-derived; 67/34 bands; training verdict
    sleep.ts           need = baseline + f(strain) + f(debt) − naps, debt, bedtime/midpoint SD, countdown, caffeine cutoff
    nutrition.ts       day type from split, macro targets, protein pacing (0.4–0.55 g/kg/meal), fat floor, late eating, hydration
    tobacco.ts         counts, streaks, next-morning HRV/RHR/recovery comparison
    load.ts            session load (sRPE / TRIMP / Edwards), Banister fitness-fatigue-form, ACWR (descriptive), VO₂max
    strength.ts        e1RM by rep range, PRs, plateaus, weekly sets by muscle, progression & deload checks
    exerciseDb.ts      exercise catalogue (muscles, patterns, equipment, aliases), search, default program, landmarks
    stress.ts          Hooper check-in, overnight strain index + outlier count, resilience balance, illness flag
    energy.ts          two-process predicted-energy curve (homeostatic + circadian + caffeine PK)
    impact.ts          N-of-1 behaviour effects: Welch se, shrinkage to published priors, BH correction
    changepoint.ts     Bayesian online changepoint detection (regime shifts in HRV, RHR, weight level, strain)
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
  screens/             Today, Log, Train, Trends, Coach, Settings, Onboarding
    Train.tsx          the sixth tab: Today / Log / History / Analysis sub-views
    train/             session logger, exercise picker, history list, e1RM · volume · load analysis
    stress/            check-in strip, stress & resilience cards, predicted-energy curve, behaviour-impact card
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

## Engine notes (v3)

Every module is pure and deterministic: `asOf` / `now` / `through` are parameters, nothing under
`engine/` or `ai/` reads the clock, and missing data returns `null` with a reason rather than a
number that looks real. Each module header carries its citations, and any constant without one is
explicitly labelled a heuristic **in a string the UI can show the user**, not only in a comment.

* **Weight** is a Kalman local linear trend with adaptive measurement noise, an outlier gate, and a
  re-anchor after three consecutive same-sign rejections so a real step change cannot lock the
  filter out. An RTS smoother redraws history at render time; the filtered series is what decisions
  use. EWMA is kept for export continuity. A 20 lb typo moves the level 0.0 lb.
* **Expenditure** uses the Hall/Forbes energy density from body composition, not a flat
  3,500 kcal/lb — for a lean lifter the true factor is about 30% lower, which was the single
  largest bias in the old estimate. A glycogen–water state stops week one of a carb cut reporting a
  fake jump. The posterior fuses a weight-derived and a steps-derived observation against a Mifflin
  prior, and publishes an interval. Intake moves in a 50–100 kcal nudge after one block, or 150+
  only after two plus a 14-day freeze.
* **HRV** is ln(rMSSD) against a 60-day robust reference, suppressed below four valid readings in
  the week rather than guessed, with a vagal-saturation guard so a high reading is not read as good
  news when it is not. Forcing a light day fires on 3.1% of stationary days, against roughly 30%
  before.
* **Readiness** blends WHOOP recovery over a 7-day ramp rather than switching hard, adds a 3-night
  sleep history and the subjective check-in, and always publishes its per-input contributions and a
  confidence band. Without an established baseline it says Calibrating instead of guessing.
* **Sleep** decays debt at 0.85/day, whose 4.3-day half-life matches Kitamura 2016. One long night
  retires at most 2 h, so a lie-in cannot clear a week. Adds the Sleep Regularity Index, social
  jetlag, and a dose-aware caffeine cutoff.
* **Training load** is Foster sRPE, Edwards and Banister heart-rate load, with the WHOOP strain
  conversion and the Banister time constants both fitted to the user rather than assumed. The
  acute:chronic ratio is charted but never gates advice on its own (Impellizzeri 2020); decisions
  lead on absolute acute load and week-on-week change.
* **Strength** selects its one-rep-max formula by rep range and returns nothing above 15 reps.
  Volume landmarks are advisory bands that never reduce a suggestion, since the 2025 meta-regression
  found no plateau in the dose-response. Deloads are reactive only (Coleman 2024).
* **Stress** keeps four outputs separate on purpose. A Hooper check-in, an overnight index reported
  alongside the count of signals outside the personal range (the count leads), a conjunctive illness
  flag, and a 14-day resilience balance that always shows its two component curves.
* **Energy** is an explicit two-process model with a caffeine term. It is a forecast, never a
  measurement, and the interface says so.
* **Regime shifts and behaviour impact** are the two things no consumer product ships. Changepoint
  detection separates a dip from a new baseline and truncates the HRV reference accordingly. The
  N-of-1 engine gates at five yes and five no days in 90, shrinks toward published priors, and
  corrects for multiplicity across the whole grid — applied to the unshrunk p-value, so a prior can
  never manufacture significance for a user whose own days show nothing.

## Evidence and limits

What this app measures, what it models, and what it cannot do:

* **Measured** — anything you log or import: weight, food, steps, sleep times, sessions, and the
  overnight physiology a wearable exports (heart-rate variability, resting and respiratory rate,
  skin temperature, blood oxygen).
* **Modelled** — every score. Readiness, the overnight strain index, resilience, predicted energy,
  fitness and fatigue, expenditure. Each is a calculation over the above with its uncertainty
  reported, not a sensor reading.
* **Not possible here.** Daytime stress *events* and recovery moments need continuous heart rate,
  which a daily log does not have, so the energy curve is a prediction from sleep and load rather
  than a measurement. Baevsky's stress index and DFA-α1 need beat-to-beat intervals and are
  therefore absent rather than approximated. This app cannot out-sense a wearable; what it does
  better is show its working, learn your baselines from your own data, analyse lifting at all, and
  put an interval on every number.

The medical boundary is unchanged and applies to the new signals: the illness flag names the
signals behind it and never a condition, behaviour effects are stated as associations with their
intervals and day counts, and persistent symptoms route to a doctor.

## Data & durability

* Records use the compact schema from the spec (≈250–450 bytes/day). Shards are keyed by month;
  the index stores per-shard counts and checksums which are validated on load.
* **Workouts are a second shard family** (`hx:wk:YYYY-MM`) with the same checksum validation,
  corrupt-preservation and pruning. A training session is far bigger than a day record, so mixing
  them would rewrite a month of days every time a set is logged. The live session lives under
  `hx:wk:draft` and is restored on mount, so closing the app mid-workout loses nothing; the shard
  pattern deliberately cannot match that key.
* Writes are debounced (500 ms, 2 s max wait) and flushed on `visibilitychange`/`pagehide`.
* `QuotaExceededError` is caught, surfaced as a banner and retried with back-off; a second tab's
  writes are picked up through the `storage` event (last writer wins per month).
* JSON exports omit the API key; imports normalise ids and numeric fields.

### Migration, v1 → v2

Purely additive. Existing day shards load unchanged because every new field is optional; a v1
index with no `workouts` key simply means no workouts; settings gain their new blocks through
`mergeSettings` on first write; and a v2 export opened by a v1 build ignores what it does not know
rather than failing. Downgrading loses the new data but never corrupts the old.

## Importing training history

Settings → Imports reads three formats, all parsed by `data/workoutImport.ts`:

* **WHOOP** `workouts.csv` — heart-rate zone percentages become minutes, strain seeds a session RPE
  you can correct. `physiological_cycles.csv` keeps its existing importer and now also reads
  respiratory rate, skin temperature and blood oxygen for the stress engine.
* **Strava** `activities.csv` — moving time rather than elapsed, and session RPE only from the
  Perceived Exertion column, since Relative Effort is Strava's own load number and not a 1–10 rating.
* **Apple Health** `export.xml` — streamed in 4 MB slices, skipping the record samples without
  parsing them. Because Apple writes workouts after the samples, the 200 MB limit is a window over
  the *end* of the file rather than a refusal, and the result says so when it applies.

Re-importing the same export is safe: sessions dedupe on their source id, or on same day, same kind
and a start within ten minutes. An import never overwrites a session you typed.

## Medical boundary

The app is wellness information only. It never diagnoses, prescribes, or interprets labs as
disease; lab/medication/symptom questions get general lifestyle guidance plus a "confirm with your
doctor" cue, and emergency language stops the coach and points to professional care.
