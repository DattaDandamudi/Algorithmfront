/**
 * VolumeCard — weekly hard sets per muscle against that muscle's landmarks.
 *
 * The grid itself belongs to the Train tab and is imported from its public
 * surface (`screens/train/index.ts`), not reimplemented: it already carries
 * the status word beside every row, its own legend, its hidden table and
 * `VOLUME_ADVISORY_NOTE`, so the "advisory, never a cap" promise travels with
 * the component instead of relying on this card to remember it.
 *
 * What this card owns is the framing around it:
 *
 *  • the current week is **in progress**, and the caption says so — a
 *    half-finished week that reads "below MEV" on a Tuesday is not a finding;
 *  • a secondary muscle earns half a set, which is why counts land on halves;
 *  • "high" is the top of the scale, not a warning: the 2025 *Sports Medicine*
 *    meta-regression found hypertrophy keeps rising with weekly sets and MRV
 *    has no trial support, so nothing here takes sets away.
 */
import { LayoutGrid } from 'lucide-react';
import type { TrainingContext } from '../../data/types';
import { volumeStatusLabel } from '../../engine';
import { formatDateShort } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { EmptyState } from '../../ui';
import { MuscleVolumeGrid } from '../train';
import { Note, TrendCard } from './TrendCard';
import type { VolumeWeek } from './series';

export interface VolumeCardProps {
  /** `ctx.training.weeklySets` — this week's counts, for the readout line. */
  weeklySets?: TrainingContext['weeklySets'];
  /** Oldest week first; the last entry is the week in progress. */
  weeks: VolumeWeek[];
  onOpenTrain?: () => void;
}

export default function VolumeCard({ weeklySets, weeks, onOpenTrain }: VolumeCardProps) {
  const anySets = weeks.some((w) => w.muscles.some((m) => m.sets > 0));
  if (!weeks.length || !anySets) {
    return (
      <TrendCard
        title="Weekly volume"
        caption="Hard sets per muscle against your landmark bands"
        empty={
          <EmptyState
            icon={<LayoutGrid />}
            title="No sets logged yet"
            hint="Log a strength session and each muscle's weekly hard sets appear here, against the volume band it sits in."
            {...(onOpenTrain ? { action: { label: 'Open Train', onClick: onOpenTrain } } : {})}
          />
        }
      />
    );
  }

  const current = weeklySets?.length ? weeklySets : weeks[weeks.length - 1].muscles;
  const total = current.reduce((sum, m) => sum + (Number.isFinite(m.sets) ? m.sets : 0), 0);
  const below = current.filter((m) => m.status === 'below-mev');
  const weekStart = weeks[weeks.length - 1].weekStart;

  return (
    <TrendCard
      title="Weekly volume"
      caption={`${weeks.length} weeks · this week from ${formatDateShort(weekStart)}, still in progress`}
      meaning={`One hard set counts for the muscle it trains and half a set for each muscle that assists, which is why the counts land on halves. "${volumeStatusLabel('high')}" is the top of the scale, not a warning.`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="hx-label">This week so far</span>
        <span className="text-[15px] leading-5 font-semibold text-hx-text tabular-nums">{fmt(total, 1)} hard sets</span>
      </div>

      {/* The grid prints `VOLUME_ADVISORY_NOTE` itself — see its header. */}
      <MuscleVolumeGrid weeks={weeks} ariaLabel={`Weekly hard sets per muscle over the last ${weeks.length} weeks`} />

      {below.length > 0 && (
        <Note tone="neutral">
          {below.length === current.length
            ? 'Nothing logged this week yet — the week is still open.'
            : `${below.map((m) => m.muscle.replace('-', ' ')).slice(0, 4).join(', ')}${below.length > 4 ? ` and ${below.length - 4} more` : ''} are ${volumeStatusLabel('below-mev')} so far this week. The week is not over.`}
        </Note>
      )}
    </TrendCard>
  );
}
