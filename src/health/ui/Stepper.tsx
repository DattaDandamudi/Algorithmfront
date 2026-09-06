/**
 * Stepper — "− [ value ] +" for grams, weight (±0.1) and tobacco +1 (SPEC §2).
 *
 * Both buttons are ≥ 44 px targets; the middle is a real text input
 * (inputMode decimal) so he can type "185" instead of tapping 30 times. Typed
 * values commit on blur/Enter, are rounded to `dp` and clamped to min/max;
 * garbage reverts to the last good value. Buttons disable at the bounds.
 */
import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import { clamp, fmt, round } from '../lib/format';

export interface StepperProps {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  dp?: number;
  unit?: string;
  /** Accessible name for the group and the +/− buttons, e.g. "Grams". */
  label?: string;
  size?: 'sm' | 'lg';
  disabled?: boolean;
  className?: string;
}

export default function Stepper({ value, onChange, step = 1, min = -Infinity, max = Infinity, dp = 0, unit, label = 'Value', size = 'sm', disabled = false, className = '' }: StepperProps) {
  const id = useId();
  const [draft, setDraft] = useState(() => fmt(value, dp).replace(/,/g, ''));
  const [editing, setEditing] = useState(false);

  // Keep the field in sync with external changes unless the user is typing.
  useEffect(() => {
    if (!editing) setDraft(fmt(value, dp).replace(/,/g, ''));
  }, [value, dp, editing]);

  const set = (n: number) => {
    const next = clamp(round(n, dp), min, max);
    if (next !== value) onChange(next);
  };

  const commit = () => {
    setEditing(false);
    const parsed = parseFloat(draft.replace(/,/g, '').replace('−', '-'));
    if (Number.isFinite(parsed)) set(parsed);
    else setDraft(fmt(value, dp).replace(/,/g, ''));
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      set(value + step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      set(value - step);
    }
  };

  const lg = size === 'lg';
  const btn = `${lg ? 'w-14 h-14' : 'w-11 h-11'} shrink-0 inline-flex items-center justify-center rounded-xl bg-hx-card2 border border-hx-border text-hx-text hover:border-hx-neutral active:bg-hx-border disabled:opacity-40 disabled:cursor-not-allowed transition-colors`;

  return (
    <div role="group" aria-label={label} className={`inline-flex items-center gap-2 ${className}`}>
      <button type="button" className={btn} aria-label={`Decrease ${label}`} onClick={() => set(value - step)} disabled={disabled || value - step < min - 1e-9}>
        <Minus className="w-5 h-5" aria-hidden />
      </button>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className={`relative ${lg ? 'w-28' : 'w-20'}`}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={draft}
          disabled={disabled}
          onFocus={() => setEditing(true)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
          className={`w-full ${lg ? 'h-14 text-[28px]' : 'h-11 text-[18px]'} ${unit ? 'pr-8' : ''} text-center font-semibold`}
          aria-describedby={unit ? `${id}-unit` : undefined}
        />
        {unit && (
          <span id={`${id}-unit`} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-hx-muted pointer-events-none">
            {unit}
          </span>
        )}
      </div>
      <button type="button" className={btn} aria-label={`Increase ${label}`} onClick={() => set(value + step)} disabled={disabled || value + step > max + 1e-9}>
        <Plus className="w-5 h-5" aria-hidden />
      </button>
    </div>
  );
}
