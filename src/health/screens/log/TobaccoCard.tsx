/**
 * TobaccoCard — SPEC §2 "+1 stepper, 2 taps max, optional timestamp" and
 * §6.6 counts/streak. The optional stamp appends "cig HH:MM" to record.note
 * so the coach can see spacing between cigarettes.
 *
 * The Tobacco section of the Log page (DESIGN.md "Log"): a running head whose
 * dateline is the day's state, the lg Stepper (two 56 px rule-outlined keys
 * around the .hx-fig count; its "+" is the one-tap +1), the "Note time"
 * toggle as a tag with `aria-pressed`, the streak in words with the count in
 * its tone, and the noted times as a caption.
 *
 * A smoke-free day needs an explicit `tob: 0` (engine/tobacco.ts skips days
 * without a value; INTEGRATION_NOTES), so when nothing is logged yet the
 * section says so and offers "Smoke-free today" → adjustTobacco(d, 0).
 */
import { useState } from 'react';
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

  const dateline = logged
    ? count === 0
      ? 'Smoke-free so far today'
      : `${count} today${avg7 !== null ? `, against your ${fmt(avg7, 1)} a day average` : ''}`
    : 'Not logged yet today';

  return (
    <section className="flex flex-col" aria-label="Tobacco">
      <SectionHeader as="h2" rule={false} title="Tobacco" caption={dateline} />
      <div className="mt-4 flex flex-col gap-3">
        {/* One tap on "+" is the +1; the stamp rides along when the toggle is on. */}
        <Stepper value={count} onChange={(n) => onAdjust(n - count, stamp && n - count === 1)} step={1} min={0} max={99} label="Cigarettes today" size="lg" className="w-full" />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Chip size="sm" active={stamp} pressed={stamp} color="blue" onClick={() => setStamp((v) => !v)}>
            Note time
          </Chip>
          {!logged && (
            <Button variant="secondary" size="md" onClick={onSmokeFree}>
              Smoke-free today
            </Button>
          )}
        </div>
        <p className="hx-cap">
          {streakDays > 0 ? (
            <>
              <span className="text-hx-green">{streakDays}</span> smoke-free {streakDays === 1 ? 'day' : 'days'} in a row
            </>
          ) : (
            'Smoke-free streak starts with a 0 day.'
          )}
        </p>
        {stamps.length > 0 && <p className="hx-cap">Times: {stamps.join(', ')}</p>}
      </div>
    </section>
  );
}
