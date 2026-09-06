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
 * Storage is lb; `profile.units` only changes display (integration notes).
 */
import { Scale } from 'lucide-react';
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

export interface WeightTrendCardProps {
  weight: CoachContext['weight'];
  series: WeightSeries;
  units: 'lb' | 'kg';
  /** §1 empty-state copy from `emptyStates(ctx).weight`, shown while < 5 weigh-ins this week. */
  calibrationHint?: string;
  onLogWeight: () => void;
  onOpenCoach: (prompt: string) => void;
}

export default function WeightTrendCard({ weight, series, units, calibrationHint, onLogWeight, onOpenCoach }: WeightTrendCardProps) {
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
                {verdict ? verdict.text : 'rate needs 8+ days of weigh-ins'}
              </div>
            </div>
          </div>
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
    </section>
  );
}
