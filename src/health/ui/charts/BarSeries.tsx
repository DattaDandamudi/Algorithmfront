/**
 * BarSeries — simple column chart for weekly / monthly aggregates and the
 * tobacco 7-day counts (SPEC §3, §6.6).
 *
 * Mark rules (dataviz/marks-and-anatomy.md): columns ≤ 24 px thick, 4 px
 * rounded data-end and a square baseline, a 2 px surface gap between
 * neighbours, hairline solid grid, target as a neutral hairline. Only the
 * last column carries a direct label; each column's value is in the tooltip
 * (pointer: the whole slot is the hit target, ≥ 24 px; keyboard: ←/→) and in
 * the visually-hidden table.
 */
import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { fmt } from '../../lib/format';
import {
  autoDecimals,
  definedIndices,
  formatTick,
  lastDefined,
  nearestIndex,
  niceTicks,
  scaleLinear,
  sparseIndices,
  textWidth,
  tickDecimals,
} from './chartUtils';
import { ChartTooltip, EmptyFrame, FONT, HiddenTable, SVG_CLASS, TOKEN, useMeasuredWidth, type TooltipRow } from './shared';

export interface BarDatum {
  label: string;
  value: number | null;
}

export interface BarSeriesProps {
  data: BarDatum[];
  /** Series colour. Default var(--hx-blue). */
  color?: string;
  /** Neutral hairline, e.g. a weekly target. */
  target?: number;
  targetLabel?: string;
  /** Default 160. */
  height?: number;
  valueFormat?: (n: number) => string;
  /** Unit suffix appended after the formatted value. */
  unit?: string;
  ariaLabel: string;
  /** Series name for the tooltip / table. Default 'Value'. */
  label?: string;
  emptyText?: string;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Column path with a 4 px radius at the data end and a square baseline. The
 * radius shrinks for very short or narrow bars so the curve never inverts.
 */
export function barPath(x: number, yValue: number, yBase: number, w: number, r = 4): string {
  const h = Math.abs(yBase - yValue);
  const rr = Math.min(r, h, w / 2);
  const p = (v: number) => Math.round(v * 100) / 100;
  if (h === 0) return '';
  if (yValue <= yBase) {
    // positive: rounded top
    return `M${p(x)} ${p(yBase)}V${p(yValue + rr)}Q${p(x)} ${p(yValue)} ${p(x + rr)} ${p(yValue)}H${p(x + w - rr)}Q${p(x + w)} ${p(yValue)} ${p(x + w)} ${p(yValue + rr)}V${p(yBase)}Z`;
  }
  // negative: rounded bottom
  return `M${p(x)} ${p(yBase)}V${p(yValue - rr)}Q${p(x)} ${p(yValue)} ${p(x + rr)} ${p(yValue)}H${p(x + w - rr)}Q${p(x + w)} ${p(yValue)} ${p(x + w)} ${p(yValue - rr)}V${p(yBase)}Z`;
}

export default function BarSeries({
  data,
  color = TOKEN.blue,
  target,
  targetLabel = 'Target',
  height = 160,
  valueFormat,
  unit,
  ariaLabel,
  label = 'Value',
  emptyText = 'Nothing logged yet.',
}: BarSeriesProps) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const values = data.map((d) => (isNum(d.value) ? d.value : null));
  const defined = definedIndices(values);
  const n = data.length;
  if (!defined.length) return <EmptyFrame height={height} text={emptyText} ariaLabel={ariaLabel} />;

  // --- y domain: always includes 0 (columns grow from one baseline) and the target.
  const finite = values.filter(isNum);
  if (isNum(target)) finite.push(target);
  const lo = Math.min(0, ...finite);
  const hi = Math.max(0, ...finite);
  const ticks = niceTicks(lo < 0 ? lo * 1.08 : 0, hi === 0 ? 1 : hi * 1.08, 3);
  const domain: [number, number] = [ticks[0], ticks[ticks.length - 1]];
  const tickDp = tickDecimals(ticks);
  const valueDp = autoDecimals(values);
  const fmtNum = (v: number) => (valueFormat ? valueFormat(v) : fmt(v, valueDp));
  const suffix = unit ? ` ${unit}` : '';
  const display = (v: number) => `${fmtNum(v)}${suffix}`;

