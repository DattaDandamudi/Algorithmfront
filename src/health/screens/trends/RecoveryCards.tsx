/**
 * HRV & RHR figures — SPEC §3 / §6.3 (Plews/Buchheit, Garmin-style bands).
 *
 * HRV opens the sleep-and-recovery group, so it carries that group's ink
 * rule. Its lead is the 7-day (geometric) mean with the band word beside it;
 * the deck is today's reading against the 30-day average and the normal
 * range. The chart draws daily rMSSD as hollow circles, the 7-day mean as the
 * bone line and the SWC band (mean ± 0.5 SD of ln rMSSD) as a wash named at
 * its top. The maths is in ln space (§6.3) and the chart back-transforms to
 * ms, so the source line says so: the band is exp(ln mean ± 0.5 SD),
 * asymmetric in ms (R2-12). The baseline-forming note (≥21 readings in 30
 * days before the band is trusted) is the dateline.
 *
 * RHR: readings, the 7-day mean and the 28-day baseline as a dotted hairline
 * INSIDE its personal range (28-day mean ± SD, the §3 baseline band, R2-7),
 * with the ▲/▼ delta vs that baseline (down is good) under the lead.
 */
import type { BaselineDelta, CoachContext } from '../../data/types';
import { BASELINE_READINGS, COACH_CHIPS } from '../../engine';
import { fmt, fmtSigned } from '../../lib/format';
import { Button, EmptyState } from '../../ui';
import { TimeSeriesChart } from '../../ui/charts';
import { DeltaSub, Lead, TrendCard } from './TrendCard';
import { bucketDateFormat, hrvBandName, hrvBandTone, type BandedSeries, type BaselineBand, type LinedSeries, type RangeWindow } from './series';

const hasData = (pts: Array<{ value: number | null }>) => pts.some((p) => p.value !== null);

export interface HrvCardProps {
  hrv: CoachContext['hrv'];
  series: BandedSeries;
  win: RangeWindow;
  onOpenCoach: (prompt: string) => void;
  onOpenSettings: () => void;
  /** Draw the group's ink rule above the running head. */
  rule?: boolean;
}

export function HrvCard({ hrv, series, win, onOpenCoach, onOpenSettings, rule }: HrvCardProps) {
  const tone = hrvBandTone(hrv.band);
  const n = hrv.delta.n;
  const forming = n < BASELINE_READINGS;
  const range = hrv.swcLower !== null && hrv.swcUpper !== null ? `${fmt(hrv.swcLower)}–${fmt(hrv.swcUpper)} ms` : null;
  const action = (
    <Button variant="ghost" size="sm" onClick={() => onOpenCoach(COACH_CHIPS[2])}>
      Ask the coach
    </Button>
  );

  if (!hasData(series.dots)) {
    return (
      <TrendCard
        title="HRV"
        rule={rule}
        caption="ln(rMSSD) baseline and its smallest worthwhile change"
        action={action}
        empty={<EmptyState title="No HRV yet" hint="Log HRV or connect WHOOP to start your baseline." action={{ label: 'Open Settings', onClick: onOpenSettings }} />}
      />
    );
  }

  const today = hrv.today === null ? null : `Today ${fmt(hrv.today)} ms`;
  const delta = hrv.delta.delta === null ? null : `${fmtSigned(hrv.delta.delta)} ms against your 30-day average`;
  const deck = [
    today && delta ? `${today}, ${delta}` : (today ?? 'No reading yet today'),
    range ? `your normal range is ${range}` : 'the normal range needs 7 or more readings in the last 28 days',
  ].join('; ');

  return (
    <TrendCard
      title="HRV"
      rule={rule}
      caption={forming ? `Baseline forming, ${n} of ${BASELINE_READINGS}` : `${n} readings in 30 days`}
      action={action}
      source={`Daily rMSSD, 7-day geometric mean, ${win.label}; ${forming ? 'baseline forming' : 'baseline established'}. The wash is your normal range, mean ± 0.5 SD in ln rMSSD shown back in ms, so it sits a little wider above the line than below.`}
      meaning="Below your normal range, keep training light; above it, you have room. Give the baseline about 30 days before acting on it."
    >
      <Lead value={hrv.baseline7} unit="ms" word={hrvBandName(hrv.band)} tone={tone} sub="7-day geometric mean" />

      <p className="hx-deck">{`${deck}.`}</p>

      <TimeSeriesChart
        ariaLabel={`HRV, ${win.label}: daily rMSSD, 7-day mean and your normal range`}
        range={win.range}
        data={series.dots}
        line={series.line}
        band={series.band}
        unit="ms"
        label="Daily"
        lineLabel="7-day mean"
        bandLabel="Normal range"
        dateFormat={bucketDateFormat(win.bucket)}
        emptyText="Log HRV or connect WHOOP to start your baseline."
      />
    </TrendCard>
  );
}

export interface RhrCardProps {
  rhr: BaselineDelta;
  series: LinedSeries;
  /** 28-day mean ± SD — the personal baseline band; null under 7 readings. */
  band: BaselineBand | null;
  win: RangeWindow;
  onOpenSettings: () => void;
}

export function RhrCard({ rhr, series, band, win, onOpenSettings }: RhrCardProps) {
  if (!hasData(series.dots)) {
    return (
      <TrendCard
        title="Resting heart rate"
        caption="Daily RHR against your 28-day baseline"
        empty={
          <EmptyState
            title="No resting heart rate yet"
            hint="Log RHR or connect WHOOP to compare each morning against your 28-day baseline."
            action={{ label: 'Open Settings', onClick: onOpenSettings }}
          />
        }
      />
    );
  }

  const deck =
    rhr.baseline === null
      ? 'The 28-day baseline needs more mornings.'
      : `7-day mean ${series.meanLast === null ? '—' : fmt(series.meanLast, 1)} bpm against a 28-day baseline of ${fmt(rhr.baseline, 1)} bpm.`;

  return (
    <TrendCard
      title="Resting heart rate"
      caption={`${rhr.n} readings in 28 days`}
      source={`Daily readings and the 7-day mean, ${win.label}; the wash is your usual range, 28-day mean ± SD, and the dotted line its mean.`}
      meaning="A resting heart rate creeping above your usual range usually means fatigue, short sleep or illness. Read it together with HRV before adding load."
    >
      <Lead value={rhr.today} unit="bpm" sub={<DeltaSub value={rhr.delta} good={rhr.good} unit="bpm" caption="vs 28-day baseline" />} />

      <p className="hx-deck">{deck}</p>

      <TimeSeriesChart
        ariaLabel={`Resting heart rate, ${win.label}: daily readings, 7-day mean and 28-day baseline`}
        range={win.range}
        data={series.dots}
        line={series.line}
        targetBand={band ? { lo: band.lo, hi: band.hi, label: 'Your usual range' } : undefined}
        reference={rhr.baseline === null ? undefined : { value: rhr.baseline, label: band ? undefined : '28-day baseline' }}
        unit="bpm"
        label="Daily"
        lineLabel="7-day mean"
        dateFormat={bucketDateFormat(win.bucket)}
        emptyText="Log RHR or connect WHOOP to start your baseline."
      />
    </TrendCard>
  );
}
