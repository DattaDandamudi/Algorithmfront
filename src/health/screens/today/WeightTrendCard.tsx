/**
 * Weight trend card — SPEC §1 #6 / §6.1.
 *
 * Faint daily scale dots under the EWMA trend line (α from settings, "trust
 * the trend line, never a single dot"), the trend value, and the weekly rate
 * in lb/wk and %BW/wk with the target-band verdict (0.5–1 %BW/wk by default):
 * 'in target' / 'slower than target' / 'faster than target'. Under two
 * weigh-ins in the window there is nothing to draw, so the §1 empty state
 * asks for 5+ weigh-ins a week — the same gate the expenditure model needs.
 *
 * ## v3: the rate is an interval, not a point (plan 2b)
 * The weekly rate now comes from the Kalman slope, and a slope has error bars.
 * Three states, all fed from `ctx.weight`:
 *  - **interval** — the 90 % range around the rate, written as a sentence
 *    ("90 % likely between −1.4 and −0.2 lb/wk") rather than a ± symbol;
 *  - **unavailable** — while `7·√P₁₁` is above the cap the slope is too
 *    uncertain to publish, so the card says so and quotes the engine's own
 *    "about N more weigh-ins" (`rateReason`) instead of a number;
 *  - **suspect** — today's weigh-in was rejected by the outlier gate, so it is
 *    flagged as a likely typo with one tap back into Log. Nothing is deleted:
 *    the gate only down-weights, and the user decides whether it was real.
 *
 * Storage is lb; `profile.units` only changes display (integration notes).
 */
import { AlertTriangle, Scale } from 'lucide-react';
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

  return (
    <section className="px-4 pb-5 flex flex-col gap-3" aria-label="Weight trend">
      <SectionHeader
        title="Weight trend"
        caption={`EWMA trend over daily scale weights, last ${series.dots.length} days`}
        action={
          <Button variant="ghost" size="sm" onClick={() => onOpenCoach(COACH_CHIPS[3])}>
            Ask the coach
          </Button>
        }
      />
      {!enough ? (
        <EmptyState
          icon={<Scale />}
          title="Not enough weigh-ins"
          hint="Weigh in 5+ days this week so your trend and expenditure calibrate."
          action={{ label: 'Log weight', onClick: onLogWeight }}
        />
      ) : (
        <div className="hx-card p-4 flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <span className="hx-label">Trend</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-[28px] leading-8 font-semibold tracking-tight text-hx-text">{weight.trend === null ? '—' : fmt(toUnit(weight.trend), 1)}</span>
                {weight.trend !== null && <span className="text-[13px] font-medium text-hx-text2">{unitLabel}</span>}
              </div>
              {weight.latest !== null && <span className="text-[12px] leading-4 text-hx-muted">Latest scale {fmtWeight(weight.latest, units)}</span>}
            </div>
            <div className="text-right shrink-0">
              <span className="hx-label">Weekly rate</span>
              <div className="mt-1 text-[15px] leading-5 font-semibold text-hx-text">{rateLine ?? '—'}</div>
              <div className={`text-[12px] leading-4 font-medium ${verdict ? bandText(verdict.band) : 'text-hx-muted'}`}>
                {verdict ? verdict.text : rateUnavailable ? 'not published yet' : 'rate needs 8+ days of weigh-ins'}
              </div>
            </div>
          </div>
          {intervalLine && <p className="text-[12px] leading-4 text-hx-muted">{intervalLine}</p>}
          {rateUnavailable && <p className="text-[12px] leading-4 text-hx-text2">{rateReason || RATE_UNAVAILABLE_FALLBACK}</p>}
          <TimeSeriesChart
            ariaLabel={`Weight, last ${series.dots.length} days`}
            range="30D"
            height={132}
            data={series.dots.map((p) => ({ d: p.d, value: toUnit(p.value) }))}
            line={series.line.map((p) => ({ d: p.d, value: toUnit(p.value) }))}
            dotColor="var(--hx-neutral)"
            color="var(--hx-blue)"
            unit={unitLabel}
            label="Scale"
            lineLabel="Trend"
            emptyText="Weigh in to start your trend."
          />
          {calibrationHint && (
            <p className="text-[12px] leading-4 text-hx-muted">
              {calibrationHint} <span className="text-hx-text2">({weight.weighInsThisWeek}/7 this week)</span>
            </p>
          )}
        </div>
      )}
      {weight.suspectToday === true && (
        <div className="rounded-2xl border border-hx-yellow/40 bg-hx-yellow/10 p-3 flex items-start gap-2" role="status">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-hx-yellow" aria-hidden />
          <div className="min-w-0 flex flex-col items-start gap-2">
            <div>
              <p className="text-[13px] leading-5 font-semibold text-hx-yellow">{SUSPECT_HEADLINE}</p>
              <p className="text-[12px] leading-4 text-hx-text2 mt-0.5">
                {weight.latest === null ? "Today's weigh-in" : `Today's ${fmtWeight(weight.latest, units)}`} is far enough from your trend that it barely moved it. Keep it if it is real — fix it if a digit slipped.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={onLogWeight}>
              Check the weigh-in
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
