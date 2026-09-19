/**
 * EnergyCard — the predicted-energy curve (plan 2b/2g) as a figure.
 *
 * DELIBERATELY NOT A BATTERY. A battery icon claims a measured level; this app
 * has no continuous heart rate and measures nothing of the kind. What it has
 * is a *forecast* from the two-process sleep model — homeostatic pressure
 * building since wake, multiplied by the circadian rhythm — so it is drawn as
 * a LINE, captioned as a prediction, and the word "predicted" is in the lead,
 * the table head and the screen-reader name.
 *
 * Marks (DESIGN.md "Data marks"): the curve is 1.5 px bone, solid up to now
 * and 1 px dashed after it, so "predicted, not measured" is visible before it
 * is read; the band is a bone wash (0.12, pinned by the render test); "now" is
 * a vertical blue hairline with its time in blue agate; the trough is a hollow
 * dot labelled on the curve; wake and bed times are the only x labels on one
 * bottom hairline; no y axis, no gridlines; the engine's hedge is the caption;
 * a visually-hidden table carries every number so nothing is gated behind a
 * pointer. Geometry comes from `energyGeometry` (pure, tested).
 */
import type { EnergyContext, HHMM } from '../../data/types';
import { formatClock, hhmmToMinutes } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Button, EmptyState, SectionHeader } from '../../ui';
import { HiddenTable, TOKEN, useMeasuredWidth } from '../../ui/charts';
import { ENERGY_CAPTION, energyGeometry, troughLine } from './format';

const PAD = { padLeft: 2, padRight: 2, padTop: 22, padBottom: 22 } as const;
const AGATE = 12;
/** The band wash. The render test pins 0.12 on this curve; the kit's zone wash is 0.09. */
const BAND_OPACITY = 0.12;

