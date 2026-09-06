# `src/health/ui/charts` — Trends charts

Hand-rolled SVG charts for the Trends screen (SPEC §3). No chart library (no new deps), dark theme
only, sized for a 358 px card but responsive (the container is measured with `ResizeObserver`).

```ts
import { TimeSeriesChart, BarSeries, Heatmap, fillDaily, aggregateByBucket, bucketForRange } from '../ui/charts';
```

## Mark rules every chart obeys

* 2 px lines with round joins/caps; `null` values lift the pen (gaps, never interpolation).
* Dots are 8 px with a 2 px ring in the card colour; bands are ~12 % washes; target bands a neutral wash.
* Hairline **solid** grid in `var(--hx-border)` (one step off the card). Never dashed, never a dual y-axis.
* Text is never coloured with the series colour: ticks/labels use `--hx-muted`, the direct label `--hx-text`.
* Selective labelling: only the **last** value (or last column) is direct-labelled.
* Tooltips enhance, never gate: a crosshair snaps to the nearest x on pointer/touch, the SVG is
  focusable (`←`/`→`/`Home`/`End`/`Esc`), and a visually-hidden `<table>` (the "table view twin")
  lists every number. Tooltip strings are React text nodes (never `innerHTML`); values lead, labels follow.
* Hit targets ≥ 24 px: the whole plot (time series), the whole slot (bars), the cell pitch (heatmap).
* Colours inside SVG are CSS variables only (`var(--hx-blue)` …) — pass tokens, not hex.

## `TimeSeriesChart`

The workhorse for Weight / TDEE / HRV / RHR / Sleep / Steps.

```tsx
<TimeSeriesChart
  ariaLabel="Weight, last 30 days"
  range="30D"
  data={fillDaily(weights, start, end)}                 // dots (daily scale weight)
  line={trend}                                          // EWMA trend, 2 px line
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
| `band?` | `Array<{ d; lo: number \| null; hi: number \| null }>` | per-point band at 12 % of `color` (SWC, water noise). |
| `targetBand?` | `{ lo; hi; label? }` | constant horizontal neutral wash (8–10k steps, sleep need). |
| `reference?` | `{ value; label? }` | hairline in `--hx-neutral` (e.g. 30-day mean). |
| `color?` / `dotColor?` | CSS colour | default `var(--hx-blue)`. |
| `unit?` / `valueFormat?` | | unit is appended after the formatted value; default format is 0 dp when every reading is an integer (HRV, RHR, steps), otherwise 1 dp while the data spans < 20 units (weight, sleep hours), else whole numbers with commas. |
| `range` | `'7D' \| '30D' \| '90D' \| '1Y'` | controls x-label density and date format (`Sat`, `6 Sep`, `Sep`). |
| `height?` | number | default 180. |
| `showDots?` | boolean | default true. Dots hide automatically when denser than one per 6 px (then the data is drawn as a line) — aggregate 90D/1Y data with `aggregateByBucket` instead of passing daily points. |
| `connectDots?` | boolean | join the dots with a 2 px line (steps, sleep hours). |
| `annotations?` | `Array<{ d; label }>` | small ▼ markers on the top edge (weekly TDEE update); shown in the tooltip at that x. |
| `label?` / `lineLabel?` / `bandLabel?` | string | tooltip & table names (defaults `Value` / `Trend` / `Range`). |
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
Bars are ≤ 24 px wide with a 4 px rounded cap, square baseline and a 2 px gap; the domain always includes 0.
`null` leaves the slot empty. Hover/keyboard select a slot; the active bar lifts to full opacity.

## `Heatmap`

GitHub-style calendar for adherence.

```tsx
<Heatmap ariaLabel="Protein-hit days" weeks={12} end={today}
  days={records.map(r => ({ d: r.d, level: r.p == null ? null : r.p >= 180 ? 3 : r.p >= 160 ? 2 : r.p >= 120 ? 1 : 0, title: r.p == null ? 'Not logged' : `${r.p} g protein` }))}
  legend={['< 120 g', '120–159 g', '160–179 g', '≥ 180 g']} />
```

Props: `days: Array<{ d; level: 0|1|2|3|null; title }>`, `weeks?` (12), `color?` (`var(--hx-green)`),
`legend?: string[]` (labels for levels 0–3), `end?` (last day shown; defaults to the latest entry),
`ariaLabel`. Columns are Monday-start weeks; `null`/missing days are outlined cells; levels use
opacity 0.18 / 0.45 / 0.72 / 1 of the colour. Each past cell is focusable with a `<title>`, arrow keys
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

Typical Trends wiring: `const bucket = bucketForRange(range); const series = aggregateByBucket(fillDaily(daily, start, end), bucket);`.
