/**
 * Settings form primitives (DESIGN.md "Settings", the black-stock edition).
 *
 * Every component here is declared at module level so React never remounts a
 * control between keystrokes; an input that loses focus while typing is the
 * one bug the Settings screen must not have. Numeric fields keep a local
 * string draft and commit on blur / Enter after validation, so half-typed
 * values never reach the store and out-of-range values are explained in a red
 * caption instead of being clamped silently. Text fields are bound straight to
 * the store (the writer debounces the localStorage flush).
 *
 * This is also the screen's whole visual vocabulary: restyle a primitive here
 * and all twelve sections follow. A section is a 56 px ledger row whose whole
 * width is the disclosure button; opening it inks the row's top hairline to
 * bone. Inside, labels are .hx-label, inputs are the kit's underline fields
 * with their side padding dropped, the unit after a number is .hx-unit, a
 * toggle is a rule-outlined switch with a bone thumb and its state as a word,
 * a read-only summary is a small ledger, a read-only inset is a note, and a
 * sub-heading is a running head. The field shapes and the error treatment
 * match the Onboarding steps, which are built to the same spec.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { fmt, round } from '../../lib/format';
import { SectionHeader, SegmentedControl, bandBg, bandText, type SegmentedOption, type Tone } from '../../ui';
import { isISODate, normalizeHHMM } from './util';

/** The underline field's text: the kit draws the rule; the field only drops its side padding. */
const FIELD = 'w-full min-w-0 px-0 leading-6';

const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur();
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface SectionProps {
  id: string;
  title: string;
  /** One-line live summary under the title, closed and open. */
  caption?: string;
  defaultOpen?: boolean;
  /** Set (to a fresh nonce) to open the section and scroll it into view: the Settings deep link. */
  openSignal?: number;
  children: ReactNode;
}

/**
 * One row of the index. Closed it is a 56 px ledger row: the title in .hx-ui,
 * the summary in .hx-hedge, a chevron at the right, a hairline above. The whole
 * row is the disclosure button and its accessible name starts with the section
 * title, which is how the tests and the deep links find it. Open, the top
 * hairline inks to bone and the form expands in place beneath the same row.
 * Content unmounts while collapsed (drafts are cheap to rebuild).
 */
