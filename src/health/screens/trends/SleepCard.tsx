/**
 * Sleep card — SPEC §3 / §6.4 (WHOOP model).
 *
 * Row 1: hours slept per night (dots, joined) against the need line —
 * imported `sln`, else need = baseline + f(strain) + f(debt) − naps — with
 * the 7-night mean as a hairline and the 30-night personal range (mean ± SD)
 * as the baseline band (§3, review R2-7); readouts: last night vs need, debt
 * in minutes, the 7-night mean.
 * Row 2: consistency — the rolling 7-night SD of bedtime plotted over the
 * window with a 0–30 min "consistent" band and the 60-min flag line (§6.4;
 * Windred 2024: regularity predicts outcomes better than duration; review
 * R2-4), then a BarSeries of nightly bedtime offsets from the target
 * (+ minutes late / − early, on the noon-anchored axis so 00:20 vs 23:00 = +80).
 * The SD readout waits for 3 nights, as its copy promises (R2-9).
 */
import { Moon } from 'lucide-react';
import type { CoachContext, HHMM } from '../../data/types';
import { COACH_CHIPS } from '../../engine';
import { formatClock } from '../../lib/dates';
import { fmt, fmtHours, fmtMinutes, round } from '../../lib/format';
import { Button, EmptyState } from '../../ui';
import { BarSeries, TimeSeriesChart, type DatedValue } from '../../ui/charts';
import { DeltaSub, Note, Readout, TrendCard } from './TrendCard';
import {
  BEDTIME_SD_MIN_NIGHTS,
  BEDTIME_SD_OK_MIN,
  BEDTIME_SD_WARN_MIN,
  BUCKET_LABEL,
  bedtimeSdTone,
  bucketDateFormat,
  toBars,
  type BedtimeSdSeries,
  type RangeWindow,
  type SleepSeries,
} from './series';

/** §1 sleep tile convention: within 30 min of need is on track, within 60 caution. */
const SHORT_OK_MIN = 30;
const SHORT_WARN_MIN = 60;

export interface SleepCardProps {
  sleep: CoachContext['sleep'];
  series: SleepSeries;
  /** Rolling 7-night bedtime SD over the window + today's value (null under 3 nights). */
  consistency: BedtimeSdSeries;
  /** Nightly bedtime offset from the target in minutes (+ late / − early), bucketed like the range. */
  offsets: DatedValue[];
  win: RangeWindow;
  bedTarget: HHMM;
  onLogBedtime: () => void;
  onOpenCoach: (prompt: string) => void;
}

