# Pulse — visual design specification (the black-stock edition)

This is the spec every screen is built to. Read it before touching a `.tsx` under
`src/health/`. Where it disagrees with what a file currently does, the file is wrong.
It replaces the "instrument panel under glass" spec: same engine, same data, same
tests, same medical boundary, a different object in the hand.

## Thesis: a sports quarterly printed on black stock

Pulse is a page, not a panel. The reader should feel they are holding a matte sheet
of uncoated black paper on which the numbers are ink, not light. A physiology
instrument earns trust by being checkable, and print is the visual language of the
checkable fact: one big figure, a small precise caption, the uncertainty set right
beside it in the same ink, nothing glowing to sell it. At 6 a.m. in bed it reads as a
calm page rather than a lit dashboard; mid-workout the 160 px score and the 28 px set
figures read from arm's length.

Three consequences carry the whole design:

1. **Hierarchy is typographic.** Size, width, weight and two kinds of rule. No card
   ever wraps a reading. There are no tiles, no bento, no glass, no glow, no shadow,
   no gradient, no radius on anything you only read.
2. **Ink, not accent.** Bone on warm charcoal is the page. The four semantic inks
   (green, amber, red, blue) appear only as a word, an arc, a tag rule or a tone
   square. A screenful is bone on charcoal with, typically, one coloured word.
3. **Rules mean something.** A full-bleed ink rule is a section boundary. An inset
   hairline is a leader between a figure and its caption, or a row of a table. A
   vertical hairline splits a two-up box score. Nothing is ever framed on four sides.

The theme is dark because the primary read is at 6 a.m. with dark-adapted eyes next to
a sleeping partner. It is not the generic near-black-with-an-accent: the black is a
warm charcoal with a visible surface, the white is bone, every grey is the same warm
ink at a lower density, and there is no single accent.

## Palette

All values live on `.hx` in `health.css` and in `tailwind.config.js`. Token *names*
are unchanged because tests pin classes (`text-hx-red`, `bg-hx-red/15`); only values
moved. Contrast ratios are computed on the flat token.

| Token | Hex | Role | Contrast |
|---|---|---|---|
| `--hx-base` stock | `#100E0B` | the page | text 15.5:1, text2 9.4:1, muted 5.8:1 |
| `--hx-card` sheet | `#181512` | a tipped-in object only: the AI estimate field, zebra rows in long ledgers, the toast. Never behind a reading | text 14.6:1, muted 5.5:1 |
| `--hx-card-2` plate | `#221E1A` | lifted things: bottom sheets, stepper keys, `role=alert` banners | text 13.3:1, muted 5.0:1 (never set muted below 13 px on it) |
| `--hx-border` hairline | `#3D362F` | leader, row and column rules, chart hairlines, the dial track. Structural only, never a control boundary | 1.6:1 vs base by design |
| `--hx-text` bone | `#EDE6D8` | primary ink; also the ink rule, trend lines, the primary key, heat-map ink | 15.5:1 on base |
| `--hx-text-2` | `#BDB4A4` | second ink density: labels, running heads, captions, control outlines | 9.4:1 base, 8.1:1 plate |
| `--hx-muted` | `#958C7D` | third density: datelines, agate ticks, the colophon | 5.8:1 base, 5.0:1 plate |
| `--hx-green` | `#7CC993` | on track: a verdict word, an arc, a tag rule, a band word | 9.8:1 base |
| `--hx-yellow` amber | `#E2B14F` | caution; also the suspect weigh-in cross | 9.8:1 base |
| `--hx-red` | `#F2786F` | off track; the hero chip's `bg-hx-red/15` + `text-hx-red` that tests pin | 7.1:1 base, 4.9:1 on its own /15 wash over plate |
| `--hx-neutral` | `#A39B8F` | no signal: the empty arc, "Calibrating", "No signal" | 7.0:1 base |
| `--hx-blue` | `#89B5EE` | informational: links, the source word, the "now" marker, steps before goal | 9.1:1 base |
| `--hx-lume` | `#F7F1E5` | brightest ink: the 2 px focus ring, the active-tab underline, the sheet grabber. No glow anywhere | 17.1:1 base |

Rules: band `/15` washes sit only on the stock or the plate, never under muted text.
Every input, button and chip boundary is a `--hx-text-2` rule (9.4:1), never
`--hx-border`, so the 3:1 non-text rule clears.

## Type