export function Section({ id, title, caption, defaultOpen = false, openSignal, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLElement>(null);
  const bodyId = `${id}-body`;
  const headId = `${id}-heading`;
  // Deep link (nav.openSettings(section)): expand and bring the row into view. A
  // changed nonce re-fires even when the section is already mounted (review R2-10).
  useEffect(() => {
    if (!openSignal) return;
    setOpen(true);
    const el = ref.current;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [openSignal]);
  return (
    <section ref={ref} className="scroll-mt-4" aria-labelledby={headId}>
      <h2 id={headId} className="m-0">
        {/* The hairline is the button's own top edge, so it inks on press and stays inked while open. */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={() => setOpen((o) => !o)}
          className={`hx-row hx-press flex-row items-center justify-between gap-4 min-h-[57px] border-t ${open ? 'border-hx-text' : 'border-hx-border'}`}
        >
          <span className="min-w-0 flex-1">
            <span className="hx-ui block text-hx-text">{title}</span>
            {caption && <span className="hx-hedge block truncate">{caption}</span>}
          </span>
          <ChevronDown className={`w-4 h-4 shrink-0 text-hx-text2 ${open ? 'rotate-180' : ''}`} strokeWidth={1.5} aria-hidden />
        </button>
      </h2>
      {open && (
        <div id={bodyId} className="pt-2 pb-10 flex flex-col gap-6">
          {children}
        </div>
      )}
    </section>
  );
}

/** A .hx-label over its control, an optional caption (or a red error) beneath. */
export function Field({ label, htmlFor, hint, error, children, className = '' }: { label: string; htmlFor?: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${className}`}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="hx-label">
          {label}
        </label>
      ) : (
        <p className="hx-label">{label}</p>
      )}
      {children}
      {error ? (
        <p className="hx-cap text-hx-red" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="hx-cap">{hint}</p>
      )}
    </div>
  );
}

/** Explanatory copy inside a section: reading text at the second ink density. Inline children only. */
export function Note({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`hx-body text-hx-text2 ${className}`}>{children}</p>;
}

/**
 * A running head inside a section (an h3, no rule): the name flush left in
 * .hx-label, an optional dateline flush right, a ghost verb in the action slot.
 * It takes 40 px above itself and leaves 16 px to its content; `first` drops
 * the space above when it opens the section.
 */
export function SubHeading({ title, caption, action, first }: { title: string; caption?: string; action?: ReactNode; first?: boolean }) {
  return <SectionHeader as="h3" title={title} caption={caption} action={action} className={first ? '-mb-2' : 'mt-4 -mb-2'} />;
}

/** A state word with its tone square: the carrier beside every tone. Neutral states carry no square. */
export function StateWord({ tone, children, className = '' }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`hx-label inline-flex items-center gap-1.5 whitespace-nowrap ${tone === 'neutral' ? 'text-hx-text2' : bandText(tone)} ${className}`}>
      {tone !== 'neutral' && <span className="hx-tone" aria-hidden />}
      {children}
    </span>
  );
}

/** A read-only inset: a note behind a 2 px text2 rule. */
export function Inset({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`hx-note border-hx-text2 py-1 flex flex-col gap-2 ${className}`}>{children}</div>;
}

/** A read-only summary as a small ledger: `<KVList>` of `<KV>` rows. */
export function KVList({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <dl className={`m-0 flex flex-col ${className}`}>{children}</dl>;
}

/** One ledger line: the label in .hx-body, the value flush right; a bare number is set as a table figure. */
export function KV({ k, v }: { k: string; v: ReactNode }) {
  const figure = typeof v === 'number';
  return (
    <div className="flex items-baseline justify-between gap-4 min-h-11 py-2 border-t border-hx-border first:border-t-0">
      <dt className="hx-body shrink-0">{k}</dt>
      <dd className={`m-0 min-w-0 flex-1 text-right text-hx-text ${figure ? 'hx-fig-sm' : 'hx-ui'}`}>{v}</dd>
    </div>
  );
}

/**
 * The 2 px progress rule (DESIGN.md "Data marks"): a hairline track with an ink
 * fill, a tone only where a band applies, the reading in .hx-agate at its end.
 * `role="meter"` so the value is announced.
 */
export function ProgressRule({ value, max, tone = 'ink', label, end, valueText, className = '' }: { value: number; max: number; tone?: Tone | 'ink'; label: string; end?: string; valueText?: string; className?: string }) {
  const v = Number.isFinite(value) ? Math.max(0, value) : 0;
  const scale = max > 0 ? max : 1;
  const frac = Math.min(1, v / scale);
  const fill = tone === 'ink' ? 'bg-hx-text' : bandBg(tone);
  return (
    <div className={`w-full flex items-center gap-2 ${className}`}>
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={scale} aria-valuenow={Math.min(v, scale)} aria-valuetext={valueText ?? `${fmt(v)} of ${fmt(scale)}`} className="relative flex-1 h-0.5 bg-hx-border">
        <span className={`absolute inset-y-0 left-0 ${fill}`} style={{ width: `${Math.round(frac * 1000) / 10}%` }} aria-hidden />
      </div>
      {end && <span className="hx-agate shrink-0">{end}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export interface NumberFieldProps {
  label: string;
  value: number | null | undefined;
  onCommit: (n: number) => void;
  /** When given, clearing the field is allowed and calls this instead of reverting. */
  onClear?: () => void;
  min?: number;
  max?: number;
  step?: number;
  dp?: number;
  unit?: string;
  hint?: ReactNode;
  placeholder?: string;
  /** Extra rule beyond min/max; return a message to reject. */
  validate?: (n: number) => string | null;
  disabled?: boolean;
  className?: string;
  /** Compact mode for dense rows: no visible label (the label becomes aria-label); errors still show inline. */
  hideLabel?: boolean;
  /** Set the numeral as a table figure (.hx-fig-sm) for ruled tables. */
  figure?: boolean;
  align?: 'left' | 'right';
}

const draftOf = (v: number | null | undefined, dp: number) => (v === null || v === undefined || !Number.isFinite(v) ? '' : String(round(v, dp)));

export function NumberField({ label, value, onCommit, onClear, min, max, step = 1, dp = 0, unit, hint, placeholder, validate, disabled, className = '', hideLabel, figure, align = 'left' }: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(() => draftOf(value, dp));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(draftOf(value, dp));
  }, [value, dp, editing]);

  const unitSuffix = unit ? ` ${unit}` : '';

  const commit = () => {
    setEditing(false);
    const raw = draft.trim().replace(/,/g, '').replace('−', '-');
    if (raw === '') {
      setError(null);
      if (onClear) onClear();
      else setDraft(draftOf(value, dp));
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setError('Enter a number.');
      return;
    }
    const r = round(n, dp);
    if (min !== undefined && r < min) {
      setError(`Minimum is ${round(min, dp)}${unitSuffix}.`);
      return;
    }
    if (max !== undefined && r > max) {
      setError(`Maximum is ${round(max, dp)}${unitSuffix}.`);
      return;
    }
    const msg = validate?.(r) ?? null;
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);
    if (r !== value) onCommit(r);
    else setDraft(draftOf(r, dp));
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setDraft(draftOf(value, dp));
      setError(null);
      e.currentTarget.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const base = Number(draft.replace(/,/g, '')) || value || 0;
      setDraft(String(round(base + (e.key === 'ArrowUp' ? step : -step), dp)));
    }
  };

  const control = (
    <div className="flex items-baseline">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={hideLabel ? label : undefined}
        aria-invalid={error ? true : undefined}
        onFocus={() => setEditing(true)}
        onChange={(e) => {
          setDraft(e.target.value);
          if (error) setError(null);
        }}
        onBlur={commit}
        onKeyDown={onKey}
        className={`${FIELD} flex-1 disabled:opacity-40 ${figure ? 'hx-fig-sm' : ''} ${align === 'right' ? 'text-right' : ''}`}
      />
      {unit && <span className="hx-unit shrink-0">{unit}</span>}
    </div>
  );

  if (hideLabel) {
    return (
      <div className={className}>
        {control}
        {error && (
          <p className="hx-cap text-hx-red mt-1" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <Field label={label} htmlFor={id} hint={hint} error={error} className={className}>
      {control}
    </Field>
  );
}

export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  placeholder?: string;
  type?: 'text' | 'password' | 'url';
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  autoComplete?: string;
  spellCheck?: boolean;
  /** Node rendered to the right of the input (e.g. a Save verb). */
  trailing?: ReactNode;
  className?: string;
}

export function TextField({ label, value, onChange, hint, placeholder, type = 'text', multiline, rows = 3, maxLength, autoComplete = 'off', spellCheck, trailing, className = '' }: TextFieldProps) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint} className={className}>
      <div className="flex items-end gap-3">
        {multiline ? (
          <textarea id={id} value={value} rows={rows} maxLength={maxLength} placeholder={placeholder} spellCheck={spellCheck} onChange={(e) => onChange(e.target.value)} className={`${FIELD} py-2.5 min-h-[44px] resize-y`} />
        ) : (
          <input
            id={id}
            type={type}
            inputMode={type === 'url' ? 'url' : undefined}
            value={value}
            maxLength={maxLength}
            placeholder={placeholder}
            autoComplete={autoComplete}
            autoCapitalize={type === 'text' ? undefined : 'off'}
            spellCheck={spellCheck ?? (type === 'text' ? undefined : false)}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={blurOnEnter}
            className={`${FIELD} flex-1`}
          />
        )}
        {trailing}
      </div>
    </Field>
  );
}

export interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  hint?: ReactNode;
  className?: string;
  /** Visually-hidden label (dense rows that already show the label elsewhere). */
  hideLabel?: boolean;
}

export function SelectField<T extends string>({ label, value, onChange, options, hint, className = '', hideLabel }: SelectFieldProps<T>) {
  const id = useId();
  const control = (
    <div className="relative">
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={hideLabel ? label : undefined} className={`${FIELD} appearance-none pr-8`}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {/* The disclosure glyph of a native select: it carries meaning, so it stays. */}
      <ChevronDown className="w-4 h-4 absolute right-0 top-1/2 -translate-y-1/2 text-hx-text2 pointer-events-none" strokeWidth={1.5} aria-hidden />
    </div>
  );
  if (hideLabel) return <div className={className}>{control}</div>;
  return (
    <Field label={label} htmlFor={id} hint={hint} className={className}>
      {control}
    </Field>
  );
}

/** A labelled word choice: the SegmentedControl's words on a hairline. */
export function Words<T extends string>({ label, ariaLabel, value, options, onChange, hint, size }: { label: string; ariaLabel?: string; value: T; options: Array<SegmentedOption<T>>; onChange: (v: T) => void; hint?: ReactNode; size?: 'sm' | 'md' }) {
  return (
    <Field label={label} hint={hint}>
      <SegmentedControl<T> options={options} value={value} onChange={onChange} ariaLabel={ariaLabel ?? label} size={size} className="w-full" />
    </Field>
  );
}

export function TimeField({ label, value, onChange, hint, className = '' }: { label: string; value: string; onChange: (v: string) => void; hint?: ReactNode; className?: string }) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint} className={className}>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(e) => {
          const v = normalizeHHMM(e.target.value);
          if (v) onChange(v);
        }}
        className={FIELD}
      />
    </Field>
  );
}

export function DateField({ label, value, onChange, hint, max, className = '' }: { label: string; value: string | undefined; onChange: (v: string | undefined) => void; hint?: ReactNode; max?: string; className?: string }) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint} className={className}>
      <input
        id={id}
        type="date"
        value={value ?? ''}
        max={max}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '') onChange(undefined);
          else if (isISODate(v)) onChange(v);
        }}
        className={FIELD}
      />
    </Field>
  );
}

/**
 * A switch: a rule-outlined 44 by 24 track with a square thumb that slides,
 * and the state as a word beside it. Off is a text2 thumb at the left of a
 * text2 rule; on is a bone thumb at the right of a bone rule. Position, the
 * word and `aria-checked` all carry the state; nothing is coloured. The label
 * names the control through `htmlFor`, so the accessible name is the label.
 */
export function Toggle({ label, checked, onChange, hint, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1 py-[11px]">
        <label htmlFor={id} className="hx-body block">
          {label}
        </label>
        {hint && <p className="hx-cap mt-0.5">{hint}</p>}
      </div>
      <button id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className="shrink-0 h-11 -mr-1 px-1 inline-flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed">
        <span className="hx-label w-6 text-right" aria-hidden>
          {checked ? 'On' : 'Off'}
        </span>
        <span className={`relative block w-11 h-6 rounded-ctl border ${checked ? 'border-hx-text' : 'border-hx-text2'}`} aria-hidden>
          <span className={`absolute top-[3px] left-[3px] w-4 h-4 transition-transform duration-150 motion-reduce:transition-none ${checked ? 'translate-x-5 bg-hx-text' : 'translate-x-0 bg-hx-text2'}`} />
        </span>
      </button>
    </div>
  );
}
