/**
 * The estimated one-rep-max figure for one exercise (DESIGN.md "Train"): a
 * 1.5 px bone EWMA line, each session's best as a hollow text2 circle, the
 * sessions that set a PR as filled bone dots with a direct "PR" label, and
 * the last value labelled at the line end. One bottom hairline carries the
 * dates; the y ticks sit as agate at the left; no gridlines, no y-axis line,
 * no legend. The crosshair tooltip is a plate slip and every number is in
 * the visually-hidden table, so nothing is gated behind hover.
 *
 * Composed from the shared chart primitives (`scaleLinear`, `niceTicks`,
 * `buildPath`, `xPositions`, `HiddenTable`, `ChartTooltip`) rather than
 * `TimeSeriesChart`, because that component marks annotations as triangles
 * on the top edge and the spec wants the record on the line itself.
 *
 * The x axis is **one slot per session**, not one per calendar day. Sessions
 * containing a given lift are 2–4 days apart, so a daily axis over 90 days
 * puts the points ~3.7 px apart; per-session spacing keeps every session
 * visible and the hidden table carries the real dates.
 */
import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ISODate } from '../../data/types';
import { diffDays, formatDateShort } from '../../lib/dates';
import { fmt } from '../../lib/format';
import {
  ChartTooltip,
  EmptyFrame,
  HiddenTable,
  TOKEN,
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
  useMeasuredWidth,
  xLabelIndices,
  xPositions,
  type ChartRange,
  type Pt,
  type TooltipRow,
} from '../../ui/charts';

export interface E1rmChartPoint {
  d: ISODate;
  /** The session's best estimate, display units; null when nothing estimable. */
  best: number | null;
  /** The EWMA trend through that session, display units. */
  trend: number | null;
  /** Set when the session set a record: the record's kind word. */
  pr?: string;
}

export interface E1rmChartProps {
  points: E1rmChartPoint[];
  unit: string;
  range: ChartRange;
  ariaLabel: string;
  height?: number;
  emptyText?: string;
}

const AGATE = 12;
const SVG_CLASS = 'block outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hx-lume';

