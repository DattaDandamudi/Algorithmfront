/**
 * Macro remaining bars — SPEC §1 #4: protein first, then carbs with the
 * day-type range (150–175 g lift / 70–100 g rest, §6.5), then fat with the
 * 60 g floor marker (Whittaker & Wu 2021), then fiber to 30 g. Values are the
 * engine's `nutrition.totals` / `nutrition.targets`, so the bars agree with the
 * tiles and the coach. With no meals logged the section is the §1 empty
 * state: "Log your first meal to see protein remaining."
 *
 * Bar tone follows STATE, never a fixed series hue (§0 "one semantic colour
 * per state", review R1-13):
 *  - protein: green while on pace (per-meal need ≤ the 0.55 g/kg ceiling, or
 *    the target is hit — the engine's `onPace` rule), else neutral;
 *  - carbs: blue (informational — a range, not a pass/fail);
 *  - fat: yellow below the 60 g floor, red when it is late and still below
 *    (no meal slots left or past FAT_LATE_HHMM), green once the floor is met;
 *  - fiber: neutral until the 30 g target is hit, then green.
 */
import { UtensilsCrossed } from 'lucide-react';
import type { CoachContext } from '../../data/types';
import { PROTEIN_PER_MEAL_GKG } from '../../engine';
import { hhmmToMinutes } from '../../lib/dates';
import { lbToKg, round } from '../../lib/format';
import { EmptyState, MacroBar, SectionHeader, type Tone } from '../../ui';

/** After this time a fat shortfall is unlikely to be closed — the floor bar turns red. */
export const FAT_LATE_HHMM = '20:00';

export interface MacroSectionProps {
  ctx: CoachContext;
  /** Reference body weight (lb) for the per-meal protein ceiling on legacy contexts without `maxPerMeal`. */
  bodyWeightLb: number;
  emptyText?: string;
  onLogMeal: () => void;
}

export interface MacroTones {
  protein: Tone;
  carbs: Tone;
  fat: Tone;
  fiber: Tone;
}

/** Pure tone rules (exported for tests). */
export function macroTones(n: CoachContext['nutrition'], nowHHMM: string, bodyWeightLb: number): MacroTones {
  const maxPerMeal = typeof n.maxPerMeal === 'number' ? n.maxPerMeal : round(PROTEIN_PER_MEAL_GKG[1] * lbToKg(bodyWeightLb));
  const per = n.proteinPerMealNeeded;
  const proteinOnPace = per === null ? n.remaining.p <= 0 : per <= maxPerMeal;
  const now = hhmmToMinutes(nowHHMM);
  const cutoff = hhmmToMinutes(FAT_LATE_HHMM) ?? 20 * 60;
  const late = n.mealsLeft <= 0 || (now !== null && now >= cutoff);
  const fatBelow = n.totals.f < n.targets.fatFloor;
  return {
    protein: proteinOnPace ? 'green' : 'neutral',
    carbs: 'blue',
    fat: fatBelow ? (late ? 'red' : 'yellow') : 'green',
    fiber: n.totals.fi >= n.targets.fi ? 'green' : 'neutral',
  };
}

export default function MacroSection({ ctx, bodyWeightLb, emptyText, onLogMeal }: MacroSectionProps) {
  const { totals, targets, mealsLogged } = ctx.nutrition;
  const nothingLogged = mealsLogged <= 0 && totals.kc <= 0 && totals.p <= 0;
  const dayWord = ctx.dayType === 'lift' ? 'lift day' : 'rest day';
  const tone = macroTones(ctx.nutrition, ctx.nowHHMM, bodyWeightLb);

  return (
    <section className="px-4 pb-5 flex flex-col gap-3" aria-label="Macros remaining">
      <SectionHeader title="Macros remaining" caption={`Targets for a ${dayWord}`} />
      {nothingLogged ? (
        <EmptyState
          icon={<UtensilsCrossed />}
          title="No meals yet"
          hint={emptyText ?? 'Log your first meal to see protein remaining.'}
          action={{ label: 'Log a meal', onClick: onLogMeal }}
        />
      ) : (
        <div className="hx-card p-4 flex flex-col gap-4">
          <MacroBar label="Protein" value={totals.p} target={targets.p} color={tone.protein} />
          <MacroBar
            label={`Carbs · ${dayWord}`}
            value={totals.c}
            target={targets.carbsRange[1]}
            targetLabel={`${targets.carbsRange[0]}–${targets.carbsRange[1]}`}
            range={targets.carbsRange}
            color={tone.carbs}
          />
          <MacroBar label="Fat" value={totals.f} target={targets.f} floor={targets.fatFloor} color={tone.fat} />
          <MacroBar label="Fiber" value={totals.fi} target={targets.fi} color={tone.fiber} />
        </div>
      )}
    </section>
  );
}
