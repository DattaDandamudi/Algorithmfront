/**
 * Settings form primitives (SPEC §5).
 *
 * Every component here is declared at module level so React never remounts a
 * control between keystrokes — an input that loses focus while typing is the
 * one bug the Settings screen must not have. Numeric fields keep a local
 * string draft and commit on blur / Enter after validation, so half-typed
 * values never reach the store and out-of-range values are explained inline
 * instead of being clamped silently. Text fields are bound straight to the
 * store (the writer debounces the localStorage flush).
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { round } from '../../lib/format';
import { bandSoftBg, bandText, type Tone } from '../../ui';
import { isISODate, normalizeHHMM } from './util';

export const CONTROL = 'h-11 w-full px-3 text-[15px] leading-5';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface SectionProps {
  id: string;
  title: string;
  icon?: ReactNode;
  /** One-line live summary shown under the title while collapsed and open. */
  caption?: string;
  defaultOpen?: boolean;
  /** Set (to a fresh nonce) to open the card and scroll it into view — the Settings deep link. */
  openSignal?: number;
  children: ReactNode;
}

/** Collapsible `hx-card`. Content unmounts while collapsed (drafts are cheap to rebuild). */
export function Section({ id, title, icon, caption, defaultOpen = false, openSignal, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLElement>(null);
  const bodyId = `${id}-body`;
  const headId = `${id}-heading`;
  // Deep link (nav.openSettings(section)): expand and bring the card into view. A
  // changed nonce re-fires even when the card is already mounted (review R2-10).
  useEffect(() => {
    if (!openSignal) return;
    setOpen(true);
    const el = ref.current;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [openSignal]);
  return (
    <section ref={ref} className="hx-card overflow-hidden scroll-mt-16" aria-labelledby={headId}>
      <h2 id={headId} className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={() => setOpen((o) => !o)}
          className="w-full min-h-[60px] flex items-center gap-3 px-4 py-3 text-left hover:bg-hx-card2/60 transition-colors"
        >
          {icon && <span className="w-9 h-9 shrink-0 rounded-xl bg-hx-card2 border border-hx-border inline-flex items-center justify-center text-hx-text2 [&>svg]:w-[18px] [&>svg]:h-[18px]">{icon}</span>}
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold leading-5 text-hx-text">{title}</span>
            {caption && <span className="block text-[12px] leading-4 text-hx-muted truncate mt-0.5">{caption}</span>}
          </span>
          <ChevronDown className={`w-5 h-5 shrink-0 text-hx-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </h2>
      {open && (
        <div id={bodyId} className="px-4 pb-4 pt-4 space-y-4 border-t border-hx-border">
          {children}
        </div>
      )}
    </section>
  );
}

export function Field({ label, htmlFor, hint, error, children, className = '' }: { label: string; htmlFor?: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="hx-label">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12px] leading-4 text-hx-red" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] leading-4 text-hx-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** Muted paragraph for explanatory copy inside a section. */
export function Note({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-[13px] leading-5 text-hx-text2 ${className}`}>{children}</p>;
}

/** `.hx-label` sub-heading inside a section body. */
export function SubHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-6">
      <h3 className="hx-label">{children}</h3>
      {action}
    </div>
  );
}

export function Pill({ tone, children, className = '' }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center h-6 px-2 rounded-full text-[11px] font-semibold uppercase tracking-wide ${bandSoftBg(tone)} ${bandText(tone)} ${className}`}>{children}</span>;
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
}

const draftOf = (v: number | null | undefined, dp: number) => (v === null || v === undefined || !Number.isFinite(v) ? '' : String(round(v, dp)));

export function NumberField({ label, value, onCommit, onClear, min, max, step = 1, dp = 0, unit, hint, placeholder, validate, disabled, className = '', hideLabel }: NumberFieldProps) {
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
    <div className="relative">
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
        className={`${CONTROL} ${unit ? 'pr-14' : ''} ${error ? 'border-hx-red' : ''}`}
      />
      {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-hx-muted pointer-events-none">{unit}</span>}
    </div>
  );

  if (hideLabel) {
    return (
      <div className={className}>
        {control}
        {error && (
          <p className="mt-1 text-[12px] leading-4 text-hx-red" role="alert">
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
  /** Node rendered to the right of the input (e.g. a Clear button). */
  trailing?: ReactNode;
  className?: string;
}

export function TextField({ label, value, onChange, hint, placeholder, type = 'text', multiline, rows = 3, maxLength, autoComplete = 'off', spellCheck, trailing, className = '' }: TextFieldProps) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint} className={className}>
      <div className="flex items-start gap-2">
        {multiline ? (
          <textarea id={id} value={value} rows={rows} maxLength={maxLength} placeholder={placeholder} spellCheck={spellCheck} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2.5 text-[15px] leading-5 min-h-[44px] resize-y" />
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
            className={`${CONTROL} min-w-0 flex-1`}
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
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={hideLabel ? label : undefined} className={`${CONTROL} appearance-none pr-9`}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-hx-muted pointer-events-none" aria-hidden />
    </div>
  );
  if (hideLabel) return <div className={className}>{control}</div>;
  return (
    <Field label={label} htmlFor={id} hint={hint} className={className}>
      {control}
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
        className={CONTROL}
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
        className={CONTROL}
      />
    </Field>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 min-h-[44px]">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[15px] text-hx-text">
          {label}
        </label>
        {hint && <p className="text-[12px] leading-4 text-hx-muted">{hint}</p>}
      </div>
      {/* 44 px hit area (h-11, side padding) around the 48×28 track (review R6-2). */}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="shrink-0 h-11 px-1 -mr-1 inline-flex items-center rounded-xl"
      >
        <span className={`relative block w-12 h-7 rounded-full border transition-colors ${checked ? 'bg-hx-green/80 border-hx-green' : 'bg-hx-card2 border-hx-border'}`} aria-hidden>
          <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-hx-text shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
        </span>
      </button>
    </div>
  );
}

/** Label + value line used in read-only summaries (storage, integrity, about). */
export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-hx-border/60 last:border-b-0">
      <span className="text-[13px] text-hx-text2">{k}</span>
      <span className="text-[13px] text-hx-text text-right">{v}</span>
    </div>
  );
}