export default function E1rmChart({ points, unit, range, ariaLabel, height = 180, emptyText = 'Not enough data yet.' }: E1rmChartProps) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const n = points.length;
  const bests = points.map((p) => (typeof p.best === 'number' && Number.isFinite(p.best) ? p.best : null));
  const trends = points.map((p) => (typeof p.trend === 'number' && Number.isFinite(p.trend) ? p.trend : null));
  const defined = definedIndices(bests.map((v, i) => v ?? trends[i]));

  if (!defined.length) return <EmptyFrame height={height} text={emptyText} ariaLabel={ariaLabel} />;

  // --- y domain: nice ticks over everything drawn; never below 0.
  const ext = (extent([...bests, ...trends], 0.08) ?? [0, 1]) as [number, number];
  let ticks = niceTicks(ext[0], ext[1], 4);
  if (ticks[0] < 0) ticks = niceTicks(0, ext[1], 4);
  const domain: [number, number] = [ticks[0], ticks[ticks.length - 1]];
  const tickDp = tickDecimals(ticks);
  const dp = bests.every((v) => v === null || Number.isInteger(v)) ? 0 : 1;
  const display = (v: number) => `${fmt(v, dp)} ${unit}`;

  // --- direct label: the last session (its best, else the trend there).
  const lastBest = lastDefined(bests);
  const lastTrend = lastDefined(trends);
  const last = lastBest ?? lastTrend;
  const lastText = last ? display(last.value) : '';

  // --- layout
  const top = 16;
  const bottom = 22;
  const left = Math.max(...ticks.map((t) => textWidth(formatTick(t, tickDp), AGATE))) + 8;
  const right = Math.max(12, textWidth(lastText, AGATE) + 12);
  const plotW = Math.max(24, width - left - right);
  const plotH = Math.max(24, height - top - bottom);
  const xs = xPositions(n, left, left + plotW);
  const y = scaleLinear(domain, [top + plotH, top]);
  const pitch = n > 1 ? plotW / (n - 1) : plotW;
  const dense = n > 1 && pitch < 6;
  const px = (v: number) => Math.round(v * 100) / 100;
  const clampY = (v: number) => Math.min(top + plotH, Math.max(top, y(v)));

  const toPts = (vals: Array<number | null>): Pt[] => vals.map((v, i) => ({ x: xs[i], y: v === null ? null : y(v) }));
  const trendPath = buildPath(toPts(trends));
  const bestPath = dense ? buildPath(toPts(bests)) : '';

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

  let rows: TooltipRow[] = [];
  if (active !== null) {
    const b = bests[active];
    const t = trends[active];
    if (b !== null) rows.push({ value: display(b), label: 'Session best', color: TOKEN.text2, kind: 'dot' });
    if (t !== null) rows.push({ value: display(t), label: 'Trend', color: TOKEN.text, kind: 'line' });
    const pr = points[active].pr;
    if (pr) rows.push({ value: `PR, ${pr}`, label: '', kind: 'none' });
    if (!rows.length) rows = [{ value: '—', label: 'No data', kind: 'none' }];
  }

  // One slot per session, so the labels follow the span actually in view: day
  // and month while it is under about three months, the month alone beyond
  // that, and never the same word twice in a row.
  const spanDays = n > 1 ? Math.abs(diffDays(points[0].d, points[n - 1].d)) : 0;
  const labelRange: ChartRange = spanDays > 100 ? '1Y' : range === '7D' ? '7D' : '90D';
  const xLabels: Array<{ i: number; t: string }> = [];
  for (const i of xLabelIndices(n, range)) {
    const t = formatTickDate(points[i].d, labelRange);
    if (xLabels.length && xLabels[xLabels.length - 1].t === t) continue;
    xLabels.push({ i, t });
  }

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
        {/* y ticks as agate at the left: no gridlines, no axis line. */}
        {ticks.map((t) => (
          <text key={t} x={left - 6} y={px(y(t))} textAnchor="end" dominantBaseline="middle" fontSize={AGATE} fill={TOKEN.muted}>
            {formatTick(t, tickDp)}
          </text>
        ))}
        {/* one bottom hairline carries the dates */}
        <line x1={left} x2={left + plotW} y1={px(top + plotH)} y2={px(top + plotH)} stroke={TOKEN.border} strokeWidth={1} shapeRendering="crispEdges" />

        {/* dense fallback: the session bests as a 1 px text2 line */}
        {bestPath ? <path d={bestPath} fill="none" stroke={TOKEN.text2} strokeWidth={1} strokeLinejoin="round" strokeLinecap="butt" /> : null}

        {/* the trend: 1.5 px bone */}
        {trendPath ? <path d={trendPath} fill="none" stroke={TOKEN.text} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="butt" /> : null}

        {/* session bests: hollow text2 circles filled with the stock; PR sessions filled bone and labelled */}
        {bests.map((v, i) => {
          if (v === null) return null;
          const pr = !!points[i].pr;
          if (!pr && dense) return null;
          const cx = px(xs[i]);
          const cy = px(y(v));
          if (!pr) return <circle key={i} cx={cx} cy={cy} r={2.5} fill={TOKEN.base} stroke={TOKEN.text2} strokeWidth={1} />;
          const labelX = Math.min(left + plotW, Math.max(left + 8, xs[i]));
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={3} fill={TOKEN.text} />
              <text x={px(labelX)} y={px(Math.max(top - 4, cy - 8))} textAnchor="middle" fontSize={AGATE} fontWeight={500} fill={TOKEN.text2}>
                PR
              </text>
            </g>
          );
        })}

        {/* crosshair */}
        {active !== null ? (
          <g pointerEvents="none">
            <line x1={px(xs[active])} x2={px(xs[active])} y1={top} y2={top + plotH} stroke={TOKEN.text2} strokeWidth={1} />
            {bests[active] !== null ? <circle cx={px(xs[active])} cy={px(y(bests[active] as number))} r={6} fill="none" stroke={TOKEN.text2} strokeWidth={1} /> : null}
          </g>
        ) : null}

        {/* the last value at the line end */}
        {last ? (
          <text x={px(xs[last.index] + 8)} y={px(clampY(last.value))} dominantBaseline="middle" fontSize={AGATE} fontWeight={600} fill={TOKEN.text}>
            {lastText}
          </text>
        ) : null}

        {/* sparse x labels */}
        {xLabels.map(({ i, t }) => {
          const half = textWidth(t, AGATE) / 2;
          const cx = px(Math.min(width - half, Math.max(half, xs[i])));
          return (
            <text key={i} x={cx} y={height - 6} textAnchor="middle" fontSize={AGATE} fill={TOKEN.muted}>
              {t}
            </text>
          );
        })}
      </svg>

      {active !== null ? <ChartTooltip x={xs[active]} width={width} title={formatDateShort(points[active].d)} rows={rows} /> : null}

      <HiddenTable
        caption={ariaLabel}
        head={['Date', 'Session best', 'Trend', 'Record']}
        rows={points.map((p, i) => [p.d, bests[i] === null ? '—' : display(bests[i] as number), trends[i] === null ? '—' : display(trends[i] as number), p.pr ? `PR, ${p.pr}` : ''])}
      />
    </div>
  );
}
