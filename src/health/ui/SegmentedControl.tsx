/**
 * SegmentedControl — 7D / 30D / 90D / 1Y range toggle and the coach tone
 * toggle (SPEC §3, §4). A sunken well with the checked segment raised out of
 * it. Implemented as a radiogroup with roving tabindex: ←/→ (and ↑/↓) move
 * the selection, Home/End jump. Every segment is 44 px tall.
 */
import type { KeyboardEvent } from 'react';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  ariaLabel: string;
  className?: string;
}

export default function SegmentedControl<T extends string = string>({ options, value, onChange, size = 'md', ariaLabel, className = '' }: SegmentedControlProps<T>) {
  const enabled = options.filter((o) => !o.disabled);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = enabled.findIndex((o) => o.value === value);
    if (idx < 0 || !enabled.length) return;
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % enabled.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    else return;
    e.preventDefault();
    const target = enabled[next];
    onChange(target.value);
    (e.currentTarget.querySelector(`[data-value="${target.value}"]`) as HTMLElement | null)?.focus();
  };

  const h = size === 'sm' ? 'h-11 text-[13px]' : 'h-11 text-[15px]';

  return (
    <div role="radiogroup" aria-label={ariaLabel} onKeyDown={onKey} className={`hx-well inline-flex p-1 rounded-full ${className}`}>
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            data-value={o.value}
            tabIndex={checked ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={`${h} px-3 min-w-[44px] rounded-full font-medium transition-colors disabled:opacity-40 ${
              checked ? 'hx-raised !rounded-full text-hx-text' : 'text-hx-text2 hover:text-hx-text border border-transparent'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
