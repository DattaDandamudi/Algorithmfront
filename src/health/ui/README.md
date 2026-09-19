# `src/health/ui` — the kit (props cheat-sheet and class table)

The black-stock edition. Read `../DESIGN.md` first; this file is the working reference for building a
screen from the kit alone. Dark only, a 390 px page with 20 px margins (a 350 px measure), one column,
no tiles. Import from `'../ui'`:

```ts
import { Ring, Tile, Delta, Sparkline, MacroBar, InsightCard, Chip, Stepper, Sheet,
         SegmentedControl, EmptyState, SectionHeader, Button, ToastHost, toast, Banner,
         ProgressRing, bandColor, bandText, bandBg, bandBorder, bandLabel } from '../ui';
```

All components accept `className`. Numbers: pass raw numbers; `Tile` / `Delta` / `MacroBar` format with
`lib/format.fmt` (tabular lining numerals are inherited from `.hx`). Null means "no data" and renders `—`;
never pass a placeholder number. Charts live in `./charts` (see `./charts/README.md`).

## Three cascade facts

1. `health.css` loads after Tailwind, so a kit rule beats a utility at equal specificity. Everything a
   screen may legitimately override is therefore declared in `:where()` (zero specificity): the colour of
   every type class, the background and rule colour of `.hx-tag`, the size of `.hx-key`, the flex
   direction of `.hx-row` and `.hx-cell`. `text-hx-*`, `bg-hx-*`, `border-hx-*`, `w-14`, `flex-row` all
   win. A radius on `.hx-raised` does not: write `!rounded-t-[12px]` (the Sheet does).
2. Every text input, textarea and select inside `.hx` is already an underline field (transparent, 1 px
   text2 rule below, 44 px, 16 px type, no radius). Do not add borders or grounds to inputs. Inside a
   `.hx-well` wrapper the input drops its own rule.
3. `.hx-rule` bleeds past the page margin by `--hx-gutter` (20 px on `.hx`; set it on a screen that uses
   another gutter). HealthApp clips the column with `overflow-x-clip`, so the page never widens.

## The type ladder (use the class, never hand-set px)

| Class | Face | Size | Use |
|---|---|---|---|
| `.hx-agate` | Archivo 500, text2 | 12/16 | chart direct labels, ticks, "of 100", the % at the end of a progress rule, tab words |
| `.hx-label` | Archivo 600, text2 | 13/18 | labels, running heads, box-score column heads (name pinned by tests) |
| `.hx-ui` | Archivo 600 | 15/20 | buttons, chips, segment words, ledger verbs |
| `.hx-cap` | Literata 400, text2 | 13/18 | data captions under a figure |
| `.hx-hedge` | Literata 400 italic, text2 | 13/18 | every engine hedge; datelines; the colophon |
| `.hx-body` | Literata 400, text | 15/22 | reading copy, ledger labels, coach replies |
| `.hx-deck` | Literata 400 | 18/24 | Trends lead sentences, the Onboarding deck (the hero deck sets 20/26) |
| `.hx-head` | Archivo 700 | 22/26 | the verdict word, the Today date, section h2 |
| `.hx-masthead` | Archivo 800 width 125 | 32/32 | tab mastheads |
| `.hx-fig-sm` | Archivo 700 width 75 tnum | 28/30 | table figures: set rows, meal kcal, e1RM |
| `.hx-fig` | Archivo 700 width 70 tnum | 40/40 | section figures: box-score cells, ledger figures, Trends leads |
| `.hx-score` | Archivo 800 width 62 tnum | `min(160px, 41vw)`/0.85 | the readiness number, once |
| `.hx-cover` | Archivo 800 width 125 | 64/56 | "Pulse" on Onboarding |
| `.hx-unit` | Literata italic, text2 | `max(15px, 0.4em)` | the unit after a figure; put it inside the figure element (`<span class="hx-fig">7.4<span class="hx-unit">h</span></span>`) so 0.4em follows the figure |
| `.hx-display` | Archivo 700 width 75 tnum | inherits | legacy numeral class: `.hx-fig-sm` without the size |

