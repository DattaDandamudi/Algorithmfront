/**
 * Train ▸ Analysis — estimated max, weekly volume, training load, PRs and the
 * three callouts.
 *
 * The range toggle only changes what is plotted: the volume grid is always the
 * last 12 weeks (that is what a landmark comparison means) and the load series
 * is always built over a long history before the window is sliced out, so the
 * EWMAs behind acute, chronic, fitness and fatigue are warmed up whatever the
 * user is looking at. Everything comes from `useAnalysisModel`, the second
 * memo, so flipping 30D → 1Y never rebuilds readiness or the stress stack.
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
        title="Nothing to analyse yet"
        hint="Log a session or two and this fills with your estimated max per lift, weekly sets per muscle against your landmarks, the load curves behind the readiness verdict, and your PRs."
        action={{ label: 'Start a session', onClick: () => onStart('strength') }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SegmentedControl<ChartRange>
        options={RANGES}
        value={range}
        onChange={setRange}
        size="sm"
        ariaLabel="Analysis range"
        className="self-start"
      />

      <E1rmCard
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
        caption={`Last ${VOLUME_WEEKS} weeks`}
        meaning="One set per primary muscle, half a set per secondary, warm-ups excluded — counted Monday to Sunday."
      >
        <MuscleVolumeGrid weeks={analysis.volumeWeeks} />
      </TrainCard>

      <LoadCard points={analysis.load} load={model.training.load} range={range} />

      <PrList prs={analysis.prs} units={model.units} days={PR_LIST_DAYS} />

      <Callouts training={model.training} />
    </div>
  );
}
