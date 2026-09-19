/**
 * ResilienceCard — the load-vs-recovery balance, drawn rather than asserted.
 *
 * The band word ("Solid", "Limited") is an output of two EWMA curves, so the
 * figure shows both curves, named by words at their line ends, and shades the
 * gap between them as a bone wash: the balance IS that gap, and a reader can
 * check the label against the picture instead of taking it on trust. One y
 * axis, one unit: the curves are on the same 0–100 scale, so no second axis
 * is needed or allowed. The lead is the resilience score with the band word
 * beside it; the deck is the balance sentence.
 *
 * The allostatic-load-style counter is labelled as a heuristic in the copy the
 * user reads, not only in a comment: the wearable transposition of allostatic
 * load is not a validated measure and must not be presented as one.
 */
import type { ISODate, StressContext } from '../../data/types';
import { fmt } from '../../lib/format';
import { EmptyState } from '../../ui';
import { TimeSeriesChart, type ChartRange, type TimeSeriesPoint } from '../../ui/charts';
import { Lead, TrendCard } from '../trends/TrendCard';
import { balanceBand, balanceLine, resilienceBandWord } from './format';

export const AL_STYLE_NOTE =
  'The strain counter is a heuristic: it counts days several signals sat outside your range. It borrows the shape of allostatic load, which was built for blood markers; the wearable version is not a validated measure.';

const hasData = (pts: TimeSeriesPoint[] | undefined) => !!pts?.some((p) => p.value !== null);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export interface ResilienceCardProps {
  /** Undefined while the engine has nothing to say. */
  resilience?: StressContext['resilience'];
  /** Training/stress load EWMA, one entry per day (drawn as the readings line). */
  load?: TimeSeriesPoint[];
  /** Recovery EWMA on the same scale, one entry per day (drawn as the bone line). */
  recovery?: TimeSeriesPoint[];
  range?: ChartRange;
  /** e.g. "last 14 days" — goes in the source line. */
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
        caption="Load against recovery, both as exponentially weighted averages"
        empty={
          <EmptyState
            title="Not enough days yet"
            hint="Log training and daily check-ins for about two weeks and the two curves, how much you are asking of yourself and how much you are getting back, appear here."
          />
        }
      />
    );
  }

  const score = isNum(resilience?.score) ? Math.round(resilience.score) : null;
  const counter = isNum(resilience?.alStyleCount) ? Math.round(resilience.alStyleCount) : null;
  const ewma = (v: number | null | undefined) => (isNum(v) ? fmt(v, 1) : '—');

  return (
    <TrendCard
      title="Resilience"
      caption={`${nDays} ${nDays === 1 ? 'day' : 'days'} of data`}
      source={`Load EWMA ${ewma(resilience?.loadEwma)} and recovery EWMA ${ewma(resilience?.recoveryEwma)} on one 0–100 scale, ${windowLabel}; the wash between the curves is the balance gap.`}
      meaning="The wash between the two curves is the balance the band word describes: load above recovery for several days is what turns 'Solid' into 'Limited'. It is a description of your last two weeks, not a prediction and not a diagnosis."
    >
      <Lead value={score} unit="of 100" word={word.label} tone={word.tone} sub={score === null ? undefined : 'Resilience score, a summary of the gap below, not a separate measurement'} />

      <p className="hx-deck">{balanceLine(resilience?.balance, 1)}</p>

      <TimeSeriesChart
        ariaLabel={`Load and recovery exponentially weighted averages, ${windowLabel}`}
        range={range}
        data={load ?? []}
        line={recovery ?? []}
        band={band}
        label="Load"
        lineLabel="Recovery"
        bandLabel="Balance gap"
        connectDots
        showDots={false}
        dateFormat={dateFormat}
        height={168}
        emptyText="Two weeks of training and check-ins fill both curves."
      />

      <p className="hx-cap">
        {counter !== null ? `Strain counter: ${counter} loaded ${counter === 1 ? 'day' : 'days'} in the window. ` : ''}
        {AL_STYLE_NOTE}
      </p>
    </TrendCard>
  );
}
