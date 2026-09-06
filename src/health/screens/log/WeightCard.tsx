/**
 * WeightCard — SPEC §2 "single numeric field remembering last value, ±0.1
 * stepper". Storage is lb (INTEGRATION_NOTES); `profile.units` only changes
 * what is displayed, converting on input via kgToLb (logUtils.displayToLb).
 *
 * Shows the EWMA trend (§6.1) with the weekly rate, the ▲/▼ delta of today's
 * scale weight vs the 30-day average (good direction = down in a fat-loss
 * phase), and "n/7 weigh-ins this week" with the §6.2 ≥5 gate hint.
 */
import { useEffect, useState } from 'react';
import { Scale } from 'lucide-react';
import type { CoachContext, DailyRecord, Profile } from '../../data/types';
import { baselineDelta, weightDirection } from '../../engine/baseline';
import { fmt, fmtWeight, round } from '../../lib/format';
import { Button, Delta, SectionHeader, Stepper } from '../../ui';
import { displayToLb, lbToDisplay } from './logUtils';

export interface WeightCardProps {
  ctx: CoachContext;
  records: DailyRecord[];
  today: string;
  todayRecord: DailyRecord | undefined;
  profile: Profile;
  onSave: (lb: number) => void;
}

const WEIGH_INS_GATE = 5;

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
  const n = ctx.weight.weighInsThisWeek;
  const delta = baselineDelta(records, 'w', today, 30, { direction: weightDirection(profile.goalPhase) });
  const rateLabel = rate === null ? null : `${rate < 0 ? '▼' : rate > 0 ? '▲' : '•'} ${fmtWeight(Math.abs(rate), units)}/wk`;
  const inBand = ctx.weight.inBand;
  const bandText = inBand === 'in' ? 'text-hx-green' : inBand === null ? 'text-hx-muted' : 'text-hx-yellow';
  const bandCopy = inBand === 'in' ? 'in your 0.5–1 %/wk band' : inBand === 'below' ? 'slower than your band' : inBand === 'above' ? 'faster than your band' : 'trend needs ~8 days';
  const changed = todayLb === null || round(displayToLb(value, units), 1) !== round(todayLb, 1);

  return (
    <div className="hx-card p-4 space-y-3">
      <SectionHeader title="Weight" caption={todayLb !== null ? `Logged today · ${fmtWeight(todayLb, units)}` : 'Weigh in first thing, after the bathroom, before coffee.'} />
      <div className="flex items-center justify-between gap-3">
        <Stepper value={value} onChange={setValue} step={0.1} dp={1} min={0} max={units === 'kg' ? 400 : 900} unit={units} label={`Weight in ${units}`} size="lg" />
        <Button size="lg" icon={<Scale aria-hidden />} onClick={() => onSave(displayToLb(value, units))} disabled={!changed || value <= 0} className="shrink-0">
          {todayLb !== null ? 'Update' : 'Save'}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 text-[13px] leading-5">
        <div>
          <div className="hx-label">Trend</div>
          <div className="text-hx-text font-semibold text-[17px] leading-6">{trend === null ? '—' : fmtWeight(trend, units)}</div>
          <div className={bandText}>{rateLabel ? `${rateLabel} · ${bandCopy}` : 'Weekly rate after 8 days of weigh-ins'}</div>
        </div>
        <div>
          <div className="hx-label">This week</div>
          <div className="text-hx-text font-semibold text-[17px] leading-6">
            {n}/7 <span className="text-[13px] font-medium text-hx-text2">weigh-ins</span>
          </div>
          <div className="text-hx-text2">{n >= WEIGH_INS_GATE ? 'Enough for this week’s expenditure update.' : 'Weigh in 5+ days this week so your trend and expenditure calibrate.'}</div>
        </div>
      </div>
      {todayLb !== null && (
        <Delta value={delta.delta} good={delta.good} dp={1} format={(abs) => `${fmt(lbToDisplay(abs, units), 1)} ${units}`} caption="vs 30-day avg (today’s scale)" />
      )}
    </div>
  );
}
