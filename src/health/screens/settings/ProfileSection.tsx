/**
 * Settings §1 — Profile & goals.
 *
 * Weights are stored in lb (data contract); `profile.units` only changes what
 * is displayed, so the reference-weight field converts on input with kgToLb
 * and shows the other unit as a hint. Tobacco fields live here too because
 * the coach prompt and the tobacco tile read them from the profile.
 */
import { useHealth } from '../../data/store';
import type { Profile } from '../../data/types';
import { fmt, kgToLb, lbToKg, round } from '../../lib/format';
import { SegmentedControl } from '../../ui';
import { Field, NumberField, Note, SelectField, SubHeading, TextField, Toggle } from './fields';

const SEX_OPTIONS: Array<{ value: Profile['sex']; label: string }> = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];
const LEVEL_OPTIONS: Array<{ value: Profile['trainingLevel']; label: string }> = [
  { value: 'beginner', label: 'Beginner (< 1 yr lifting)' },
  { value: 'intermediate', label: 'Intermediate (1–3 yrs)' },
  { value: 'advanced', label: 'Advanced (3+ yrs)' },
];
const PHASE_OPTIONS: Array<{ value: Profile['goalPhase']; label: string }> = [
  { value: 'fat-loss', label: 'Fat loss (moderate deficit)' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'muscle-gain', label: 'Muscle gain (lean surplus)' },
];
const WEARABLE_OPTIONS: Array<{ value: Profile['wearable']; label: string }> = [
  { value: 'whoop', label: 'WHOOP' },
  { value: 'other', label: 'Other (manual HRV/RHR)' },
  { value: 'none', label: 'None' },
];

/** 180 cm → 5′11″ */
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

      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Age" value={p.age} min={13} max={100} unit="yrs" onCommit={(age) => actions.updateProfile({ age })} />
        <SelectField label="Sex" value={p.sex} options={SEX_OPTIONS} onChange={(sex) => actions.updateProfile({ sex })} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Height"
          value={p.heightCm ?? null}
          min={120}
          max={230}
          unit="cm"
          placeholder="—"
          hint={p.heightCm ? feetInches(p.heightCm) : 'Optional'}
          onCommit={(heightCm) => actions.updateProfile({ heightCm })}
          onClear={() => actions.updateProfile({ heightCm: undefined })}
        />
        <NumberField
          label={`Reference weight`}
          value={shownWeight}
          min={kg ? 30 : 66}
          max={kg ? 300 : 660}
          step={kg ? 0.5 : 1}
          dp={1}
          unit={p.units}
          hint={`= ${otherWeight}`}
          onCommit={(n) => actions.updateProfile({ weightLb: round(kg ? kgToLb(n) : n, 1) })}
        />
      </div>
      <Note>Reference weight drives g/kg and %BW math when there's no weigh-in in the last 14 days. Stored in lb regardless of the display unit.</Note>

      <Field label="Units" hint="Display only — every stored weight stays in lb.">
        <SegmentedControl<Profile['units']>
          ariaLabel="Weight units"
          options={[
            { value: 'lb', label: 'lb' },
            { value: 'kg', label: 'kg' },
          ]}
          value={p.units}
          onChange={(units) => actions.updateProfile({ units })}
        />
      </Field>

      <SelectField label="Training level" value={p.trainingLevel} options={LEVEL_OPTIONS} onChange={(trainingLevel) => actions.updateProfile({ trainingLevel })} />
      <SelectField
        label="Goal phase"
        value={p.goalPhase}
        options={PHASE_OPTIONS}
        hint="Frames the coach's calorie advice and the weekly-rate target band."
        onChange={(goalPhase) => actions.updateProfile({ goalPhase })}
      />
      <SelectField label="Wearable" value={p.wearable} options={WEARABLE_OPTIONS} hint="With WHOOP the readiness ring mirrors recovery %; otherwise it uses your HRV band." onChange={(wearable) => actions.updateProfile({ wearable })} />

      <div className="pt-1 space-y-3">
        <SubHeading>Tobacco</SubHeading>
        <Toggle label="Quitting tobacco" checked={p.tobaccoQuitting} hint="Turns on the tobacco tile, streaks and HRV-vs-smoking feedback." onChange={(tobaccoQuitting) => actions.updateProfile({ tobaccoQuitting })} />
        <NumberField
          label="Baseline per day"
          value={p.tobaccoBaselinePerDay ?? null}
          min={0}
          max={60}
          unit="/day"
          placeholder="—"
          hint="Your typical count before cutting back; the coach uses it for context."
          onCommit={(tobaccoBaselinePerDay) => actions.updateProfile({ tobaccoBaselinePerDay })}
          onClear={() => actions.updateProfile({ tobaccoBaselinePerDay: undefined })}
        />
      </div>
    </>
  );
}
