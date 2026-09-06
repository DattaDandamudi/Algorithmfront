/**
 * Personal records in the last 90 days.
 *
 * Three kinds, all from `detectPRs`: heaviest weight, most reps at a weight,
 * and best estimated max. Each has to beat the previous best by 1%
 * (`PR_THRESHOLD`) so rounding noise never triggers a celebration, and an
 * exercise with no earlier history sets none at all — day one is a baseline,
 * not eight PRs.
 */
import { Trophy } from 'lucide-react';
import type { PersonalRecord } from '../../data/types';
import { formatDateShort } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Note, TrainCard } from './TrainCard';
import { formatLoad, type Units } from './trainUtils';

export interface PrListProps {
  prs: PersonalRecord[];
  units: Units;
  days: number;
}

const KIND_WORD: Record<PersonalRecord['kind'], string> = {
  weight: 'heaviest set',
  reps: 'most reps',
  e1rm: 'best estimated max',
};

export default function PrList({ prs, units, days }: PrListProps) {
  return (
    <TrainCard title="Personal records" caption={`Last ${days} days`}>
      {prs.length === 0 ? (
        <Note>
          No PRs in this window. A record has to beat the previous best by at least 1%, and an exercise with no earlier
          history sets none — the first session is the baseline.
        </Note>
      ) : (
        <ul className="flex flex-col gap-2">
          {prs.map((pr) => (
            <li key={`${pr.exerciseId}-${pr.kind}-${pr.d}`} className="flex items-baseline gap-2">
              <Trophy className="w-4 h-4 shrink-0 self-center text-hx-green" aria-hidden />
              <span className="min-w-0">
                <span className="block text-[14px] leading-5 text-hx-text truncate">{pr.name}</span>
                <span className="block text-[12px] leading-4 text-hx-muted">
                  {KIND_WORD[pr.kind]} · {formatDateShort(pr.d)}
                  {pr.previous === null
                    ? ''
                    : ` · was ${pr.kind === 'reps' ? `${fmt(pr.previous, 0)} reps` : formatLoad(pr.previous, units)}`}
                </span>
              </span>
              <span className="ml-auto shrink-0 text-[14px] leading-5 text-hx-text tabular-nums">
                {pr.kind === 'reps' ? `${fmt(pr.value, 0)} reps` : formatLoad(pr.value, units)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </TrainCard>
  );
}
