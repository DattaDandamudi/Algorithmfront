/**
 * WeightChart — the one chart on Trends that `TimeSeriesChart` cannot draw:
 * scale readings in **two states**, accepted and set aside.
 *
 * §1a's Kalman filter rejects a weigh-in whose innovation is beyond 3.5 σ (or
 * 8 lb): a typo, a different scale, a day in shoes. Those readings must still
 * appear, because hiding a number the user typed is how an app loses their
 * trust, but they must not read as part of the trend. So they are drawn as an
 * **amber cross** where the accepted readings are hollow circles: a different
 * shape first, a different ink second, so the state survives greyscale. The
 * caption under the chart says it in words and the hidden table carries a
 * "Used" column, so it survives with no colour, no hover and no pointer.
 *
 * The rest is DESIGN.md's band chart: the 90% band a 9 percent bone wash,
 * the smoothed trend a 1.5 px bone line, readings 2.5 px hollow text2
 * circles, two direct labels in agate in the right margin (the value beside
 * the line end, "90% band" beside the ribbon's top, pushed apart when they
 * meet), three date ticks on one bottom hairline, no gridlines, no y-axis
 * line. A crosshair snaps to the nearest x
 * on pointer or the arrow keys and the tooltip is a plate slip.
 */
import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ISODate } from '../../data/types';
import { formatDateShort } from '../../lib/dates';
import { fmt } from '../../lib/format';
import {
  ChartTooltip,
  EmptyFrame,
  FONT,
  HiddenTable,
  SVG_CLASS,
  TOKEN,
  WASH,
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
  sparseIndices,
  spreadLabels,
  textWidth,
  tickDecimals,
  useMeasuredWidth,
  xPositions,
  type ChartRange,
  type Pt,
  type TimeSeriesBandPoint,
  type TimeSeriesPoint,
  type TooltipRow,
} from '../../ui/charts';

/** The word at the ribbon's top edge. */
export const BAND_WORD = '90% band';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export interface WeightChartProps {
  /** Accepted scale readings. */
  dots: TimeSeriesPoint[];
  /** Readings the outlier gate set aside — drawn as amber crosses. */
  suspect: TimeSeriesPoint[];
  /** The smoothed Kalman level. */
  line: TimeSeriesPoint[];
  /** Its 90% credible interval. */
  band: TimeSeriesBandPoint[];
  range: ChartRange;
  /** Display unit ("lb" / "kg"). */
  unit: string;
  ariaLabel: string;
  emptyText: string;
  /** Tooltip date header; pass a bucket formatter for 90D / 1Y. */
  dateFormat?: (d: ISODate) => string;
  height?: number;
}