Two families from Google Fonts, both verified on the latin subset Google serves to
carry `tnum` and lining figures and the true minus. The health `<link>` in
`index.html` is:

```
family=Archivo:wdth,wght@62..125,100..900
family=Literata:ital,opsz,wght@0,7..72,300..700;1,7..72,300..500
```

- **Archivo** — display, every numeral, every interface word. Its 62–125 width axis
  is the whole vocabulary: the score at width 62 is a jersey number, the masthead at
  125 is a wide slab, tables sit at 70–75, labels and buttons at 100. Big figures are
  made tall by **width, not weight**. Archivo has no optical-size axis, so tracking
  tightens by size (−0.03em at 160, −0.01em at 40, 0 at 28 and below).
- **Literata** — reading text: the verdict deck, body copy, captions, every hedge in
  italic, coach replies, settings help, the colophon. A low-contrast screen serif
  designed for dark reading, so its hairlines do not burn out on black. Its optical
  axis gives a sturdier cut at 13 px and a lighter one at 18–20.

`.hx` sets `font-family: Archivo` and `font-variant-numeric: tabular-nums lining-nums`
(Literata's default figures are proportional, so that declaration is load-bearing).
Serif is opted into with the classes below. **Type floor: no Literata below 13 px, and
serif at 13 px is `--hx-text-2`, never `--hx-muted`.** Nothing on any screen is set
below 12 px. Agate (12 px) is always Archivo.

The ladder, as classes in `health.css` (use the class, do not hand-set px):

| Class | Face | Size | Use |
|---|---|---|---|
| `.hx-agate` | Archivo 500 wdth 100, text2 | 12/16 | chart direct labels, axis ticks, "of 100", the % at the end of a progress rule, tab words |
| `.hx-label` | Archivo 600 wdth 100, text2 | 13/18 | labels, running heads, box-score column heads (name pinned by tests) |
| `.hx-ui` | Archivo 600 wdth 100 | 15/20 | buttons, chips, segment words, ledger verbs |
| `.hx-cap` | Literata 400, text2 | 13/18 | data captions under a figure |
| `.hx-hedge` | Literata 400 italic, text2 | 13/18 | every hedge the engine writes; datelines; the colophon |
| `.hx-body` | Literata 400, text | 15/22 | reading copy, ledger labels, coach replies |
| `.hx-deck` | Literata 400 | 18/24 | Trends lead sentences, Onboarding deck; the hero deck sets 20/26 |
| `.hx-head` | Archivo 700 wdth 100 | 22/26 | the verdict word, the Today date, section h2 where a section has a title |
| `.hx-masthead` | Archivo 800 wdth 125 | 32/32 | the tab mastheads: Log, Train, Trends, Coach, Settings |
| `.hx-fig-sm` | Archivo 700 wdth 75 tnum | 28/30 | table figures: set rows, meal ledger kcal, e1RM |
| `.hx-fig` | Archivo 700 wdth 70 tnum, −0.01em | 40/40 | section figures: box-score cells, ledger figures, Trends lead figures |
| `.hx-score` | Archivo 800 wdth 62 tnum, −0.03em | `min(160px, 41vw)`/0.85 | the readiness number, once, on Today |
| `.hx-cover` | Archivo 800 wdth 125 | 64/56 | "Pulse" on Onboarding only |
| `.hx-unit` | Literata 400 italic, text2 | `max(15px, 0.4em)` | the unit after a figure, baseline-aligned, 4 px gap |
| `.hx-display` | Archivo 700 wdth 75 tnum | inherits | the legacy numeral class; equals `.hx-fig-sm` without the size |

Units never share the numeral's face: `7.4 h`, `54 ms`, `1,240 kcal`. `6,240` steps
takes no unit. Signs are the true minus. Figures inside running prose are never bumped
in size or weight. "Calibrating" where the score would be is `.hx-fig` in text2, not a
number the reader would take literally.

## Layout grammar

One column. 20 px outer margins, a 350 px measure. No gutters, because there are no
tiles. Vertical rhythm on an 8 px base: 40 px above an ink rule, 12 px from rule to
running head, 16 px from running head to content, 24 px between figures inside a
section.

Four dividers, each meaning exactly one thing:

| Device | Class | What it is | Meaning |
|---|---|---|---|
| ink rule | `.hx-rule` | 1 px `--hx-text`, full-bleed edge to edge (negative margins to the viewport) | a section boundary. At most **three per screenful**. Only `SectionHeader` draws it |
| hairline | `.hx-hair` | 1 px `--hx-border`, inset to the margins | a leader from figure to caption, a table row, the top and bottom of a disclosure |
| column rule | drawn by `.hx-score-grid` | 1 px vertical `--hx-border` at the gutter | splits a two-up box score. Never closed into a box |
| space | 24 / 40 px | nothing | separation inside a section / before a rule |

No rule is four-sided, doubled or used as a frame. The two rule weights are visibly
different (bone versus hairline) so the reader can tell boundary from leader.

**Running heads.** Every section opens with one: the section name flush left in
`.hx-label` ("Last night and this morning", "Food", "Training", "Energy", "Weight"),
and a **dateline** flush right in `.hx-hedge` carrying real metadata ("vs your 30-day
avg", "3 meals left, 14:20", "Last 30 days, 21 Aug to 19 Sep"). No numbering, because
sections are not a sequence. The only counted thing in the app is Onboarding's
"Step 2 of 4", which is one.

**Three block types cover every reading:**

- **Box score** (`.hx-score-grid` > `.hx-cell`): two-up cells with a column rule and
  row hairlines. Sleep / HRV / Resting HR / Steps; Train set rows; Trends stat pairs.
  A cell is label (`.hx-label`), figure (`.hx-fig` + `.hx-unit`), a delta or band
  line (13/18), and an optional 2 px progress rule or 1 px sparkline. When tappable
  the whole cell is the button, min-height 56 px.
- **Ledger** (`.hx-ledger` > `.hx-row`): label left in `.hx-body`, figure flush right
  in `.hx-fig`, a 2 px progress rule beneath, a caption sentence under that. Protein,
  calories, water, meals, weight, tobacco, the "Why this score" contributors, Settings
  rows. Rows divide by hairlines drawn **outside** the 56 px tap target. Ledger totals
  sit under a double hairline.
- **Figure** (`.hx-figure`): a chart with its lead figure at 40 px above it, direct
  labels inside, and an italic caption below. Every Trends card, the energy curve,
  the e1RM chart, the weight trend.

**What a card becomes.** The same content with no background, border, radius or
shadow, bounded above by its running head and below by the next ink rule. Tappable
blocks are the button: min-height 56 px, full width, the leader hairline inks to
`--hx-text` on press, a visible verb at the right ("Open", "Ask") where the block
navigates, and the 2 px lume focus ring around the block.

**Tipped-in surfaces** — the only things with a ground of their own: the AI estimate
field (sheet), bottom sheets (plate), stepper keys and the primary ink key, the toast
(plate slip), `role=alert` banners (plate), a chart tooltip (plate slip).

**Radius is a tap signal.** `--hx-radius: 0` on everything read; `--hx-radius-sm: 4px`
on chips, keys, inputs and tags; 12 px on a sheet's top corners. A rounded corner
means "you can press this" and a square one means "read this".

**Sticky headers go.** Mastheads scroll away with the page. Only Trends keeps its
masthead row sticky, because the range toggle is a live control; it sits on the flat
stock with a hairline beneath (no tint, no blur). The running foot (tab bar) is the only fixed element.

**Alignment:** flush left everywhere. Datelines and the figure column of a ledger are
flush right, which makes the right margin a second axis for numbers. Nothing is
centred except the tab-bar icons.

## The CSS kit (health.css)

Old material names keep existing so the tree stays coherent, but they mean new things:

| Class | Now means |
|---|---|
| `.hx-card` | a figure block: transparent, no border, no radius, no shadow; 16 px vertical padding |
| `.hx-raised` | a plate: `--hx-card-2` ground, 1 px `--hx-text-2` rule on the leading edge, no blur, no shadow, 4 px radius |
| `.hx-well` | a ruled control: transparent, 1 px `--hx-text-2` outline, 4 px radius (inputs get the underline field instead) |
| `.hx-bento` | one column, `gap: 0`; `.hx-span-2` and `.hx-row-2` are no-ops kept for the names |
| `.hx-lume-glow`, `.hx-lume-text` | empty rules kept for the class names |
| `.hx-press` | a pressed block inks its leader; keys settle 1 px |
| `.hx-tabbar` | the running foot: flat stock, 1 px hairline rule above, no glass, no tint, no radius |

New classes: `.hx-rule`, `.hx-hair`, `.hx-hair-2` (double hairline for totals),
`.hx-score-grid`, `.hx-cell`, `.hx-ledger`, `.hx-row`, `.hx-figure`, `.hx-note` (a
note indented 16 px with a 2 px left rule in the tone, the tone word first), `.hx-tag`
(a 44 px tag: 1 px rule in the tone, 4 px radius, `.hx-label` inside), `.hx-field` (an
underline field: transparent, 1 px `--hx-text-2` bottom rule, 44 px, no radius),
`.hx-key` (a 44 px rule-outlined square key), `.hx-tone` (an 8 px filled square in
`currentColor`, inline, the non-colour carrier beside a state word), the type classes
above, and `.hx-rule-in` (the hero's ink rule drawing left to right on mount).

Tailwind: `rounded-tile` becomes 0 and `rounded-ctl` 4 px through the two radius
variables, so the 50 existing usages update without touching screen files.

## Today, in ASCII (390 px, 20 px margins)

```
   0 ┌──────────────────────────────────────────────┐
  20 │ Saturday 19 September            [Upper day] │  date .hx-head; day type a .hx-tag flush right
  56 ├══════════════════════════════════════════════┤  INK RULE (draws in on mount)
  84 │ ▐▀▀▌▐▀▀▌   Primed                            │  score .hx-score flush left (≈115 px for two digits)
     │   ▐ ▐  ▌   ◔ of 100                          │  right column, 24 px in: verdict word .hx-head in band colour
     │   ▐ ▐▄▄▌   Confidence 66–78                  │  44 px hairline dial (role="img") + .hx-agate; the confidence line .hx-label
     │   ▐ ▐      From WHOOP recovery               │  .hx-hedge
     │   ▐ ▐▄▄▌   [ Progress ]  Tap to ask the coach│  the training Chip (44 px tag, band wash) + .hx-agate
 236 │ ────────                                     │  LEADER hairline, 56 px
 252 │ Primed — progress loads today                │  the deck: Literata 20/26 in the band colour (engine verdict, unedited)
 290 │ The morning answer to how much strain your   │  .hx-hedge
     │ body can take today.                         │
 322 │ ─────────────────────────────────────────────│  hairline
     │ Why this score                             ⌄ │  native <details>: 48 px summary in .hx-ui; contributors as a ledger inside
     │ ─────────────────────────────────────────────│  hairline
 380 │ Morning check-in    Not yet today   Check in │  StressStrip as a 56 px ledger row; WeighInPrompt the same shape beneath it
     │ Weigh-in            Not yet today   Log weight
 460 ├══════════════════════════════════════════════┤  INK RULE
 472 │ Last night and this morning  vs your 30-day avg  running head + dateline
     │                       │                      │  COLUMN RULE
 504 │ Sleep                 │ HRV                  │  .hx-label
 520 │ 7.4 h                 │ 54 ms                │  .hx-fig + .hx-unit
 564 │ ▲ 0.4 h vs 30-day avg │ ■ Balanced  ▲ 3 ms   │  13/18; tone square + band word; delta triangle in tone
 582 │ ━━━━━━━━━━━━━━━──  7.9 h  ╱╲╱‾╲─╱  7 days     │  2 px progress rule of need / 1 px sparkline with a 9% band wash
 604 │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │  ROW hairline
 620 │ Resting HR            │ Steps                │
     │ 52 bpm                │ 6,240                │
     │ ▼ 2 bpm vs 28-day avg │ Goal 8–10k           │
     │ Baseline 54 bpm       │ ━━━━━━━━━━━━──── 78% │  steps rule in blue until goal, green after; agate %
 756 ├══════════════════════════════════════════════┤  INK RULE
 768 │ Food                      3 meals left, 14:20│
 800 │ Protein remaining                       93 g │  ledger row: .hx-body left, .hx-fig flush right
     │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 47% │  2 px progress rule
     │ ~31 g × 3 meals left. 83 g of 176 g eaten.   │  .hx-cap (pacing copy as the engine writes it)
     │ Calories remaining                 1,240 kcal│
     │ of 2,600, TDEE about 2,720                   │
     │ … Training (fixture row), Energy (figure),   │  three ink rules are spent above, so the sections
     │   Insights (briefs), Weight, Tobacco, Nudges │  below divide by 40 px of space and their running heads
     │ ─────────────────────────────────────────────│  hairline
     │ Wellness information only, not medical advice│  the colophon, .hx-hedge
     └──────────────────────────────────────────────┘
       running foot: hairline above, six 48 px items, .hx-agate words,
       active = bone with a 20 × 2 px lume underline under the icon, inactive muted
```

At three digits ("100") or "Calibrating" the right column wraps under the numeral;
the numeral is clamped by `41vw`.

## The other tabs

- **Log** — the AI estimate field is the tab's one tipped-in surface: a 52 px sheet
  field with a `--hx-text-2` underline and an italic placeholder, the Estimate button
  an ink key beside it. Fast paths are a row of tags. Meals are a ledger: time in a
  56 px agate column, the meal in `.hx-body`, protein and kcal in `.hx-fig-sm` flush
  right, totals under a double hairline. The check-in is four rows of seven 44 px
  cells divided by hairlines with the `.hx-label` `h-11` numerals (both names kept)
  and "Lower is better on all four" as the dateline. Weight, water and bedtime are
  ledger rows with rule-outlined keys.
- **Train** — a match programme. The planned session is a fixture list: exercise in
  `.hx-ui`, the prescription "82.5 kg × 4" in `.hx-fig-sm`, the plan word in its tone
  with a tone square. Set rows are a box score with a column rule between weight and
  reps and figures at 28 px, because this is the mid-workout screen. The e1RM chart is
  a 1.5 px ink line with the last value labelled at the line end; the 14-day strip is
  fourteen hairline cells filled by ink density with the day letter beneath; the rest
  timer figure is `.hx-fig`. The Today / Log / History / Analysis switch is four words
  on a hairline, the active one underlined 2 px in bone.
- **Trends** — every chart is a figure: running head and dateline, a `.hx-fig` lead
  with its band word ("182.4 lb, in target"), the rate sentence as a `.hx-deck`, the
  chart in hairlines with direct labels, a **source line** under the figure ("Kalman-
  smoothed, 90% band; 24 weigh-ins in 30 days") and the engine's meaning sentence as
  `.hx-hedge`. The 7D / 30D / 90D / 1Y toggle sits in the sticky masthead row as words
  with an ink underline on the active one.
- **Coach** — a printed interview, no bubbles. Each turn is a paragraph with a hanging
  speaker word in a 56 px left column ("You", "Coach" in `.hx-label`), the user's line
  in Archivo 15/22 500, the coach's reply in `.hx-body`, a hairline between turns.
  Prompt chips are tags above an underline composer with an ink-key Send; the
  disclaimer is the colophon.
- **Settings** — an index page. Each section is a 56 px ledger row: title in `.hx-ui`,
  caption in `.hx-hedge`, a hairline between rows, no icons. Opening a section inks
  its top hairline; forms inside use underline fields with `.hx-label` labels. About
  ends with a true colophon: version, where data lives, "Set in Archivo and Literata."
- **Onboarding** — the cover. "Pulse" in `.hx-cover`, a `.hx-deck`, then a contents
  list of what the steps set up; each step's dateline reads "Step 2 of 4"; underline
  fields; one ink-key "Continue".

## Data marks (the graphics desk)

Hairlines, direct labels, no legend, no gridlines, no y-axis line, no fills except a
9% ink wash where a band applies, and every chart keeps its hidden data table. The
`dataviz` skill's rules (one system, direct labels, accessible colour) apply; where it
and this section disagree, this section wins on colour because the palette is fixed.

- **Ring** — a 44 px hairline dial: 1 px `--hx-border` track, 2.5 px arc with
  `stroke="var(--hx-green)"` (or the band's token), butt caps, two 1 px notches on
  the track at 34 and 67 (the band cuts, so the arc reads against real thresholds),
  no glow, no well, no children. `role="img"` and "Readiness: 72 out of 100, on track"
  unchanged. Calibrating draws the track only. The numeral lives beside it as type.
- **Progress rule** — replaces `ProgressRing` and `MacroBar` fills: a 2 px
  `--hx-border` track with an ink fill in `--hx-text` (a tone token only when a band
  applies; blue for steps before goal), the percentage or "x g left" in `.hx-agate` at
  its end, a floor tick as a hairline with its agate label. `role="meter"` kept.
- **Sparkline** — 1 px `--hx-text-2` line, nulls as gaps, the last point a 3 px bone
  dot, the SWC band a 9% bone wash with no edge, the baseline a dotted hairline.
- **Band chart** (weight, expenditure posterior) — the 90% band a 9% bone wash, the
  trend 1.5 px bone, scale readings 2.5 px hollow text2 circles, a suspect weigh-in an
  amber cross named in the caption; two direct labels in agate at the right edge (the
  value at the line end, "90% band" at the ribbon's top); three date ticks on one
  bottom hairline; the target strip beneath a 2 px rule with the zone as a wash, a
  2 px tick for this week, its state a word.
- **Energy curve** — 1.5 px bone **solid up to now, 1 px dashed after it**, so
  "predicted, not measured" is visible before it is read; "now" a vertical hairline
  with the time in blue agate; the trough labelled on the curve; wake and bed times
  the only x labels; the engine's hedge as the caption.
- **Heat map** (volume, adherence) — a hairline grid whose cells fill by ink density
  (bone at 12 / 28 / 50 / 80%), never a colour ramp; the legend written as words; the
  band state a word in the row's right margin; wider than 350 px scrolls inside its
  own container.
- **CI bars** (behaviour impact) — a 1 px text2 line from lo to hi, a 2 px bone tick
  at the estimate, a dotted hairline at zero, the estimate written as text with the
  interval in brackets and the word "likely" or "unclear" beside it, so the bar is
  never the only carrier.
- **Load and ACWR** — 1.5 px bone line, the 0.8–1.3 zone a 9% wash labelled inside it,
  the ACWR word in its tone next to the lead figure.
- **Tooltip** — a plate slip (`.hx-raised`), `.hx-agate` values, no arrow.
- **Tone square** — `.hx-tone`, 8 px, `currentColor`, before every state word where a
  wash is not test-pinned. Colour is never the only carrier.
- **Three resolutions where the dataviz references and this page could disagree:**
  baselines and zero lines are solid hairlines (only the forecast segment after "now"
  is dashed, because that dash is data); bars are square-ended (radius belongs to
  controls); two or more series are identified by words at the line ends, which is the
  legend, never a swatch box.

## Primitives (ui/), one line each

- **Tile** — a box-score cell or, with `span={2}`, a ledger row; transparent; `.hx-label`, `.hx-fig` + `.hx-unit`, delta line, chart slot as a progress rule or sparkline; `onClick` makes the block a 56 px button that inks its leader.
- **Ring** — the 44 px hairline dial above; `glow` prop accepted and ignored; default `size=44`, `stroke=2.5`.
- **ProgressRing** — kept at 32 px with a 1 px track / 2 px arc where a ring is still wanted (hydration); elsewhere use the progress rule.
- **SectionHeader** — the running head; `as="h2"` draws the ink rule above itself, title `.hx-label`, caption as a dateline flush right in `.hx-hedge`, action as a ghost verb; `as="h3"` drops the rule.
- **Button** — primary an ink key (`bg-hx-lume text-hx-base`, 48 px, `.hx-ui`, 4 px radius, no shadow); secondary a 1 px text2 outline; ghost an underlined verb (1 px, 3 px offset, 44 px hit area); danger a red outline and word. No arrows. Icons only for loading.
- **Chip** — a tag: 44 px, 1 px rule in the tone (text2 when neutral), 4 px radius, `.hx-label`, transparent; `active` keeps the tone wash classes (`bg-hx-red/15 text-hx-red border-hx-red/40`) the hero tests pin, plus a tone square.
- **SegmentedControl** — words on a hairline, 16 px apart, the active word underlined 2 px bone, 44 px tall; radiogroup and arrow keys kept.
- **Sheet** — a plate with a 12 px top radius, a 1 px text2 top rule and a 32 × 2 px lume grabber, no blur; title as a running head inside; dialog, focus trap and return unchanged.
- **Banner** — a note: 2 px left rule in the tone, the tone word or the existing lead ("Physician follow-up:") first, `.hx-body`, plate ground only for `role=alert` kinds, no radius, action as a ghost verb, 44 px dismiss.
- **Toast** — a plate slip with a 1 px text2 rule, `.hx-body`, no radius, 6 px above the running foot; `aria-live` kept.
- **InsightCard** — a brief: the tone word hanging in a 72 px left column in `.hx-label` with a tone square, the body `.hx-body`, "Ask the coach" a ghost verb, a hairline beneath; the whole brief the button.
- **Delta** — 10 px triangle in the tone plus a tnum figure in text2 plus the caption in muted; same API.
- **Sparkline / MacroBar / EmptyState / Stepper** — per the marks above; EmptyState is an italic `.hx-body` paragraph under a hairline with a ghost verb, no dashed box; Stepper is two 44 px keys around a `.hx-fig-sm` figure (lg: 56 px keys, `.hx-fig`).
- **Tab bar** (HealthApp) — the running foot: flat stock, hairline above, six 48 px items, icons 20 px at 1.5 stroke, `.hx-agate` words, active bone with a 20 × 2 px lume underline under the icon, inactive muted; `aria-current` kept.

## Copy voice

A page, not a panel. Running heads name the content ("Last night and this morning",
not "Metrics"; "Food", not "Nutrition"). Datelines are true metadata, never
decoration. Every hedge the engine writes is set as an italic caption under the thing
it hedges, unedited. The verdict is the only headline voice in the app and it is the
engine's sentence as written. Buttons are verbs from the user's side with no arrows:
"Log a meal", "Open session", "Log weight", "Continue". Units always follow figures.

- Sentence case everywhere. No ALL CAPS, no letter-spacing on labels.
- No middle dots, except the two test-pinned facts inside "Why this score"
  (`54 ms · 0.4 SD above your normal · raised the score`, `Lowered the verdict ·
  Overnight strain: major`).
- No "WORD — fragment" labels. No "→" appended to links or buttons.
- Engine copy (hedges, uncertainty phrasing, "not a diagnosis") is not edited.
- The medical boundary is the colophon: "Wellness information only, not medical
  advice." once per tab, `.hx-hedge`, under a final hairline, never in a card.
- Keep these strings verbatim because tests pin them: "Check in", "How did you sleep
  and how do you feel?", "Open today's session", "+1 more in Train", "Confidence
  66–78" (en dash), "Goal 8–10k", "30-day avg 8,048/day", "vs 30-day avg", the typed
  ▲/▼ characters, "Daily check-in", "Calibrating", "Why this score", "From WHOOP
  recovery". Running heads and datelines are the only renamed chrome.

## Motion

One moment, on Today mount: **the score prints.** The numeral fades 0 → 1 over 320 ms
ease-out; the dial's arc draws over 600 ms (the existing `.hx-ring-arc` keyframe);
the ink rule under the masthead draws left to right over 480 ms (`.hx-rule-in`,
`scaleX` from 0, origin left) starting at 200 ms. Nothing else animates on load:
`.hx-fade-up` comes off `<main>`; no figure fades, no stagger. Motion that answers a
tap is short: a sheet slides up 240 ms, a segment underline slides 160 ms, a pressed
block inks its leader instantly. Under `prefers-reduced-motion` all of it is instant.

## Quality floor (not optional)

- 390 px, no horizontal overflow, ever. Wide content scrolls inside its own container.
- Every target ≥ 44 px; whole-row targets 56 px; check-in scale labels stay `h-11`.
- Colour is never the only carrier of state: a word, glyph or tone square beside every tone.
- Visible focus: 2 px lume ring, offset 2, on every control including ink keys.
- No nested sheets. Focus returns to the opener.
- Charts keep their hidden data table.
- All render tests stay green. They pin roles, text, `aria-*`, `.hx-label`, `h-11`,
  `stroke="var(--hx-green)"` on the arc, `text-hx-red` on "Run down" and on the forced
  verdict sentence, `bg-hx-red/15` on the hero chip. Update a string pin only where
  this spec changed the copy by design.

## The tells to remove (review checklist)

Grep for each before calling a screen done:

- `hx-raised` or `hx-well` on anything that is only read; `hx-card` used as a box
- a shadow, blur, gradient or glow written anywhere; `backdrop-blur`
- `rounded-` on a reading (radius belongs to chips, keys, inputs, sheets only)
- more than three `.hx-rule` per screen; a `border-t` and `border-b` pair on one element; any `border-l`/`border-r` outside `.hx-score-grid` and `.hx-note`
- `uppercase` / `tracking-` on labels; ` · ` in JSX strings; `→` in copy
- Literata below 13 px, or in `text-hx-muted`; agate in a serif
- an icon that is decoration (icons stay in the running foot and where they carry meaning)
- a chart with a legend, gridlines, a y-axis line, a colour ramp or a floating tooltip with an arrow
- `hx-fade-up` on anything; a per-block entrance
- centred body text; a numbered section marker; a bubble in the coach
