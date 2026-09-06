/**
 * EnergyCard — the predicted-energy curve (plan 2b/2g).
 *
 * DELIBERATELY NOT A BATTERY. A battery icon claims a measured level; this app
 * has no continuous heart rate and measures nothing of the kind. What it has
 * is a *forecast* from the two-process sleep model — homeostatic pressure
 * building since wake, multiplied by the circadian rhythm — so it is drawn as
 * a LINE with a shaded confidence band, captioned as a prediction, and the
 * word "predicted" is in the title, the axis label and the screen-reader name.
 *
 * The curve is a hand-rolled SVG built from `energyGeometry` (pure, tested)
 * using the same mark rules as ui/charts: 2 px round-capped line, ~12 % band
 * wash, hairline solid grid, muted tick text, and a visually-hidden table
 * carrying every number so nothing is gated behind a pointer.
 */
import { Sunrise } from 'lucide-react';
import type { EnergyContext, HHMM } from '../../data/types';
import { formatClock } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Button, EmptyState } from '../../ui';
import { HiddenTable, TOKEN, useMeasuredWidth } from '../../ui/charts';
import { Note, Readout, TrendCard } from '../trends/TrendCard';
import { ENERGY_CAPTION, energyGeometry, troughLine } from './format';

const PAD = { padLeft: 30, padRight: 14, padTop: 18, padBottom: 22 } as const;
const FONT = { tick: 12, small: 11 } as const;

const CONFIDENCE_WORD: Record<EnergyContext['confidence'], string> = {
  low: 'Low confidence — the model has little of your sleep history yet',
  medium: 'Moderate confidence',
  high: 'Good confidence',
};

export interface EnergyCardProps {
  /** Undefined while the engine has nothing to forecast. */
  energy?: EnergyContext;
  /** Wall-clock time for the "now" marker; omit and no marker is drawn. */
  nowHHMM?: HHMM;
  /** Chart height in px. Default 176. */
  height?: number;
  onOpenCoach?: (prompt: string) => void;
  coachPrompt?: string;
}