Type floor: nothing below 12 px; no Literata below 13 px; serif at 13 px is text2, never muted. Width
comes from `font-stretch` inside these classes (Tailwind has no utility for it). Sentence case
everywhere: no all-caps utility, no letter-spacing utility on labels.

## Dividers and blocks

| Class | What it is |
|---|---|
| `.hx-rule` | 1 px bone, full bleed: a section boundary. Only `SectionHeader as="h2"` draws it; at most three per screen |
| `.hx-hair` | 1 px `--hx-border`, inset: a leader, a table row, a disclosure edge |
| `.hx-hair-2` | double hairline, under ledger totals |
| `.hx-score-grid` > `.hx-cell` | box score: two columns, a 1 px column rule at the gutter, row hairlines from the third cell on, 16 px cell padding (odd cells flush left, even cells flush right), never a closed box. A `.hx-row` inside spans both columns |
| `.hx-ledger` > `.hx-row` | ledger: 56 px rows divided by hairlines drawn outside the tap target; `.hx-row` is a flex column (override with `flex-row items-center justify-between` for one-line rows) |
| `.hx-figure` (+ `figcaption`) | a chart block with 16 px vertical padding; its `figcaption` is set as a hedge |
| `.hx-note` | indented 16 px behind a 2 px left rule in currentColor (or a `border-hx-*` utility); the tone word first |
| `.hx-tag` | 44 px, 1 px rule (text2 by default, tone via `border-hx-*`), 4 px radius, transparent, put `.hx-label` inside |
| `.hx-field` | the underline field as a class, for wrappers that are not inputs (the AI estimate field) |
| `.hx-key` | 44 px rule-outlined square key that settles 1 px on press (`w-14 h-14` for 56) |
| `.hx-tone` | 8 px inline square in currentColor: the carrier beside a state word |
| `.hx-rule-in` | the hero's ink rule drawing left to right, 480 ms from 200 ms |
| `.hx-print` | the score numeral fading in over 320 ms |
| `.hx-ring-arc` | the dial arc drawing over 600 ms (Ring sets it) |
| `.hx-slip` | the toast's 6 px rise (Toast sets it) |
| `.hx-pulse` | skeleton bars only |

Legacy material names still exist and mean new things: `.hx-card` is a transparent figure block with
16 px vertical padding; `.hx-raised` is a plate (card2 ground, 1 px text2 rule on the top edge, 4 px
radius, no blur, no shadow); `.hx-well` is a ruled control (transparent, 1 px text2 outline, 4 px
radius); `.hx-bento` is one column with `gap: 0`; `.hx-span-2` / `.hx-row-2` are no-ops;
`.hx-lume-glow` / `.hx-lume-text` are empty; `.hx-press` inks the element's own border on press.
Tailwind: the `tile` radius token is 0 and the `ctl` token 4 px (through the two radius variables), so
the existing usages need no edits; `font-serif` is Literata. Do not use `.hx-raised`, `.hx-well` or any radius on something that is only read.

## bands.ts

| fn | returns |
|---|---|
| `bandColor(tone)` | CSS string `var(--hx-green)` for SVG strokes/fills, inline styles |
| `bandText(tone)` / `bandBg(tone)` / `bandBorder(tone)` | Tailwind `text-hx-*` / `bg-hx-*` / `border-hx-*` |
| `bandSoftBg(tone)` | `bg-hx-*/15` wash (only on the stock or a plate, never under muted text) |
| `bandLabel(band)` | "On track" / "Caution" / "Off track" / "No signal" / "Info" |
| `bandFromScore(0–100 \| null)` | WHOOP bands: ≥67 green, 34–66 yellow, <34 red, null → neutral |
| `deltaTone(good, delta)` | green / red / neutral for ▲▼ glyphs |

`Tone = Band | 'blue'`; every helper accepts `Band` (from `data/types`) or `'blue'`.

## Ring — the 44 px hairline dial
`{ value: number|null (0–100); band: Band; size?=44; stroke?=2.5; label?='Score'; glow?; children? }`
A 1 px `--hx-border` track, two 1 px text2 notches at 34 and 67, a `stroke` px arc in the band token with
butt caps that draws in on mount. `value` null draws the track only (no arc element, so no band stroke in
the markup). `role="img"` "Readiness: 72 out of 100, on track". `glow` is accepted and ignored. Put the
numeral beside the dial as type; `children` are still centred over it for the hero until it is rebuilt.

