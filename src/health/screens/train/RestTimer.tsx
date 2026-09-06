/**
 * Rest timer — 60 / 90 / 120 / 180 s presets with a live countdown.
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
import { Timer, X } from 'lucide-react';
import { Chip } from '../../ui';
import { REST_PRESETS, formatRest } from './trainUtils';

export interface RestTimerProps {
  /** Epoch ms the current rest ends at; undefined when nothing is running. */
  endsAt?: number;
  /** The preset the user's settings default to, highlighted in the row. */
  defaultSec: number;
  onStart: (seconds: number) => void;
  onStop: () => void;
}

export default function RestTimer({ endsAt, defaultSec, onStart, onStop }: RestTimerProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === undefined) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  const remaining = endsAt === undefined ? null : Math.max(0, Math.round((endsAt - nowMs) / 1000));
  const done = remaining !== null && remaining === 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Timer className="w-4 h-4 shrink-0 text-hx-muted" aria-hidden />
        {remaining === null ? (
          <span className="text-[13px] leading-5 text-hx-text2">Rest timer</span>
        ) : done ? (
          <span role="status" className="text-[15px] leading-5 font-semibold text-hx-green tabular-nums">
            Rest done
          </span>
        ) : (
          <span role="timer" aria-live="off" className="text-[17px] leading-6 font-semibold text-hx-text tabular-nums">
            {formatRest(remaining)}
            <span className="sr-only"> of rest remaining</span>
          </span>
        )}
        {remaining !== null && (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop the rest timer"
            className="ml-auto w-11 h-11 -my-2 inline-flex items-center justify-center rounded-xl text-hx-text2 hover:text-hx-text hover:bg-hx-card2"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        )}
      </div>
      <div className="flex gap-1.5 overflow-x-auto hx-no-scrollbar -mx-1 px-1">
        {REST_PRESETS.map((sec) => (
          <Chip
            key={sec}
            size="sm"
            color="blue"
            active={sec === defaultSec && remaining === null}
            onClick={() => onStart(sec)}
            aria-label={`Rest ${sec} seconds`}
          >
            {formatRest(sec)}
          </Chip>
        ))}
      </div>
    </div>
  );
}
