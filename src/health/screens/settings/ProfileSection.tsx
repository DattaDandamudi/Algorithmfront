/**
 * Settings §1 — Profile & goals.
 *
 * Weights are stored in lb (data contract); `profile.units` only changes what
 * is displayed, so the reference-weight field converts on input with kgToLb
 * and shows the other unit as a caption. Tobacco fields live here too because
 * the coach prompt and the tobacco row read them from the profile.
 */
import { useHealth } from '../../data/store';
import type { Profile } from '../../data/types';
import { fmt, kgToLb, lbToKg, round } from '../../lib/format';
import { NumberField, Note, SelectField, SubHeading, TextField, Toggle, Words } from './fields';

const SEX_OPTIONS: Array<{ value: Profile['sex']; label: string }> = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];
const LEVEL_OPTIONS: Array<{ value: Profile['trainingLevel']; label: string }> = [
  { value: 'beginner', label: 'Beginner (under a year lifting)' },
  { value: 'intermediate', label: 'Intermediate (1 to 3 years)' },
  { value: 'advanced', label: 'Advanced (3 or more years)' },
];
const PHASE_OPTIONS: Array<{ value: Profile['goalPhase']; label: string }> = [
  { value: 'fat-loss', label: 'Fat loss (moderate deficit)' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'muscle-gain', label: 'Muscle gain (lean surplus)' },
];
const WEARABLE_OPTIONS: Array<{ value: Profile['wearable']; label: string }> = [
  { value: 'whoop', label: 'WHOOP' },
  { value: 'other', label: 'Other (manual HRV and RHR)' },
  { value: 'none', label: 'None' },
];
const UNIT_OPTIONS: Array<{ value: Profile['units']; label: string }> = [
  { value: 'lb', label: 'lb' },
  { value: 'kg', label: 'kg' },
];

/** 180 cm reads as 5′11″. */
function feetInches(cm: number): string {
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn - ft * 12);
  return inch === 12 ? `${ft + 1}′0″` : `${ft}′${inch}″`;
}

export default function ProfileSection() {
  const { state, actions } = useHealth();
  const p = state.settings.profile;
  const kg = p.units === 'kg';
  const shownWeight = kg ? round(lbToKg(p.weightLb), 1) : round(p.weightLb, 1);
  const otherWeight = kg ? `${fmt(p.weightLb, 1)} lb` : `${fmt(lbToKg(p.weightLb), 1)} kg`;

  return (
    <>
      <TextField label="Name" value={p.name} maxLength={40} autoComplete="name" onChange={(name) => actions.updateProfile({ name })} />

      <div className="grid grid-cols-2 gap-x-6 gap-y-6">
        <NumberField label="Age" value={p.age} min={13} max={100} unit="yrs" onCommit={(age) => actions.updateProfile({ age })} />
        <SelectField label="Sex" value={p.sex} options={SEX_OPTIONS} onChange={(sex) => actions.updateProfile({ sex })} />
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-6">
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
        <NumberField
          label="Reference weight"
          value={shownWeight}
          min={kg ? 30 : 66}
          max={kg ? 300 : 660}
          step={kg ? 0.5 : 1}
          dp={1}
          unit={p.units}
          hint={otherWeight}
          onCommit={(n) => actions.updateProfile({ weightLb: round(kg ? kgToLb(n) : n, 1) })}
        />
      </div>
      <Note>Reference weight drives the g/kg and % of body weight math when there is no weigh-in in the last 14 days. It is stored in lb whatever the display unit.</Note>

      <Words<Profile['units']> label="Units" ariaLabel="Weight units" options={UNIT_OPTIONS} value={p.units} hint="Display only; every stored weight stays in lb." onChange={(units) => actions.updateProfile({ units })} />

      <SelectField label="Training level" value={p.trainingLevel} options={LEVEL_OPTIONS} onChange={(trainingLevel) => actions.updateProfile({ trainingLevel })} />
      <SelectField
        label="Goal phase"
        value={p.goalPhase}
        options={PHASE_OPTIONS}
        hint="Frames the coach's calorie advice and the weekly-rate target band."
        onChange={(goalPhase) => actions.updateProfile({ goalPhase })}
      />
      <SelectField label="Wearable" value={p.wearable} options={WEARABLE_OPTIONS} hint="With WHOOP the readiness score mirrors recovery; otherwise it reads your HRV band." onChange={(wearable) => actions.updateProfile({ wearable })} />

      <SubHeading title="Tobacco" />
      <Toggle label="Quitting tobacco" checked={p.tobaccoQuitting} hint="Turns on the tobacco row, its streaks and the HRV feedback." onChange={(tobaccoQuitting) => actions.updateProfile({ tobaccoQuitting })} />
      <NumberField
        label="Baseline per day"
        value={p.tobaccoBaselinePerDay ?? null}
        min={0}
        max={60}
        placeholder="Optional"
        hint="Your usual count before cutting back; the coach uses it for context."
        onCommit={(tobaccoBaselinePerDay) => actions.updateProfile({ tobaccoBaselinePerDay })}
        onClear={() => actions.updateProfile({ tobaccoBaselinePerDay: undefined })}
      />
    </>
  );
}
