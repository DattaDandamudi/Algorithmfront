/**
 * TimeSeriesChart — the workhorse for Weight / TDEE / HRV / RHR / Sleep / Steps
 * on the Trends screen (SPEC §3).
 *
 * Marks follow DESIGN.md "Data marks": a 1.5 px bone line with null gaps,
 * scale readings as small hollow text2 circles, bands as a 9 percent ink
 * wash, no gridlines and no y-axis line (the y ticks sit as agate at the
 * left and one bottom hairline carries the dates), a dotted reference line,
 * text never in the series colour. Only the LAST value is direct-labelled
 * (selective labelling); everything else lives in the y ticks, the crosshair
 * tooltip and the visually-hidden table, so the tooltip enhances and never
 * gates.
 *
 * Interaction: a vertical crosshair snaps to the nearest x on pointer move /
 * touch (touch-action pan-y keeps the page scrollable), the SVG is focusable
 * and ←/→/Home/End move the crosshair, Esc clears it.
 */
import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ISODate } from '../../data/types';
import { formatDateShort } from '../../lib/dates';
import { fmt } from '../../lib/format';
import {
  autoDecimals,
  buildAreaBetween,
  buildPath,
  definedIndices,
  extent,
  formatTick,
  formatTickDate,
  lastDefined,
  nearestIndex,
  niceTicks,
  scaleLinear,
  textWidth,
  tickDecimals,
  xLabelIndices,
  xPositions,
  type ChartRange,
  type Pt,
} from './chartUtils';
import { ChartTooltip, EmptyFrame, FONT, HiddenTable, SVG_CLASS, TOKEN, WASH, useMeasuredWidth, type TooltipRow } from './shared';

export interface TimeSeriesPoint {
  d: ISODate;
  value: number | null;
}
export interface TimeSeriesBandPoint {
  d: ISODate;
  lo: number | null;
  hi: number | null;
}
export interface TimeSeriesAnnotation {
  d: ISODate;
  label: string;
}

export interface TimeSeriesChartProps {
  /** Raw readings drawn as dots (daily scale weight, daily HRV…). */
  data: TimeSeriesPoint[];
  /** Smoothed line (EWMA trend / 7-day mean). Optional. */
  line?: TimeSeriesPoint[];
  /** Per-point band (SWC, water-noise) shaded at 12 % of `color`. */
  band?: TimeSeriesBandPoint[];
  /** Constant horizontal band (8–10k steps, sleep need) in a neutral wash. */
  targetBand?: { lo: number; hi: number; label?: string };
  /** Hairline reference (e.g. 30-day mean). */
  reference?: { value: number; label?: string };
  /** Series colour (CSS colour / token variable). Default var(--hx-blue). */
  color?: string;
  dotColor?: string;
  /** Unit suffix appended after the formatted value ("lb", "ms"). */
  unit?: string;
  /** Custom number formatter (unit is still appended). */
  valueFormat?: (n: number) => string;
  range: ChartRange;
  /** Default 180. */
  height?: number;
  /** Default true. Dots hide automatically when denser than one per 6 px. */
  showDots?: boolean;
  /** Join the dots with a 2 px line (false → dots only, plus `line` if given). */
  connectDots?: boolean;
  ariaLabel: string;
  emptyText?: string;
  /** Small markers on the top edge, e.g. weekly TDEE update. */
  annotations?: TimeSeriesAnnotation[];
  /** Tooltip / table names for the series. */
  label?: string;
  lineLabel?: string;
  bandLabel?: string;
  /** Tooltip date header; default 'Sat 6 Sep'. Pass a week/month formatter for buckets. */
  dateFormat?: (d: ISODate) => string;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export default function TimeSeriesChart({
  data,
  line,
  band,
  targetBand,
  reference,
  color = TOKEN.text,
  dotColor,
  unit,
  valueFormat,
  range,
  height = 180,
  showDots = true,
  connectDots = false,
  ariaLabel,
  emptyText = 'Not enough data yet.',
  annotations,
  label = 'Value',
  lineLabel = 'Trend',
  bandLabel = 'Range',
  dateFormat = formatDateShort,
}: TimeSeriesChartProps) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  // Merge every series onto one sorted date axis so a line/band date without a
  // dot (an EWMA day with no weigh-in) still gets an x position.
  const model = useMemo(() => {
    const dateSet = new Set<ISODate>();
    data.forEach((p) => dateSet.add(p.d));
    line?.forEach((p) => dateSet.add(p.d));
    band?.forEach((p) => dateSet.add(p.d));
    const dates = [...dateSet].sort();
    const pick = (pts: TimeSeriesPoint[] | undefined) => {
      const m = new Map(pts?.map((p) => [p.d, p.value]));
      return dates.map((d) => {
        const v = m.get(d);
        return isNum(v) ? v : null;
      });
    };
    const bandLo = new Map(band?.map((p) => [p.d, p.lo]));
    const bandHi = new Map(band?.map((p) => [p.d, p.hi]));
    const values = pick(data);
    const lineVals = pick(line);
    const loVals = dates.map((d) => (isNum(bandLo.get(d)) ? (bandLo.get(d) as number) : null));
    const hiVals = dates.map((d) => (isNum(bandHi.get(d)) ? (bandHi.get(d) as number) : null));
    const annAt = new Map(annotations?.map((a) => [a.d, a.label]));
    const defined = definedIndices(dates.map((_, i) => (values[i] ?? lineVals[i]) as number | null));
    return { dates, values, lineVals, loVals, hiVals, annAt, defined };
  }, [data, line, band, annotations]);

