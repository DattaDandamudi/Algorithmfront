/**
 * Settings §2 — Targets (SPEC §6 constants, all editable with validation).
 *
 * Cross-field rules enforced here, not clamped silently:
 *   • fat floor ≥ 40 g and ≤ fat target (§6.5: "never recommend below the floor")
 *   • range lows ≤ highs (carbs lift/rest, steps, weekly-rate band)
 *   • EWMA α 0.10–0.25 (§6.1: 0.10 ≈ 20-day smoothing; higher tracks faster)
 * Sleep baseline, bed/wake targets and caffeine cutoff live on the profile
 * (data contract) but are edited here because they are targets to the user.
 */
import { RotateCcw } from 'lucide-react';
import { DEFAULT_PROFILE, DEFAULT_TARGETS } from '../../data/defaults';
import { useHealth } from '../../data/store';
import { fmt, lbToKg, round } from '../../lib/format';
import { Button, toast } from '../../ui';
import { useConfirm } from './confirm';
import { Field, Note, NumberField, SubHeading, TimeField } from './fields';

export default function TargetsSection() {
  const { state, actions } = useHealth();
  const confirm = useConfirm();
  const t = state.settings.targets;
  const p = state.settings.profile;
  const kg = lbToKg(p.weightLb);
  const units = p.units;
  const rateLb = (pct: number) => (pct / 100) * p.weightLb;
  const rateText = (pct: number) => (units === 'kg' ? `${fmt(lbToKg(rateLb(pct)), 2)} kg` : `${fmt(rateLb(pct), 2)} lb`);

  const reset = async () => {
    const ok = await confirm({
      title: 'Reset targets to defaults?',
      body: `Restores the spec defaults: ${DEFAULT_TARGETS.kcal} kcal, ${DEFAULT_TARGETS.protein} g protein, ${DEFAULT_TARGETS.fatFloor}–${DEFAULT_TARGETS.fatTarget} g fat, carbs ${DEFAULT_TARGETS.carbsLift.join('–')} lift / ${DEFAULT_TARGETS.carbsRest.join('–')} rest, ${DEFAULT_TARGETS.fiber} g fiber, ${DEFAULT_TARGETS.stepsMin.toLocaleString()}–${DEFAULT_TARGETS.stepsMax.toLocaleString()} steps, α ${DEFAULT_TARGETS.ewmaAlpha}, bed ${DEFAULT_PROFILE.bedTarget}. Your current edits are replaced.`,
      confirmLabel: 'Reset',
    });
    if (!ok) return;
    actions.updateTargets({ ...DEFAULT_TARGETS });
    actions.updateProfile({
      sleepBaselineHrs: DEFAULT_PROFILE.sleepBaselineHrs,
      bedTarget: DEFAULT_PROFILE.bedTarget,
      wakeTarget: DEFAULT_PROFILE.wakeTarget,
      caffeineCutoff: DEFAULT_PROFILE.caffeineCutoff,
    });
    toast('Targets reset to defaults');
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 -mt-1">
        <Note>Validated on blur; nothing saves until a value passes.</Note>
        <Button variant="ghost" size="sm" icon={<RotateCcw aria-hidden />} onClick={reset}>
          Reset
        </Button>
      </div>

      <SubHeading>Energy & protein</SubHeading>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Calories" value={t.kcal} min={1000} max={6000} step={50} unit="kcal" onCommit={(kcal) => actions.updateTargets({ kcal })} />
        <NumberField label="Protein" value={t.protein} min={40} max={400} step={5} unit="g" hint={`${fmt(t.protein / kg, 1)} g/kg`} onCommit={(protein) => actions.updateTargets({ protein })} />
      </div>

      <SubHeading>Fat</SubHeading>
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Fat target"
          value={t.fatTarget}
          min={40}
          max={300}
          step={5}
          unit="g"
          validate={(n) => (n < t.fatFloor ? `Must be ≥ the ${t.fatFloor} g floor.` : null)}
          hint={`${round((t.fatTarget * 9 * 100) / t.kcal)}% of kcal`}
          onCommit={(fatTarget) => actions.updateTargets({ fatTarget })}
        />
        <NumberField
          label="Fat floor"
          value={t.fatFloor}
          min={40}
          max={300}
          step={5}
          unit="g"
          validate={(n) => (n > t.fatTarget ? `Cannot exceed the ${t.fatTarget} g target.` : null)}
          hint={`${fmt(t.fatFloor / kg, 2)} g/kg · never below 40`}
          onCommit={(fatFloor) => actions.updateTargets({ fatFloor })}
        />
      </div>
      <Note>The floor is a hard limit: calorie adjustments never push fat below it (protects testosterone and fat-soluble vitamin absorption).</Note>

      <SubHeading>Carbs (day-type cycling)</SubHeading>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Lift day min" value={t.carbsLift[0]} min={0} max={800} step={5} unit="g" validate={(n) => (n > t.carbsLift[1] ? `Must be ≤ ${t.carbsLift[1]} g.` : null)} onCommit={(n) => actions.updateTargets({ carbsLift: [n, t.carbsLift[1]] })} />
        <NumberField label="Lift day max" value={t.carbsLift[1]} min={0} max={800} step={5} unit="g" validate={(n) => (n < t.carbsLift[0] ? `Must be ≥ ${t.carbsLift[0]} g.` : null)} onCommit={(n) => actions.updateTargets({ carbsLift: [t.carbsLift[0], n] })} />
        <NumberField label="Rest day min" value={t.carbsRest[0]} min={0} max={800} step={5} unit="g" validate={(n) => (n > t.carbsRest[1] ? `Must be ≤ ${t.carbsRest[1]} g.` : null)} onCommit={(n) => actions.updateTargets({ carbsRest: [n, t.carbsRest[1]] })} />
        <NumberField label="Rest day max" value={t.carbsRest[1]} min={0} max={800} step={5} unit="g" validate={(n) => (n < t.carbsRest[0] ? `Must be ≥ ${t.carbsRest[0]} g.` : null)} onCommit={(n) => actions.updateTargets({ carbsRest: [t.carbsRest[0], n] })} />
      </div>

      <SubHeading>Fiber, steps, water</SubHeading>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Fiber" value={t.fiber} min={10} max={100} unit="g" onCommit={(fiber) => actions.updateTargets({ fiber })} />
        <NumberField
          label="Water"
          value={t.waterMlPerKg}
          min={20}
          max={60}
          unit="ml/kg"
          hint={`≈ ${fmt((t.waterMlPerKg * kg) / 1000, 1)} L · ${Math.round((t.waterMlPerKg * kg) / 250)} cups`}
          onCommit={(waterMlPerKg) => actions.updateTargets({ waterMlPerKg })}
        />
        <NumberField label="Steps min" value={t.stepsMin} min={1000} max={50000} step={500} validate={(n) => (n > t.stepsMax ? `Must be ≤ ${t.stepsMax.toLocaleString()}.` : null)} onCommit={(stepsMin) => actions.updateTargets({ stepsMin })} />
        <NumberField label="Steps max" value={t.stepsMax} min={1000} max={50000} step={500} validate={(n) => (n < t.stepsMin ? `Must be ≥ ${t.stepsMin.toLocaleString()}.` : null)} onCommit={(stepsMax) => actions.updateTargets({ stepsMax })} />
      </div>

      <SubHeading>Weight trend</SubHeading>
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Rate band min"
          value={t.weeklyRatePct[0]}
          min={0.1}
          max={2}
          step={0.05}
          dp={2}
          unit="%/wk"
          hint={rateText(t.weeklyRatePct[0]) + '/wk'}
          validate={(n) => (n > t.weeklyRatePct[1] ? `Must be ≤ ${t.weeklyRatePct[1]}%.` : null)}
          onCommit={(n) => actions.updateTargets({ weeklyRatePct: [n, t.weeklyRatePct[1]] })}
        />
        <NumberField
          label="Rate band max"
          value={t.weeklyRatePct[1]}
          min={0.1}
          max={2}
          step={0.05}
          dp={2}
          unit="%/wk"
          hint={rateText(t.weeklyRatePct[1]) + '/wk'}
          validate={(n) => (n < t.weeklyRatePct[0] ? `Must be ≥ ${t.weeklyRatePct[0]}%.` : null)}
          onCommit={(n) => actions.updateTargets({ weeklyRatePct: [t.weeklyRatePct[0], n] })}
        />
      </div>
      <Field label={`EWMA smoothing α = ${t.ewmaAlpha.toFixed(2)}`} htmlFor="hx-alpha" hint="0.10 ≈ 20-day smoothing (Hacker's Diet default) — higher tracks faster but shows more water-weight noise. Changing α recomputes every trend point.">
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-hx-muted w-8">0.10</span>
          <input
            id="hx-alpha"
            type="range"
            min={0.1}
            max={0.25}
            step={0.01}
            value={t.ewmaAlpha}
            onChange={(e) => actions.updateTargets({ ewmaAlpha: round(Number(e.target.value), 2) })}
            className="flex-1 h-11 accent-[var(--hx-blue)] !border-0 !bg-transparent"
            aria-valuetext={`${t.ewmaAlpha.toFixed(2)}`}
          />
          <span className="text-[12px] text-hx-muted w-8 text-right">0.25</span>
        </div>
      </Field>

      <SubHeading>Meals & sleep</SubHeading>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Meals per day" value={t.mealsPerDay} min={2} max={8} hint={`${round(t.protein / t.mealsPerDay)} g protein each`} onCommit={(mealsPerDay) => actions.updateTargets({ mealsPerDay })} />
        <NumberField label="Sleep baseline" value={p.sleepBaselineHrs} min={5} max={10} step={0.25} dp={2} unit="h" hint="Before strain / debt adjustments" onCommit={(sleepBaselineHrs) => actions.updateProfile({ sleepBaselineHrs })} />
        <TimeField label="Bedtime target" value={p.bedTarget} onChange={(bedTarget) => actions.updateProfile({ bedTarget })} />
        <TimeField label="Wake target" value={p.wakeTarget} onChange={(wakeTarget) => actions.updateProfile({ wakeTarget })} />
      </div>
      <TimeField label="Caffeine cutoff" value={p.caffeineCutoff} hint="Caffeine logged after this time triggers the deep-sleep nudge (≈ 8–10 h before bed)." onChange={(caffeineCutoff) => actions.updateProfile({ caffeineCutoff })} />
    </>
  );
}
