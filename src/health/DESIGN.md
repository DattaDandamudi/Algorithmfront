# Pulse — visual design specification

This is the spec every screen is built to. Read it before touching a `.tsx` under
`src/health/`. Where it disagrees with what a file currently does, the file is wrong.

## Thesis: an instrument panel under glass

Pulse is a personal physiology instrument. Its vocabulary is gauges, filtered
signals, credible intervals and decay half-lives — not a SaaS dashboard. So the
visual world is the one an instrument lives in: dark anodised graphite, a sapphire
crystal over it, phosphor lume on the readings that matter, milled edges you could
feel with a thumb.

Two consequences carry the whole design:

1. **The accent is light.** Nothing decorative is coloured. Luminous things are cold
   white (`--hx-lume`). The only saturated hues on any screen are the semantic states —
   green, amber, red — and blue for "informational". If something is coloured, the
   colour means something. This turns the spec's "one semantic colour per state" rule
   into the identity rather than a constraint on it.
2. **Depth is structural.** Three elevations, each with a meaning. A *tile* is a
   reading. A *raised* surface is something you act on. A *well* is a gauge track.
   No decorative shadows, no "card with a shadow because it is a card".

The layout is a **bento grid**: tiles of different sizes in a two-column grid, where
size encodes importance and data density. The readiness dial is the largest thing on
Today because it is the answer; the complications around it are 1×1 because they are
inputs. Bento is hierarchy, not aesthetics.

## Palette

Five named colours plus the semantic states. The ground has a real blue bias — cold
glass, not a tinted black — chosen so the warm semantic colours pop against it.

| Token | Hex | Role |
|---|---|---|
| `--hx-base` obsidian | `#070A0F` | page ground |
| `--hx-card` graphite | `#111820` | tile surface |
| `--hx-card-2` slate | `#1A2433` | raised layer, glass |
| `--hx-border` bezel | `#233042` | milled edge, tracks |
| `--hx-lume` | `#E9F1FF` | the light accent; also `--hx-text` |
| `--hx-text-2` | `#A7B4C6` | secondary text |
| `--hx-muted` | `#8593A8` | captions (4.8:1 on slate, 5.4 on graphite) |
| `--hx-green` | `#3DDC97` | on track |
| `--hx-yellow` amber | `#F5B451` | caution |
| `--hx-red` | `#F0566B` | off track |
| `--hx-neutral` | `#7D8BA0` | no signal |
| `--hx-blue` | `#5B9CFF` | informational, links, focus |

Every combination above clears WCAG AA (4.5:1) for text on every surface; red on
slate is the tightest at 4.65. Tailwind token *names* are unchanged (`text-hx-red`,
`bg-hx-red/15`, `hx-label`) because tests pin them; only values moved.

## Type

Two families, clearly distinct, both from Google Fonts, both with tabular numerals
on the latin subset (verified — numbers align in tables and the dial number does not
jitter as it ticks).

- **Bricolage Grotesque** — display and numerals. `font-optical-sizing: auto` uses
  its 12–96 optical-size axis, so the 60 px dial number gets the tight display cut
  and a 13 px label gets the open text cut, from one family. Use the `hx-display`
  class. This is where the personality lives.
- **Figtree** — body and interface. Quiet, warm, readable at 15 px. The default
  `font-sans`. This is where the app's long explanatory prose (the hedges, "why this
  score") gets to be calm.

Scale, on a modular ladder: **12 · 13 · 15 · 17 · 22 · 28 · 36 · 60**. Body copy is
15/22, not 13. Captions 13/18. Labels 13/18 weight 500. Big numbers 28 (tile), 36
(section lead), 60 (dial). Headings 22/28 in the display face.

**Labels are sentence case.** No uppercase eyebrows, no letter-spacing, no
"READINESS". `.hx-label` keeps its class name and is restyled: 13 px, weight 500,
`--hx-text-2`, normal case, normal tracking.

## Material system

Three elevations and two effects, all in `health.css`. Use the class; never
hand-roll a shadow.

| Class | Meaning | What it is |
|---|---|---|
| `.hx-card` | a reading | graphite, 20 px radius, bezel border, 1 px top specular, ambient shadow, faint top sheen |
| `.hx-raised` | something you act on | slate glass: blur, brighter specular, deeper shadow. Sheets, the tab bar, active segments, the dial's data window |
| `.hx-well` | a gauge track | sunken: inner shadow, darker than the surface. Ring tracks, bar troughs, inputs |
| `.hx-lume-glow` | phosphor | `drop-shadow` glow in `currentColor`. The dial arc, and nothing else on a screen |
| `.hx-lume-text` | phosphor numeral | soft text-shadow. The dial number only |

Radius: 20 px on tiles (`--hx-radius`), 14 px on controls inside tiles
(`--hx-radius-sm`), full on pills and wells. Not one radius on everything — the two
sizes are the difference between a surface and a control on it.

