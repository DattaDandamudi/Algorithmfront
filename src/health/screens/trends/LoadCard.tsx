/**
 * LoadCard — §1e training load on Trends; it opens the training-and-stress
 * group, so it carries that group's ink rule.
 *
 * **The ratio is not the headline, and that is the whole point of this
 * figure.** Impellizzeri 2020 (*Br J Sports Med* 54:1451–1452) documents the
 * acute:chronic workload ratio's statistical pathologies and finds no causal
 * identification ("manipulating ACWR to change injury rates remains a
 * conjecture"). So the lead is **absolute acute load** with the
 * **week-on-week change** as the word beside it, and a +10%/wk soft guidance
 * line that is guidance and not a limit. The ratio is still drawn, because it
 * is part of the load picture a lifter recognises, but it sits *below* in a
 * smaller panel with its 0.8–1.3 zone as a wash and carries
 * `LOAD_NOTES.acwrDescriptive` in the copy the user reads.
 *
 * Two panels, one x axis, never a dual y axis: load units above, the unitless
 * ratio below.
 */
import type { AcwrBand, TrainingContext } from '../../data/types';
import { LOAD_NOTES, WEEKLY_LOAD_SOFT_CAP_PCT } from '../../engine';
import { fmt, fmtSigned } from '../../lib/format';
import { EmptyState, type Tone } from '../../ui';
import { TimeSeriesChart } from '../../ui/charts';
import { Lead, TrendCard } from './TrendCard';
import { bucketDateFormat, type LoadSeries, type RangeWindow } from './series';

/** The descriptive ratio zone (Williams 2017): a wash, never alerted on. */
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
  whoop: 'Converted from WHOOP day strain: an estimate, not a measurement of your session.',
  mixed: 'Part logged sessions, part WHOOP strain converted to the same scale.',
  none: 'No sessions logged in this window.',
};

export interface LoadCardProps {
  /** Undefined until the training block has anything to say. */
  load?: LoadBlock;
  series: LoadSeries;
  win: RangeWindow;
  onOpenTrain?: () => void;
  /** Draw the group's ink rule above the running head. */
  rule?: boolean;
}

export default function LoadCard({ load, series, win, onOpenTrain, rule }: LoadCardProps) {
  const plotted = `last ${series.days} day${series.days === 1 ? '' : 's'}`;
  // A user who trained months ago but not in this range still has a load
  // history: show them a chart of zeroes and an honest "acute load 0" rather
  // than "no training logged", which would be false.
  const hasHistory = !!load && (load.acute7 > 0 || load.chronic28 > 0 || series.trainedDays > 0);

  if (!load || !hasHistory) {
    return (
      <TrendCard
        title="Training load"
        rule={rule}
        caption="How much work you are doing, and how fast it is changing"
        empty={
          <EmptyState
            title="No training logged yet"
            hint="Log a session, or import WHOOP, Strava or Apple Health, and your weekly load, its week-on-week change and the descriptive acute:chronic ratio appear here."
            {...(onOpenTrain ? { action: { label: 'Open Train', onClick: onOpenTrain } } : {})}
          />
        }
      />
    );
  }

  const wow = load.weekOverWeekPct;
  const ramping = wow !== null && wow > WEEKLY_LOAD_SOFT_CAP_PCT;
  const wowTone: Tone | undefined = wow === null ? undefined : ramping ? 'yellow' : 'green';
  const wowWord = wow === null ? 'Week on week needs a previous week' : `Week on week ${fmtSigned(wow, 0)}%`;
  const wowLine = wow === null ? '' : ramping ? `Above the +${WEEKLY_LOAD_SOFT_CAP_PCT}% guidance line. ` : `Within the +${WEEKLY_LOAD_SOFT_CAP_PCT}% guidance line. `;
  const acwrWord = load.acwr === null ? null : load.acwrBand ? ACWR_WORD[load.acwrBand] : 'not yet established';

  return (
    <TrendCard
      title="Training load"
      rule={rule}
      caption={`${series.trainedDays} of ${series.days} days trained`}
      source={`Daily load and its 7-day acute average, ${plotted}. ${SOURCE_NOTE[load.source]}${load.source === 'mixed' ? ` ${LOAD_NOTES.unitMix}` : ''}`}
      meaning="Load is effort × duration in one number, so a long easy session and a short brutal one can land in the same place. What matters is the size of the jump between weeks, not the exact figure."
    >
      <Lead label="Acute load, 7 days" value={load.acute7} unit="units" word={wowWord} tone={wowTone} sub={`Chronic 28-day ${fmt(load.chronic28)}`} />

      <p className="hx-deck">{`${wowLine}${LOAD_NOTES.weekOverWeek}`}</p>

      <TimeSeriesChart
        ariaLabel={`Daily training load with the 7-day acute average, ${plotted}`}
        range={win.range}
        data={series.daily}
        line={series.acute}
        unit="units"
        label="Daily"
        lineLabel="7-day acute"
        dateFormat={bucketDateFormat(win.bucket)}
        emptyText="Log a session to start your load series."
      />

      {/* --- the ratio, deliberately subordinate: smaller, lower, and captioned --- */}
      <section aria-label="Acute:chronic ratio" className="flex flex-col gap-3">
        <div className="flex flex-col">
          <span className="hx-label">Acute:chronic ratio</span>
          {load.acwr === null ? (
            <span className="hx-cap mt-1">Needs 28 days</span>
          ) : (
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="hx-fig-sm text-hx-text">{fmt(load.acwr, 2)}</span>
              <span className="hx-cap">{acwrWord}</span>
            </div>
          )}
        </div>

        <TimeSeriesChart
          ariaLabel={`Acute to chronic load ratio, ${plotted}. Descriptive only.`}
          range={win.range}
          data={series.acwr}
          connectDots
          showDots={false}
          targetBand={{ lo: ACWR_SWEET[0], hi: ACWR_SWEET[1], label: `${ACWR_SWEET[0]}–${ACWR_SWEET[1]}` }}
          valueFormat={(v) => fmt(v, 2)}
          label="Ratio"
          height={120}
          dateFormat={bucketDateFormat(win.bucket)}
          emptyText="The ratio needs 28 days of load before it means anything."
        />

        <p className="hx-cap">{LOAD_NOTES.acwrDescriptive}</p>
      </section>
    </TrendCard>
  );
}
