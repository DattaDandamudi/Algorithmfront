/**
 * LoadCard — §1e training load on Trends.
 *
 * **The ratio is not the headline, and that is the whole point of this card.**
 * Impellizzeri 2020 (*Br J Sports Med* 54:1451–1452) documents the
 * acute:chronic workload ratio's statistical pathologies and finds no causal
 * identification — "manipulating ACWR to change injury rates remains a
 * conjecture". So the two numbers that lead are the ones that mean something
 * on their own: **absolute acute load** and **week-on-week change**, with a
 * +10%/wk soft guidance line that is guidance and not a limit. The ratio is
 * still drawn, because it is part of the load picture a lifter recognises, but
 * it sits *below* them in a smaller panel and carries
 * `LOAD_NOTES.acwrDescriptive` in the copy the user reads — not in a comment,
 * not behind a tap.
 *
 * Two panels, one x axis, never a dual y axis: load units above, the unitless
 * ratio below with its 0.8–1.3 zone as a neutral wash.
 */
import { Dumbbell } from 'lucide-react';
import type { AcwrBand, TrainingContext } from '../../data/types';
import { LOAD_NOTES, WEEKLY_LOAD_SOFT_CAP_PCT } from '../../engine';
import { fmt, fmtSigned } from '../../lib/format';
import { EmptyState, type Tone } from '../../ui';
import { TimeSeriesChart } from '../../ui/charts';
import { Note, Readout, TrendCard } from './TrendCard';
import { bucketDateFormat, type LoadSeries, type RangeWindow } from './series';

/** The descriptive ratio zone (Williams 2017) — shaded, never alerted on. */
const ACWR_SWEET: [number, number] = [0.8, 1.3];

const ACWR_WORD: Record<AcwrBand, string> = {
  low: 'below your recent normal',
  sweet: 'in line with your recent normal',
  high: 'above your recent normal',
  spike: 'well above your recent normal',
};

/** `ctx.training.load` — the block this card reads. */
export type LoadBlock = TrainingContext['load'];

const SOURCE_NOTE: Record<LoadBlock['source'], string> = {
  logged: 'From sessions you logged.',
  whoop: 'Converted from WHOOP day strain — an estimate, not a measurement of your session.',
  mixed: 'Part logged sessions, part WHOOP strain converted to the same scale.',
  none: 'No sessions logged in this window.',
};

export interface LoadCardProps {
  /** Undefined until the training block has anything to say. */
  load?: LoadBlock;
  series: LoadSeries;
  win: RangeWindow;
  onOpenTrain?: () => void;
}

export default function LoadCard({ load, series, win, onOpenTrain }: LoadCardProps) {
  const plotted = `last ${series.days} day${series.days === 1 ? '' : 's'}`;
  // A user who trained months ago but not in this range still has a load
  // history: show them a chart of zeroes and an honest "acute load 0" rather
  // than "no training logged", which would be false.
  const hasHistory = !!load && (load.acute7 > 0 || load.chronic28 > 0 || series.trainedDays > 0);

  if (!load || !hasHistory) {
    return (
      <TrendCard
        title="Training load"
        caption="How much work you are doing, and how fast it is changing"
        empty={
          <EmptyState
            icon={<Dumbbell />}
            title="No training logged yet"
            hint="Log a session — or import WHOOP, Strava or Apple Health — and your weekly load, its week-on-week change and the descriptive acute:chronic ratio appear here."
            {...(onOpenTrain ? { action: { label: 'Open Train', onClick: onOpenTrain } } : {})}
          />
        }
      />
    );
  }

  const wow = load.weekOverWeekPct;
  const ramping = wow !== null && wow > WEEKLY_LOAD_SOFT_CAP_PCT;
  const wowTone: Tone | undefined = wow === null ? undefined : ramping ? 'yellow' : 'green';
  const acwrText = load.acwr === null ? null : `${fmt(load.acwr, 2)} — ${load.acwrBand ? ACWR_WORD[load.acwrBand] : 'not yet established'}`;

  return (
    <TrendCard
      title="Training load"
      caption={`Acute load and its week-on-week change · ${plotted}`}
      meaning="Load is effort × duration in one number, so a long easy session and a short brutal one can land in the same place. What matters is the size of the jump between weeks, not the exact figure."
    >
      <div className="grid grid-cols-2 gap-3">
        <Readout
          label="Acute load (7 d)"
          value={load.acute7}
          unit="units"
          sub={`Chronic 28 d ${fmt(load.chronic28)} · ${series.trainedDays} of ${series.days} days trained`}
        />
        <Readout
          label="Week on week"
          value={wow === null ? null : `${fmtSigned(wow, 0)}%`}
          sub={wow === null ? 'Needs a previous week to compare' : ramping ? `Above the +${WEEKLY_LOAD_SOFT_CAP_PCT}% guidance line` : `Within the +${WEEKLY_LOAD_SOFT_CAP_PCT}% guidance line`}
          tone={wowTone}
        />
      </div>

      <TimeSeriesChart
        ariaLabel={`Daily training load with the 7-day acute average, ${plotted}`}
        range={win.range}
        data={series.daily}
        line={series.acute}
        color="var(--hx-blue)"
        dotColor="var(--hx-neutral)"
        unit="units"
        label="Daily load"
        lineLabel="Acute (7 d)"
        dateFormat={bucketDateFormat(win.bucket)}
        emptyText="Log a session to start your load series."
      />

      <Note tone={ramping ? 'yellow' : 'neutral'}>{LOAD_NOTES.weekOverWeek}</Note>
      <p className="text-[12px] leading-4 text-hx-text2">{SOURCE_NOTE[load.source]}</p>
      {load.source === 'mixed' && <p className="text-[12px] leading-4 text-hx-muted">{LOAD_NOTES.unitMix}</p>}

      {/* --- the ratio, deliberately subordinate: smaller, lower, and captioned --- */}
      <section aria-label="Acute:chronic ratio" className="border-t border-hx-border pt-3 flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="hx-label">Acute:chronic ratio</span>
          <span className="text-[13px] leading-5 font-semibold text-hx-text tabular-nums">{acwrText ?? 'Needs 28 days'}</span>
        </div>

        <TimeSeriesChart
          ariaLabel={`Acute to chronic load ratio, ${plotted}. Descriptive only.`}
          range={win.range}
          data={series.acwr}
          connectDots
          showDots={false}
          color="var(--hx-neutral)"
          targetBand={{ lo: ACWR_SWEET[0], hi: ACWR_SWEET[1], label: `${ACWR_SWEET[0]}–${ACWR_SWEET[1]}` }}
          label="Ratio"
          height={120}
          dateFormat={bucketDateFormat(win.bucket)}
          emptyText="The ratio needs 28 days of load before it means anything."
        />

        <p className="text-[12px] leading-4 text-hx-muted">{LOAD_NOTES.acwrDescriptive}</p>
      </section>
    </TrendCard>
  );
}