Spacing: 16 px page margins, 12 px bento gutter, 16 px tile padding (20 on the hero).
Vertical rhythm between sections 24 px. Use grid/flex `gap`, not stacked margins.

## Bento rules

```
.hx-bento   two columns, 12 px gap
.hx-span-2  a tile spans both columns
.hx-row-2   a tile spans two rows
```

- A screen's primary surface is one `.hx-bento`. Sections that are lists (insights,
  history, meals) sit *inside* a span-2 tile or below the grid, never as loose cards.
- 1×1 tiles hold one number and one caption. If it needs a chart wider than 140 px it
  is a span-2.
- Never leave a lone 1×1 in a row. Pair it or promote it.
- The hero of a screen is span-2 and taller. There is one hero per screen.
- Section titles are `h2` in the display face at 17/24, sentence case, left-aligned,
  sitting on the grid ground (no card). A caption under it at 13/18 muted.

Today, in ASCII (390 px):

```
┌──────────────────────────────────┐
│ Sun 6 Sep                  Rest  │   type on the ground, no card
├──────────────────────────────────┤
│  ╭────╮  Steady                  │   HERO span-2: dial left (156 px),
│  │ 63 │  train, hold loads       │   data window right: verdict,
│  ╰────╯  from WHOOP recovery     │   source, chip. Why-this-score
│          [Train, hold loads]     │   folds beneath, inside the tile.
├────────────────┬─────────────────┤
│ Sleep          │ HRV             │   1×1 complications
│ 7.4 h ▂▃▅▆     │ 54 ms Balanced  │
├────────────────┼─────────────────┤
│ Resting HR     │ Steps           │
│ 52 bpm         │ 6,240 ◔         │
├────────────────┴─────────────────┤
│ Protein   93 g left, 3 meals     │   span-2 bar
├──────────────────────────────────┤
│ Today: Upper, 5 exercises      › │   span-2 action tile (raised)
├──────────────────────────────────┤
│ Energy  ╱‾╲__╱‾╲   trough 15:10  │   span-2 curve
└──────────────────────────────────┘
  Insights, weight, tobacco, nudges follow as span-2 tiles.
```

Alignment: **left** throughout. Numbers left, labels left, headings left. The one
exception is the number inside the dial, which is centred in the dial.

## Copy rules

- Sentence case everywhere. No ALL CAPS.
- **No middle dots.** `A · B · C` becomes a sentence, a comma list, or two lines.
  "0% · 54 h ago" → "0%, 54 h ago". "Last 30 days · daily · 8 Aug – 6 Sep" →
  "Last 30 days, 8 Aug to 6 Sep".
- No "WORD — fragment" labels. No "→" appended to links or buttons.
- Plain verbs, from the user's side. "Log a meal", not "Add entry".
- Numbers keep their units, always. Existing engine copy (hedges, medical boundary,
  "not a diagnosis") is **not** to be edited — it is reviewed and tested.
- Two deliberate exceptions keep a middle dot because tests pin the exact string as a
  data fact: the contributor facts inside "Why this score" (`54 ms · 0.4 SD above your
  normal · raised the score`) and the modifier line (`Lowered the verdict · Overnight
  strain: major`). Both sit inside a disclosure, as dense facts, not as chrome.

## Motion

One orchestrated moment: when Today mounts, the dial arc sweeps in and its glow
blooms (existing `.hx-ring-arc`), and the screen rises 6 px (`.hx-fade-up` on
`<main>`, already there). **Nothing else animates on load.** No per-card fade-ups —
delete `hx-fade-up` from cards. Motion that answers a tap is welcome: a sheet
sliding up, a segment sliding, a pressed tile settling 1 px (`active:translate-y-px`).
Everything respects `prefers-reduced-motion`.

## Quality floor (not optional)

- 390 px, no horizontal overflow, ever. Wide content scrolls inside its own container.
- Every target ≥ 44 px. Check-in scale labels stay `h-11`.
- Colour is never the only carrier of state: a word or glyph sits beside every tone.
- Visible focus: the `.hx` focus ring is lume, 2 px, offset 2.
- No nested sheets. Focus returns to the opener.
- Charts keep their hidden data table.
- All 15 render-test files stay green. They pin roles, text, `aria-*`, the
  `hx-label` class, `h-11` on check-in labels, `text-hx-red` / `bg-hx-red/15` on the
  hero — keep those strings.

## The tells to remove (review checklist)

Grep for each before calling a screen done:

- `uppercase` / `tracking-` on labels
- ` · ` in JSX strings
- `hx-fade-up` on anything but `<main>` and toasts
- `rounded-2xl` / `rounded-xl` where `--hx-radius` classes should be
- `text-[13px]` used for reading copy (should be 15)
- a loose `.hx-card` outside a bento or a list
- a shadow written by hand
- centred body text
- a lone 1×1 tile in a row
