/**
 * StressCard — the Trends card for the overnight strain stack (plan 2c).
 *
 * Three panels, one x axis, never a dual y axis:
 *  1. the overnight strain index (0–100) with its credible-interval band, so
 *     the uncertainty is drawn rather than implied;
 *  2. the check-in overlay — the Hooper total (4–28) in its OWN panel
 *     directly underneath, sharing the date axis. Subjective and objective
 *     are on different scales, so they get different panels instead of a
 *     second axis on one plot (charts README: never a dual y-axis).
 *  3. the per-signal outlier dots, which are what the user should actually
 *     read: the index is a summary, the signals are the evidence.
 *
 * The count of deviating signals leads the readouts; the index follows. The
 * illness note names no condition and routes to the doctor cue.
 */
import { Moon } from 'lucide-react';
import type { ISODate, StressContext } from '../../data/types';
import { Button, EmptyState } from '../../ui';
import { TimeSeriesChart, type ChartRange, type TimeSeriesBandPoint, type TimeSeriesPoint } from '../../ui/charts';
import { Note, Readout, TrendCard } from '../trends/TrendCard';
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
  /** e.g. "last 30 days" — goes in the caption. */
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
  const signals = signalsLine(stress?.signalsDeviating ?? 0, stress?.signalsAvailable ?? 0);
  const worse = worseRunLine(stress?.checkIn.worseRun);
  const outliers = stress?.outliers ?? [];
  const illness = stress?.illness;
  const reasons = illness?.flag ? (illness.reasons ?? []).filter((r) => !!r) : [];
  const interval =
    stress && stress.osiLo !== null && stress.osiHi !== null ? `${Math.round(stress.osiLo)}–${Math.round(stress.osiHi)}` : null;

  const action = onOpenCoach ? (
    <Button variant="ghost" size="sm" onClick={() => onOpenCoach(coachPrompt)}>
      Ask the coach
    </Button>
  ) : undefined;

  if (!hasData(osi) && !hasData(checkIn)) {
    return (
      <TrendCard
        title="Overnight strain"
        caption="Your own overnight signals vs your own baseline"
        action={action}
        empty={
          <EmptyState
            icon={<Moon />}
            title="No overnight signals yet"
            hint="Log a daily check-in, or import HRV, resting heart rate, respiratory rate, skin temperature and blood oxygen, and this builds your personal range over about two weeks."
            action={onCheckIn ? { label: 'Check in', onClick: onCheckIn } : undefined}
          />
        }
      />
    );
  }

  return (
    <TrendCard
      title="Overnight strain"
      caption={`Index 0–100 with its credible interval · check-in overlay · ${windowLabel}`}
      action={action}
      meaning="Read the signal count first: the index is only a summary of how many of your overnight readings sat outside your own range, and the shaded band is how sure that summary is. The lower panel is what you reported that morning. Neither one diagnoses anything — they say the night was unusual for you."
    >
      <div className="grid grid-cols-2 gap-3">
        <Readout label="Signals outside range" value={`${stress?.signalsDeviating ?? 0} of ${stress?.signalsAvailable ?? 0}`} sub={strain.label} tone={strain.tone} />
        <Readout label="Strain index" value={stress?.osi ?? null} unit="/ 100" sub={interval ? `credible interval ${interval}` : 'interval needs more nights'} />
      </div>

      <TimeSeriesChart
        ariaLabel={`Overnight strain index, ${windowLabel}`}
        range={range}
        data={osi}
        band={osiBand}
        color="var(--hx-blue)"
        label="Strain index"
        bandLabel="Credible interval"
        unit="/ 100"
        connectDots
        dateFormat={dateFormat}
        height={160}
        emptyText="The index needs about two weeks of overnight readings."
      />

      {hasData(checkIn) && (
        <div className="flex flex-col gap-1">
          <span className="hx-label">How you felt · Hooper {HOOPER_MAX}-point total, lower is better</span>
          <TimeSeriesChart
            ariaLabel={`Daily check-in Hooper total, ${windowLabel}`}
            range={range}
            data={checkIn ?? []}
            color="var(--hx-neutral)"
            label="Hooper total"
            unit={`/ ${HOOPER_MAX}`}
            connectDots
            dateFormat={dateFormat}
            height={110}
            emptyText="Check in daily to overlay how you felt."
          />
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-hx-border pt-3">
        <span className="hx-label">Last night's signals</span>
        <SignalDots signals={outliers} emptyText={`${signals}. Nothing to flag from last night.`} />
      </div>

      <div className="flex flex-col gap-1">
        <Note tone={hooper.tone}>
          Check-in: <span className="font-semibold text-hx-text">{hooper.label}</span> · Hooper {hooperTotalText(stress?.checkIn.total ?? null)}
          {stress ? ` · ${stress.checkIn.nDays} ${stress.checkIn.nDays === 1 ? 'day' : 'days'} logged` : ''}
        </Note>
        {worse && <Note tone="yellow">{worse}</Note>}
        {stress?.calibrating && <Note tone="neutral">{calibratingLine(stress.nRef)}</Note>}
        {illness?.flag && (
          <Note tone="yellow">
            {reasons.length > 0 ? `${reasons.join(' · ')}. ` : ''}
            {ILLNESS_NOTE}
          </Note>
        )}
      </div>
    </TrendCard>
  );
}
