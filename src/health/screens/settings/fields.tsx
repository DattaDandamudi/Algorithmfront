/**
 * Settings form primitives (SPEC §5, DESIGN.md material system).
 *
 * Every component here is declared at module level so React never remounts a
 * control between keystrokes — an input that loses focus while typing is the
 * one bug the Settings screen must not have. Numeric fields keep a local
 * string draft and commit on blur / Enter after validation, so half-typed
 * values never reach the store and out-of-range values are explained inline
 * instead of being clamped silently. Text fields are bound straight to the
 * store (the writer debounces the localStorage flush).
 *
 * This is also the Settings screen's whole visual vocabulary: restyle a
 * primitive here and all twelve sections follow. The materials are the ones in
 * DESIGN.md and nothing is hand-rolled — a section is an `.hx-card` tile, the
 * header of the section you are acting on is `.hx-raised`, inputs are wells
 * (health.css does that globally), a toggle is a raised thumb on a well track,
 * numerals are in the display face, and labels are sentence case at 13 px.
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

/**
 * One span-2 tile in the Settings bento. Closed it is a plain `.hx-card` row —
 * title, one-line summary, chevron. Open, the same tile grows its form and its
 * header row lifts to `.hx-raised`, because that header is the control you are
 * currently acting on. Content unmounts while collapsed (drafts are cheap to
 * rebuild). The button's accessible name starts with the section title, which
 * is how both the tests and the deep links find it.
 */
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
    <section ref={ref} className="hx-card hx-span-2 overflow-hidden scroll-mt-16" aria-labelledby={headId}>
      <h2 id={headId} className="m-0">
        {/* Open, the header slab is raised glass: square-cornered (the tile's own radius clips it) with only its bottom bezel left. */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={() => setOpen((o) => !o)}
          className={`hx-press w-full min-h-[64px] flex items-center gap-3 px-4 py-3 text-left ${open ? 'hx-raised !rounded-none !border-x-0 !border-t-0 !border-b-hx-border' : 'hover:bg-hx-card2/50 transition-colors'}`}
        >
          {icon && <span className="hx-well !rounded-ctl w-9 h-9 shrink-0 inline-flex items-center justify-center text-hx-text2 [&>svg]:w-[18px] [&>svg]:h-[18px]">{icon}</span>}
          <span className="flex-1 min-w-0">
            <span className="hx-display block text-[17px] leading-6 font-semibold text-hx-text">{title}</span>
            {caption && <span className="block text-[13px] leading-[18px] text-hx-muted truncate">{caption}</span>}
          </span>
          <ChevronDown className={`w-5 h-5 shrink-0 text-hx-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </h2>
      {open && (
        <div id={bodyId} className="px-4 pb-4 pt-4 flex flex-col gap-4">
          {children}
        </div>
      )}
    </section>
  );
}

export function Field({ label, htmlFor, hint, error, children, className = '' }: { label: string; htmlFor?: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={htmlFor} className="hx-label">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[13px] leading-[18px] text-hx-red" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] leading-[18px] text-hx-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** Explanatory copy inside a section — body text, so 15/22 (DESIGN.md "Type"). */
export function Note({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-[15px] leading-[22px] text-hx-text2 ${className}`}>{children}</p>;
}

/** A tile's own sub-heading: display face, 15/20, sentence case. */
export function SubHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-7">
      <h3 className="hx-display text-[15px] leading-5 font-semibold text-hx-text">{children}</h3>
      {action}
    </div>
  );
}

/** A state word in its own tone wash: sentence case, 13 px, no letter-spacing. */
export function Pill({ tone, children, className = '' }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center h-7 px-2.5 rounded-full text-[13px] leading-[18px] font-medium whitespace-nowrap ${bandSoftBg(tone)} ${bandText(tone)} ${className}`}>{children}</span>;
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
        className={`hx-display ${CONTROL} ${unit ? 'pr-14' : ''} ${error ? '!border-hx-red' : ''}`}
      />
      {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] leading-[18px] text-hx-muted pointer-events-none">{unit}</span>}
    </div>
  );

  if (hideLabel) {
    return (
      <div className={className}>
        {control}
        {error && (
          <p className="mt-1 text-[13px] leading-[18px] text-hx-red" role="alert">
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

/**
 * A switch: a raised thumb sliding on a well track. Off is a glass knob sunk
 * at the left of a dark track; on lights the track and turns the knob to lume.
 * Position, the lit track and `aria-checked` all carry the state — never a hue
 * on its own, and nothing decorative is coloured (DESIGN.md "the accent is light").
 */
export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 min-h-[44px]">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[15px] leading-[22px] text-hx-text">
          {label}
        </label>
        {hint && <p className="text-[13px] leading-[18px] text-hx-muted">{hint}</p>}
      </div>
      {/* 44 px hit area (h-11, side padding) around the 48×28 track (review R6-2). */}
      <button id={id} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="hx-press shrink-0 h-11 px-1 -mr-1 inline-flex items-center rounded-ctl">
        <span className="hx-well relative block w-12 h-7 rounded-full" aria-hidden>
          <span className={`absolute inset-0 rounded-full bg-hx-lume/15 transition-opacity ${checked ? 'opacity-100' : 'opacity-0'}`} />
          <span className={`hx-raised !absolute !rounded-full left-0 top-0.5 w-6 h-6 transition-transform ${checked ? 'translate-x-[22px] !bg-hx-lume' : 'translate-x-0.5'}`} />
        </span>
      </button>
    </div>
  );
}

/** Label + value line used in read-only summaries (storage, integrity, about). */
export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-hx-border/60 last:border-b-0">
      <span className="text-[13px] leading-[18px] text-hx-text2">{k}</span>
      <span className="hx-display text-[15px] leading-5 text-hx-text text-right">{v}</span>
    </div>
  );
}
