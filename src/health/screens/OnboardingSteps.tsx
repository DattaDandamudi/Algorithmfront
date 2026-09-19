/**
 * The four onboarding step forms, and the underline-field primitives they
 * are built from (DESIGN.md "Onboarding": underline fields, no cards).
 *
 * Every field writes straight to the store through the existing actions, the
 * way Settings does, so a step is "done" the moment it is filled and Back /
 * Continue never lose anything. Numbers keep a local string draft and commit
 * on blur / Enter after validation: half-typed values never reach the store
 * and an out-of-range value is explained in a red caption rather than clamped
 * silently. Word choices (sex, units, goal, level, wearable, on / off) are
 * SegmentedControls: words on a hairline, the chosen one underlined. Inputs
 * are underline fields by the kit's own rule; nothing here adds a border, a
 * ground or a radius to one.
 *
 * Every primitive is declared at module level so React never remounts a
 * control between keystrokes.
 */
import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { DEFAULT_PROFILE } from '../data/defaults';
import { useHealth } from '../data/store';
import type { HHMM, Profile, SessionType, Weekday } from '../data/types';
import { weekdayShort } from '../lib/dates';
import { fmt, kgToLb, lbToKg, round } from '../lib/format';
import { SegmentedControl, type SegmentedOption } from '../ui';
import type { OnboardingStepId } from './onboardingPlan';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** A .hx-label over its control, an optional caption (or error) beneath. */
function Field({ label, htmlFor, hint, error, children, className = '' }: { label: string; htmlFor?: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
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

const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur();
};

function TextField({ label, value, onChange, placeholder, hint, maxLength, autoComplete }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: ReactNode; maxLength?: number; autoComplete?: string }) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <input id={id} type="text" value={value} maxLength={maxLength} autoComplete={autoComplete} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onKeyDown={blurOnEnter} className="w-full px-0 leading-6" />
    </Field>
  );
}

const draftOf = (v: number | null, dp: number) => (v === null || Number.isNaN(v) ? '' : String(round(v, dp)));

interface NumberFieldProps {
  label: string;
  value: number | null;
  onCommit: (n: number) => void;
  /** When set, an emptied field clears the value instead of reverting. */
  onClear?: () => void;
  min?: number;
  max?: number;
  dp?: number;
  unit?: string;
  hint?: ReactNode;
  placeholder?: string;
}

function NumberField({ label, value, onCommit, onClear, min, max, dp = 0, unit, hint, placeholder }: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(() => draftOf(value, dp));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(draftOf(value, dp));
  }, [value, dp, editing]);

  const suffix = unit ? ` ${unit}` : '';
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
      setError(`Minimum is ${round(min, dp)}${suffix}.`);
      return;
    }
    if (max !== undefined && r > max) {
      setError(`Maximum is ${round(max, dp)}${suffix}.`);
      return;
    }
    setError(null);
    onCommit(r);
  };

  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <div className="flex items-baseline">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={draft}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onFocus={() => setEditing(true)}
          onBlur={commit}
          onKeyDown={blurOnEnter}
          className="min-w-0 flex-1 px-0 leading-6"
        />
        {unit && <span className="hx-unit shrink-0">{unit}</span>}
      </div>
    </Field>
  );
}

/** A labelled word choice: the SegmentedControl's words on a hairline. */
function Words<T extends string>({ label, value, options, onChange, hint }: { label: string; value: T; options: Array<SegmentedOption<T>>; onChange: (v: T) => void; hint?: ReactNode }) {
  return (
    <Field label={label} hint={hint}>
      <SegmentedControl<T> options={options} value={value} onChange={onChange} ariaLabel={label} className="w-full" />
    </Field>
  );
}

function SelectField<T extends string>({ label, value, options, onChange, className = '' }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={label} className="w-full appearance-none px-0 pr-8 leading-6">
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
}

function TimeField({ label, value, onChange }: { label: string; value: HHMM; onChange: (v: HHMM) => void }) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(e) => {
          // Browsers can emit '' or 'HH:MM:SS'; only a whole clock reading is kept.
          const m = /^(\d{2}:\d{2})/.exec(e.target.value);
          if (m) onChange(m[1] as HHMM);
        }}
        className="w-full px-0 leading-6"
      />
    </Field>
  );
}