const CONFIDENCE_WORD: Record<EnergyContext['confidence'], string> = {
  low: 'Low confidence, little sleep history yet',
  medium: 'Moderate confidence',
  high: 'Good confidence',
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export interface EnergyCardProps {
  /** Undefined while the engine has nothing to forecast. */
  energy?: EnergyContext;
  /** Wall-clock time for the "now" marker; omit and the whole curve is drawn as forecast. */
  nowHHMM?: HHMM;
  /** Chart height in px. Default 150. */
  height?: number;
  onOpenCoach?: (prompt: string) => void;
  coachPrompt?: string;
  /** Accepted for callers; the figure has one shape now. */
  tile?: boolean;
}

interface CurvePoint {
  x: number;
  y: number;
  m: number;
}

const px = (n: number) => Math.round(n * 100) / 100;
const seg = (pts: CurvePoint[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.x)} ${px(p.y)}`).join(' ');

export default function EnergyCard({ energy, nowHHMM, height = 150, onOpenCoach, coachPrompt = 'When will my energy dip today?' }: EnergyCardProps) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();

  const forecast = energy?.forecast ?? [];
  const geo = energyGeometry(forecast, { width, height, ...PAD });

  const action = onOpenCoach ? (
    <Button variant="ghost" size="sm" onClick={() => onOpenCoach(coachPrompt)}>
      Ask the coach
    </Button>
  ) : undefined;
  const head = <SectionHeader as="h2" rule={false} title="Energy" caption={energy ? CONFIDENCE_WORD[energy.confidence] : undefined} action={action} />;

  if (!geo) {
    return (
      <section className="mt-10" aria-label="Energy">
        {head}
        <EmptyState
          className="mt-4"
          title="No forecast yet"
          hint="Log a bedtime and a wake time (or import them) and the model predicts today's curve, including when the afternoon dip is likely to land."
        />
      </section>
    );
  }

  const usable = forecast.filter((p) => isNum(p.value));
  const plotTop = PAD.padTop;
  const plotBottom = height - PAD.padBottom;
  const pts: CurvePoint[] = usable.map((p, i) => ({ x: geo.xs[i], y: geo.y(p.value), m: geo.minutes[i] }));

  // Split the curve at now: solid for the day so far, dashed for the forecast.
  const nowX = geo.xAt(nowHHMM ?? null);
  const t0 = geo.minutes[0];
  const t1 = geo.minutes[geo.minutes.length - 1];
  const nowMin = hhmmToMinutes(nowHHMM ?? null);
  let nowT: number | null = null;
  if (nowMin !== null) {
    let m = nowMin;
    while (m < t0) m += 1440;
    nowT = m <= t1 ? m : null;
  }
  let solid = '';
  let dashed = seg(pts);
  let nowPt: CurvePoint | null = null;
  if (nowT !== null && nowX !== null) {
    const i = pts.findIndex((p) => p.m > nowT);
    if (i > 0) {
      const a = pts[i - 1];
      const b = pts[i];
      const f = (nowT - a.m) / (b.m - a.m);
      nowPt = { x: nowX, y: a.y + (b.y - a.y) * f, m: nowT };
    } else {
      nowPt = i === 0 ? pts[0] : pts[pts.length - 1];
    }
    const before = pts.filter((p) => p.m < nowT);
    const after = pts.filter((p) => p.m > nowT);
    solid = seg([...before, nowPt]);
    dashed = seg([nowPt, ...after]);
  }

  const trough = energy?.trough ?? null;
  const troughX = trough ? geo.xAt(trough.hhmm) : null;
  const troughY = trough && isNum(trough.value) ? geo.y(trough.value) : null;
  const drivers = (energy?.drivers ?? []).filter((d) => !!d);
  const ariaLabel = 'Predicted energy through today, from the two-process sleep model';
  const flipNow = nowX !== null && nowX > width / 2;

  const tableRows = forecast.map((p) => [
    formatClock(p.hhmm),
    isNum(p.value) ? fmt(p.value) : '—',
    isNum(p.lo) && isNum(p.hi) ? `${fmt(p.lo)}–${fmt(p.hi)}` : '—',
  ]);

  const dipLine = [troughLine(trough) || null, energy?.bedtimeReadyAt ? `Sleep-ready from ${formatClock(energy.bedtimeReadyAt)}` : null].filter(Boolean).join('. ');

  return (
    <section className="mt-10" aria-label="Energy">
      {head}
      <figure className="hx-figure">
        <div className="flex items-baseline justify-between gap-3">
          <span className="hx-fig text-hx-text">
            {isNum(energy?.now) ? fmt(energy.now) : '—'}
            <span className="hx-unit">of 100</span>
          </span>
          <span className="hx-cap text-right">predicted now</span>
        </div>

        <div ref={ref} className="relative w-full mt-3">
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} className="block">
            {/* one bottom hairline carries the two clock labels */}
            <line x1={PAD.padLeft} x2={width - PAD.padRight} y1={plotBottom} y2={plotBottom} stroke={TOKEN.border} strokeWidth={1} shapeRendering="crispEdges" />

            {/* the confidence band: a bone wash, no edge */}
            <path d={geo.bandPath} fill={TOKEN.text} fillOpacity={BAND_OPACITY} />

            {/* the curve: solid to now, dashed after */}
            {solid && <path d={solid} fill="none" stroke={TOKEN.text} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="butt" />}
            {dashed && <path d={dashed} fill="none" stroke={TOKEN.text} strokeWidth={1} strokeDasharray="3 3" strokeLinejoin="round" strokeLinecap="butt" />}

            {/* the afternoon trough, labelled on the curve */}
            {troughX !== null && troughY !== null && (
              <g>
                <circle cx={px(troughX)} cy={px(troughY)} r={2.5} fill={TOKEN.base} stroke={TOKEN.text2} strokeWidth={1} />
                <text
                  x={px(Math.min(width - PAD.padRight, Math.max(PAD.padLeft, troughX + (troughX > width / 2 ? -6 : 6))))}
                  y={px(Math.min(plotBottom - 4, troughY + 16))}
                  textAnchor={troughX > width / 2 ? 'end' : 'start'}
                  fontSize={AGATE}
                  fontWeight={500}
                  fill={TOKEN.text2}
                >
                  {`Dip ${formatClock(trough?.hhmm)}`}
                </text>
              </g>
            )}

            {/* now: a blue hairline, the time in blue agate, a bone dot on the curve */}
            {nowX !== null && nowPt && (
              <g>
                <line x1={px(nowX)} x2={px(nowX)} y1={plotTop} y2={plotBottom} stroke={TOKEN.blue} strokeWidth={1} shapeRendering="crispEdges" />
                <circle cx={px(nowX)} cy={px(nowPt.y)} r={2.5} fill={TOKEN.text} />
                <text x={px(nowX + (flipNow ? -5 : 5))} y={plotTop - 8} textAnchor={flipNow ? 'end' : 'start'} fontSize={AGATE} fontWeight={500} fill={TOKEN.blue}>
                  <tspan>Now</tspan>
                  <tspan>{`, ${formatClock(nowHHMM)}`}</tspan>
                </text>
              </g>
            )}

            {/* wake and bed: the only x labels */}
            <text x={PAD.padLeft} y={height - 6} textAnchor="start" fontSize={AGATE} fill={TOKEN.muted}>
              {formatClock(usable[0].hhmm)}
            </text>
            <text x={width - PAD.padRight} y={height - 6} textAnchor="end" fontSize={AGATE} fill={TOKEN.muted}>
              {formatClock(usable[usable.length - 1].hhmm)}
            </text>
          </svg>

          <HiddenTable caption={`${ariaLabel} (predicted, not measured)`} head={['Time', 'Predicted energy out of 100', 'Confidence range']} rows={tableRows} />
        </div>

        {dipLine && <p className="hx-cap mt-2">{`${dipLine}.`}</p>}
        {isNum(energy?.caffeineActiveMg) && energy.caffeineActiveMg > 0 && (
          <p className="hx-cap">{`About ${fmt(energy.caffeineActiveMg)} mg of caffeine is still modelled as active; the curve already accounts for it.`}</p>
        )}
        {drivers.length > 0 && <p className="hx-cap">{`Driven by ${drivers.join(', ')}.`}</p>}
        <figcaption>{ENERGY_CAPTION}</figcaption>
      </figure>
    </section>
  );
}
