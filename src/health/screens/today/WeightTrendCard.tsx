/**
 * Weight — SPEC §1 #6 / §6.1, as a figure.
 *
 * The lead is the smoothed level in `.hx-fig` with the target-band verdict
 * beside it as a word with a tone square ('in target' / 'slower than target'
 * / 'faster than target'); the weekly rate and the latest scale reading in a
 * caption; the Kalman 90% interval as a hedge; then the chart: scale readings
 * as hollow circles under the Kalman-smoothed level with its 90% band as a
 * wash; a source line; the calibration hint as the figure's caption. Under
 * two weigh-ins in the window there is nothing to draw, so the §1 empty state
 * asks for 5+ weigh-ins a week — the same gate the expenditure model needs.
 *
 * ## v3: the rate is an interval, not a point (plan 2b)
 * The weekly rate comes from the Kalman slope, and a slope has error bars.
 * Three states, all fed from `ctx.weight`:
 *  - **interval** — the 90 % range around the rate, written as a sentence
 *    ("90 % likely between −1.4 and −0.2 lb/wk") rather than a ± symbol;
 *  - **unavailable** — while `7·√P₁₁` is above the cap the slope is too
 *    uncertain to publish, so the figure says so and quotes the engine's own
 *    "about N more weigh-ins" (`rateReason`) instead of a number;
 *  - **suspect** — today's weigh-in was rejected by the outlier gate, so it is
 *    flagged as a likely typo with one tap back into Log. Nothing is deleted:
 *    the gate only down-weights, and the user decides whether it was real.
 *
 * Storage is lb; `profile.units` only changes display (integration notes).
 */
import type { CoachContext } from '../../data/types';
import { COACH_CHIPS } from '../../engine';
import { fmt, fmtWeight, lbToKg } from '../../lib/format';
import { Button, EmptyState, SectionHeader, bandText } from '../../ui';
import { TimeSeriesChart } from '../../ui/charts';
import { MIN_WEIGH_INS_FOR_CHART, type WeightSeries } from './useTodayModel';

const RATE_TEXT = {
  in: { text: 'in target', band: 'green' },
  below: { text: 'slower than target', band: 'yellow' },
  above: { text: 'faster than target', band: 'yellow' },
} as const;

/** Shown when the slope is too uncertain and the engine could not say how many more weigh-ins it needs. */
export const RATE_UNAVAILABLE_FALLBACK = 'Rate unavailable — not enough weigh-ins yet';
/** The suspect-weigh-in headline; the outlier gate never deletes, it asks. */
export const SUSPECT_HEADLINE = 'Looks like a typo — keep?';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export interface WeightTrendCardProps {
  weight: CoachContext['weight'];
  series: WeightSeries;
  units: 'lb' | 'kg';
  /** §1 empty-state copy from `emptyStates(ctx).weight`, shown while < 5 weigh-ins this week. */
  calibrationHint?: string;
  /**
   * The engine's sentence for an unpublished slope ("Rate unavailable — about
   * 3 more weigh-ins"), from `useTodayModel`. The context carries the interval
   * but not this string, and the count is the filter's, never the screen's.
   */
  rateReason?: string | null;
  onLogWeight: () => void;
  onOpenCoach: (prompt: string) => void;
}

