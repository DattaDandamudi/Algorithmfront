# `src/health/ui/charts` — Trends charts

Hand-rolled SVG charts for the Trends screen (SPEC §3). No chart library (no new deps), dark theme
only, sized for the 350 px measure but responsive (the container is measured with `ResizeObserver`).

```ts
import { TimeSeriesChart, BarSeries, Heatmap, fillDaily, aggregateByBucket, bucketForRange } from '../ui/charts';
```

## Mark rules every chart obeys

The graphics desk in `../../DESIGN.md` ("Data marks") is authoritative; in brief:

* 1.5 px bone lines (`var(--hx-text)` is the default `color`) with butt caps; `null` values lift the pen (gaps, never interpolation).
* Readings are 2.5 px hollow text2 circles filled with the stock; bands and zones are a 9 percent **bone** wash (`WASH` in `shared.tsx`) with no edge, whatever the line colour.
* No gridlines, no y-axis line, no legend as swatches. The y ticks sit as agate at the left, one solid bottom hairline in `var(--hx-border)` carries the dates (it is the zero line when data goes negative), a reference or target is a dotted hairline.
* Text is never coloured with the series colour: ticks in `--hx-muted`, the direct label in `--hx-text`; nothing below 12 px (`FONT`).
* Selective labelling: only the **last** value (or last column) is direct-labelled, in bone at the line end. When `data` and `line` share a plot the two are named by **words at their own line ends** (`label` / `lineLabel`, text2, pushed apart by `spreadLabels` when they meet) and the readings drop to a 1 px text2 line under the 1.5 px bone smoothed line; a per-point band is named by `bandLabel` at the ribbon's top. That is the legend.
* Bars are square, on one baseline hairline; the heat map fills by ink density (`LEVEL_OPACITY` = 0.12 / 0.28 / 0.5 / 0.8 of bone), never a colour ramp.
* Tooltips enhance, never gate: a crosshair snaps to the nearest x on pointer/touch, the SVG is
  focusable (`←`/`→`/`Home`/`End`/`Esc`), and a visually-hidden `<table>` (the "table view twin")
  lists every number. The tooltip is a plate slip (`.hx-raised`, no radius, no arrow) in `.hx-agate`; strings are React text nodes (never `innerHTML`); values lead, labels follow.
* The empty frame is an italic `.hx-body` sentence under a hairline, flush left, at the chart's height so the layout never jumps.
* Hit targets at least 24 px: the whole plot (time series), the whole slot (bars), the cell pitch (heatmap).
* Colours inside SVG are CSS variables only (`var(--hx-text)`, `var(--hx-blue)` …) — pass tokens, not hex. `DEFAULT_CHART_WIDTH` is the 350 px measure.

## `TimeSeriesChart`

The workhorse for Weight / TDEE / HRV / RHR / Sleep / Steps.

```tsx
<TimeSeriesChart
  ariaLabel="Weight, last 30 days"
  range="30D"
  data={fillDaily(weights, start, end)}                 // dots (daily scale weight)
  line={trend}                                          // EWMA trend, 1.5 px bone line
  band={trend.map(p => ({ d: p.d, lo: p.value - 1.5, hi: p.value + 1.5 }))}  // water-noise wash
  reference={{ value: mean30, label: '30-day mean' }}   // hairline
  unit="lb" label="Scale" lineLabel="Trend" bandLabel="Noise"
/>
<TimeSeriesChart ariaLabel="Steps" range="7D" data={steps} targetBand={{ lo: 8000, hi: 10000, label: '8–10k goal' }} connectDots />
<TimeSeriesChart ariaLabel="Expenditure" range="90D" data={[]} line={tdeeWeekly} annotations={updates} unit="kcal" />
```

| prop | type | notes |
|---|---|---|
| `data` | `Array<{ d: ISODate; value: number \| null }>` | dots. Pass one entry per day/bucket (use `fillDaily`) so x is linear in time. |
| `line?` | same shape | smoothed line (EWMA / 7-day mean). Dates are merged with `data`'s. |
| `band?` | `Array<{ d; lo: number \| null; hi: number \| null }>` | per-point band as a 9 percent bone wash (SWC, a credible interval), named by `bandLabel` at its top. |
| `targetBand?` | `{ lo; hi; label? }` | constant horizontal bone wash (8–10k steps, a usual range) with its label inside at the right. |
| `reference?` | `{ value; label? }` | a dotted text2 hairline (e.g. a 28-day baseline). |
| `color?` / `dotColor?` | CSS colour | the line and the reading rings; default bone and text2. Pass a tone only where a band applies. The band wash is always bone. |
| `unit?` / `valueFormat?` | | unit is appended after the formatted value; default format is 0 dp when every reading is an integer (HRV, RHR, steps), otherwise 1 dp while the data spans < 20 units (weight, sleep hours), else whole numbers with commas. |
| `range` | `'7D' \| '30D' \| '90D' \| '1Y'` | controls x-label density and date format (`Sat`, `6 Sep`, `Sep`). |
| `height?` | number | default 180. |
| `showDots?` | boolean | default true. Dots hide automatically when denser than one per 6 px (then the data is drawn as a line) — aggregate 90D/1Y data with `aggregateByBucket` instead of passing daily points. |
| `connectDots?` | boolean | join the readings with a line (steps, sleep hours): 1.5 px bone alone, 1 px text2 under a `line`. |
| `annotations?` | `Array<{ d; label }>` | small ▼ markers on the top edge (weekly TDEE update); shown in the tooltip at that x. |
| `label?` / `lineLabel?` / `bandLabel?` | string | the words at the line ends, and the tooltip & table names (defaults `Value` / `Trend` / `Range`). |
| `dateFormat?` | `(d) => string` | tooltip header; default `Sat 6 Sep`. Pass a "Week of …" formatter for buckets. |
| `ariaLabel` | string | required; also the hidden table's caption. |
| `emptyText?` | string | shown inside the frame when there is nothing finite to draw. |

