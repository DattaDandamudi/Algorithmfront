/**
 * SegmentedControl — the 7D / 30D / 90D / 1Y range toggle, the Train view
 * switch, the coach tone. Words on a hairline, 16 px apart, each 44 px tall;
 * the checked word is bone with a 2 px ink underline sitting on the hairline,
 * the others text2. No well, no pill. A radiogroup with roving tabindex: ←/→
 * (and ↑/↓) move the selection, Home/End jump.
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
  /** sm sets the words in .hx-label, md in .hx-ui. Both are 44 px tall. */
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

  const face = size === 'sm' ? 'hx-label' : 'hx-ui';

  return (
    <div role="radiogroup" aria-label={ariaLabel} onKeyDown={onKey} className={`inline-flex items-stretch gap-4 border-b border-hx-border ${className}`}>
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
            className={`${face} h-11 min-w-[44px] flex items-center justify-start whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none disabled:opacity-40 ${
              checked ? 'text-hx-text' : 'text-hx-text2 hover:text-hx-text'
            }`}
          >
            <span className={`relative inline-flex items-center h-11 ${checked ? 'after:absolute after:left-0 after:right-0 after:-bottom-px after:h-0.5 after:bg-hx-text' : ''}`}>
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
