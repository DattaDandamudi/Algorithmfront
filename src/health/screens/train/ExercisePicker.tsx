/**
 * Exercise picker — a sibling sheet of the logger, never nested inside
 * another one (plan §2a: picker, finish and detail sheets are siblings).
 *
 * A plate with the running head "Add an exercise", an underline search field
 * and the results as a ledger: name in `.hx-body`, equipment and muscles in
 * `.hx-cap`, "in this session" as a hedge; every row a 56 px target.
 *
 * Search is `engine/exerciseDb.searchExercises`: token-prefix matching with a
 * one-edit typo tolerance over names and aliases, custom exercises first. An
 * empty query returns the useful default list rather than nothing, so the
 * sheet is never blank — "bench" and "bnch" both land on Bench Press.
 */
import { useEffect, useMemo, useState } from 'react';
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
      <div className="flex flex-col gap-4">
        <label className="flex flex-col">
          <span className="sr-only">Search exercises</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Bench, rdl, ohp…"
            className="w-full [&::-webkit-search-cancel-button]:appearance-none"
            autoComplete="off"
          />
        </label>

        {results.length === 0 ? (
          <p className="hx-body text-hx-text2 py-4">
            Nothing matches “{query}”. Add it as a custom exercise in Settings, under Training.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-hx-border">
            {results.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => onPick(e)} className="hx-row hx-press flex-row items-center justify-between gap-3 text-left">
                  <span className="min-w-0 flex flex-col">
                    <span className="hx-body truncate">{e.name}</span>
                    <span className="hx-cap truncate">
                      {e.equipment}, {(e.muscles?.primary ?? []).map(muscleLabel).join(', ') || '—'}
                      {e.custom ? ', custom' : ''}
                    </span>
                  </span>
                  {present.has(e.id) && <span className="hx-hedge shrink-0">in this session</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