export default function SleepCard({ sleep, series, consistency, offsets, win, bedTarget, onLogBedtime, onOpenCoach }: SleepCardProps) {
  const action = (
    <Button variant="ghost" size="sm" onClick={() => onOpenCoach(COACH_CHIPS[5])}>
      Ask the coach
    </Button>
  );

  if (series.nights === 0) {
    return (
      <TrendCard
        title="Sleep"
        caption="Hours vs need · bedtime consistency"
        action={action}
        empty={
          <EmptyState
            icon={<Moon />}
            title="No sleep logged yet"
            hint="Log last night's sleep or connect WHOOP to see hours vs need."
            action={{ label: 'Log bedtime', onClick: onLogBedtime }}
          />
        }
      />
    );
  }

  const target = formatClock(bedTarget);
  const deltaMin = sleep.hours !== null && sleep.need !== null ? Math.round((sleep.hours - sleep.need) * 60) : null;
  const vsNeedTone = deltaMin === null ? undefined : deltaMin >= -SHORT_OK_MIN ? 'green' : deltaMin >= -SHORT_WARN_MIN ? 'yellow' : 'red';

  // Same engine call as ctx.sleep.bedtimeSdMin, but held back until 3 nights so the copy below is true.
  const sd = consistency.sdMin;
  const sdTone = bedtimeSdTone(sd);
  let sdText: string;
  if (sd === null)
    sdText =
      consistency.nights > 0
        ? `${consistency.nights} of ${BEDTIME_SD_MIN_NIGHTS} nights logged this week — consistency shows after ${BEDTIME_SD_MIN_NIGHTS} nights.`
        : `Tap "Going to bed" nightly — consistency shows after ${BEDTIME_SD_MIN_NIGHTS} nights.`;
  else if (sd < BEDTIME_SD_OK_MIN) sdText = `Tight — under ${BEDTIME_SD_OK_MIN} min. Keep it there.`;
  else if (sd <= BEDTIME_SD_WARN_MIN) sdText = `Drifting — ${BEDTIME_SD_OK_MIN}–${BEDTIME_SD_WARN_MIN} min. Aim for ${target} nightly.`;
  else sdText = `Over ${BEDTIME_SD_WARN_MIN} min — regularity is slipping; a fixed ${target} bedtime does more for recovery than extra hours.`;

  const hasOffsets = offsets.some((p) => p.value !== null);
  const band = series.band;
  // 7-night mean vs the 30-day baseline (ctx.sleep.delta.baseline is the mean
  // of the 30 nights before today); more sleep is the good direction (§0).
  const base30 = sleep.delta.baseline;
  const meanDelta = series.mean7 !== null && base30 !== null ? round(series.mean7 - base30, 2) : null;

  return (
    <TrendCard
      title="Sleep"
      caption={`Hours vs need · 30-night range · bedtime consistency · ${win.label}`}
      action={action}
      meaning="Hours vs need is the debt you are building and the shaded band is your usual range (30-night mean ± SD); the bedtime row is regularity — a steady bedtime predicts recovery better than total hours."
    >
      <div className="grid grid-cols-3 gap-3">
        <Readout
          label="Last night"
          value={sleep.hours === null ? null : fmtHours(sleep.hours)}
          sub={sleep.need === null ? undefined : `of ${fmt(sleep.need, 1)} h need`}
          tone={vsNeedTone}
        />
        <Readout
          label="Sleep debt"
          value={sleep.debtMin === null ? null : fmtMinutes(sleep.debtMin)}
          sub={deltaMin === null ? undefined : `${deltaMin >= 0 ? '+' : '−'}${Math.abs(deltaMin)} min vs need`}
        />
        <Readout
          label="7-night mean"
          value={series.mean7 === null ? null : fmtHours(series.mean7)}
          sub={<DeltaSub value={meanDelta} good={meanDelta === null ? null : meanDelta > 0} dp={1} unit="h" />}
        />
      </div>

      <TimeSeriesChart
        ariaLabel={`Sleep, ${win.label}: hours per night against need`}
        range={win.range}
        data={series.hours}
        line={series.need}
        connectDots
        targetBand={band ? { lo: band.lo, hi: band.hi, label: 'Your usual range' } : undefined}
        reference={series.mean7 === null ? undefined : { value: series.mean7, label: band ? undefined : '7-night mean' }}
        unit="h"
        label="Slept"
        lineLabel="Need"
        dateFormat={bucketDateFormat(win.bucket)}
        emptyText="Log last night's sleep or connect WHOOP to see hours vs need."
      />

      <div className="flex flex-col gap-3 border-t border-hx-border pt-3">
        <div className="flex items-start justify-between gap-3">
          <Readout label="Bedtime consistency" value={sd === null ? null : fmt(sd)} unit={sd === null ? undefined : 'min SD'} sub={`7-night SD · target ${target}`} />
          {sd === null && (
            <Button variant="secondary" size="sm" onClick={onLogBedtime}>
              Going to bed
            </Button>
          )}
        </div>
        <Note tone={sdTone}>{sdText}</Note>
        <TimeSeriesChart
          ariaLabel={`Bedtime consistency, ${win.label}: rolling 7-night standard deviation of bedtime in minutes, with the under-${BEDTIME_SD_OK_MIN}-minute consistent band and the ${BEDTIME_SD_WARN_MIN}-minute flag line`}
          range={win.range}
          data={consistency.series}
          connectDots
          targetBand={{ lo: 0, hi: BEDTIME_SD_OK_MIN, label: 'consistent' }}
          reference={{ value: BEDTIME_SD_WARN_MIN, label: `${BEDTIME_SD_WARN_MIN} min` }}
          unit="min"
          label="7-night SD"
          height={140}
          dateFormat={bucketDateFormat(win.bucket)}
          emptyText={`Log ${BEDTIME_SD_MIN_NIGHTS}+ bedtimes in a week to see your consistency.`}
        />
        <BarSeries
          ariaLabel={`Bedtime offset from the ${target} target, ${win.label}, in minutes (positive is late)`}
          data={toBars(offsets, win.range)}
          unit="min"
          label={`vs ${target}`}
          height={120}
          emptyText="No bedtimes logged in this range."
        />
        {hasOffsets && (
          <p className="text-[11px] leading-4 text-hx-muted">
            + minutes late · − minutes early{win.bucket === 'day' ? '' : ` · ${BUCKET_LABEL[win.bucket]}`}
          </p>
        )}
      </div>
    </TrendCard>
  );
}
