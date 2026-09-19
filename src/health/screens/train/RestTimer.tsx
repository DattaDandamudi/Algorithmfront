/**
 * Rest timer — 60 / 90 / 120 / 180 s presets as tags on one line, and while a
 * rest runs, the countdown as a `.hx-fig` figure over a 2 px progress rule
 * that drains with it (DESIGN.md "Data marks": a rule, not a well).
 *
 * The deadline (`endsAt`, epoch ms) lives in the draft, not in this
 * component, so a rest that started before the app was backgrounded is still
 * counting the right number of seconds when it comes back. The ticking state
 * here is only the redraw; the truth is a timestamp.
 *
 * The countdown itself is `aria-live="off"` (a per-second announcement would
 * be unusable); the single "Rest done" line that replaces it is polite, so a
 * screen-reader user is told once, when it matters.
 */
import { useEffect, useState } from 'react';
import { Button, Chip } from '../../ui';
import ProgressRule from './ProgressRule';
import { REST_PRESETS, formatRest } from './trainUtils';

export interface RestTimerProps {
  /** Epoch ms the current rest ends at; undefined when nothing is running. */
  endsAt?: number;
  /** Length of the rest that is running, in seconds — the rule's full width. */
  totalSec?: number;
  /** The preset the user's settings default to, marked in the row. */
  defaultSec: number;
  onStart: (seconds: number) => void;
  onStop: () => void;
}

export default function RestTimer({ endsAt, totalSec, defaultSec, onStart, onStop }: RestTimerProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === undefined) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  const remaining = endsAt === undefined ? null : Math.max(0, Math.round((endsAt - nowMs) / 1000));
  const done = remaining !== null && remaining === 0;
  const total = totalSec && totalSec > 0 ? totalSec : defaultSec;

  return (
    <div className="flex flex-col gap-3">
      {remaining !== null && (
        <div className="flex flex-col gap-2">
          <div className="flex items-end justify-between gap-3">
            {done ? (
              <span role="status" className="hx-ui text-hx-green">
                <span className="hx-tone mr-1.5" aria-hidden />
                Rest done
              </span>
            ) : (
              <span className="flex items-baseline gap-2">
                <span role="timer" aria-live="off" className="hx-fig text-hx-text">
                  {formatRest(remaining)}
                  <span className="sr-only"> of rest remaining</span>
                </span>
                <span className="hx-agate">of {formatRest(total)}</span>
              </span>
            )}
            <Button variant="ghost" size="sm" aria-label="Stop the rest timer" onClick={onStop} className="shrink-0">
              Stop
            </Button>
          </div>
          <ProgressRule
            value={done ? total : remaining}
            max={total}
            tone={done ? 'green' : 'ink'}
            label="Rest remaining"
            valueText={done ? 'Rest done' : `${formatRest(remaining)} of ${formatRest(total)} remaining`}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="hx-label mr-1">Rest</span>
        {REST_PRESETS.map((sec) => (
          <Chip key={sec} size="sm" active={sec === defaultSec && remaining === null} onClick={() => onStart(sec)} aria-label={`Rest ${sec} seconds`}>
            {formatRest(sec)}
          </Chip>
        ))}
      </div>
    </div>
  );
}
