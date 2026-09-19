/**
 * Training load on Analysis: the running head "Training load", the load box
 * score (`LoadGauge` without its ratio row), then the acute:chronic figure
 * (DESIGN.md "Load and ACWR"): the ratio as a `.hx-fig` lead with its band
 * word in the band's tone beside it, a 1.5 px bone line over the window with
 * the 0.8–1.3 zone as a 9 percent bone wash labelled inside it, the last
 * value at the line end, and `LOAD_NOTES.acwrDescriptive` as the caption.
 *
 * The order is the audit's: absolute acute load and the week-on-week change
 * lead, the Banister state follows, and the ratio comes last with its
 * "descriptive, not a causal injury predictor" note in the copy the user
 * reads. The hidden table under the figure carries every daily number the
 * series has (load, acute, chronic, fitness, fatigue, form) so nothing the
 * chart no longer draws is lost to a screen reader or a keyboard.
 *
 * The SVG is composed from the shared chart primitives (`scaleLinear`,
 * `niceTicks`, `buildPath`, `xPositions`, `HiddenTable`) — the same maths and
 * marks as every other chart in the app, not a new chart kit.
 */
import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { TrainingContext } from '../../data/types';
import { LOAD_NOTES, type LoadChartPoint } from '../../engine';
import { formatDateShort } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { bandText } from '../../ui';
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
import LoadGauge from './LoadGauge';
import { TrainCard } from './TrainCard';
import { acwrBandTone, acwrBandWord } from './trainUtils';

export interface LoadCardProps {
  points: LoadChartPoint[];
  load: TrainingContext['load'];
  range: ChartRange;
  className?: string;
}

/** The descriptive ratio zone (Williams 2017): shaded and named, never alerted on. */
const ACWR_ZONE: [number, number] = [0.8, 1.3];
const HEIGHT = 160;
const AGATE = 12;
const WASH = 0.09;
const SVG_CLASS = 'block outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hx-lume';

export default function LoadCard({ points, load, range, className = '' }: LoadCardProps) {
  const tone = acwrBandTone(load.acwrBand);
  return (
    <TrainCard title="Training load" rule caption={points.length ? `${points.length} days` : 'No load logged yet'} className={className}>
      <LoadGauge
        load={load}
        showAcwr={false}
        meaning="Fitness rises slowly and fades slowly; fatigue does both fast. Form is what is left: positive means fresher than usual, negative means carrying work."
      />

      <figure className="hx-figure mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="hx-fig text-hx-text">{load.acwr === null ? '—' : fmt(load.acwr, 2)}</span>
          <span className={`hx-label ${tone === 'neutral' ? '' : bandText(tone)}`}>
            {tone !== 'neutral' && <span className="hx-tone mr-1.5" aria-hidden />}
            {acwrBandWord(load.acwrBand)}
          </span>
        </div>
        <p className="hx-cap mt-1">Acute : chronic, the 7-day load over the 28-day load.</p>
        <div className="mt-3">
          <AcwrChart points={points} range={range} />
        </div>
        <figcaption>{LOAD_NOTES.acwrDescriptive}</figcaption>
      </figure>
    </TrainCard>
  );
}

