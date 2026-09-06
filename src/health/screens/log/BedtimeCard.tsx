/**
 * BedtimeCard — SPEC §2 "a single 'Going to bed' button at night captures
 * actual bed time → feeds the consistency metric" (§6.4 bedtime SD).
 *
 * Record semantics (INTEGRATION_NOTES / engine/sleep.ts): `bt` on record D is
 * the bedtime of the sleep that ENDED on the morning of D. A press before
 * 04:00 counts as the PREVIOUS calendar day's night, so 23:10 on 6 Sep and
 * 00:20 on 7 Sep both write to record 2026-09-07 — `bedtimeRecordDate` in
 * logUtils implements the rule; the store's `logBedtime(d, time)` just
 * patches `bt`. The card labels the save with the night's date, not the
 * record's, because that is how people think about it.
 *
 * Shows last night's logged bedtime (today's record), tonight's if already
 * pressed (with Undo), the countdown nudge from `bedtimeCountdown`, and the
 * bedtime SD over the nights actually logged in the rolling 7-day window
 * (`ctx.sleep.bedtimeNights`, shown from 3 — review R7-12: a 4-night SD must
 * not be labelled "7 nights") with the spec's empty-state copy.
 */
import { Moon } from 'lucide-react';
import { BEDTIME_SD_MIN_NIGHTS } from '../trends/series';
import type { CoachContext, DailyRecord, Profile } from '../../data/types';
import { bedtimeCountdown } from '../../engine/sleep';
import { addDays, formatClock, formatDateShort, nowHHMM } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Button, SectionHeader } from '../../ui';

export interface BedtimeCardProps {
  ctx: CoachContext;
  now: Date;
  profile: Profile;
  /** Record the press would write to (bedtimeRecordDate(now)). */
  targetDate: string;
  targetRecord: DailyRecord | undefined;
  todayRecord: DailyRecord | undefined;
  onGoingToBed: () => void;
  onUndo: () => void;
}

export default function BedtimeCard({ ctx, now, profile, targetDate, targetRecord, todayRecord, onGoingToBed, onUndo }: BedtimeCardProps) {
  const tonight = targetRecord?.bt ?? null;
  // Last night = the sleep that ended this morning = today's record. When the
  // target IS today (after midnight) that slot is "tonight", so fall back to
  // the most recent earlier bedtime the engine knows about.
  const lastNight = targetDate === ctx.today ? null : todayRecord?.bt ?? null;
  const lastKnown = lastNight ?? (tonight ? null : ctx.sleep.lastBedtime);
  const countdown = bedtimeCountdown(now, profile.bedTarget, profile.wakeTarget);
  // Same gate as the Trends consistency card: an SD from fewer than 3 nights is noise.
  const nights = ctx.sleep.bedtimeNights ?? 0;
  const sd = nights >= BEDTIME_SD_MIN_NIGHTS ? ctx.sleep.bedtimeSdMin : null;
  // The record is dated the morning after; show the night it belongs to.
  const nightOf = addDays(targetDate, -1);

  return (
    <div className="hx-card p-4 space-y-3">
      <SectionHeader title="Bedtime" caption={`Target ${formatClock(profile.bedTarget)} · wake ${formatClock(profile.wakeTarget)}`} />
      {countdown && (
        <p className={`text-[13px] leading-5 ${countdown.phase === 'past' ? 'text-hx-yellow' : 'text-hx-text2'}`}>
          {countdown.message}
          {countdown.phase === 'past' && ` — lights out now still gets you ${fmt(countdown.achievableHrs, 1)} h.`}
        </p>
      )}
      {tonight ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[14px] leading-5 text-hx-text">
            Tonight logged · <span className="font-semibold">{formatClock(tonight)}</span>
            <span className="block text-[12px] text-hx-muted">night of {formatDateShort(nightOf)}</span>
          </p>
          <Button variant="secondary" size="sm" onClick={onUndo}>
            Undo
          </Button>
        </div>
      ) : (
        <Button size="lg" fullWidth icon={<Moon aria-hidden />} onClick={onGoingToBed}>
          Going to bed · {formatClock(nowHHMM(now))}
        </Button>
      )}
      <div className="flex items-baseline justify-between gap-3 text-[13px] leading-5">
        <span className="text-hx-text2">
          Last night: <span className="text-hx-text font-semibold">{lastKnown ? formatClock(lastKnown) : '—'}</span>
        </span>
        <span className="text-hx-text2 text-right">
          {sd === null ? 'Tap "Going to bed" nightly — consistency shows after 3 nights.' : `Bedtime swing ${fmt(sd)} min over the last ${nights} nights`}
        </span>
      </div>
    </div>
  );
}
