# TrueFare

**Build one cart, see every delivery app's real all-in checkout total — fees,
taxes, memberships and all — before you tap Order.**

TrueFare is a self-contained web app that prices the *identical* cart on
DoorDash, Uber Eats, Grubhub and Postmates and shows the full after-tax
checkout total for each, side by side. It runs entirely on search and
recommendations: find food, build a cart, compare, and check out in-app with
live order tracking.

> Postmates runs on the Uber Eats backend, so it shares Uber Eats item
> prices with its own fee cosmetics — exactly like the real world.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 — works instantly, zero config
```

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` / `preview` | Production build / serve it |
| `npm run typecheck` | Strict TS, no emit |
| `npm run lint` | ESLint (flat config) |
| `npm test` | Vitest golden suite for the pricing engine (21 tests) |
| `npm run shots` | Playwright screenshots of every route (light+dark × desktop+mobile) |

## How pricing works (and why it's honest)

None of the delivery platforms expose a public price-comparison API — Uber's
API terms explicitly prohibit comparison, DoorDash and Grubhub have no
consumer API, and the one real aggregator (MealMe) is sales-gated. So
TrueFare's quotes come from a **deterministic simulation engine** built from
researched 2025–26 fee structures:

- per-platform service fees (% of subtotal, min/cap), including where surge
  actually lives (DoorDash folds it into the *service* fee; Uber Eats into
  the *delivery* fee),
- per-restaurant menu markups (+18–30% vs in-store) as **per-platform price
  vectors on every item**,
- small-order fees, long-range fees, membership math (DashPass, Uber One,
  Grubhub+ incl. free-with-Amazon-Prime), and Grubhub's Feb-2026
  "$50+ orders ⇒ fees waived" step function,
- per-metro sales tax **and whether the state taxes the fees themselves**
  (NYC/Seattle/Austin do; California doesn't), plus regulatory fee lines
  (CA Driver Benefits, Seattle Local Operating Fee, NYC Regulatory Response,
  CO Retail Delivery Fee).

All of that lives in **one versioned data table**
(`src/features/pricing/rules/v1.ts`) executed by a fixed 14-step pipeline
(`engine.ts`), regression-locked by golden tests against published
field-study numbers (`engine.test.ts`). Every quote is labeled *Estimated*
with its rules version and refresh time. Quotes are seeded per
(restaurant, platform, metro, daypart): stable within a session, re-rolled
when the meal period changes.

### Swapping in real data

The UI only ever consumes a `ProviderQuote` shaped like MealMe's
`final_quote`, through two seams:

- `QuoteProvider` (`SimulationQuoteProvider` today; `MealMeQuoteProvider`
  is a typed stub showing the mapping) — real-time quotes.
- `OrderProvider` (`SimulationOrderProvider` today; `MealMeOrderProvider`
  maps to MealMe Create Order `place_order=true`) — real checkout.

Implement the fetch in those stubs behind a backend proxy holding your API
key, register the provider, and no screen changes.

## Guest mode vs Supabase

The app runs full-featured with **zero configuration**: cart, orders, taste
profile and events persist in `localStorage` behind a `DataStore` interface
(`src/lib/datastore/`).

To enable accounts, cross-device history and *real* cross-user trending:

1. Create a Supabase project and apply the three migrations in
   `supabase/migrations/` (`supabase db push`, or paste into the SQL
   editor). Tables are `fd_`-prefixed and safe to coexist with other apps
   in the same project; RLS is owner-scoped everywhere.
2. Copy `.env.example` → `.env` and fill `VITE_SUPABASE_URL` +
   `VITE_SUPABASE_ANON_KEY`.
3. Restart the dev server. Sign-in appears under Profile; on first sign-in
   the app offers a one-time import of your guest activity.

`fd_get_trending()` is a `SECURITY DEFINER` aggregate (HN-gravity over the
last 72h of everyone's events) exposing only `(item_id, score)`.

## Architecture

```
src/
├── design/            tokens + spring vocabulary (all motion picks from 3 springs)
├── layout/            glass nav, mobile tabs, grain overlay
├── components/
│   ├── food/          the illustration system: 30 hand-drawn glyphs + seeded blob compositions
│   └── ui/            BentoCell, AnimatedPrice (odometer), Skeleton, PlatformBadge…
├── lib/
│   ├── datastore/     DataStore seam: LocalAdapter ↔ SupabaseAdapter
│   ├── money.ts       integer cents everywhere; psychRound for menu endings
│   └── rng.ts         xmur3+mulberry32 seeded determinism
└── features/
    ├── catalog/       16 restaurants × 179 items, per-platform price vectors
    ├── pricing/       rules/v1 (versioned data) + engine (pure pipeline) + provider seam
    ├── cart/          single-restaurant cart, fly-to-cart, glass cart bar
    ├── compare/       the signature screen: quote cards, winner ring, fee breakdowns
    ├── checkout/      price-lock re-quote, demo payment, OrderProvider seam
    ├── orders/        live tracking timeline, spend-by-platform
    ├── search/        MiniSearch singleton, ⌘K palette, fallback chain
    ├── recommendations/ taste profile, master score, 2-D feed builder
    ├── discover/      bento hero (engine-priced sample carts) + feed rows
    ├── profile/       metro/memberships/dietary/theme
    └── auth/          Supabase auth + guest-merge flow
```

Pricing, search and recommendation cores are framework-agnostic pure
TypeScript (no React imports) — reusable by a future mobile client.

### Design language

Warm organic system: cream/espresso ground with terracotta/sage/saffron
accents (dark mode stays warm, never blue-gray), Fraunces display + Inter
with tabular numerals for every price, feTurbulence paper grain,
umber-tinted layered shadows, bento grids with cursor spotlights, and a
three-tier spring vocabulary. Platform brand colors appear only as
desaturated data accents. All imagery is a hand-drawn glyph set composed
over seeded blobs — no external image dependencies, coherent in both
themes. Every animation is compositor-only and honors
`prefers-reduced-motion`.

## Honesty rules

- Totals are **estimates** and say so, with a rules version — never fake
  live quotes (the #1 trust-killer for comparison tools).
- Checkout is a clearly-labeled demo: Luhn-validated card UX, masked
  storage, **no real charge, no real order** until a real OrderProvider is
  configured.
- The default sort is the math, nothing else.
