/**
 * Weight card — SPEC §3 / §6.1.
 *
 * Daily scale dots (neutral) under the EWMA trend line (α from settings) with
 * the water-noise band (trend ± expenditure.waterNoiseBand) as a 12 % wash —
 * "trust the trend line, never a single dot". Readouts: trend in the profile
 * unit, weekly rate in lb/wk (kg/wk for kg users) AND %BW/wk, and the
 * 0.5–1 %BW/wk target band converted to the current weight (172 lb →
 * 0.86–1.72 lb/wk) as a highlighted band with a marker for this week's rate
 * and the band state. Fewer than 5 weigh-ins in the range → the §1 empty state.
 */
import { Scale } from 'lucide-react';
import type { CoachContext, Targets } from '../../data/types';
import { COACH_CHIPS } from '../../engine';
import { clamp, fmt, fmtSigned } from '../../lib/format';
import { Button, EmptyState, bandBg, type Tone } from '../../ui';
import { TimeSeriesChart } from '../../ui/charts';
import { Note, Readout, TrendCard } from './TrendCard';
import { bucketDateFormat, rateBandState, weightFactor, type RangeWindow, type WeightSeries, type WeightUnits } from './series';

/** §6.2's weigh-in gate, reused for the chart: under five weigh-ins the trend is not yet meaningful. */
export const MIN_WEIGH_INS = 5;

export interface WeightCardProps {
  weight: CoachContext['weight'];
  series: WeightSeries;
  win: RangeWindow;
  units: WeightUnits;
  targets: Targets;
  onLogWeight: () => void;
  onOpenCoach: (prompt: string) => void;
}

export default function WeightCard({ weight, series, win, units, targets, onLogWeight, onOpenCoach }: WeightCardProps) {
  const k = weightFactor(units);
  const conv = (lb: number | null): number | null => (lb === null ? null : lb * k);
  const trend = conv(weight.trend);
  const rate = conv(weight.weeklyRateLb);
  const pct = weight.weeklyRatePct;
  const lo = weight.targetLbPerWk[0] * k;
  const hi = weight.targetLbPerWk[1] * k;
  const state = rateBandState(weight.inBand, weight.weeklyRateLb);
  // Positive = losing, the direction the target band is defined in.
  const loss = rate === null ? null : -rate;

  const action = (
    <Button variant="ghost" size="sm" onClick={() => onOpenCoach(COACH_CHIPS[3])}>
      Ask the coach
    </Button>
  );

  if (series.weighIns < MIN_WEIGH_INS) {
    return (
      <TrendCard
        title="Weight"
        caption={`${series.weighIns} weigh-in${series.weighIns === 1 ? '' : 's'} in the ${win.label}`}
        action={action}
        empty={
          <EmptyState
            icon={<Scale />}
            title="Not enough weigh-ins"
            hint="Weigh in 5+ days this week so your trend and expenditure calibrate."
            action={{ label: 'Log weight', onClick: onLogWeight }}
          />
        }
      />
    );
  }

  return (
    <TrendCard
      title="Weight"
      caption={`EWMA trend (α ${targets.ewmaAlpha}) over ${series.weighIns} weigh-ins · ${win.label}`}
      action={action}
      meaning={`Trust the line, not the dots — day-to-day swings inside the ±${fmt(series.noise, 1)} ${units} band are water and glycogen, not fat.`}
    >
      <div className="grid grid-cols-2 gap-3">
        <Readout
          label="Trend"
          value={trend}
          dp={1}
          unit={units}
          sub={weight.latest === null ? undefined : `Latest scale ${fmt(conv(weight.latest), 1)} ${units}`}
        />
        <Readout
          label="Weekly rate"
          value={rate === null ? null : fmtSigned(rate, 2)}
          unit={rate === null ? undefined : `${units}/wk`}
          sub={pct === null ? 'Needs 8+ days of weigh-ins' : `${fmtSigned(pct, 2)} %BW/wk`}
        />
      </div>

      <TimeSeriesChart
        ariaLabel={`Weight, ${win.label}: daily scale weights, EWMA trend and water-noise band`}
        range={win.range}
        data={series.dots}
        line={series.trend}
        band={series.band}
        color="var(--hx-blue)"
        dotColor="var(--hx-neutral)"
        unit={units}
        label="Scale"
        lineLabel="Trend"
        bandLabel="Water noise"
        dateFormat={bucketDateFormat(win.bucket)}
        emptyText="Weigh in to start your trend."
      />

      <RateBand lo={lo} hi={hi} loss={loss} unit={units} tone={state.tone} pctBand={targets.weeklyRatePct} stateText={state.text} />
    </TrendCard>
  );
}

interface RateBandProps {
  lo: number;
  hi: number;
  /** Weekly loss in display units (positive = losing); null before 8 days of trend. */
  loss: number | null;
  unit: WeightUnits;
  tone: Tone;
  pctBand: [number, number];
  stateText: string;
}

/**
 * The 0.5–1 %BW/wk target band as a highlighted segment on a 0 → 2×upper
 * track, with a marker for this week's loss. Semantic colour only on the
 * marker/state text; the band itself is a green wash (on-track zone).
 */
function RateBand({ lo, hi, loss, unit, tone, pctBand, stateText }: RateBandProps) {
  const max = Math.max(hi * 2, loss === null ? 0 : loss * 1.15, 0.01);
  const at = (v: number) => clamp(v / max, 0, 1) * 100;
  const lossText = loss === null ? 'not yet known' : `${fmt(loss, 2)} ${unit}/wk`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="hx-label">Target band</span>
        <span className="text-[12px] leading-4 text-hx-text2">
          {fmt(lo, 2)}–{fmt(hi, 2)} {unit}/wk · {pctBand[0]}–{pctBand[1]} %BW
        </span>
      </div>
      <div
        role="img"
        aria-label={`Weekly loss ${lossText} against a ${fmt(lo, 2)}–${fmt(hi, 2)} ${unit}/wk target band`}
        className="relative h-2 rounded-full bg-hx-card2"
      >
        <div className="absolute inset-y-0 rounded-full bg-hx-green/30" style={{ left: `${at(lo)}%`, width: `${Math.max(0, at(hi) - at(lo))}%` }} />
        {loss !== null && (
          <div className={`absolute -top-1 h-4 w-1 rounded-full ${bandBg(tone)}`} style={{ left: `calc(${at(Math.max(0, loss))}% - 2px)` }} />
        )}
      </div>
      <Note tone={tone}>
        {stateText}
        {loss !== null && loss < 0 ? ` — trend up ${fmt(-loss, 2)} ${unit}/wk` : ''}
      </Note>
    </div>
  );
}
