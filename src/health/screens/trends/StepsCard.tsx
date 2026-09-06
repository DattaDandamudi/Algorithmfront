/**
 * Steps card — SPEC §3. Daily steps (weekly / monthly means at 90D / 1Y)
 * joined by a line over the 8–10k goal band (neutral wash); readouts: today
 * vs the 30-day average (▲ is good), the range average, and goal days
 * (≥ the lower goal). NEAT is the cheapest expenditure lever in a deficit.
 */
import { Footprints } from 'lucide-react';
import type { CoachContext } from '../../data/types';
import { fmt } from '../../lib/format';
import { EmptyState } from '../../ui';
import { TimeSeriesChart, type DatedValue } from '../../ui/charts';
import { DeltaSub, Readout, TrendCard } from './TrendCard';
import { bucketDateFormat, goalBandLabel, type RangeWindow, type StepsStats } from './series';

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
        empty={<EmptyState icon={<Footprints />} title="No steps yet" hint={`Log steps or connect WHOOP to see your days against the ${goal} goal band.`} />}
      />
    );
  }

  const share = stats.goalDays / stats.loggedDays;
  const goalTone = share >= 0.67 ? 'green' : share >= 0.34 ? 'yellow' : 'red';

  return (
    <TrendCard
      title="Steps"
      caption={`Daily steps · ${goal} goal band · ${win.label}`}
      meaning={`Steps are the cheapest expenditure lever in a deficit — days inside the ${goal} band keep your daily activity steady while calories come down.`}
    >
      <div className="grid grid-cols-3 gap-3">
        <Readout label="Today" value={steps.today} sub={<DeltaSub value={steps.delta} good={steps.good} />} />
        <Readout label="Average" value={stats.meanSteps} sub={`${stats.loggedDays} logged day${stats.loggedDays === 1 ? '' : 's'}`} />
        <Readout label="Goal days" value={`${stats.goalDays}/${stats.loggedDays}`} sub={`≥ ${fmt(steps.goalMin)} steps`} tone={goalTone} />
      </div>

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
