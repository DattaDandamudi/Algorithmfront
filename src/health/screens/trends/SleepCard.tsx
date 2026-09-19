/**
 * Sleep figure — SPEC §3 / §6.4 (WHOOP model).
 *
 * Lead: last night's hours with the vs-need word beside it; deck: the debt
 * and the 7-night mean against the 30-night average. Chart: hours slept per
 * night against the need line (imported `sln`, else need = baseline +
 * f(strain) + f(debt) − naps), the 7-night mean as a dotted hairline and the
 * 30-night personal range (mean ± SD) as the wash (§3, R2-7).
 *
 * Then consistency: the rolling 7-night SD of bedtime plotted over the window
 * with a 0–30 min "consistent" wash and the 60-min flag line (§6.4; Windred
 * 2024: regularity predicts outcomes better than duration; R2-4), and the
 * nightly bedtime offsets from the target as square bars (+ minutes late /
 * − early, on the noon-anchored axis so 00:20 vs 23:00 = +80). The SD figure
 * waits for 3 nights, as its copy promises (R2-9).
 */
import type { CoachContext, HHMM } from '../../data/types';
import { COACH_CHIPS } from '../../engine';
import { formatClock } from '../../lib/dates';
import { fmt, fmtMinutes, fmtSigned, round } from '../../lib/format';
import { Button, EmptyState } from '../../ui';
import { BarSeries, TimeSeriesChart, type DatedValue } from '../../ui/charts';
import { Lead, TrendCard, Word } from './TrendCard';
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
        caption="Hours against need, and how steady your bedtime is"
        action={action}
        empty={
          <EmptyState title="No sleep logged yet" hint="Log last night's sleep or connect WHOOP to see hours vs need." action={{ label: 'Log bedtime', onClick: onLogBedtime }} />
        }
      />
    );
  }

  const target = formatClock(bedTarget);
  const deltaMin = sleep.hours !== null && sleep.need !== null ? Math.round((sleep.hours - sleep.need) * 60) : null;
  const vsNeedTone = deltaMin === null ? undefined : deltaMin >= -SHORT_OK_MIN ? 'green' : deltaMin >= -SHORT_WARN_MIN ? 'yellow' : 'red';
  const vsNeedWord = deltaMin === null ? undefined : `${fmtSigned(deltaMin)} min vs need`;

  // Same engine call as ctx.sleep.bedtimeSdMin, but held back until 3 nights so the copy below is true.
  const sd = consistency.sdMin;
  const sdTone = bedtimeSdTone(sd);
  let sdText: string;
  if (sd === null)
    sdText =
      consistency.nights > 0
        ? `${consistency.nights} of ${BEDTIME_SD_MIN_NIGHTS} nights logged this week; consistency shows after ${BEDTIME_SD_MIN_NIGHTS} nights.`
        : `Log a bedtime nightly; consistency shows after ${BEDTIME_SD_MIN_NIGHTS} nights.`;
  else if (sd < BEDTIME_SD_OK_MIN) sdText = `Under ${BEDTIME_SD_OK_MIN} min. Keep it there.`;
  else if (sd <= BEDTIME_SD_WARN_MIN) sdText = `${BEDTIME_SD_OK_MIN}–${BEDTIME_SD_WARN_MIN} min. Aim for ${target} nightly.`;
  else sdText = `Over ${BEDTIME_SD_WARN_MIN} min: regularity is slipping, and a fixed ${target} bedtime does more for recovery than extra hours.`;

  const band = series.band;
  // 7-night mean vs the 30-day baseline (ctx.sleep.delta.baseline is the mean
  // of the 30 nights before today); more sleep is the good direction (§0).
  const base30 = sleep.delta.baseline;
  const meanDelta = series.mean7 !== null && base30 !== null ? round(series.mean7 - base30, 2) : null;

  const deck = [
    sleep.debtMin === null ? null : `Sleep debt ${fmtMinutes(sleep.debtMin)}`,
    series.mean7 === null
      ? null
      : `7-night mean ${fmt(series.mean7, 1)} h${meanDelta === null ? '' : Math.abs(meanDelta) < 0.05 ? ', level with your 30-night average' : `, ${fmtSigned(meanDelta, 1)} h against your 30-night average`}`,
  ]
    .filter(Boolean)
    .join('; ');

  return (
    <TrendCard
      title="Sleep"
      caption={`${series.nights} night${series.nights === 1 ? '' : 's'} in the ${win.label}`}
      action={action}
      source={`Bedtime against ${target}: the rolling 7-night SD with the under-${BEDTIME_SD_OK_MIN}-minute wash and the ${BEDTIME_SD_WARN_MIN}-minute line, then each night's offset, above the line minutes late and below it minutes early${win.bucket === 'day' ? '' : `, ${BUCKET_LABEL[win.bucket]}`}.`}
      meaning="Hours against need is the debt you are building; the bedtime rows are regularity, and a steady bedtime predicts recovery better than total hours."
    >
      <Lead value={sleep.hours} dp={1} unit="h" word={vsNeedWord} tone={vsNeedTone} sub={sleep.need === null ? 'Last night' : `Last night, of ${fmt(sleep.need, 1)} h need`} />

      {deck && <p className="hx-deck">{`${deck}.`}</p>}

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
      <p className="hx-cap">{`Hours per night against the need line, ${win.label}; the wash is your usual range, 30-night mean ± SD, and the dotted line the 7-night mean.`}</p>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="hx-label">Bedtime consistency</span>
          <span className="hx-hedge text-right">7-night SD, target {target}</span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col">
            <span className={`hx-fig-sm ${sd === null ? 'text-hx-text2' : 'text-hx-text'}`}>
              {sd === null ? '—' : fmt(sd)}
              {sd !== null && <span className="hx-unit">min SD</span>}
            </span>
            <p className="hx-cap mt-1">
              {sd !== null && <Word word={sd < BEDTIME_SD_OK_MIN ? 'Consistent' : sd <= BEDTIME_SD_WARN_MIN ? 'Drifting' : 'Irregular'} tone={sdTone} className="mr-1.5" />}
              {sdText}
            </p>
          </div>
          {sd === null && (
            <Button variant="ghost" size="sm" onClick={onLogBedtime}>
              Log bedtime
            </Button>
          )}
        </div>
        <TimeSeriesChart
          ariaLabel={`Bedtime consistency, ${win.label}: rolling 7-night standard deviation of bedtime in minutes, with the under-${BEDTIME_SD_OK_MIN}-minute consistent band and the ${BEDTIME_SD_WARN_MIN}-minute flag line`}
          range={win.range}
          data={consistency.series}
          connectDots
          targetBand={{ lo: 0, hi: BEDTIME_SD_OK_MIN, label: 'Consistent' }}
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
      </div>
    </TrendCard>
  );
}
