# `src/health/ui` — design-system primitives (props cheat-sheet)

Dark-only, 390 px frame, one semantic colour per state (SPEC §0), built on the material
system in `../DESIGN.md` — read that first. Import from `'../ui'`:

```ts
import { Ring, Tile, Delta, Sparkline, MacroBar, InsightCard, Chip, Stepper, Sheet,
         SegmentedControl, EmptyState, SectionHeader, Button, ToastHost, toast, Banner,
         ProgressRing, bandColor, bandText, bandBg, bandLabel } from '../ui';
```

All components accept `className`. Numbers: pass raw numbers — `Tile`/`Delta`/`MacroBar` format
with `lib/format.fmt` (tabular numerals are inherited from `.hx`). Null means "no data" and renders
`—`; never pass a placeholder number. Charts (full-size line/heatmap) live in `./charts`.

## Material classes (health.css)

| class | meaning |
|---|---|
| `.hx-card` | a reading: graphite, 20 px radius, bezel border, top specular, ambient shadow |
| `.hx-raised` | something you act on: slate glass, blur, brighter edge, deeper shadow |
| `.hx-well` | a gauge track: sunken, inner shadow (inputs get this globally) |
| `.hx-lume-glow` / `.hx-lume-text` | phosphor — the dial arc and its number only |
| `.hx-bento` / `.hx-span-2` / `.hx-row-2` | the two-column grid and its spans |
| `.hx-display` | Bricolage Grotesque with optical sizing — numerals and headings |
| `.hx-label` | 13 px sentence-case label (the name is pinned by tests; it is no longer uppercase) |
| `.hx-press` | settles 1 px on `:active` |

Tailwind: `rounded-tile` (20 px), `rounded-ctl` (14 px), `font-display`, `text-hx-lume`.

Two cascade facts worth knowing. `health.css` loads after Tailwind's utilities, so a material's own
radius wins over `rounded-ctl` at equal specificity: to put a 14 px radius on a `.hx-card`/`.hx-raised`
or a pill on a `.hx-well`, write `!rounded-ctl` / `!rounded-full` (the kit does this itself). And none
of the material classes sets `position`, so `absolute`/`fixed` utilities keep working on them; set
`relative` yourself where a child needs an anchor.

## bands.ts
| fn | returns |
|---|---|
| `bandColor(tone)` | CSS string `var(--hx-green)` — SVG strokes/fills, inline styles |
| `bandText(tone)` / `bandBg(tone)` / `bandBorder(tone)` | Tailwind `text-hx-*` / `bg-hx-*` / `border-hx-*` |
| `bandSoftBg(tone)` | `bg-hx-*/15` wash |
| `bandLabel(band)` | "On track" / "Caution" / "Off track" / "No signal" |
| `bandFromScore(0–100 \| null)` | WHOOP bands: ≥67 green, 34–66 yellow, <34 red, null → neutral |
| `deltaTone(good, delta)` | green / red / neutral for ▲▼ glyphs |

`Tone = Band | 'blue'` — every helper accepts `Band` (from `data/types`) or `'blue'`.

## Ring — the hero dial
`{ value: number|null (0–100); band: Band; size?=216; stroke?=14; label?='Score'; glow?=true; children? }`
A sunken well for the track, the arc in the band colour with a phosphor glow (`glow={false}` for
secondary rings), `.hx-ring-arc` sweep then `.hx-bloom`. `role="img"` with "Readiness: 72 out of
100, on track". Children are centred: put the display-face number there
(`<span className="hx-display hx-lume-text text-[48px] leading-none font-semibold">72</span>`),
the one-word verdict under it, and a small label. At 150 px the number is 48 px.

## ProgressRing — small ring (steps, hydration)
`{ value: number|null; max: number; color?: Tone|cssColor='blue'; size?=56; stroke?=6; label?; children? }`

## Tile — a reading in the bento
```
{ label; value: string|number|null; dp?=0; unit?; size?: 'md'(28px)|'lg'(36px, protein);
  delta?: { value; good; dp?; unit?; format?; caption?='vs 30-day avg' };
  band?: Band (dot + colours `sub`); sub?: ReactNode ('Balanced'); chart?: ReactNode (Sparkline/ProgressRing);
  chartLayout?: 'inline'|'stack'; span?: 1|2; rows?: 1|2;
  onClick?: () => void (whole tile becomes a ≥44 px button that settles on press); emptyHint?: string }
```
Place tiles directly inside a `.hx-bento`; `span={2}` for anything with a chart wider than
140 px or a long caption. Never leave a lone 1×1 in a row.

