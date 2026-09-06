/**
 * Exercise picker — a sibling sheet of the logger, never nested inside
 * another one (plan §2a: picker, finish and detail sheets are siblings).
 *
 * Search is `engine/exerciseDb.searchExercises`: token-prefix matching with a
 * one-edit typo tolerance over names and aliases, custom exercises first. An
 * empty query returns the useful default list rather than nothing, so the
 * sheet is never blank — "bench" and "bnch" both land on Bench Press.
 */
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Exercise } from '../../data/types';
import { searchExercises } from '../../engine';
import { Sheet } from '../../ui';
import { muscleLabel } from './trainUtils';

export interface ExercisePickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
  custom?: readonly Exercise[];
  /** Ids already in the session — shown as "in this session". */
  inSession?: readonly string[];
}

const RESULT_LIMIT = 30;

export default function ExercisePicker({ open, onClose, onPick, custom, inSession }: ExercisePickerProps) {
  const [query, setQuery] = useState('');

  // Reset the query each time the sheet opens: the last search is never what
  // the next exercise is called.
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const results = useMemo(
    () => searchExercises(query, { custom, limit: RESULT_LIMIT }),
    [query, custom],
  );
  const present = useMemo(() => new Set(inSession ?? []), [inSession]);

  return (
    <Sheet open={open} onClose={onClose} title="Add an exercise">
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 rounded-xl border border-hx-border bg-hx-card2 px-3 h-11">
          <Search className="w-4 h-4 shrink-0 text-hx-muted" aria-hidden />
          <span className="sr-only">Search exercises</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search — bench, rdl, ohp…"
            className="flex-1 min-w-0 bg-transparent text-[15px] leading-5 text-hx-text placeholder:text-hx-muted outline-none"
            autoComplete="off"
          />
        </label>

        {results.length === 0 ? (
          <p className="text-[13px] leading-5 text-hx-text2 py-6 text-center">
            Nothing matches “{query}”. Add it as a custom exercise in Settings ▸ Training.
          </p>
        ) : (
          <ul className="flex flex-col">
            {results.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onPick(e)}
                  className="w-full min-h-11 py-2 px-2 flex items-center gap-3 rounded-xl text-left hover:bg-hx-card2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-5 text-hx-text truncate">{e.name}</span>
                    <span className="block text-[12px] leading-4 text-hx-muted truncate">
                      {e.equipment} · {(e.muscles?.primary ?? []).map(muscleLabel).join(', ') || '—'}
                      {e.custom ? ' · custom' : ''}
                    </span>
                  </span>
                  {present.has(e.id) && (
                    <span className="shrink-0 text-[11px] leading-4 text-hx-text2">in this session</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