export default function EnergyCard({ energy, nowHHMM, height = 176, onOpenCoach, coachPrompt = 'When will my energy dip today?' }: EnergyCardProps) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();

  const forecast = energy?.forecast ?? [];
  const geo = energyGeometry(forecast, { width, height, ...PAD });

  const action = onOpenCoach ? (
    <Button variant="ghost" size="sm" onClick={() => onOpenCoach(coachPrompt)}>
      Ask the coach
    </Button>
  ) : undefined;

  if (!geo) {
    return (
      <TrendCard
        title="Predicted energy"
        caption="Two-process sleep model — a forecast, not a measurement"
        action={action}
        empty={
          <EmptyState
            icon={<Sunrise />}
            title="No forecast yet"
            hint="Log a bedtime and a wake time (or import them) and the model predicts today's curve — including when the afternoon dip is likely to land."
          />
        }
      />
    );
  }

  const px = (n: number) => Math.round(n * 100) / 100;
  const plotTop = PAD.padTop;
  const plotBottom = height - PAD.padBottom;
  const nowX = geo.xAt(nowHHMM ?? null);
  const trough = energy?.trough ?? null;
  const troughX = trough ? geo.xAt(trough.hhmm) : null;
  const troughY = trough && Number.isFinite(trough.value) ? geo.y(trough.value) : null;
  const drivers = (energy?.drivers ?? []).filter((d) => !!d);
  const ariaLabel = 'Predicted energy through today, from the two-process sleep model';

  const tableRows = forecast.map((p) => [
    formatClock(p.hhmm),
    Number.isFinite(p.value) ? fmt(p.value) : '—',
    Number.isFinite(p.lo) && Number.isFinite(p.hi) ? `${fmt(p.lo)}–${fmt(p.hi)}` : '—',
  ]);

  return (
    <TrendCard
      title="Predicted energy"
      caption="Two-process sleep model — a forecast, not a measurement"
      action={action}
      meaning={ENERGY_CAPTION}
    >
      <div className="grid grid-cols-3 gap-3">
        <Readout label="Predicted now" value={energy?.now ?? null} unit="/ 100" sub={energy ? CONFIDENCE_WORD[energy.confidence] : undefined} />
        <Readout label="Afternoon dip" value={trough ? formatClock(trough.hhmm) : null} sub={trough ? `${fmt(trough.value)} out of 100` : 'needs a full day'} />
        <Readout label="Sleep-ready" value={energy?.bedtimeReadyAt ? formatClock(energy.bedtimeReadyAt) : null} sub="predicted wind-down" />
      </div>

      <div ref={ref} className="relative w-full">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} className="block">
          {/* hairline grid + y ticks (0–100 predicted energy) */}
          {geo.yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.padLeft} x2={width - PAD.padRight} y1={px(geo.y(t))} y2={px(geo.y(t))} stroke={TOKEN.border} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={PAD.padLeft - 6} y={px(geo.y(t))} textAnchor="end" dominantBaseline="middle" fontSize={FONT.tick} fill={TOKEN.muted}>
                {t}
              </text>
            </g>
          ))}

          {/* confidence band — the same ~12 % wash the other charts use */}
          <path d={geo.bandPath} fill={TOKEN.blue} fillOpacity={0.12} />

          {/* the predicted curve */}
          <path d={geo.linePath} fill="none" stroke={TOKEN.blue} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {/* afternoon trough, labelled with its clock time */}
          {troughX !== null && troughY !== null && (
            <g>
              <line x1={px(troughX)} x2={px(troughX)} y1={px(troughY)} y2={plotBottom} stroke={TOKEN.muted} strokeWidth={1} shapeRendering="crispEdges" />
              <circle cx={px(troughX)} cy={px(troughY)} r={4} fill={TOKEN.blue} stroke={TOKEN.card} strokeWidth={2} style={{ paintOrder: 'stroke' }} />
              <text
                x={px(Math.min(width - PAD.padRight, Math.max(PAD.padLeft, troughX)))}
                y={px(Math.min(plotBottom - 4, troughY + 16))}
                textAnchor={troughX > width / 2 ? 'end' : 'start'}
                fontSize={FONT.small}
                fill={TOKEN.text2}
              >
                {`Dip ${formatClock(trough?.hhmm)}`}
              </text>
            </g>
          )}

          {/* "now" marker */}
          {nowX !== null && (
            <g>
              <line x1={px(nowX)} x2={px(nowX)} y1={plotTop} y2={plotBottom} stroke={TOKEN.text2} strokeWidth={1} shapeRendering="crispEdges" />
              {energy?.now !== null && energy?.now !== undefined && (
                <circle cx={px(nowX)} cy={px(geo.y(energy.now))} r={4} fill={TOKEN.text} stroke={TOKEN.card} strokeWidth={2} style={{ paintOrder: 'stroke' }} />
              )}
              <text x={px(nowX)} y={plotTop - 6} textAnchor={nowX > width / 2 ? 'end' : 'start'} fontSize={FONT.small} fontWeight={600} fill={TOKEN.text}>
                Now
              </text>
            </g>
          )}

          {/* x ticks every 3 h */}
          {geo.xTicks.map((t) => (
            <text key={t.label} x={px(Math.min(width - 14, Math.max(14, t.x)))} y={height - 6} textAnchor="middle" fontSize={FONT.tick} fill={TOKEN.muted}>
              {t.label}
            </text>
          ))}
        </svg>

        <HiddenTable caption={`${ariaLabel} (predicted, not measured)`} head={['Time', 'Predicted energy out of 100', 'Confidence range']} rows={tableRows} />
      </div>

      <div className="flex flex-col gap-1">
        {trough && <Note tone="yellow">{troughLine(trough)} — plan the shallow work there, or take the walk.</Note>}
        {energy?.caffeineActiveMg !== null && energy?.caffeineActiveMg !== undefined && energy.caffeineActiveMg > 0 && (
          <Note tone="blue">About {fmt(energy.caffeineActiveMg)} mg of caffeine is still modelled as active — the curve already accounts for it.</Note>
        )}
        {drivers.length > 0 && <Note tone="neutral">Driven by: {drivers.join(' · ')}.</Note>}
      </div>
    </TrendCard>
  );
}
