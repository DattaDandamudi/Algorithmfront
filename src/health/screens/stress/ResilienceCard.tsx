/**
 * ResilienceCard — the load-vs-recovery balance, drawn rather than asserted.
 *
 * The band word ("Solid", "Limited") is an output of two EWMA curves, so the
 * card shows both curves and shades the gap between them: the balance IS that
 * gap, and a reader can check the label against the picture instead of taking
 * it on trust. One y axis, one unit — the curves are on the same 0–100 scale,
 * so no second axis is needed or allowed.
 *
 * The allostatic-load-style counter is labelled as a heuristic in the copy the
 * user reads, not only in a comment: the wearable transposition of allostatic
 * load is not a validated measure and must not be presented as one.
 */
import { Activity } from 'lucide-react';
import type { ISODate, StressContext } from '../../data/types';
import { EmptyState } from '../../ui';
import { TimeSeriesChart, type ChartRange, type TimeSeriesPoint } from '../../ui/charts';
import { Note, Readout, TrendCard } from '../trends/TrendCard';
import { balanceBand, balanceLine, resilienceBandWord } from './format';

export const AL_STYLE_NOTE =
  'The strain counter is a heuristic: it counts days several signals sat outside your range. It borrows the shape of allostatic load, which was built for blood markers — the wearable version is not a validated measure.';

const hasData = (pts: TimeSeriesPoint[] | undefined) => !!pts?.some((p) => p.value !== null);

export interface ResilienceCardProps {
  /** Undefined while the engine has nothing to say. */
  resilience?: StressContext['resilience'];
  /** Training/stress load EWMA, one entry per day (drawn as the dotted series). */
  load?: TimeSeriesPoint[];
  /** Recovery EWMA on the same scale, one entry per day (drawn as the line). */
  recovery?: TimeSeriesPoint[];
  range?: ChartRange;
  /** e.g. "last 14 days" — goes in the caption. */
  windowLabel?: string;
  dateFormat?: (d: ISODate) => string;
}

export default function ResilienceCard({ resilience, load, recovery, range = '30D', windowLabel = 'last 14 days', dateFormat }: ResilienceCardProps) {
  const word = resilienceBandWord(resilience?.band);
  const band = balanceBand(load, recovery);
  const drawable = hasData(load) || hasData(recovery);
  const nDays = resilience?.nDays ?? 0;

  if (!drawable) {
    return (
      <TrendCard
        title="Resilience"
        caption="Load vs recovery, both as exponentially weighted averages"
        empty={
          <EmptyState
            icon={<Activity />}
            title="Not enough days yet"
            hint="Log training and daily check-ins for about two weeks and the two curves — how much you are asking of yourself, and how much you are getting back — appear here."
          />
        }
      />
    );
  }

  return (
    <TrendCard
      title="Resilience"
      caption={`Load and recovery EWMAs · balance = the gap between them · ${windowLabel}`}
      meaning="The shaded gap between the two curves is the balance the band word describes: load above recovery for several days is what turns 'Solid' into 'Limited'. It is a description of your last two weeks, not a prediction and not a diagnosis."
    >
      <div className="grid grid-cols-3 gap-3">
        <Readout label="Balance" value={word.label} sub={`${nDays} ${nDays === 1 ? 'day' : 'days'} of data`} tone={word.tone} />
        <Readout label="Load EWMA" value={resilience?.loadEwma ?? null} dp={1} />
        <Readout label="Recovery EWMA" value={resilience?.recoveryEwma ?? null} dp={1} />
      </div>

      <TimeSeriesChart
        ariaLabel={`Load and recovery exponentially weighted averages, ${windowLabel}`}
        range={range}
        data={load ?? []}
        line={recovery ?? []}
        band={band}
        color="var(--hx-green)"
        dotColor="var(--hx-yellow)"
        label="Load"
        lineLabel="Recovery"
        bandLabel="Balance gap"
        connectDots
        dateFormat={dateFormat}
        height={168}
        emptyText="Two weeks of training and check-ins fill both curves."
      />

      <div className="flex flex-col gap-1">
        <Note tone={word.tone}>{balanceLine(resilience?.balance, 1)}</Note>
        {resilience?.score !== null && resilience?.score !== undefined && (
          <Note tone="neutral">
            Resilience score <span className="font-semibold text-hx-text">{Math.round(resilience.score)}</span> out of 100 — a summary of the gap above, not a separate measurement.
          </Note>
        )}
        <Note tone="neutral">
          {resilience?.alStyleCount !== null && resilience?.alStyleCount !== undefined
            ? `Strain counter: ${Math.round(resilience.alStyleCount)} loaded ${Math.round(resilience.alStyleCount) === 1 ? 'day' : 'days'} in the window. `
            : ''}
          {AL_STYLE_NOTE}
        </Note>
      </div>
    </TrendCard>
  );
}
