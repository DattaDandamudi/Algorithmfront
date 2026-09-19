/**
 * Steps figure — SPEC §3. Daily steps (weekly / monthly means at 90D / 1Y)
 * joined by a line over the 8–10k goal band as a wash; the lead is today
 * with its ▲/▼ against the 30-day average and the goal-day word beside it;
 * the deck is the range average and the goal-day count. NEAT is the cheapest
 * expenditure lever in a deficit.
 */
import type { CoachContext } from '../../data/types';
import { fmt } from '../../lib/format';
import { EmptyState } from '../../ui';
import { TimeSeriesChart, type DatedValue } from '../../ui/charts';
import { DeltaSub, Lead, TrendCard } from './TrendCard';
import { BUCKET_LABEL, bucketDateFormat, goalBandLabel, type RangeWindow, type StepsStats } from './series';

export interface StepsCardProps {
  steps: CoachContext['steps'];
  series: DatedValue[];
  stats: StepsStats;
  win: RangeWindow;
}

export default function StepsCard({ steps, series, stats, win }: StepsCardProps) {
  const goal = goalBandLabel(steps.goalMin, steps.goalMax);

  if (stats.loggedDays === 0) {
    return (
      <TrendCard
        title="Steps"
        caption={`Daily steps against the ${goal} goal`}
        empty={<EmptyState title="No steps yet" hint={`Log steps or connect WHOOP to see your days against the ${goal} goal band.`} />}
      />
    );
  }

  const share = stats.goalDays / stats.loggedDays;
  // §0 bands (≥67 % / 34–66 % / <34 %); the word travels with the colour so the state is never colour-only (review R6-12).
  const goalTone = share >= 0.67 ? 'green' : share >= 0.34 ? 'yellow' : 'red';
  const goalWord = goalTone === 'green' ? 'on track' : goalTone === 'yellow' ? 'patchy' : 'low';
  const days = `${stats.loggedDays} logged day${stats.loggedDays === 1 ? '' : 's'}`;

  return (
    <TrendCard
      title="Steps"
      caption={days}
      source={`Daily steps${win.bucket === 'day' ? '' : ` as ${BUCKET_LABEL[win.bucket]}`}, ${win.label}; the wash is the ${goal} goal band.`}
      meaning={`Steps are the cheapest expenditure lever in a deficit: days inside the ${goal} band keep your daily activity steady while calories come down.`}
    >
      <Lead value={steps.today} word={`${goalWord}, ${stats.goalDays} of ${stats.loggedDays} goal days`} tone={goalTone} sub={<DeltaSub value={steps.delta} good={steps.good} />} />

      <p className="hx-deck">{`Averaging ${fmt(stats.meanSteps)} a day over ${days}; ${stats.goalDays} of them reached ${fmt(steps.goalMin)} steps.`}</p>

      <TimeSeriesChart
        ariaLabel={`Steps, ${win.label}, against the ${goal} goal band`}
        range={win.range}
        data={series}
        connectDots
        targetBand={{ lo: steps.goalMin, hi: steps.goalMax, label: `${goal} goal` }}
        label="Steps"
        dateFormat={bucketDateFormat(win.bucket)}
        emptyText="No steps logged in this range."
      />
    </TrendCard>
  );
}