  const { dates, values, lineVals, loVals, hiVals, annAt, defined } = model;
  const n = dates.length;

  if (!defined.length) return <EmptyFrame height={height} text={emptyText} ariaLabel={ariaLabel} />;

  // --- y domain: nice ticks over everything drawn; never dip below 0 for non-negative data.
  const all: Array<number | null | undefined> = [...values, ...lineVals, ...loVals, ...hiVals];
  if (targetBand) all.push(targetBand.lo, targetBand.hi);
  if (reference) all.push(reference.value);
  const rawMin = Math.min(...all.filter(isNum));
  const ext = extent(all, 0.08) as [number, number];
  let ticks = niceTicks(ext[0], ext[1], 4);
  if (rawMin >= 0 && ticks[0] < 0) ticks = niceTicks(0, ext[1], 4);
  const domain: [number, number] = [ticks[0], ticks[ticks.length - 1]];
  const tickDp = tickDecimals(ticks);
  const valueDp = autoDecimals([...values, ...lineVals]);
  const fmtNum = (v: number) => (valueFormat ? valueFormat(v) : fmt(v, valueDp));
  const suffix = unit ? ` ${unit}` : '';
  const display = (v: number) => `${fmtNum(v)}${suffix}`;

  // --- direct label: the last reading (or the last line value when there are no dots).
  const lastDot = lastDefined(values);
  const lastLine = lastDefined(lineVals);
  const last = lastDot ?? lastLine;
  const lastText = last ? display(last.value) : '';

  // --- layout
  const hasAnn = !!annAt.size;
  const top = hasAnn ? 18 : 12;
  const bottom = 22;
  const left = Math.max(...ticks.map((t) => textWidth(formatTick(t, tickDp), FONT.tick))) + 8;
  const right = Math.max(12, textWidth(lastText, FONT.label) + 12);
  const plotW = Math.max(24, width - left - right);
  const plotH = Math.max(24, height - top - bottom);
  const xs = xPositions(n, left, left + plotW);
  const y = scaleLinear(domain, [top + plotH, top]);
  const pitch = n > 1 ? plotW / (n - 1) : plotW;
  const dense = n > 1 && pitch < 6;
  // Hollow readings: 5 px circles normally, 4 px when points sit closer than 12 px so daily
  // scale readings stay individually visible (review R6-16).
  const smallDots = !dense && pitch < 12;
  const dotR = smallDots ? 2 : 2.5;