  // --- layout
  const top = 16; // room for the cap label
  const bottom = 20;
  const left = Math.max(...ticks.map((t) => textWidth(formatTick(t, tickDp), FONT.tick))) + 8;
  const right = 8;
  const plotW = Math.max(24, width - left - right);
  const plotH = Math.max(24, height - top - bottom);
  const y = scaleLinear(domain, [top + plotH, top]);
  const yBase = y(0);
  const slot = plotW / n;
  const barW = Math.min(24, Math.max(2, slot - 2)); // 2 px surface gap
  const centers = Array.from({ length: n }, (_, i) => left + slot * i + slot / 2);
  const px = (v: number) => Math.round(v * 100) / 100;

  // --- interaction: nearest slot (the slot, not the painted bar, is the hit target)
  const setFromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = nearestIndex(centers, e.clientX - rect.left);
    setActive(i < 0 ? null : i);
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    let next: number | null;
    switch (e.key) {
      case 'ArrowLeft':
        next = active === null ? n - 1 : Math.max(0, active - 1);
        break;
      case 'ArrowRight':
        next = active === null ? 0 : Math.min(n - 1, active + 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = n - 1;
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

  const rows: TooltipRow[] = [];
  if (active !== null) {
    const v = values[active];
    rows.push({ value: v === null ? '—' : display(v), label, color, kind: 'rect' });
    if (isNum(target)) rows.push({ value: display(target), label: targetLabel, color: TOKEN.neutral, kind: 'line' });
  }

  const last = lastDefined(values);
  const xLabels = sparseIndices(n, n <= 8 ? n : 4);

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
        onFocus={() => setActive((a) => (a === null ? n - 1 : a))}
        onBlur={() => setActive(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={left + plotW} y1={px(y(t))} y2={px(y(t))} stroke={TOKEN.border} strokeWidth={1} shapeRendering="crispEdges" />
            <text x={left - 6} y={px(y(t))} textAnchor="end" dominantBaseline="middle" fontSize={FONT.tick} fill={TOKEN.muted}>
              {formatTick(t, tickDp)}
            </text>
          </g>
        ))}

        {values.map((v, i) => {
          if (v === null) return null;
          const d = barPath(centers[i] - barW / 2, y(v), yBase, barW);
          return d ? <path key={i} d={d} fill={color} fillOpacity={active === i ? 1 : 0.8} /> : null;
        })}

        {/* baseline: square, solid */}
        <line x1={left} x2={left + plotW} y1={px(yBase)} y2={px(yBase)} stroke={TOKEN.border} strokeWidth={1} shapeRendering="crispEdges" />

        {isNum(target) ? (
          <g>
            <line x1={left} x2={left + plotW} y1={y(target)} y2={y(target)} stroke={TOKEN.neutral} strokeWidth={1} />
            <text x={left + plotW - 2} y={y(target) - 3} textAnchor="end" fontSize={FONT.small} fill={TOKEN.muted}>
              {targetLabel}
            </text>
          </g>
        ) : null}

        {/* selective direct label: last column's value on its cap */}
        {last ? (
          <text
            x={px(centers[last.index])}
            y={px(last.value >= 0 ? y(last.value) - 4 : y(last.value) + FONT.tick + 2)}
            textAnchor="middle"
            fontSize={FONT.tick}
            fontWeight={600}
            fill={TOKEN.text}
          >
            {display(last.value)}
          </text>
        ) : null}

        {xLabels.map((i) => {
          const t = data[i].label;
          const half = textWidth(t, FONT.tick) / 2;
          const cx = px(Math.min(width - half, Math.max(half, centers[i])));
          return (
            <text key={i} x={cx} y={height - 6} textAnchor="middle" fontSize={FONT.tick} fill={TOKEN.muted}>
              {t}
            </text>
          );
        })}
      </svg>

      {active !== null ? <ChartTooltip x={centers[active]} width={width} title={data[active].label} rows={rows} /> : null}

      <HiddenTable caption={ariaLabel} head={['Period', label]} rows={data.map((d, i) => [d.label, values[i] === null ? '—' : display(values[i] as number)])} />
    </div>
  );
}
