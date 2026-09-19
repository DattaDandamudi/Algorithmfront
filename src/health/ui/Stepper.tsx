/**
 * Stepper — "− [ value ] +" for grams, weight (±0.1) and tobacco +1 (SPEC §2).
 *
 * Two 44 px rule-outlined keys (.hx-key) around a .hx-fig-sm figure; `lg` is
 * two 56 px keys around a .hx-fig figure. The figure is a real text input
 * (inputMode decimal) so "185" can be typed instead of tapped 30 times; it
 * flexes to the space left between the keys, so two steppers side by side in
 * a 350 px measure still show "231.5" whole. The unit sits after it as
 * .hx-unit. Typed values commit on blur/Enter, are rounded to `dp` and clamped
 * to min/max; garbage reverts to the last good value. Keys disable at the
 * bounds.
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
  const key = `hx-key ${lg ? 'w-14 h-14' : ''}`;

  return (
    <div role="group" aria-label={label} className={`flex items-center gap-1 min-w-0 ${className}`}>
      <button type="button" className={key} aria-label={`Decrease ${label}`} onClick={() => set(value - step)} disabled={disabled || value - step < min - 1e-9}>
        <Minus className="w-5 h-5" strokeWidth={1.5} aria-hidden />
      </button>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="flex-1 min-w-0 flex items-baseline justify-center gap-1">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          size={4}
          value={draft}
          disabled={disabled}
          onFocus={() => setEditing(true)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
          className={`${lg ? 'hx-fig h-14' : 'hx-fig-sm h-11'} w-full min-w-0 px-0 text-center text-hx-text`}
          aria-describedby={unit ? `${id}-unit` : undefined}
        />
        {unit && (
          <span id={`${id}-unit`} className="hx-unit shrink-0 pr-1">
            {unit}
          </span>
        )}
      </div>
      <button type="button" className={key} aria-label={`Increase ${label}`} onClick={() => set(value + step)} disabled={disabled || value + step > max + 1e-9}>
        <Plus className="w-5 h-5" strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  );
}