const YES_NO: Array<SegmentedOption<'yes' | 'no'>> = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];
const ON_OFF: Array<SegmentedOption<'on' | 'off'>> = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const SEX: Array<SegmentedOption<Profile['sex']>> = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];
const UNITS: Array<SegmentedOption<Profile['units']>> = [
  { value: 'lb', label: 'lb' },
  { value: 'kg', label: 'kg' },
];
const PHASE: Array<SegmentedOption<Profile['goalPhase']>> = [
  { value: 'fat-loss', label: 'Fat loss' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'muscle-gain', label: 'Muscle gain' },
];
const LEVEL: Array<SegmentedOption<Profile['trainingLevel']>> = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];
const WEARABLE: Array<SegmentedOption<Profile['wearable']>> = [
  { value: 'whoop', label: 'WHOOP' },
  { value: 'other', label: 'Other' },
  { value: 'none', label: 'None' },
];
const SESSIONS: Array<{ value: SessionType; label: string }> = [
  { value: 'rest', label: 'Rest' },
  { value: 'upper', label: 'Upper' },
  { value: 'lower', label: 'Lower' },
  { value: 'push', label: 'Push' },
  { value: 'pull', label: 'Pull' },
  { value: 'legs', label: 'Legs' },
  { value: 'full', label: 'Full body' },
  { value: 'cardio', label: 'Cardio' },
];
/** Training weeks read Mon to Sun. */
const WEEK: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LONG: Record<Weekday, string> = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };
/** Session types that count as a lift day for carb cycling (mirrors engine/nutrition). */
const isLift = (s: SessionType) => s !== 'rest' && s !== 'cardio';

/** 180 cm reads as 5′11″. */
function feetInches(cm: number): string {
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn - ft * 12);
  return inch === 12 ? `${ft + 1}′0″` : `${ft}′${inch}″`;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function AboutStep() {
  const { state, actions } = useHealth();
  const p = state.settings.profile;
  const kg = p.units === 'kg';
  const shownWeight = kg ? round(lbToKg(p.weightLb), 1) : round(p.weightLb, 1);
  return (
    <>
      <TextField
        label="Name"
        value={p.name === DEFAULT_PROFILE.name ? '' : p.name}
        placeholder="Optional"
        maxLength={40}
        autoComplete="name"
        onChange={(name) => actions.updateProfile({ name: name.trim() ? name : DEFAULT_PROFILE.name })}
      />
      <div className="grid grid-cols-2 gap-x-6 gap-y-6">
        <NumberField label="Age" value={p.age} min={13} max={100} unit="yrs" onCommit={(age) => actions.updateProfile({ age })} />
        <NumberField
          label="Height"
          value={p.heightCm ?? null}
          min={120}
          max={230}
          unit="cm"
          placeholder="Optional"
          hint={p.heightCm ? feetInches(p.heightCm) : undefined}
          onCommit={(heightCm) => actions.updateProfile({ heightCm })}
          onClear={() => actions.updateProfile({ heightCm: undefined })}
        />
      </div>
      <Words<Profile['sex']> label="Sex" value={p.sex} options={SEX} onChange={(sex) => actions.updateProfile({ sex })} />
      <Words<Profile['units']>
        label="Units"
        value={p.units}
        options={UNITS}
        hint="For weights and loads on every page."
        onChange={(units) => {
          actions.updateProfile({ units });
          actions.updateTraining({ units });
        }}
      />
      <NumberField
        label="Weight"
        value={shownWeight}
        min={kg ? 30 : 66}
        max={kg ? 300 : 660}
        dp={1}
        unit={p.units}
        hint="The reference for protein and calorie math until your first weigh-in."
        onCommit={(n) => actions.updateProfile({ weightLb: round(kg ? kgToLb(n) : n, 1) })}
      />
    </>
  );
}