## ProgressRing — a 32 px dial where a ring is still wanted (hydration)
`{ value: number|null; max: number; color?: Tone|cssColor='blue'; size?=32; stroke?=2; label?; children? }`
1 px track, `stroke` px arc, butt caps. Elsewhere use a progress rule (MacroBar, or a 2 px `.hx-hair` with an ink fill).

## Tile — a box-score cell, or a ledger row with `span={2}`
```
{ label; value: string|number|null; dp?=0; unit?; size?: 'md'|'lg' (both set .hx-fig);
  delta?: { value; good; dp?; unit?; format?; caption?='vs 30-day avg' };
  band?: Band (tone square + colour on `sub`); sub?: ReactNode; chart?: ReactNode (Sparkline / progress rule / ProgressRing);
  chartLayout?: 'inline'|'stack'; span?: 1|2; rows?: 1|2 (no-op);
  onClick?: () => void (the whole block becomes a 56 px button that inks its leader); emptyHint?: string }
```
Transparent. A cell (`.hx-cell`) stacks label, figure with unit, band line, chart, delta. A row (`.hx-row`)
puts the label left and the figure flush right on one line, then the chart, caption and delta. The label
is the only `.hx-label` inside a Tile (a render test slices tiles by that class). Place cells directly
inside `.hx-score-grid` and rows inside `.hx-ledger`.

## Delta — ▲ 3 ms vs 30-day avg
`{ value: number|null; good: boolean|null; dp?=0; unit?; format?(abs); caption?='vs 30-day avg' }`
A 10 px triangle in the tone, the figure in text2 (tnum), the caption in muted. Pass `caption=''` to hide it.
The markup order (`▼</span><span aria-hidden="true"> 3 ms</span>`) is pinned by tests; do not wrap the figure.

## Sparkline — 1 px mini line
`{ values: Array<number|null>; width?=96; height?=28; color?='var(--hx-text-2)'; band?: [lo,hi]|null;
   baseline?: number|null; highlightLast?: boolean; title?='Trend' }`
Nulls as gaps, the band a 9 percent bone wash with no edge, the baseline a dotted hairline, the last point a 3 px bone dot. `aria-hidden`.

## MacroBar — a ledger row with a progress rule
`{ label; value: number|null; target: number; range?: [lo,hi]; targetLabel?; floor?: number; unit?='g';
   color: Tone ('neutral' fills in bone); remainingLabel?=true }`
Label in `.hx-body`, the eaten figure flush right in `.hx-fig-sm` with "of 176 g" as its unit, a 2 px
`--hx-border` track with an ink fill, "x g left" / "in range" / "x g over" in `.hx-agate` at the rule's
end, the floor a hairline tick with an agate label (adds bottom padding). `role="meter"`.

## InsightCard — a brief
`{ insight: Insight; onOpen?(prompt: string) }`. The tone word (`bandLabel(insight.band)`, "Note" when neutral) hangs in a 72 px
left column in `.hx-label` with a tone square; title `.hx-ui`, body `.hx-body`, "Ask the coach" an
underlined verb; a hairline beneath. When `onOpen` and `insight.coachPrompt` exist the whole brief is the
button. No entrance animation.

