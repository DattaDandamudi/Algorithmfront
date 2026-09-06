/**
 * HRV & RHR cards — SPEC §3 / §6.3 (Plews/Buchheit, Garmin-style bands).
 *
 * HRV: daily rMSSD dots, the 7-day (geometric) mean line and the SWC band
 * (mean ± 0.5 SD of ln rMSSD) shaded and labelled "normal range for you";
 * readouts carry the band, the range in ms, today's reading vs the 30-day
 * average and the "baseline forming (n/21 days)" note (≥21 readings in 30
 * days before the band is trusted).
 * RHR: dots + 7-day mean + the 28-day baseline as a reference hairline, with
 * the ▲/▼ delta vs that baseline (down is good).
 */
import { HeartPulse } from 'lucide-react';
import type { BaselineDelta, CoachContext } from '../../data/types';
import { BASELINE_READINGS, COACH_CHIPS } from '../../engine';
import { fmt } from '../../lib/format';
import { Button, Delta, EmptyState } from '../../ui';
import { TimeSeriesChart } from '../../ui/charts';
import { DeltaSub, Note, Readout, TrendCard } from './TrendCard';
import { bucketDateFormat, hrvBandName, hrvBandTone, type BandedSeries, type LinedSeries, type RangeWindow } from './series';

const hasData = (pts: Array<{ value: number | null }>) => pts.some((p) => p.value !== null);

export interface HrvCardProps {
  hrv: CoachContext['hrv'];
  series: BandedSeries;
  win: RangeWindow;
  onOpenCoach: (prompt: string) => void;
  onOpenSettings: () => void;
}

export function HrvCard({ hrv, series, win, onOpenCoach, onOpenSettings }: HrvCardProps) {
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
        caption="ln(rMSSD) baseline · smallest worthwhile change"
        action={action}
        empty={
          <EmptyState
            icon={<HeartPulse />}
            title="No HRV yet"
            hint="Log HRV or connect WHOOP to start your baseline."
            action={{ label: 'Open Settings', onClick: onOpenSettings }}
          />
        }
      />
    );
  }

  return (
    <TrendCard
      title="HRV"
      caption={`Daily rMSSD · 7-day mean · normal range (mean ± 0.5 SD) · ${win.label}`}
      action={action}
      meaning="Dots are daily rMSSD; the line is your 7-day mean and the shaded band is your own normal range. Below it, keep training light — and give the baseline ~30 days before acting on it."
    >
      <div className="grid grid-cols-2 gap-3">
        <Readout label="7-day mean" value={hrv.baseline7} unit="ms" sub={hrvBandName(hrv.band)} tone={tone} />
        <Readout label="Today" value={hrv.today} unit="ms" sub={<Delta value={hrv.delta.delta} good={hrv.delta.good} unit="ms" />} />
      </div>

      <TimeSeriesChart
        ariaLabel={`HRV, ${win.label}: daily rMSSD, 7-day mean and your normal range`}
        range={win.range}
        data={series.dots}
        line={series.line}
        band={series.band}
        unit="ms"
        label="HRV"
        lineLabel="7-day mean"
        bandLabel="Normal range for you"
        dateFormat={bucketDateFormat(win.bucket)}
        emptyText="Log HRV or connect WHOOP to start your baseline."
      />

      <div className="flex flex-col gap-1">
        <Note tone={range ? tone : 'neutral'}>
          {range ? (
            <>
              Normal range for you: <span className="font-semibold text-hx-text">{range}</span>
            </>
          ) : (
            'Normal range needs 7+ HRV readings in the last 28 days.'
          )}
        </Note>
        <Note tone={forming ? 'neutral' : 'green'}>
          {forming
            ? `Baseline forming (${n}/${BASELINE_READINGS} days) — the band firms up at ${BASELINE_READINGS} readings in 30 days.`
            : `Baseline established — ${n} readings in the last 30 days.`}
        </Note>
      </div>
    </TrendCard>
  );
}

export interface RhrCardProps {
  rhr: BaselineDelta;
  series: LinedSeries;
  win: RangeWindow;
  onOpenSettings: () => void;
}

export function RhrCard({ rhr, series, win, onOpenSettings }: RhrCardProps) {
  if (!hasData(series.dots)) {
    return (
      <TrendCard
        title="Resting heart rate"
        caption="Daily RHR vs your 28-day baseline"
        empty={
          <EmptyState
            icon={<HeartPulse />}
            title="No resting heart rate yet"
            hint="Log RHR or connect WHOOP to compare each morning against your 28-day baseline."
            action={{ label: 'Open Settings', onClick: onOpenSettings }}
          />
        }
      />
    );
  }

  return (
    <TrendCard
      title="Resting heart rate"
      caption={`Daily RHR · 7-day mean · 28-day baseline · ${win.label}`}
      meaning="A resting heart rate creeping above your 28-day baseline usually means fatigue, short sleep or illness — read it together with HRV before adding load."
    >
      <div className="grid grid-cols-3 gap-3">
        <Readout label="Today" value={rhr.today} unit="bpm" sub={<DeltaSub value={rhr.delta} good={rhr.good} unit="bpm" caption="vs 28-day baseline" />} />
        <Readout label="7-day mean" value={series.meanLast} dp={1} unit="bpm" />
        <Readout label="Baseline" value={rhr.baseline} dp={1} unit="bpm" sub={`28-day · ${rhr.n} readings`} />
      </div>

      <TimeSeriesChart
        ariaLabel={`Resting heart rate, ${win.label}: daily readings, 7-day mean and 28-day baseline`}
        range={win.range}
        data={series.dots}
        line={series.line}
        reference={rhr.baseline === null ? undefined : { value: rhr.baseline, label: '28-day baseline' }}
        unit="bpm"
        label="RHR"
        lineLabel="7-day mean"
        dateFormat={bucketDateFormat(win.bucket)}
        emptyText="Log RHR or connect WHOOP to start your baseline."
      />
    </TrendCard>
  );
}
