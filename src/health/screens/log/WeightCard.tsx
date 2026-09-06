/**
 * WeightCard — SPEC §2 "single numeric field remembering last value, ±0.1
 * stepper". Storage is lb (INTEGRATION_NOTES); `profile.units` only changes
 * what is displayed, converting on input via kgToLb (logUtils.displayToLb).
 *
 * Shows the EWMA trend (§6.1) with the weekly rate, the ▲/▼ delta of today's
 * scale weight vs the 30-day average (good direction = down in a fat-loss
 * phase), and the in-progress expenditure block: "n/7 weigh-ins in this
 * block · updates <date>" from `weeklyExpenditure` — the 7-day block anchored
 * to the first weigh-in that the §6.2 gate is evaluated on, the same counter
 * Trends shows — not the trailing-7-day `ctx.weight.weighInsThisWeek`, which
 * could read 6/7 while the block was at 2/7 (review R7-5). "Enough…" appears
 * only when the block meets both gates (`weighInBlockLine`).
 */
import { useEffect, useMemo, useState } from 'react';
import { Scale } from 'lucide-react';
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
  const bandText = inBand === 'in' ? 'text-hx-green' : inBand === null ? 'text-hx-muted' : 'text-hx-yellow';
  const bandCopy = inBand === 'in' ? 'in your 0.5–1 %/wk band' : inBand === 'below' ? 'slower than your band' : inBand === 'above' ? 'faster than your band' : 'trend needs ~8 days';
  const changed = todayLb === null || round(displayToLb(value, units), 1) !== round(todayLb, 1);

  return (
    <div className="hx-card p-4 space-y-3">
      <SectionHeader title="Weight" caption={todayLb !== null ? `Logged today · ${fmtWeight(todayLb, units)}` : 'Weigh in first thing, after the bathroom, before coffee.'} />
      {/* The lg stepper is 240 px; with a button beside it the row overflowed the 324 px card (R6-1), so the button sits underneath. */}
      <div className="flex flex-col gap-3">
        <Stepper value={value} onChange={setValue} step={0.1} dp={1} min={0} max={units === 'kg' ? 400 : 900} unit={units} label={`Weight in ${units}`} size="lg" />
        <Button size="lg" fullWidth icon={<Scale aria-hidden />} onClick={() => onSave(displayToLb(value, units))} disabled={!changed || value <= 0}>
          {todayLb !== null ? 'Update weight' : 'Save weight'}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 text-[13px] leading-5">
        <div>
          <div className="hx-label">Trend</div>
          <div className="text-hx-text font-semibold text-[17px] leading-6">{trend === null ? '—' : fmtWeight(trend, units)}</div>
          <div className={bandText}>{rateLabel ? `${rateLabel} · ${bandCopy}` : 'Weekly rate after 8 days of weigh-ins'}</div>
        </div>
        <div>
          <div className="hx-label">This block</div>
          <div className="text-hx-text font-semibold text-[17px] leading-6">
            {block.value} <span className="text-[13px] font-medium text-hx-text2">weigh-ins</span>
          </div>
          <div className={block.met ? 'text-hx-green' : 'text-hx-text2'}>{block.sub}</div>
        </div>
      </div>
      {todayLb !== null && (
        <Delta value={delta.delta} good={delta.good} dp={1} format={(abs) => `${fmt(lbToDisplay(abs, units), 1)} ${units}`} caption="vs 30-day avg (today’s scale)" />
      )}
    </div>
  );
}