## Chip — a tag
`{ children; onClick?; active?; pressed?; color?: Tone='neutral'; icon?; size?: 'sm'|'md'; ...button }`
44 px, `.hx-tag` + `.hx-label`, 4 px radius, transparent. Idle: text2 word, rule in the tone (text2 when
neutral). `active`: the tone wash exactly as the hero test pins it (`bg-hx-red/15 text-hx-red
border-hx-red/40`) plus a tone square. `pressed` drives `aria-pressed`; set it on real toggles only. Icons
only where they carry meaning (the hero's). Icon-only chips need `aria-label`.

## Stepper — − [ 231.5 ] +
`{ value; onChange(n); step?=1; min?; max?; dp?=0; unit?; label?='Value'; size?: 'sm'|'lg'; disabled? }`
Two `.hx-key` keys (44 px; `lg` 56 px) around a `.hx-fig-sm` (`lg`: `.hx-fig`) text input that flexes to
the space between them; the unit follows as `.hx-unit`. The group is `display: flex`; pass `w-full` to fill a
column, and two steppers side by side in 350 px keep "231.5" whole. Typed input commits on blur/Enter
(clamped, rounded to `dp`); ↑/↓ step. Key names: "Decrease {label}" / "Increase {label}"; `role="group"`.

## Sheet — bottom sheet
`{ open; onClose; title?; children; footer? }`. A plate with a 12 px top radius, a 1 px text2 top rule and
a 32 by 2 px lume grabber; the title is a running head (`.hx-label`); "Close" is a 44 px X. Dialog,
aria-modal, ESC and backdrop close, scroll lock, focus trap, focus returns to the opener, max-h 88dvh,
240 ms slide (instant under reduced motion). Portalled into `.hx`. Put Save/Cancel `<Button>`s in `footer`
(it gets a hairline above). No nested sheets.

## SegmentedControl — words on a hairline
`{ options: Array<{ value; label; disabled? }>; value; onChange(v); size?: 'sm' (.hx-label) | 'md' (.hx-ui); ariaLabel }`
Words 16 px apart on a hairline, each 44 px tall; the checked word is bone with a 2 px ink underline.
Generic on the value type; radiogroup with arrow-key roving focus. Pass `w-full` to stretch the hairline.

## EmptyState
`{ icon? (accepted, not drawn); title; hint; action?: { label; onClick } }`. An italic `.hx-body` paragraph
under a hairline: the title in bone, then the hint in text2, then a ghost verb. Use the SPEC §1 copy.

## SectionHeader — the running head
`{ title; action?: ReactNode; caption?: string; as?: 'h2'|'h3'; rule?: boolean }`
`h2` draws the full-bleed ink rule above itself (12 px to the head); `h3` (or `rule={false}`) does not.
Title flush left in `.hx-label`; `caption` is the dateline flush right in `.hx-hedge` and should be real
metadata ("vs your 30-day avg", "3 meals left, 14:20"); `action` is a slot for a ghost verb or a range
toggle. The screen owns the 40 px above a ruled head (`mt-10`) and the 16 px below it (`mt-4`).

## Button
`{ variant?: 'primary'|'secondary'|'ghost'|'danger' (='primary'); size?: 'sm'(44)|'md'(44)|'lg'(48);
   icon?; loading?; fullWidth?; ...ButtonHTMLAttributes }`, `forwardRef`, `type="button"` by default.
Primary is an ink key (`bg-hx-lume text-hx-base`, 4 px radius, no shadow); secondary a 1 px text2 outline;
ghost an underlined verb (1 px, 3 px offset, 4 px side padding, 44 px tall); danger a red outline and word.
Keys settle 1 px on press. Words are `.hx-ui`, verbs with no arrows. `icon` still renders, but the design
wants icons only for `loading`.

## Toast
Mount `<ToastHost />` once in `HealthApp`; call `toast('Meal saved')`, `toast('Quota 80 %', 'warn')`,
`toast('Save failed', 'error')` from anywhere. A plate slip (1 px text2 rule, no radius) 6 px above the
running foot, the message in `.hx-body` with a tone square for the kind, a 44 px "Dismiss". Auto-hides
after 2.5 s, `aria-live="polite"`.

## Banner — a note
`{ kind: 'info'|'warn'|'error'|'success'; children; onDismiss?; action?: { label; onClick } | ReactNode; lead?: string }`
A 2 px left rule in the tone; the tone word ("Note" / "Done" / "Caution" / "Problem", or `lead`, e.g.
"Physician follow-up:") first in `.hx-label`, the message in `.hx-body`; the action a ghost verb; a 44 px
"Dismiss". warn/error are `role="alert"` on a plate (`bg-hx-card2`); info/success are `role="status"` on the
stock. No icon, no radius.

## Running foot (HealthApp)
Not exported: stock at 96 percent with a hairline above, six 48 px items, 20 px icons at a 1.5 stroke,
`.hx-agate` words, the active item bone with a 20 by 2 px lume underline under its icon, `aria-current`.
Screens reserve `pb-24` for it (HealthApp does).
