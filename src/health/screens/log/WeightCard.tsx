/**
 * WeightCard — SPEC §2 "single numeric field remembering last value, ±0.1
 * stepper". Storage is lb (INTEGRATION_NOTES); `profile.units` only changes
 * what is displayed, converting on input via kgToLb (logUtils.displayToLb).
 *
 * The Weight section of the Log page (DESIGN.md "Log"): a ruled running head
 * whose dateline is the day's state ("Logged today, 171.0 lb" / "Not yet
 * today"), the lg Stepper (two 56 px rule-outlined keys around a .hx-fig
 * figure) with the ink key beneath it, then a ledger: the EWMA trend (§6.1)
 * as a .hx-fig figure with the weekly rate and the Kalman band line in .hx-cap
 * (the band state as a word, in its tone), the in-progress expenditure block
 * ("n/7 weigh-ins in this block, updates <date>" from `weeklyExpenditure`,
 * the same counter Trends shows, review R7-5) and the ▲/▼ delta of today's
 * scale weight vs the 30-day average. A weigh-in the outlier gate set aside
 * (`ctx.weight.suspectToday`) is said in a note, never silently dropped.
 */
import { useEffect, useMemo, useState } from 'react';
import type { CoachContext, DailyRecord, Profile } from '../../data/types';
import { baselineDelta, weightDirection } from '../../engine/baseline';
import { weeklyExpenditure } from '../../engine/expenditure';
import { fmt, fmtWeight, round } from '../../lib/format';
import { Button, Delta, SectionHeader, Stepper } from '../../ui';
import { displayToLb, lbToDisplay, weighInBlockLine } from './logUtils';

export interface WeightCardProps {
  ctx: CoachContext;
  records: DailyRecord[];
  today: string;
  todayRecord: DailyRecord | undefined;
  profile: Profile;
  onSave: (lb: number) => void;
}

export default function WeightCard({ ctx, records, today, todayRecord, profile, onSave }: WeightCardProps) {
  const units = profile.units;
  const todayLb = typeof todayRecord?.w === 'number' && todayRecord.w > 0 ? todayRecord.w : null;
  // Remember the last value: today's weigh-in, else the latest, else the profile weight.
  const seedLb = todayLb ?? ctx.weight.latest ?? profile.weightLb;
  const [value, setValue] = useState(() => lbToDisplay(seedLb, units));
  useEffect(() => {
    setValue(lbToDisplay(seedLb, units));
  }, [seedLb, units]);

  const trend = ctx.weight.trend;
  const rate = ctx.weight.weeklyRateLb;
  // Block-anchored counts (same evaluation as the Trends expenditure card); memoised per data change / day.
  const expenditure = useMemo(() => weeklyExpenditure(records, today), [records, today]);
  const block = weighInBlockLine(expenditure, today);
  const delta = baselineDelta(records, 'w', today, 30, { direction: weightDirection(profile.goalPhase) });
  const rateLabel = rate === null ? null : `${rate < 0 ? '▼' : rate > 0 ? '▲' : '•'} ${fmtWeight(Math.abs(rate), units)}/wk`;
  const inBand = ctx.weight.inBand;
  const bandTone = inBand === 'in' ? 'text-hx-green' : inBand === null ? '' : 'text-hx-yellow';
  const bandCopy = inBand === 'in' ? 'in your 0.5–1 %/wk band' : inBand === 'below' ? 'slower than your band' : inBand === 'above' ? 'faster than your band' : 'trend needs ~8 days';
  const changed = todayLb === null || round(displayToLb(value, units), 1) !== round(todayLb, 1);
  const suspect = todayLb !== null && ctx.weight.suspectToday === true;

  return (
    <section className="flex flex-col" aria-label="Weight">
      <SectionHeader title="Weight" caption={todayLb !== null ? `Logged today, ${fmtWeight(todayLb, units)}` : 'Not yet today'} />

      <div className="mt-4 flex flex-col gap-3">
        <Stepper value={value} onChange={setValue} step={0.1} dp={1} min={0} max={units === 'kg' ? 400 : 900} unit={units} label={`Weight in ${units}`} size="lg" className="w-full" />
        <Button size="lg" fullWidth onClick={() => onSave(displayToLb(value, units))} disabled={!changed || value <= 0}>
          {todayLb !== null ? 'Update weight' : 'Save weight'}
        </Button>
        {todayLb === null && <p className="hx-hedge">Weigh in first thing, after the bathroom, before coffee.</p>}
      </div>

      {suspect && (
        <div className="hx-note border-hx-yellow mt-4" role="status">
          <p className="hx-body">
            <span className="hx-label text-hx-yellow">
              <span className="hx-tone mr-1.5" aria-hidden />
              Caution
            </span>{' '}
            <span>Today's weigh-in is far from your trend, so the trend line set it aside. It stays in your log; tomorrow's reading will show whether the scale was right.</span>
          </p>
        </div>
      )}

      <div className="hx-ledger mt-4">
        <div className="hx-row">
          <div className="w-full flex items-baseline justify-between gap-3">
            <span className="hx-body">Trend</span>
            <span className={`hx-fig text-right shrink-0 ${trend === null ? 'text-hx-text2' : 'text-hx-text'}`}>
              {trend === null ? '—' : fmt(lbToDisplay(trend, units), 1)}
              {trend !== null && <span className="hx-unit">{units}</span>}
            </span>
          </div>
          <span className={`hx-cap mt-0.5 ${bandTone}`}>{rateLabel ? `${rateLabel}, ${bandCopy}` : 'Weekly rate after 8 days of weigh-ins'}</span>
        </div>
        <div className="hx-row">
          <div className="w-full flex items-baseline justify-between gap-3">
            <span className="hx-body">This block</span>
            <span className="hx-fig text-hx-text text-right shrink-0">
              {block.value}
              <span className="hx-unit">weigh-ins</span>
            </span>
          </div>
          <span className={`hx-cap mt-0.5 ${block.met ? 'text-hx-green' : ''}`}>{block.sub}</span>
        </div>
        {todayLb !== null && (
          <div className="hx-row">
            <div className="w-full flex items-baseline justify-between gap-3">
              <span className="hx-body">Today's scale</span>
              <Delta value={delta.delta} good={delta.good} dp={1} format={(abs) => `${fmt(lbToDisplay(abs, units), 1)} ${units}`} caption="vs 30-day avg" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
