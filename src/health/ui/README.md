# `src/health/ui` — design-system primitives (props cheat-sheet)

Dark-only, 390 px frame, one semantic colour per state (SPEC §0). Import from `'../ui'`:

```ts
import { Ring, Tile, Delta, Sparkline, MacroBar, InsightCard, Chip, Stepper, Sheet,
         SegmentedControl, EmptyState, SectionHeader, Button, ToastHost, toast, Banner,
         ProgressRing, bandColor, bandText, bandBg, bandLabel } from '../ui';
```

All components accept `className`. Numbers: pass raw numbers — `Tile`/`Delta`/`MacroBar` format
with `lib/format.fmt` (tabular numerals are inherited from `.hx`). Null means "no data" and renders
`—`; never pass a placeholder number. Charts (full-size line/heatmap) live in `./charts`.

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

## Ring — hero gauge
`{ value: number|null (0–100); band: Band; size?=220; stroke?=14; label?='Score'; children? }`
Track `--hx-border`, arc in band colour (neutral when null), round caps, `.hx-ring-arc` sweep.
`role="img"` with "Readiness: 72 out of 100, on track". Children are centred (put the 56–64 px
number + verdict there, e.g. `<span className="text-[60px] leading-none font-semibold">72</span>`).

## ProgressRing — small ring (steps, hydration)
`{ value: number|null; max: number; color?: Tone|cssColor='blue'; size?=56; stroke?=6; label?; children? }`

## Tile — metric card
```
{ label; value: string|number|null; dp?=0; unit?; size?: 'md'(28px)|'lg'(32px, protein);
  delta?: { value; good; dp?; unit?; format?; caption?='vs 30-day avg' };
  band?: Band (dot + colours `sub`); sub?: ReactNode ('Balanced'); chart?: ReactNode (Sparkline/ProgressRing);
  onClick?: () => void (whole tile becomes a ≥44 px button); emptyHint?: string (shown when value is null) }
```

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
`{ insight: Insight; onOpen?(prompt: string) }` — left rail by `insight.band`; when `onOpen` and
`insight.coachPrompt` exist the card is a button showing "Ask the coach".

## Chip — pill button
`{ children; onClick?; active?; color?: Tone='neutral'; icon?; size?: 'sm'(36px)|'md'(44px); ...button }`
`active` → tone wash + `aria-pressed`. Icon-only chips need `aria-label`.

## Stepper — − [value] +
`{ value; onChange(n); step?=1; min?; max?; dp?=0; unit?; label?='Value'; size?: 'sm'|'lg'; disabled? }`
44 px (sm) / 56 px (lg) buttons; typed input commits on blur/Enter (clamped, rounded to `dp`); ↑/↓ step.
Weight: `step={0.1} dp={1} unit="lb"`. Tobacco: `step={1} min={0}`.

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
`{ title; action?: ReactNode; caption?: string; as?: 'h2'|'h3' }` — `.hx-label` styled title row.

## Button
`{ variant?: 'primary'|'secondary'|'ghost'|'danger' (='primary'); size?: 'sm'(36)|'md'(44)|'lg'(48);
   icon?; loading?; fullWidth?; ...ButtonHTMLAttributes }` — `forwardRef`, `type="button"` by default.

## Toast
Mount `<ToastHost />` once in `HealthApp`; call `toast('Meal saved')`, `toast('Quota 80 %', 'warn')`,
`toast('Save failed', 'error')` from anywhere (no context needed). Auto-hides after 2.5 s, `aria-live=polite`.

## Banner
`{ kind: 'info'|'warn'|'error'|'success'; children; onDismiss?; action?: { label; onClick } | ReactNode }`
warn/error are `role="alert"`. Use for quota / integrity problems and the "confirm with your doctor" cue.
