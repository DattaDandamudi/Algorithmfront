/**
 * StressCard — the Trends figure for the overnight strain stack (plan 2c).
 *
 * Three panels, one x axis, never a dual y axis:
 *  1. the overnight strain index (0–100) with its credible interval as a
 *     bone wash, so the uncertainty is drawn rather than implied;
 *  2. the check-in overlay: the Hooper total (4–28) as hollow circles in its
 *     OWN panel directly underneath, sharing the date axis. Subjective and
 *     objective are on different scales, so they get different panels instead
 *     of a second axis on one plot (charts README: never a dual y-axis);
 *  3. the per-signal list, which is what the user should actually read: the
 *     index is a summary, the signals are the evidence.
 *
 * The count of deviating signals is the lead figure; the index follows in the
 * deck. The illness note names no condition and routes to the doctor cue.
 */
import type { ISODate, StressContext } from '../../data/types';
import { Button, EmptyState } from '../../ui';
import { TimeSeriesChart, type ChartRange, type TimeSeriesBandPoint, type TimeSeriesPoint } from '../../ui/charts';
import { Lead, Note, TrendCard, Word } from '../trends/TrendCard';
import SignalDots from './SignalDots';
import { HOOPER_MAX, calibratingLine, hooperBandWord, hooperTotalText, signalsLine, stressBandWord, worseRunLine } from './format';
import { ILLNESS_NOTE } from './StressStrip';

const hasData = (pts: TimeSeriesPoint[] | undefined) => !!pts?.some((p) => p.value !== null);

export interface StressCardProps {
  /** Undefined while the engine has nothing to say. */
  stress?: StressContext;
  /** Daily overnight strain index, 0–100, one entry per day in the window. */
  osi: TimeSeriesPoint[];
  /** Its credible interval, one entry per day. */
  osiBand?: TimeSeriesBandPoint[];
  /** Daily Hooper totals (4–28) for the same window — the check-in overlay panel. */
  checkIn?: TimeSeriesPoint[];
  range: ChartRange;
  /** e.g. "last 30 days" — goes in the source line. */
  windowLabel?: string;
  /** Tooltip date header (pass a bucket formatter for 90D / 1Y). */
  dateFormat?: (d: ISODate) => string;
  onCheckIn?: () => void;
  onOpenCoach?: (prompt: string) => void;
  /** Coach prompt for the "Ask the coach" action. */
  coachPrompt?: string;
}

export default function StressCard({
  stress,
  osi,
  osiBand,
  checkIn,
  range,
  windowLabel = 'last 30 days',
  dateFormat,
  onCheckIn,
  onOpenCoach,
  coachPrompt = 'Why am I so stressed?',
}: StressCardProps) {
  const strain = stressBandWord(stress?.band);
  const hooper = hooperBandWord(stress?.checkIn.band);
  const deviating = stress?.signalsDeviating ?? 0;
  const available = stress?.signalsAvailable ?? 0;
  const signals = signalsLine(deviating, available);
  const worse = worseRunLine(stress?.checkIn.worseRun);
  const total = stress?.checkIn.total ?? null;
  const outliers = stress?.outliers ?? [];
  const illness = stress?.illness;
  const reasons = illness?.flag ? (illness.reasons ?? []).filter((r) => !!r) : [];
  const interval = stress && stress.osiLo !== null && stress.osiHi !== null ? `${Math.round(stress.osiLo)}–${Math.round(stress.osiHi)}` : null;

  const action = onOpenCoach ? (
    <Button variant="ghost" size="sm" onClick={() => onOpenCoach(coachPrompt)}>
      Ask the coach
    </Button>
  ) : undefined;

  if (!hasData(osi) && !hasData(checkIn)) {
    return (
      <TrendCard
        title="Overnight strain"
        caption="Your own overnight signals against your own baseline"
        action={action}
        empty={
          <EmptyState
            title="No overnight signals yet"
            hint="Log a daily check-in, or import HRV, resting heart rate, respiratory rate, skin temperature and blood oxygen, and this builds your personal range over about two weeks."
            action={onCheckIn ? { label: 'Check in', onClick: onCheckIn } : undefined}
          />
        }
      />
    );
  }

  const index = stress?.osi === null || stress?.osi === undefined ? null : Math.round(stress.osi);
  const deck = `${signals}. ${index === null ? 'The strain index needs more nights' : `Strain index ${index} out of 100${interval ? `, credible interval ${interval}` : ', interval needs more nights'}`}.`;
  const nRef = stress?.nRef ?? 0;

  return (
    <TrendCard
      title="Overnight strain"
      caption={stress ? `${nRef} reference night${nRef === 1 ? '' : 's'}` : windowLabel}
      action={action}
      source={`Overnight index from your own signals against your own range, ${windowLabel}; the wash is its credible interval. Below it, the Hooper total you reported each morning.`}
      meaning="Read the signal count first: the index is only a summary of how many of your overnight readings sat outside your own range, and the wash is how sure that summary is. The lower panel is what you reported that morning. Neither one diagnoses anything; they say the night was unusual for you."
    >
      <Lead label="Signals outside your range" value={deviating} unit={`of ${available}`} word={strain.label} tone={strain.tone} />

      <p className="hx-deck">{deck}</p>

      <TimeSeriesChart
        ariaLabel={`Overnight strain index, ${windowLabel}`}
        range={range}
        data={osi}
        band={osiBand}
        label="Strain index"
        bandLabel="Credible interval"
        unit="/ 100"
        connectDots
        dateFormat={dateFormat}
        height={160}
        emptyText="The index needs about two weeks of overnight readings."
      />

      {hasData(checkIn) && (
        <div className="flex flex-col gap-2">
          <span className="hx-label">How you felt, Hooper {HOOPER_MAX}-point total, lower is better</span>
          <TimeSeriesChart
            ariaLabel={`Daily check-in Hooper total, ${windowLabel}`}
            range={range}
            data={checkIn ?? []}
            label="Hooper total"
            unit={`/ ${HOOPER_MAX}`}
            dateFormat={dateFormat}
            height={110}
            emptyText="Check in daily to overlay how you felt."
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="hx-label">Last night's signals</span>
        <SignalDots signals={outliers} emptyText={`${signals}. Nothing to flag from last night.`} />
      </div>

      <div className="flex flex-col gap-2">
        <p className="hx-cap">
          {hooper.tone === 'neutral' && (stress?.checkIn.nDays ?? 0) > 0 ? <Word word="Check-in" /> : <Word word={hooper.label} tone={hooper.tone} />}
          {/* "Hooper —" says nothing; name the total only when there is one. */}
          {total === null ? '' : `, Hooper ${hooperTotalText(total)}`}
          {stress ? `, ${stress.checkIn.nDays} ${stress.checkIn.nDays === 1 ? 'day' : 'days'} logged` : ''}
        </p>
        {worse && <Note tone="yellow">{worse}</Note>}
        {stress?.calibrating && <p className="hx-cap">{calibratingLine(stress.nRef)}</p>}
        {illness?.flag && (
          <Note tone="yellow">
            {reasons.length > 0 ? `${reasons.join(', ')}. ` : ''}
            {ILLNESS_NOTE}
          </Note>
        )}
      </div>
    </TrendCard>
  );
}
