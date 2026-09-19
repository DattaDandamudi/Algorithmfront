/**
 * Personal records in the last 90 days, as a ledger under a ruled running
 * head: the lift in `.hx-body`, the kind and date as a caption, the value in
 * `.hx-fig-sm` flush right.
 *
 * Three kinds, all from `detectPRs`: heaviest weight, most reps at a weight,
 * and best estimated max. Each has to beat the previous best by 1%
 * (`PR_THRESHOLD`) so rounding noise never triggers a celebration, and an
 * exercise with no earlier history sets none at all — day one is a baseline,
 * not eight PRs.
 */
import type { PersonalRecord } from '../../data/types';
import { formatDateShort } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Note, TrainCard } from './TrainCard';
import { formatLoad, loadParts, type Units } from './trainUtils';

export interface PrListProps {
  prs: PersonalRecord[];
  units: Units;
  days: number;
  className?: string;
}

const KIND_WORD: Record<PersonalRecord['kind'], string> = {
  weight: 'heaviest set',
  reps: 'most reps',
  e1rm: 'best estimated max',
};

export default function PrList({ prs, units, days, className = '' }: PrListProps) {
  return (
    <TrainCard title="Personal records" rule caption={`Last ${days} days`} className={className}>
      {prs.length === 0 ? (
        <Note>
          No PRs in this window. A record has to beat the previous best by at least 1%, and an exercise with no earlier
          history sets none; the first session is the baseline.
        </Note>
      ) : (
        <ul className="hx-ledger -mt-3">
          {prs.map((pr) => {
            const load = pr.kind === 'reps' ? null : loadParts(pr.value, units);
            return (
              <li key={`${pr.exerciseId}-${pr.kind}-${pr.d}`} className="hx-row flex-row items-center justify-between gap-3">
                <span className="min-w-0 flex flex-col">
                  <span className="hx-body truncate">{pr.name}</span>
                  <span className="hx-cap">
                    {KIND_WORD[pr.kind]}, {formatDateShort(pr.d)}
                    {pr.previous === null
                      ? ''
                      : `, was ${pr.kind === 'reps' ? `${fmt(pr.previous, 0)} reps` : formatLoad(pr.previous, units)}`}
                  </span>
                </span>
                <span className="hx-fig-sm text-hx-text shrink-0">
                  {load ? load.value : fmt(pr.value, 0)}
                  <span className="hx-unit">{load ? load.unit : 'reps'}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </TrainCard>
  );
}