  const toPts = (vals: Array<number | null>): Pt[] => vals.map((v, i) => ({ x: xs[i], y: v === null ? null : y(v) }));
  const linePath = line ? buildPath(toPts(lineVals)) : '';
  const dotsPath = connectDots || dense ? buildPath(toPts(values)) : '';
  const bandPath = band ? buildAreaBetween(toPts(loVals), toPts(hiVals)) : '';
  const drawDots = showDots && !dense;

  const clampY = (v: number) => Math.min(top + plotH, Math.max(top, y(v)));
  const px = (v: number) => Math.round(v * 100) / 100;

  // --- interaction
  const setFromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = nearestIndex(xs, e.clientX - rect.left);
    setActive(i < 0 ? null : i);
  };
  const step = (dir: 1 | -1) => {
    if (active === null) return dir > 0 ? defined[0] : defined[defined.length - 1];
    const pos = defined.indexOf(active);
    if (pos === -1) return dir > 0 ? defined.find((i) => i > active) ?? active : [...defined].reverse().find((i) => i < active) ?? active;
    return defined[Math.min(defined.length - 1, Math.max(0, pos + dir))];
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    let next: number | null;
    switch (e.key) {
      case 'ArrowLeft':
        next = step(-1);
        break;
      case 'ArrowRight':
        next = step(1);
        break;
      case 'Home':
        next = defined[0];
        break;
      case 'End':
        next = defined[defined.length - 1];
        break;
      case 'Escape':
        next = null;
        break;
      default:
        return;
    }
    e.preventDefault();
    setActive(next);
  };

  // --- tooltip rows for the active x
  let rows: TooltipRow[] = [];
  if (active !== null) {
    const v = values[active];
    const lv = lineVals[active];
    const lo = loVals[active];
    const hi = hiVals[active];
    if (v !== null) rows.push({ value: display(v), label, color: dotColor ?? color, kind: 'dot' });
    if (lv !== null) rows.push({ value: display(lv), label: lineLabel, color, kind: 'line' });
    if (lo !== null && hi !== null) rows.push({ value: `${fmtNum(lo)}–${fmtNum(hi)}${suffix}`, label: bandLabel, color, kind: 'rect', opacity: 0.35 });
    const ann = annAt.get(dates[active]);
    if (ann) rows.push({ value: ann, label: '', kind: 'none' });
    if (!rows.length) rows = [{ value: '—', label: 'No data', kind: 'none' }];
  }

  const xLabels = xLabelIndices(n, range);
  const tableHead = ['Date', label, ...(line ? [lineLabel] : []), ...(band ? [`${bandLabel} low`, `${bandLabel} high`] : [])];
  const tableRows = dates.map((d, i) => [
    d,
    values[i] === null ? '—' : display(values[i] as number),
    ...(line ? [lineVals[i] === null ? '—' : display(lineVals[i] as number)] : []),
    ...(band ? [loVals[i] === null ? '—' : display(loVals[i] as number), hiVals[i] === null ? '—' : display(hiVals[i] as number)] : []),
  ]);

  return (
    <div ref={ref} className="relative w-full">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        className={SVG_CLASS}
        style={{ touchAction: 'pan-y' }}
        onPointerMove={setFromPointer}
        onPointerDown={setFromPointer}
        onPointerLeave={() => setActive(null)}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((a) => (a === null ? defined[defined.length - 1] : a))}
        onBlur={() => setActive(null)}
      >
        {/* target band: neutral wash */}
        {targetBand ? (
          <g>
            <rect
              x={left}
              width={plotW}
              y={clampY(targetBand.hi)}
              height={Math.max(0, clampY(targetBand.lo) - clampY(targetBand.hi))}
              fill={TOKEN.text}
              fillOpacity={WASH}
            />
            {targetBand.label ? (
              <text x={left + plotW - 2} y={clampY(targetBand.hi) + FONT.small + 1} textAnchor="end" fontSize={FONT.small} fill={TOKEN.muted}>
                {targetBand.label}
              </text>
            ) : null}
          </g>
        ) : null}

        {/* y ticks as agate at the left: no gridlines, no axis line. One bottom hairline carries the dates. */}
        {ticks.map((t) => (
          <text key={t} x={left - 6} y={px(y(t))} textAnchor="end" dominantBaseline="middle" fontSize={FONT.tick} fill={TOKEN.muted}>
            {formatTick(t, tickDp)}
          </text>
        ))}
        <line x1={left} x2={left + plotW} y1={px(top + plotH)} y2={px(top + plotH)} stroke={TOKEN.border} strokeWidth={1} shapeRendering="crispEdges" />

        {/* per-point band wash: 9 percent ink, no edge */}
        {bandPath ? <path d={bandPath} fill={color} fillOpacity={WASH} /> : null}

        {/* reference: a dotted hairline */}
        {reference ? (
          <g>
            <line x1={left} x2={left + plotW} y1={y(reference.value)} y2={y(reference.value)} stroke={TOKEN.text2} strokeWidth={1} strokeDasharray="1 3" />
            {reference.label ? (
              <text x={left + plotW - 2} y={y(reference.value) - 3} textAnchor="end" fontSize={FONT.small} fill={TOKEN.muted}>
                {reference.label}
              </text>
            ) : null}
          </g>
        ) : null}

        {/* dots joined (connectDots / dense fallback) */}
        {dotsPath ? <path d={dotsPath} fill="none" stroke={dotColor ?? color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="butt" opacity={line ? 0.6 : 1} /> : null}

        {/* smoothed line: 1.5 px */}
        {linePath ? <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="butt" /> : null}

        {/* readings: hollow text2 circles filled with the stock so the trend does not show through */}
        {drawDots
          ? values.map((v, i) => (v === null ? null : <circle key={i} cx={px(xs[i])} cy={px(y(v))} r={dotR} fill={TOKEN.base} stroke={dotColor ?? TOKEN.text2} strokeWidth={1} />))
          : null}

        {/* annotations: small markers on the top edge */}
        {hasAnn
          ? dates.map((d, i) => {
              const a = annAt.get(d);
              if (!a) return null;
              return (
                <path key={d} d={`M${px(xs[i] - 4)} ${top - 12}L${px(xs[i] + 4)} ${top - 12}L${px(xs[i])} ${top - 5}Z`} fill={TOKEN.text2}>
                  <title>{a}</title>
                </path>
              );
            })
          : null}

        {/* crosshair + active marks */}
        {active !== null ? (
          <g pointerEvents="none">
            <line x1={px(xs[active])} x2={px(xs[active])} y1={top} y2={top + plotH} stroke={TOKEN.text2} strokeWidth={1} />
            {values[active] !== null ? <circle cx={px(xs[active])} cy={px(y(values[active] as number))} r={6} fill="none" stroke={dotColor ?? TOKEN.text2} strokeWidth={1} /> : null}
            {lineVals[active] !== null ? <circle cx={px(xs[active])} cy={px(y(lineVals[active] as number))} r={2.5} fill={color} /> : null}
          </g>
        ) : null}

        {/* selective direct label: last value only */}
        {last ? (
          <text x={px(xs[last.index] + 8)} y={px(clampY(last.value))} dominantBaseline="middle" fontSize={FONT.label} fontWeight={600} fill={TOKEN.text}>
            {lastText}
          </text>
        ) : null}

        {/* sparse x labels */}
        {xLabels.map((i) => {
          const t = formatTickDate(dates[i], range);
          const half = textWidth(t, FONT.tick) / 2;
          const cx = px(Math.min(width - half, Math.max(half, xs[i])));
          return (
            <text key={i} x={cx} y={height - 6} textAnchor="middle" fontSize={FONT.tick} fill={TOKEN.muted}>
              {t}
            </text>
          );
        })}
      </svg>

      {active !== null ? <ChartTooltip x={xs[active]} width={width} title={dateFormat(dates[active])} rows={rows} /> : null}

      <HiddenTable caption={ariaLabel} head={tableHead} rows={tableRows} />
    </div>
  );
}