function GoalStep() {
  const { state, actions } = useHealth();
  const p = state.settings.profile;
  const t = state.settings.targets;
  const kg = lbToKg(p.weightLb);
  return (
    <>
      <Words<Profile['goalPhase']>
        label="Goal phase"
        value={p.goalPhase}
        options={PHASE}
        hint="Frames the coach's calorie advice and the weekly-rate band."
        onChange={(goalPhase) => actions.updateProfile({ goalPhase })}
      />
      <Words<Profile['trainingLevel']>
        label="Training level"
        value={p.trainingLevel}
        options={LEVEL}
        hint="Beginner is under a year of lifting, intermediate one to three, advanced three or more."
        onChange={(trainingLevel) => actions.updateProfile({ trainingLevel })}
      />
      <div className="grid grid-cols-2 gap-x-6 gap-y-6">
        <NumberField label="Calories" value={t.kcal} min={1000} max={6000} unit="kcal" onCommit={(kcal) => actions.updateTargets({ kcal })} />
        <NumberField label="Protein" value={t.protein} min={40} max={400} unit="g" hint={`${fmt(t.protein / kg, 1)} g per kg`} onCommit={(protein) => actions.updateTargets({ protein })} />
      </div>
    </>
  );
}

function WeekStep() {
  const { state, actions } = useHealth();
  const split = state.settings.profile.split;
  const t = state.settings.targets;
  const liftDays = WEEK.filter((w) => isLift(split[w])).length;
  const set = (w: Weekday, s: SessionType) => actions.updateProfile({ split: { ...split, [w]: s } });
  return (
    <>
      <p className="hx-cap">
        {liftDays} lift day{liftDays === 1 ? '' : 's'} a week. Lift days get {t.carbsLift[0]}–{t.carbsLift[1]} g carbs, rest and cardio days {t.carbsRest[0]}–{t.carbsRest[1]} g.
      </p>
      <ul className="m-0 p-0 list-none flex flex-col gap-2">
        {WEEK.map((w) => (
          <li key={w} className="flex items-center gap-4 min-h-11">
            <span className="hx-label w-14 shrink-0">{weekdayShort(w)}</span>
            <SelectField<SessionType> label={`${WEEKDAY_LONG[w]} session`} value={split[w]} options={SESSIONS} onChange={(s) => set(w, s)} className="flex-1 min-w-0" />
          </li>
        ))}
      </ul>
    </>
  );
}

function SignalsStep() {
  const { state, actions } = useHealth();
  const p = state.settings.profile;
  const checkIn = state.settings.checkIn;
  return (
    <>
      <Words<Profile['wearable']>
        label="Wearable"
        value={p.wearable}
        options={WEARABLE}
        hint="With WHOOP the readiness score mirrors recovery; otherwise it reads your HRV band from what you log."
        onChange={(wearable) => actions.updateProfile({ wearable })}
      />
      <div className="grid grid-cols-2 gap-x-6 gap-y-6">
        <TimeField label="Bed target" value={p.bedTarget} onChange={(bedTarget) => actions.updateProfile({ bedTarget })} />
        <TimeField label="Wake target" value={p.wakeTarget} onChange={(wakeTarget) => actions.updateProfile({ wakeTarget })} />
      </div>
      <Words<'on' | 'off'>
        label="Morning check-in"
        value={checkIn.enabled ? 'on' : 'off'}
        options={ON_OFF}
        hint="Four 1 to 7 ratings on Today each morning: sleep, fatigue, stress, soreness."
        onChange={(v) => actions.setSettings((s) => ({ ...s, checkIn: { ...s.checkIn, enabled: v === 'on' } }))}
      />
      <Words<'yes' | 'no'>
        label="Quitting tobacco"
        value={p.tobaccoQuitting ? 'yes' : 'no'}
        options={YES_NO}
        hint="Turns on the tobacco row, its streaks and the HRV feedback."
        onChange={(v) => actions.updateProfile({ tobaccoQuitting: v === 'yes' })}
      />
      {p.tobaccoQuitting && (
        <NumberField
          label="Baseline a day"
          value={p.tobaccoBaselinePerDay ?? null}
          min={0}
          max={60}
          placeholder="Optional"
          hint="Your usual count before cutting back; the coach uses it for context."
          onCommit={(tobaccoBaselinePerDay) => actions.updateProfile({ tobaccoBaselinePerDay })}
          onClear={() => actions.updateProfile({ tobaccoBaselinePerDay: undefined })}
        />
      )}
    </>
  );
}

/** The form for one step; the screen owns the running head, the lede and the keys. */
export default function OnboardingStep({ id }: { id: OnboardingStepId }) {
  switch (id) {
    case 'about':
      return <AboutStep />;
    case 'goal':
      return <GoalStep />;
    case 'week':
      return <WeekStep />;
    case 'signals':
      return <SignalsStep />;
  }
}