export default function WeightChart({
  dots,
  suspect,
  line,
  band,
  range,
  unit,
  ariaLabel,
  emptyText,
  dateFormat = formatDateShort,
  height = 180,
}: WeightChartProps) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  // One sorted date axis across every series, so a trend day with no weigh-in
  // still gets an x position.
  const model = useMemo(() => {
    const dateSet = new Set<ISODate>();
    for (const list of [dots, suspect, line]) list.forEach((p) => dateSet.add(p.d));
    band.forEach((p) => dateSet.add(p.d));
    const dates = [...dateSet].sort();
    const pick = (pts: TimeSeriesPoint[]) => {
      const m = new Map(pts.map((p) => [p.d, p.value]));
      return dates.map((d) => {
        const v = m.get(d);
        return isNum(v) ? v : null;
      });
    };
    const lo = new Map(band.map((p) => [p.d, p.lo]));
    const hi = new Map(band.map((p) => [p.d, p.hi]));
    const at = (m: Map<ISODate, number | null>) => dates.map((d) => (isNum(m.get(d)) ? (m.get(d) as number) : null));
    const values = pick(dots);
    const suspects = pick(suspect);
    const lineVals = pick(line);
    return {
      dates,
      values,
      suspects,
      lineVals,
      loVals: at(lo),
      hiVals: at(hi),
      defined: definedIndices(dates.map((_, i) => (values[i] ?? suspects[i] ?? lineVals[i]) as number | null)),
    };
  }, [dots, suspect, line, band]);

  const { dates, values, suspects, lineVals, loVals, hiVals, defined } = model;
  const n = dates.length;
  if (!defined.length) return <EmptyFrame height={height} text={emptyText} ariaLabel={ariaLabel} />;

  // --- y domain over everything drawn, including the set-aside readings.
  const all: Array<number | null> = [...values, ...suspects, ...lineVals, ...loVals, ...hiVals];
  const rawMin = Math.min(...all.filter(isNum));
  const ext = extent(all, 0.08) as [number, number];
  let ticks = niceTicks(ext[0], ext[1], 4);
  if (rawMin >= 0 && ticks[0] < 0) ticks = niceTicks(0, ext[1], 4);
  const domain: [number, number] = [ticks[0], ticks[ticks.length - 1]];
  const tickDp = tickDecimals(ticks);
  const valueDp = autoDecimals([...values, ...lineVals]);
  const display = (v: number) => `${fmt(v, valueDp)} ${unit}`;

  const lastLine = lastDefined(lineVals);
  const lastText = lastLine ? display(lastLine.value) : '';
  const lastBand = lastDefined(hiVals);

  // --- layout (same paddings as TimeSeriesChart so the figures line up)
  const top = 12;
  const bottom = 22;
  const left = Math.max(...ticks.map((t) => textWidth(formatTick(t, tickDp), FONT.tick))) + 8;
  const right = Math.max(12, textWidth(lastText, FONT.label) + 12, lastBand ? textWidth(BAND_WORD, FONT.label) + 12 : 0);
  const plotW = Math.max(24, width - left - right);
  const plotH = Math.max(24, height - top - bottom);
  const xs = xPositions(n, left, left + plotW);
  const y = scaleLinear(domain, [top + plotH, top]);
  const pitch = n > 1 ? plotW / (n - 1) : plotW;
  const dense = n > 1 && pitch < 6;
  const smallDots = !dense && pitch < 12;
  const dotR = smallDots ? 2 : 2.5;
  const crossR = smallDots ? 3 : 3.5;

  const toPts = (vals: Array<number | null>): Pt[] => vals.map((v, i) => ({ x: xs[i], y: v === null ? null : y(v) }));
  const linePath = buildPath(toPts(lineVals));
  const bandPath = buildAreaBetween(toPts(loVals), toPts(hiVals));
  const px = (v: number) => Math.round(v * 100) / 100;
  const clampY = (v: number) => Math.min(top + plotH, Math.max(top, y(v)));
  // The right margin is the legend: the value beside the line end, "90% band" beside the ribbon's top.
  const legendYs = spreadLabels([lastLine ? clampY(lastLine.value) : NaN, lastBand ? clampY(lastBand.value) : NaN], 13, top + 6, top + plotH - 6);
  const legendX = px(left + plotW + 8);

  // --- interaction
  const setFromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = nearestIndex(xs, e.clientX - rect.left);
    setActive(i < 0 ? null : i);
  };
  const step = (dir: 1 | -1) => {
    if (active === null) return dir > 0 ? defined[0] : defined[defined.length - 1];
    const pos = defined.indexOf(active);
    if (pos === -1) return dir > 0 ? (defined.find((i) => i > active) ?? active) : ([...defined].reverse().find((i) => i < active) ?? active);
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

  let rows: TooltipRow[] = [];
  if (active !== null) {
    const v = values[active];
    const s = suspects[active];
    const lv = lineVals[active];
    const lo = loVals[active];
    const hi = hiVals[active];
    if (v !== null) rows.push({ value: display(v), label: 'Scale', color: TOKEN.text2, kind: 'dot' });
    if (s !== null) rows.push({ value: display(s), label: 'Set aside', color: TOKEN.yellow, kind: 'dot' });
    if (lv !== null) rows.push({ value: display(lv), label: 'Trend', color: TOKEN.text, kind: 'line' });
    if (lo !== null && hi !== null) {
      rows.push({ value: `${fmt(lo, valueDp)}–${fmt(hi, valueDp)} ${unit}`, label: BAND_WORD, color: TOKEN.text, kind: 'rect', opacity: 0.35 });
    }
    if (!rows.length) rows = [{ value: '—', label: 'No data', kind: 'none' }];
  }

  const tableRows = dates.map((d, i) => [
    d,
    values[i] !== null ? display(values[i] as number) : suspects[i] !== null ? display(suspects[i] as number) : '—',
    values[i] !== null ? 'Yes' : suspects[i] !== null ? 'Set aside' : '—',
    lineVals[i] === null ? '—' : display(lineVals[i] as number),
    loVals[i] === null ? '—' : display(loVals[i] as number),
    hiVals[i] === null ? '—' : display(hiVals[i] as number),
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
        {/* y ticks as agate at the left; one bottom hairline carries the dates */}
        {ticks.map((t) => (
          <text key={t} x={left - 6} y={px(y(t))} textAnchor="end" dominantBaseline="middle" fontSize={FONT.tick} fill={TOKEN.muted}>
            {formatTick(t, tickDp)}
          </text>
        ))}
        <line x1={left} x2={left + plotW} y1={px(top + plotH)} y2={px(top + plotH)} stroke={TOKEN.border} strokeWidth={1} shapeRendering="crispEdges" />

        {/* the 90% band: a 9 percent bone wash, no edge */}
        {bandPath ? <path d={bandPath} fill={TOKEN.text} fillOpacity={WASH} /> : null}

        {/* the smoothed trend: 1.5 px bone */}
        {linePath ? <path d={linePath} fill="none" stroke={TOKEN.text} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="butt" /> : null}

        {/* accepted readings: hollow text2 circles filled with the stock */}
        {!dense
          ? values.map((v, i) => (v === null ? null : <circle key={`a${i}`} cx={px(xs[i])} cy={px(y(v))} r={dotR} fill={TOKEN.base} stroke={TOKEN.text2} strokeWidth={1} />))
          : null}

        {/* set aside by the outlier gate: an amber cross, shape before ink */}
        {suspects.map((v, i) => {
          if (v === null) return null;
          const cx = px(xs[i]);
          const cy = px(y(v));
          const r = crossR;
          return (
            <path
              key={`s${i}`}
              d={`M${px(cx - r)} ${px(cy - r)}L${px(cx + r)} ${px(cy + r)}M${px(cx - r)} ${px(cy + r)}L${px(cx + r)} ${px(cy - r)}`}
              fill="none"
              stroke={TOKEN.yellow}
              strokeWidth={1.25}
              strokeLinecap="butt"
            />
          );
        })}

        {active !== null ? (
          <g pointerEvents="none">
            <line x1={px(xs[active])} x2={px(xs[active])} y1={top} y2={top + plotH} stroke={TOKEN.text2} strokeWidth={1} />
            {lineVals[active] !== null ? <circle cx={px(xs[active])} cy={px(y(lineVals[active] as number))} r={2.5} fill={TOKEN.text} /> : null}
          </g>
        ) : null}

        {/* two direct labels in agate in the right margin: the value beside the line end, the band's word beside its top */}
        {lastLine ? (
          <text x={legendX} y={px(legendYs[0])} dominantBaseline="middle" fontSize={FONT.label} fontWeight={600} fill={TOKEN.text}>
            {lastText}
          </text>
        ) : null}
        {lastBand ? (
          <text x={legendX} y={px(legendYs[1])} dominantBaseline="middle" fontSize={FONT.label} fontWeight={500} fill={TOKEN.muted}>
            {BAND_WORD}
          </text>
        ) : null}

        {/* three date ticks */}
        {sparseIndices(n, 3).map((i) => {
          const t = formatTickDate(dates[i], range);
          const half = textWidth(t, FONT.tick) / 2;
          return (
            <text key={i} x={px(Math.min(width - half, Math.max(half, xs[i])))} y={height - 6} textAnchor="middle" fontSize={FONT.tick} fill={TOKEN.muted}>
              {t}
            </text>
          );
        })}
      </svg>

      {active !== null ? <ChartTooltip x={xs[active]} width={width} title={dateFormat(dates[active])} rows={rows} /> : null}

      <HiddenTable caption={ariaLabel} head={['Date', 'Scale', 'Used', 'Trend', '90% low', '90% high']} rows={tableRows} />
    </div>
  );
}
