/**
 * TobaccoCard — SPEC §2 "+1 stepper, 2 taps max, optional timestamp" and
 * §6.6 counts/streak. The optional stamp appends "cig HH:MM" to record.note
 * so the coach can see spacing between cigarettes.
 *
 * A smoke-free day needs an explicit `tob: 0` (engine/tobacco.ts skips days
 * without a value; INTEGRATION_NOTES), so when nothing is logged yet the card
 * says "not logged" and offers "Smoke-free today" → adjustTobacco(d, 0).
 */
import { useState } from 'react';
import { Cigarette, ShieldCheck } from 'lucide-react';
import type { CoachContext, DailyRecord } from '../../data/types';
import { fmt } from '../../lib/format';
import { Button, Chip, SectionHeader, Stepper } from '../../ui';
import { tobaccoStampsFromNote } from './logUtils';

export interface TobaccoCardProps {
  ctx: CoachContext;
  todayRecord: DailyRecord | undefined;
  /** delta ≠ 0 adjusts the count; `stamp` asks for a "cig HH:MM" note entry. */
  onAdjust: (delta: number, stamp: boolean) => void;
  onSmokeFree: () => void;
}

export default function TobaccoCard({ ctx, todayRecord, onAdjust, onSmokeFree }: TobaccoCardProps) {
  const [stamp, setStamp] = useState(false);
  const logged = typeof todayRecord?.tob === 'number';
  const count = logged ? (todayRecord?.tob as number) : 0;
  const stamps = tobaccoStampsFromNote(todayRecord?.note);
  const { avg7, streakDays } = ctx.tobacco;

  const caption = logged
    ? count === 0
      ? 'Smoke-free so far today.'
      : `${count} today${avg7 !== null ? ` vs your ${fmt(avg7, 1)}/day average` : ''}`
    : 'Not logged yet today.';

  return (
    <div className="hx-card p-4 space-y-3">
      <SectionHeader
        title="Tobacco"
        caption={caption}
        action={
          <Chip size="sm" active={stamp} color="blue" onClick={() => setStamp((v) => !v)} aria-label="Note the time of each +1">
            Note time
          </Chip>
        }
      />
      <div className="flex items-center justify-between gap-3">
        <Stepper value={count} onChange={(n) => onAdjust(n - count, stamp && n - count === 1)} step={1} min={0} max={99} label="Cigarettes today" size="lg" />
        <Button size="lg" icon={<Cigarette aria-hidden />} onClick={() => onAdjust(1, stamp)} className="shrink-0" aria-label="Add one cigarette">
          +1
        </Button>
      </div>
      <div className="flex items-center justify-between gap-3 text-[13px] leading-5">
        <div className="text-hx-text2">
          {streakDays > 0 ? (
            <span>
              <span className="text-hx-green font-semibold">{streakDays}</span> smoke-free {streakDays === 1 ? 'day' : 'days'} in a row
            </span>
          ) : (
            <span>Smoke-free streak starts with a 0 day.</span>
          )}
        </div>
        {!logged && (
          <Button variant="secondary" size="sm" icon={<ShieldCheck aria-hidden />} onClick={onSmokeFree}>
            Smoke-free today
          </Button>
        )}
      </div>
      {stamps.length > 0 && (
        <p className="text-[12px] leading-4 text-hx-muted">Times: {stamps.join(' · ')}</p>
      )}
    </div>
  );
}
