/**
 * Weight card — SPEC §3 / §6.1, on §1a's filter. The lead figure of Trends,
 * set as the first figure of the body group (it carries the group's ink rule).
 *
 * The lead is the **RTS-smoothed Kalman level** in `.hx-fig` with the rate
 * band's word beside it ("182.4 lb, in target"); the rate sentence follows as
 * the deck with its own 90% interval. The chart draws daily scale readings as
 * hollow circles under the trend with its 90% band as a bone wash; weigh-ins
 * the outlier gate set aside are drawn as amber crosses rather than dropped,
 * and the source line says so in words. Beneath: the 0.5–1 %BW/wk target band
 * as a 2 px rule with the zone as a wash and a tick for this week's rate.
 *
 * The §1 empty state shows only while the trend itself is unavailable (no
 * level yet, or fewer than 5 weigh-ins EVER); an established trend is never
 * hidden because the selected range happens to hold few weigh-ins (R2-3).
 */
import type { CoachContext, Targets } from '../../data/types';
import { COACH_CHIPS } from '../../engine';
import { clamp, fmt, fmtSigned } from '../../lib/format';
import { Button, EmptyState, type Tone } from '../../ui';
import { Lead, Note, TrendCard, Word } from './TrendCard';
import WeightChart from './WeightChart';
import { bucketDateFormat, rateBandState, weightFactor, type RangeWindow, type WeightSeries, type WeightUnits } from './series';

/** §6.2's weigh-in gate, reused for the chart: under five weigh-ins EVER the trend is not yet meaningful. */
export const MIN_WEIGH_INS = 5;

const weighInsText = (n: number) => `${n} weigh-in${n === 1 ? '' : 's'}`;

/** The band word beside the lead figure, short enough to sit on the figure's baseline. */
const BAND_WORD: Record<'in' | 'above' | 'below', string> = { in: 'in target', above: 'faster than target', below: 'slower than target' };

export interface WeightCardProps {
  weight: CoachContext['weight'];
  series: WeightSeries;
  win: RangeWindow;
  units: WeightUnits;
  targets: Targets;
  onLogWeight: () => void;
  onOpenCoach: (prompt: string) => void;
  /** Draw the group's ink rule above the running head. */
  rule?: boolean;
}