## Delta — ▲ 3 ms vs 30-day avg
`{ value: number|null; good: boolean|null; dp?=0; unit?; format?(abs); caption?='vs 30-day avg' }`
Only glyph+number are coloured (green good / red bad / neutral null or 0). Pass `caption=''` to hide it.

## Sparkline — pure SVG mini line
`{ values: Array<number|null>; width?=96; height?=28; color?='var(--hx-blue)'; band?: [lo,hi]|null;
   baseline?: number|null; highlightLast?: boolean; title?='Trend' }`
2 px line, gaps for nulls, band = 12 % wash, baseline = hairline, last dot 8 px with 2 px card ring. `aria-hidden`.

## MacroBar — remaining macro bar
`{ label; value: number|null; target: number; range?: [lo,hi]; floor?: number; unit?='g';
   color: Tone; remainingLabel?=true }`
≤10 px bar, "x g left" right-aligned; over target → red overflow + "x g over". `floor` draws a tick
labelled "60 g floor" (adds bottom padding). `role="meter"`.

## InsightCard
`{ insight: Insight; onOpen?(prompt: string) }` — an indicator lamp in `insight.band` beside the
title; when `onOpen` and `insight.coachPrompt` exist the card is a button showing "Ask the coach".
No entrance animation.

## Chip — pill button
`{ children; onClick?; active?; color?: Tone='neutral'; icon?; size?: 'sm'(36px)|'md'(44px); ...button }`
`active` → tone wash + `aria-pressed`. Icon-only chips need `aria-label`.

## Stepper — − [value] +
`{ value; onChange(n); step?=1; min?; max?; dp?=0; unit?; label?='Value'; size?: 'sm'|'lg'; disabled? }`
44 px (sm) / 56 px (lg) buttons; typed input commits on blur/Enter (clamped, rounded to `dp`); ↑/↓ step.
Weight: `step={0.1} dp={1} unit="lb"`. Tobacco: `step={1} min={0}`.
The `sm` field is a fixed 80 px, so two steppers side by side inside 390 px squeeze it: put the
unit in the column's label ("Weight, lb") instead of passing `unit`, as the Train logger does.

## Sheet — bottom sheet
`{ open; onClose; title?; children; footer? }` — dialog/aria-modal, ESC + backdrop close, scroll lock,
focus trap, focus returns to the opener, max-h 88dvh, slide-up (instant under reduced motion).
Portalled into the `.hx` root. Put Save/Cancel `<Button>`s in `footer`.

## SegmentedControl — 7D/30D/90D/1Y, tone toggle
`{ options: Array<{ value; label; disabled? }>; value; onChange(v); size?: 'sm'|'md'; ariaLabel }`
Generic on the value type; radiogroup with arrow-key roving focus.

## EmptyState
`{ icon?; title; hint; action?: { label; onClick } }` — dashed muted card; use the SPEC §1 copy.

## SectionHeader
`{ title; action?: ReactNode; caption?: string; as?: 'h2'|'h3' }` — a display-face heading, sentence
case. `h2` (17/24) sits on the grid ground above a group; `h3` (15/20) is a tile's own title row.

## Button
`{ variant?: 'primary'|'secondary'|'ghost'|'danger' (='primary'); size?: 'sm'(36)|'md'(44)|'lg'(48);
   icon?; loading?; fullWidth?; ...ButtonHTMLAttributes }` — `forwardRef`, `type="button"` by default.
Primary is a lume key (light on the dark ground); secondary is raised glass.

## Toast
Mount `<ToastHost />` once in `HealthApp`; call `toast('Meal saved')`, `toast('Quota 80 %', 'warn')`,
`toast('Save failed', 'error')` from anywhere (no context needed). Auto-hides after 2.5 s, `aria-live=polite`.

## Banner
`{ kind: 'info'|'warn'|'error'|'success'; children; onDismiss?; action?: { label; onClick } | ReactNode }`
warn/error are `role="alert"`. Use for quota / integrity problems and the "confirm with your doctor" cue.
