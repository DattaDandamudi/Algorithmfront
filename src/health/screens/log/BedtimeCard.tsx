/**
 * BedtimeCard — SPEC §2 "a single 'Going to bed' button at night captures
 * actual bed time → feeds the consistency metric" (§6.4 bedtime SD).
 *
 * The Bedtime section of the Log page (DESIGN.md "Log"): a running head with
 * the targets as its dateline, one ledger row (the bedtime it knows as a
 * .hx-fig figure with "pm" as its unit, the night it belongs to in .hx-cap),
 * the "Going to bed" ink key (or "Undo" as an outline once tonight is
 * logged), the countdown nudge from `bedtimeCountdown` in .hx-cap and the
 * consistency line as a hedge.
 *
 * Record semantics (INTEGRATION_NOTES / engine/sleep.ts): `bt` on record D is
 * the bedtime of the sleep that ENDED on the morning of D. A press before
 * 04:00 counts as the PREVIOUS calendar day's night, so 23:10 on 6 Sep and
 * 00:20 on 7 Sep both write to record 2026-09-07 — `bedtimeRecordDate` in
 * logUtils implements the rule; the store's `logBedtime(d, time)` just
 * patches `bt`. The row labels the save with the night's date, not the
 * record's, because that is how people think about it.
 *
 * Shows last night's logged bedtime (today's record), tonight's if already
 * pressed (with Undo), and the bedtime SD over the nights actually logged in
 * the rolling 7-day window (`ctx.sleep.bedtimeNights`, shown from 3 — review
 * R7-12: a 4-night SD must not be labelled "7 nights") with the spec's
 * empty-state copy.
 */
import { BEDTIME_SD_MIN_NIGHTS } from '../trends/series';
import type { CoachContext, DailyRecord, HHMM, Profile } from '../../data/types';
import { bedtimeCountdown } from '../../engine/sleep';
import { addDays, formatClock, formatDateShort } from '../../lib/dates';
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

/** "11:47 pm" as a figure: the digits in .hx-fig, the meridiem as its unit. */
function ClockFigure({ t }: { t: HHMM | null }) {
  if (!t) return <span className="hx-fig text-hx-text2 text-right shrink-0">—</span>;
  const [digits, meridiem] = formatClock(t).split(' ');
  return (
    <span className="hx-fig text-hx-text text-right shrink-0">
      {digits}
      {meridiem && <span className="hx-unit">{meridiem}</span>}
    </span>
  );
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
  const past = countdown?.phase === 'past';

  const caption = tonight ? `Logged, night of ${formatDateShort(nightOf)}` : lastKnown ? (lastNight ? null : 'Most recent night logged') : 'Nothing logged yet';

  return (
    <section className="flex flex-col" aria-label="Bedtime">
      <SectionHeader as="h2" rule={false} title="Bedtime" caption={`Target ${formatClock(profile.bedTarget)}, wake ${formatClock(profile.wakeTarget)}`} />

      <div className="hx-ledger mt-4">
        <div className="hx-row">
          <div className="w-full flex items-baseline justify-between gap-3">
            <span className="hx-body">{tonight ? 'Tonight' : 'Last night'}</span>
            <ClockFigure t={tonight ?? lastKnown} />
          </div>
          {caption && <span className="hx-cap mt-0.5">{caption}</span>}
        </div>
      </div>

      <div className="mt-3">
        {tonight ? (
          <Button variant="secondary" size="lg" fullWidth onClick={onUndo}>
            Undo
          </Button>
        ) : (
          <Button size="lg" fullWidth onClick={onGoingToBed}>
            Going to bed
          </Button>
        )}
      </div>

      {countdown && (
        <p className={`hx-cap mt-3 ${past ? 'text-hx-yellow' : ''}`} role={past ? 'status' : undefined}>
          {countdown.message}
          {past && ` — lights out now still gets you ${fmt(countdown.achievableHrs, 1)} h.`}
        </p>
      )}

      <p className={`hx-hedge ${countdown ? 'mt-2' : 'mt-3'}`}>
        {sd === null ? 'Tap it nightly — consistency shows after 3 nights.' : `Bedtime swing ${fmt(sd)} min over the last ${nights} nights`}
      </p>
    </section>
  );
}