function AcwrChart({ points, range }: { points: LoadChartPoint[]; range: ChartRange }) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const n = points.length;
  const ariaLabel = `Acute to chronic load ratio over the last ${n} days`;

  const table = (
    <HiddenTable
      caption="Training load by day"
      head={['Date', 'Daily load', 'Acute (7-day)', 'Chronic (28-day)', 'Acute : chronic', 'Fitness', 'Fatigue', 'Form']}
      rows={points.map((p) => [
        p.d,
        fmt(Math.round(p.load), 0),
        fmt(Math.round(p.acute), 0),
        fmt(Math.round(p.chronic), 0),
        p.acwr === null ? '—' : fmt(p.acwr, 2),
        fmt(Math.round(p.fitness), 0),
        fmt(Math.round(p.fatigue), 0),
        fmt(Math.round(p.form), 0),
      ])}
    />
  );

  const values = points.map((p) => (typeof p.acwr === 'number' && Number.isFinite(p.acwr) ? p.acwr : null));
  const defined = definedIndices(values);

  if (n === 0) return <EmptyFrame height={HEIGHT} text="Log a session and the load curve starts here." ariaLabel="Training load" />;
  if (!defined.length) {
    return (
      <div>
        <EmptyFrame height={HEIGHT} text="The ratio needs 28 days of load before it means anything." ariaLabel={ariaLabel} />
        {table}
      </div>
    );
  }

  // --- y domain: the data and the zone, from zero.
  const ext = (extent([...values, ...ACWR_ZONE], 0.08) ?? [0, 2]) as [number, number];
  const ticks = niceTicks(0, ext[1], 4);
  const domain: [number, number] = [ticks[0], ticks[ticks.length - 1]];
  const tickDp = tickDecimals(ticks);
  const display = (v: number) => fmt(v, 2);

  const last = lastDefined(values);
  const lastText = last ? display(last.value) : '';

  const top = 12;
  const bottom = 22;
  const left = Math.max(...ticks.map((t) => textWidth(formatTick(t, tickDp), AGATE))) + 8;
  const right = Math.max(12, textWidth(lastText, AGATE) + 12);
  const plotW = Math.max(24, width - left - right);
  const plotH = Math.max(24, HEIGHT - top - bottom);
  const xs = xPositions(n, left, left + plotW);
  const y = scaleLinear(domain, [top + plotH, top]);
  const px = (v: number) => Math.round(v * 100) / 100;
  const clampY = (v: number) => Math.min(top + plotH, Math.max(top, y(v)));
  const toPts = (vals: Array<number | null>): Pt[] => vals.map((v, i) => ({ x: xs[i], y: v === null ? null : y(v) }));
  const linePath = buildPath(toPts(values));
  const zoneTop = clampY(ACWR_ZONE[1]);
  const zoneBottom = clampY(ACWR_ZONE[0]);

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

  const rows: TooltipRow[] = [];
  if (active !== null) {
    const p = points[active];
    rows.push({ value: values[active] === null ? '—' : display(values[active] as number), label: 'acute : chronic', color: TOKEN.text, kind: 'line' });
    rows.push({ value: fmt(Math.round(p.acute), 0), label: 'acute', kind: 'none' });
    rows.push({ value: fmt(Math.round(p.chronic), 0), label: 'chronic', kind: 'none' });
  }

  const xLabels = xLabelIndices(n, range);

  return (
    <div ref={ref} className="relative w-full">
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
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
        {/* the zone: a 9 percent bone wash, named inside it */}
        <rect x={left} width={plotW} y={px(zoneTop)} height={px(Math.max(0, zoneBottom - zoneTop))} fill={TOKEN.text} fillOpacity={WASH} />
        <text x={left + 4} y={px(zoneTop + AGATE + 1)} textAnchor="start" fontSize={AGATE} fill={TOKEN.muted}>
          {`${fmt(ACWR_ZONE[0], 1)}–${fmt(ACWR_ZONE[1], 1)} usual`}
        </text>

        {/* y ticks as agate at the left: no gridlines, no axis line */}
        {ticks.map((t) => (
          <text key={t} x={left - 6} y={px(y(t))} textAnchor="end" dominantBaseline="middle" fontSize={AGATE} fill={TOKEN.muted}>
            {formatTick(t, tickDp)}
          </text>
        ))}
        {/* one bottom hairline carries the dates */}
        <line x1={left} x2={left + plotW} y1={px(top + plotH)} y2={px(top + plotH)} stroke={TOKEN.border} strokeWidth={1} shapeRendering="crispEdges" />

        {/* the ratio: 1.5 px bone, gaps where it is not yet defined */}
        {linePath ? <path d={linePath} fill="none" stroke={TOKEN.text} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="butt" /> : null}

        {active !== null ? (
          <g pointerEvents="none">
            <line x1={px(xs[active])} x2={px(xs[active])} y1={top} y2={top + plotH} stroke={TOKEN.text2} strokeWidth={1} />
            {values[active] !== null ? <circle cx={px(xs[active])} cy={px(y(values[active] as number))} r={2.5} fill={TOKEN.text} /> : null}
          </g>
        ) : null}

        {/* the last value at the line end */}
        {last ? (
          <text x={px(xs[last.index] + 8)} y={px(clampY(last.value))} dominantBaseline="middle" fontSize={AGATE} fontWeight={600} fill={TOKEN.text}>
            {lastText}
          </text>
        ) : null}

        {xLabels.map((i) => {
          const t = formatTickDate(points[i].d, range);
          const half = textWidth(t, AGATE) / 2;
          const cx = px(Math.min(width - half, Math.max(half, xs[i])));
          return (
            <text key={i} x={cx} y={HEIGHT - 6} textAnchor="middle" fontSize={AGATE} fill={TOKEN.muted}>
              {t}
            </text>
          );
        })}
      </svg>

      {active !== null ? <ChartTooltip x={xs[active]} width={width} title={formatDateShort(points[active].d)} rows={rows} /> : null}

      {table}
    </div>
  );
}