export default function WeightCard({ weight, series, win, units, targets, onLogWeight, onOpenCoach, rule }: WeightCardProps) {
  const k = weightFactor(units);
  const conv = (lb: number | null | undefined): number | null => (lb === null || lb === undefined ? null : lb * k);
  // The drawn trend is the smoothed level; the context publishes the filtered
  // one, and at `today` the smoother and the filter agree (§1a), so the lead
  // and the end of the line are the same number.
  const trend = conv(weight.kalmanLevel ?? weight.trend);
  const rate = conv(weight.weeklyRateLb);
  const pct = weight.weeklyRatePct;
  const lo = weight.targetLbPerWk[0] * k;
  const hi = weight.targetLbPerWk[1] * k;
  const state = rateBandState(weight.inBand, weight.weeklyRateLb);
  // Positive = losing, the direction the target band is defined in.
  const loss = rate === null ? null : -rate;
  const rateLo = conv(weight.rateLow90);
  const rateHi = conv(weight.rateHigh90);

  const action = (
    <Button variant="ghost" size="sm" onClick={() => onOpenCoach(COACH_CHIPS[3])}>
      Ask the coach
    </Button>
  );

  const trendReady = trend !== null && series.totalWeighIns >= MIN_WEIGH_INS;
  if (!trendReady) {
    return (
      <TrendCard
        title="Weight"
        rule={rule}
        caption={`${weighInsText(series.totalWeighIns)} so far, needs ${MIN_WEIGH_INS}`}
        action={action}
        empty={
          <EmptyState
            title="Not enough weigh-ins"
            hint="Weigh in 5+ days this week so your trend and expenditure calibrate."
            action={{ label: 'Log weight', onClick: onLogWeight }}
          />
        }
      />
    );
  }

  const bandWord = weight.inBand === 'in' || weight.inBand === 'above' || weight.inBand === 'below' ? BAND_WORD[weight.inBand] : undefined;
  const bandText = series.bandHalf === null ? 'a 90% band' : `±${fmt(series.bandHalf, 1)} ${units} (90%)`;

  let deck: string;
  if (rate === null) deck = `The weekly rate needs 8 or more days of weigh-ins${pct === null ? '' : ''}.`;
  else {
    const dir = rate > 0 ? 'Gaining' : 'Losing';
    const interval = rateLo !== null && rateHi !== null ? `, 90% interval ${fmtSigned(rateLo, 2)} to ${fmtSigned(rateHi, 2)} ${units} a week` : pct === null ? '' : `, ${fmtSigned(pct, 2)} %BW a week`;
    deck = `${dir} ${fmt(Math.abs(rate), 2)} ${units} a week${interval}.`;
  }

  return (
    <TrendCard
      title="Weight"
      rule={rule}
      caption={weight.latest !== null ? `Latest scale ${fmt(conv(weight.latest), 1)} ${units}` : `${weighInsText(series.weighIns)} in the ${win.label}`}
      action={action}
      source={
        <>
          Kalman-smoothed, 90% band; {weighInsText(series.weighIns)} in the {win.label}. Hollow circles are weigh-ins the trend used. Amber crosses are readings
          the outlier check set aside: a typo, a different scale, or a day the number simply could not be right.
        </>
      }
      meaning={`Trust the line, not the dots: the shaded ribbon is where your true weight sits ${bandText}, and day-to-day swings inside it are water and glycogen, not fat.`}
    >
      <Lead value={trend} dp={1} unit={units} word={bandWord} tone={bandWord ? state.tone : undefined} />

      <p className="hx-deck">{deck}</p>

      <WeightChart
        ariaLabel={`Weight, ${win.label}: scale readings, the smoothed trend and its 90% band`}
        range={win.range}
        dots={series.dots}
        suspect={series.suspect}
        line={series.trend}
        band={series.band}
        unit={units}
        dateFormat={bucketDateFormat(win.bucket)}
        emptyText="Weigh in to start your trend."
      />

      {series.suspectCount > 0 && (
        <Note tone="yellow">
          {series.suspectCount} weigh-in{series.suspectCount === 1 ? '' : 's'} set aside in the {win.label}. Nothing is deleted; re-enter a value if it was real and
          the trend will take it.
        </Note>
      )}
      {series.weighIns < MIN_WEIGH_INS && (
        <p className="hx-cap">
          {weighInsText(series.weighIns)} in this range, so the line carries your trend forward from earlier weigh-ins; weigh in {MIN_WEIGH_INS}+ days a week to keep
          expenditure calibrating.
        </p>
      )}

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
 * The 0.5–1 %BW/wk target band as the strip beneath the figure: a 2 px rule
 * from 0 to 2× the upper bound with the zone as a wash on the rule, a 2 px
 * bone tick for this week's loss, and its state as a word with a tone square.
 */
function RateBand({ lo, hi, loss, unit, tone, pctBand, stateText }: RateBandProps) {
  const max = Math.max(hi * 2, loss === null ? 0 : loss * 1.15, 0.01);
  const at = (v: number) => clamp(v / max, 0, 1) * 100;
  const lossText = loss === null ? 'not yet known' : `${fmt(loss, 2)} ${unit}/wk`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="hx-label">Target band</span>
        <span className="hx-cap text-right">
          {fmt(lo, 2)}–{fmt(hi, 2)} {unit}/wk, {pctBand[0]}–{pctBand[1]} %BW
        </span>
      </div>
      <div role="img" aria-label={`Weekly loss ${lossText} against a ${fmt(lo, 2)}–${fmt(hi, 2)} ${unit}/wk target band`} className="relative h-3">
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-hx-border" aria-hidden />
        <div className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-hx-text/40" style={{ left: `${at(lo)}%`, width: `${Math.max(0, at(hi) - at(lo))}%` }} aria-hidden />
        {loss !== null && <div className="absolute inset-y-0 w-0.5 bg-hx-text" style={{ left: `calc(${at(Math.max(0, loss))}% - 1px)` }} aria-hidden />}
      </div>
      <p className="hx-cap">
        <Word word={stateText} tone={tone} />
        {loss !== null && loss < 0 ? `, trend up ${fmt(-loss, 2)} ${unit}/wk` : ''}
      </p>
    </div>
  );
}