The y-domain covers every drawn value (data, line, band, target band, reference) with clean
`niceTicks`, and never dips below 0 for non-negative data.

## `BarSeries`

Column chart for weekly/monthly aggregates and tobacco 7-day counts.

```tsx
<BarSeries ariaLabel="Tobacco, last 7 days" data={days.map(d => ({ label: 'Mon', value: d.tob ?? null }))} color="var(--hx-yellow)" target={3} targetLabel="Daily goal" />
```

Props: `data: Array<{ label: string; value: number \| null }>`, `color?`, `target?`, `targetLabel?`,
`height?` (160), `valueFormat?`, `unit?`, `label?`, `ariaLabel`, `emptyText?`.
Bars are ≤ 24 px wide, square at both ends, on one solid baseline with a 2 px gap; the domain always includes 0. `color` defaults to bone.
`null` leaves the slot empty. Hover/keyboard select a slot; the active bar lifts to full opacity.

## `Heatmap`

GitHub-style calendar for adherence.

```tsx
<Heatmap ariaLabel="Protein-hit days" weeks={12} end={today}
  days={records.map(r => ({ d: r.d, level: r.p == null ? null : r.p >= 180 ? 3 : r.p >= 160 ? 2 : r.p >= 120 ? 1 : 0, title: r.p == null ? 'Not logged' : `${r.p} g protein` }))}
  legend={['< 120 g', '120–159 g', '160–179 g', '≥ 180 g']} />
```

Props: `days: Array<{ d; level: 0|1|2|3|null; title }>`, `weeks?` (12), `color?` (bone; a tone only where a band applies),
`legend?: string[]` (labels for levels 0–3, written as words with the density beside each), `end?` (last day shown; defaults to the latest entry),
`ariaLabel`. Columns are Monday-start weeks; `null`/missing days are hairline-outlined cells; levels fill by
ink density, `LEVEL_OPACITY` = 0.12 / 0.28 / 0.5 / 0.8 of the colour. Each past cell is focusable with a `<title>`, arrow keys
move between cells, and the tooltip shows the cell's `title`.

## `chartUtils` (pure, tested in `chartUtils.test.ts`)

| fn | purpose |
|---|---|
| `niceTicks(min, max, count=4)` | 1/2/5-step ticks covering the range (≥ 2, typically 3–5). |
| `tickDecimals(ticks)` / `formatTick(v, dp)` | decimals implied by the step; thousands-comma'd labels. |
| `extent(values, pad=0.1)` | padded `[min, max]` of finite values, `null` if none. |
| `scaleLinear(domain, range)` | linear scale with `.invert`. |
| `xPositions(n, x0, x1)` | evenly spaced x by index. |
| `sparseIndices(n, max)` / `xLabelIndices(n, range)` | which x labels to draw (start/mid/end, monthly). |
| `formatTickDate(d, range)` | `Sat` / `6 Sep` / `Sep`. |
| `nearestIndex(xs, px)` | crosshair snapping (binary search; ties → lower index). |
| `buildPath(points)` | SVG `d` with `M` restarts after `null` gaps. |
| `buildAreaBetween(lower, upper)` | closed band path per contiguous run. |
| `bucketForRange(range)` / `bucketStart(d, bucket)` / `aggregateByBucket(points, bucket, 'mean'\|'sum'\|'last'\|'count')` | weekly (Monday) / monthly aggregation for 90D / 1Y. |
| `fillDaily(points, start, end)` | one entry per day with `null` gaps. |
| `lastDefined`, `definedIndices`, `textWidth`, `autoDecimals` | small layout helpers. |
| `spreadLabels(ys, gap, lo, hi)` | pushes label baselines apart by `gap` inside `[lo, hi]`, for the words at the line ends. |

Typical Trends wiring: `const bucket = bucketForRange(range); const series = aggregateByBucket(fillDaily(daily, start, end), bucket);`.
