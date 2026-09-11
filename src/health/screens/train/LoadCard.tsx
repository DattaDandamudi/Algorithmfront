/**
 * Training load over the window: the Banister fitness and fatigue curves and
 * the form (fitness − fatigue) that falls out of them, over the same readouts
 * Today shows.
 *
 * In the Analysis bento it is a heading on the ground, a span-2 chart tile,
 * and then the gauge's own tiles (`LoadGauge` renders two 1×1 complications
 * and a span-2 tile), so the curve and the numbers read off it sit in one
 * grid rather than one long card.
 *
 * Three series on one y axis is one series more than `TimeSeriesChart` draws,
 * so the SVG here is composed from the shared chart primitives
 * (`scaleLinear`, `niceTicks`, `buildPath`, `xPositions`, `HiddenTable`) — the
 * same maths and the same marks as every other chart in the app, not a new
 * chart kit. Every rule those charts obey is kept: 2 px round-joined lines,
 * null gaps rather than interpolation, a hairline solid grid, text never in a
 * series colour, and the visually-hidden table twin carrying every number.
 *
 * The legend names each line in words with its current value, so the three
 * curves are separable without relying on colour.
 */
import type { TrainingContext } from '../../data/types';
import type { LoadChartPoint } from '../../engine';
import { fmt } from '../../lib/format';
import { SectionHeader, bandColor } from '../../ui';
import {
  HiddenTable,
  TOKEN,
  buildPath,
  extent,
  formatTick,
  formatTickDate,
  niceTicks,
  scaleLinear,
  textWidth,
  tickDecimals,
  useMeasuredWidth,
  xLabelIndices,
  xPositions,
  type ChartRange,
  type Pt,
} from '../../ui/charts';
import LoadGauge from './LoadGauge';

export interface LoadCardProps {
  points: LoadChartPoint[];
  load: TrainingContext['load'];
  range: ChartRange;
}

const SERIES = [
  { key: 'fitness', label: 'Fitness', color: TOKEN.blue },
  { key: 'fatigue', label: 'Fatigue', color: bandColor('yellow') },
  { key: 'form', label: 'Form', color: TOKEN.green },
] as const;

const HEIGHT = 180;
const TICK_FONT = 12;

export default function LoadCard({ points, load, range }: LoadCardProps) {
  return (
    <>
      <SectionHeader
        className="hx-span-2"
        title="Training load"
        caption={points.length ? `${points.length} days` : 'No load logged yet'}
      />
      <section aria-label="Training load" className="hx-card hx-span-2 p-4 flex flex-col gap-4 overflow-hidden">
        <LoadChart points={points} range={range} />
      </section>
      <LoadGauge
        load={load}
        meaning="Fitness rises slowly and fades slowly; fatigue does both fast. Form is what is left — positive means fresher than usual, negative means carrying work."
      />
    </>
  );
}

function LoadChart({ points, range }: { points: LoadChartPoint[]; range: ChartRange }) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const n = points.length;

  if (n === 0) {
    return (
      <div
        role="img"
        aria-label="Training load: nothing logged yet"
        className="flex items-center justify-center rounded-ctl border border-hx-border bg-hx-base/40 px-4 text-[15px] leading-[22px] text-hx-text2"
        style={{ height: HEIGHT }}
      >
        Log a session and the fitness, fatigue and form curves start here.
      </div>
    );
  }

  const values = SERIES.map((s) => points.map((p) => p[s.key]));
  const ext = (extent(values.flat(), 0.08) ?? [0, 1]) as [number, number];
  const ticks = niceTicks(ext[0], ext[1], 4);
  const domain: [number, number] = [ticks[0], ticks[ticks.length - 1]];
  const tickDp = tickDecimals(ticks);

  const top = 12;
  const bottom = 22;
  const left = Math.max(...ticks.map((t) => textWidth(formatTick(t, tickDp), TICK_FONT))) + 8;
  const right = 12;
  const plotW = Math.max(24, width - left - right);
  const plotH = Math.max(24, HEIGHT - top - bottom);
  const xs = xPositions(n, left, left + plotW);
  const y = scaleLinear(domain, [top + plotH, top]);
  const toPts = (vals: number[]): Pt[] => vals.map((v, i) => ({ x: xs[i], y: Number.isFinite(v) ? y(v) : null }));
  const labelIdx = new Set(xLabelIndices(n, range));
  const zeroInside = domain[0] < 0 && domain[1] > 0;

  return (
    <div ref={ref} className="relative w-full">
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={`Training load: fitness, fatigue and form over the last ${n} days`}
        className="block"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} stroke={TOKEN.border} strokeWidth={1} />
            <text x={left - 6} y={y(t) + 4} textAnchor="end" fontSize={TICK_FONT} fill={TOKEN.muted}>
              {formatTick(t, tickDp)}
            </text>
          </g>
        ))}
        {zeroInside && (
          <line x1={left} x2={left + plotW} y1={y(0)} y2={y(0)} stroke={TOKEN.neutral} strokeWidth={1} />
        )}
        {SERIES.map((s, i) => (
          <path
            key={s.key}
            d={buildPath(toPts(values[i]))}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {points.map((p, i) =>
          labelIdx.has(i) ? (
            <text key={p.d} x={xs[i]} y={HEIGHT - 6} textAnchor="middle" fontSize={TICK_FONT} fill={TOKEN.muted}>
              {formatTickDate(p.d, range)}
            </text>
          ) : null,
        )}
      </svg>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
        {SERIES.map((s, i) => {
          const last = values[i][n - 1];
          return (
            <li key={s.key} className="flex items-center gap-1.5 text-[13px] leading-[18px] text-hx-text2">
              <span className="w-3 h-0.5 rounded-full shrink-0" style={{ background: s.color }} aria-hidden />
              {s.label} <span className="hx-display font-semibold text-hx-text">{fmt(Math.round(last), 0)}</span>
            </li>
          );
        })}
      </ul>

      <HiddenTable
        caption="Training load by day"
        head={['Date', 'Daily load', 'Acute (7-day)', 'Chronic (28-day)', 'Fitness', 'Fatigue', 'Form']}
        rows={points.map((p) => [
          p.d,
          fmt(Math.round(p.load), 0),
          fmt(Math.round(p.acute), 0),
          fmt(Math.round(p.chronic), 0),
          fmt(Math.round(p.fitness), 0),
          fmt(Math.round(p.fatigue), 0),
          fmt(Math.round(p.form), 0),
        ])}
      />
    </div>
  );
}