export default function WeightTrendCard({ weight, series, units, calibrationHint, rateReason, onLogWeight, onOpenCoach }: WeightTrendCardProps) {
  const toUnit = (lb: number | null): number | null => (lb === null ? null : units === 'kg' ? lbToKg(lb) : lb);
  const unitLabel = units === 'kg' ? 'kg' : 'lb';
  const enough = series.weighIns >= MIN_WEIGH_INS_FOR_CHART;

  const level = weight.kalmanLevel ?? weight.trend;
  const rate = weight.weeklyRateLb;
  const pct = weight.weeklyRatePct;
  const verdict = weight.inBand ? RATE_TEXT[weight.inBand] : null;
  let rateLine: string | null = null;
  if (rate !== null) {
    const sign = rate < 0 ? '−' : rate > 0 ? '+' : '';
    rateLine = `${sign}${fmtWeight(Math.abs(rate), units)}/wk`;
    if (pct !== null) rateLine += ` (${fmt(Math.abs(pct), 2)} %/wk)`;
  }

  // The Kalman 90% interval, in a sentence — a ± on a rate is read as a range
  // anyway, so write the range and say what the 90% means.
  const signed = (lb: number): string => `${lb < 0 ? '−' : lb > 0 ? '+' : ''}${fmt(Math.abs(units === 'kg' ? lbToKg(lb) : lb), 2)}`;
  const rateUnavailable = weight.rateAvailable === false;
  const intervalLine =
    !rateUnavailable && isNum(weight.rateLow90) && isNum(weight.rateHigh90)
      ? `90% chance your true rate is between ${signed(weight.rateLow90)} and ${signed(weight.rateHigh90)} ${unitLabel}/wk — one scale reading cannot narrow that, more weigh-ins can.`
      : null;

  const stateWord = verdict ? verdict.text : rateUnavailable ? 'rate not published yet' : 'rate needs 8+ days of weigh-ins';
  const captionParts = ['Smoothed trend'];
  if (weight.latest !== null) captionParts.push(`latest scale reading ${fmtWeight(weight.latest, units)}`);
  if (rateLine) captionParts.push(`weekly rate ${rateLine}`);
  const dateline = enough ? `Last ${fmt(series.dots.length)} days, ${fmt(series.weighIns)} weigh-ins` : `${fmt(series.weighIns)} ${series.weighIns === 1 ? 'weigh-in' : 'weigh-ins'} so far`;
  const band = series.band?.map((p) => ({ d: p.d, lo: toUnit(p.lo), hi: toUnit(p.hi) }));

  return (
    <section className="mt-10" aria-label="Weight">
      <SectionHeader
        as="h2"
        rule={false}
        title="Weight"
        caption={dateline}
        action={
          <Button variant="ghost" size="sm" onClick={() => onOpenCoach(COACH_CHIPS[3])}>
            Ask the coach
          </Button>
        }
      />

      {!enough ? (
        <EmptyState className="mt-4" title="Not enough weigh-ins" hint="Weigh in 5+ days this week so your trend and expenditure calibrate." action={{ label: 'Log weight', onClick: onLogWeight }} />
      ) : (
        <figure className="hx-figure">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="hx-fig text-hx-text">
              {level === null ? '—' : fmt(toUnit(level), 1)}
              {level !== null && <span className="hx-unit">{unitLabel}</span>}
            </span>
            <span className={`hx-label ${verdict ? bandText(verdict.band) : ''}`}>
              {verdict && <span className="hx-tone mr-1.5" aria-hidden />}
              {stateWord}
            </span>
          </div>
          <p className="hx-cap mt-1">{`${captionParts.join('; ')}.`}</p>
          {intervalLine && <p className="hx-hedge mt-1">{intervalLine}</p>}
          {rateUnavailable && <p className="hx-cap mt-1">{rateReason || RATE_UNAVAILABLE_FALLBACK}</p>}
          <div className="mt-3">
            <TimeSeriesChart
              ariaLabel={`Weight, last ${series.dots.length} days`}
              range="30D"
              height={132}
              data={series.dots.map((p) => ({ d: p.d, value: toUnit(p.value) }))}
              line={series.line.map((p) => ({ d: p.d, value: toUnit(p.value) }))}
              band={band}
              unit={unitLabel}
              label="Scale"
              lineLabel="Trend"
              bandLabel="90% band"
              emptyText="Weigh in to start your trend."
            />
          </div>
          <p className="hx-cap mt-2">{`Kalman-smoothed, 90% band; ${fmt(series.weighIns)} weigh-ins in ${fmt(series.dots.length)} days.`}</p>
          {calibrationHint && <figcaption>{`${calibrationHint} (${weight.weighInsThisWeek}/7 this week)`}</figcaption>}
        </figure>
      )}

      {weight.suspectToday === true && (
        <div className="hx-note border-hx-yellow mt-4 flex flex-col items-start" role="status">
          <p className="hx-body">
            <span className="hx-label text-hx-yellow">
              <span className="hx-tone mr-1.5" aria-hidden />
              {SUSPECT_HEADLINE}
            </span>
          </p>
          <p className="hx-cap mt-0.5">
            {`${weight.latest === null ? "Today's weigh-in" : `Today's ${fmtWeight(weight.latest, units)}`} is far enough from your trend that it barely moved it. Keep it if it is real; fix it if a digit slipped.`}
          </p>
          <Button variant="ghost" size="sm" className="mt-1" onClick={onLogWeight}>
            Check the weigh-in
          </Button>
        </div>
      )}
    </section>
  );
}
