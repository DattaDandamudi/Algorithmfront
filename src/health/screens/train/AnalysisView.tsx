/**
 * Train ▸ Analysis — estimated max, weekly volume, training load, PRs and the
 * three callouts as one page (DESIGN.md "Train"): the range toggle as words on
 * a hairline, then sections divided by running heads. The three ink rules
 * are spent on the volume grid, the load figure and the records; the
 * estimated-max figure opens the page under the toggle and the callouts
 * follow the records with space alone.
 *
 * The range toggle only changes what is plotted: the volume grid is always the
 * last 12 weeks (that is what a landmark comparison means) and the load series
 * is always built over a long history before the window is sliced out, so the
 * EWMAs behind acute, chronic, fitness and fatigue are warmed up whatever the
 * user is looking at. Everything comes from `useAnalysisModel`, the second
 * memo, so flipping 30D to 1Y never rebuilds readiness or the stress stack.
 */
import { useState } from 'react';
import type { WorkoutKind } from '../../data/types';
import { EmptyState, SegmentedControl } from '../../ui';
import { RANGE_DAYS, type ChartRange } from '../../ui/charts';
import Callouts from './Callouts';
import E1rmCard from './E1rmCard';
import LoadCard from './LoadCard';
import MuscleVolumeGrid from './MuscleVolumeGrid';
import PrList from './PrList';
import { TrainCard } from './TrainCard';
import { PR_LIST_DAYS, VOLUME_WEEKS, useAnalysisModel, type TrainModel } from './useTrainModel';

const RANGES: Array<{ value: ChartRange; label: string }> = [
  { value: '30D', label: '30D' },
  { value: '90D', label: '90D' },
  { value: '1Y', label: '1Y' },
];

export interface AnalysisViewProps {
  model: TrainModel;
  /** Start a session from the empty state. */
  onStart: (kind: WorkoutKind) => void;
}

export default function AnalysisView({ model, onStart }: AnalysisViewProps) {
  const [range, setRange] = useState<ChartRange>('90D');
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const analysis = useAnalysisModel(model, exerciseId, RANGE_DAYS[range]);
  const picked = exerciseId ?? analysis.options[0]?.id ?? null;

  if (model.workouts.length === 0) {
    return (
      <EmptyState
        className="mt-6"
        title="Nothing to analyse yet"
        hint="Log a session or two and this fills with your estimated max per lift, weekly sets per muscle against your landmarks, the load curves behind the readiness verdict, and your PRs."
        action={{ label: 'Start a session', onClick: () => onStart('strength') }}
      />
    );
  }

  return (
    <div className="flex flex-col">
      <SegmentedControl<ChartRange> options={RANGES} value={range} onChange={setRange} size="sm" ariaLabel="Analysis range" className="self-start mt-6" />

      <E1rmCard
        className="mt-8"
        options={analysis.options}
        exerciseId={picked}
        onPick={setExerciseId}
        history={analysis.history}
        prs={analysis.exercisePrs}
        units={model.units}
        range={range}
      />

      <TrainCard
        title="Weekly sets per muscle"
        rule
        caption={`Last ${VOLUME_WEEKS} weeks`}
        className="mt-10"
        meaning="One set per primary muscle, half a set per secondary, warm-ups excluded, counted Monday to Sunday."
      >
        <MuscleVolumeGrid weeks={analysis.volumeWeeks} />
      </TrainCard>

      <LoadCard className="mt-10" points={analysis.load} load={model.training.load} range={range} />

      <PrList className="mt-10" prs={analysis.prs} units={model.units} days={PR_LIST_DAYS} />

      <Callouts className="mt-10" training={model.training} />
    </div>
  );
}
