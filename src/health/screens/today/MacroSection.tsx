/**
 * Macro remaining bars — SPEC §1 #4: protein first, then carbs with the
 * day-type range (150–175 g lift / 70–100 g rest, §6.5), then fat with the
 * 60 g floor marker (Whittaker & Wu 2021), then fiber to 30 g. Values are the
 * engine's `nutrition.totals` / `nutrition.targets`, so the bars agree with the
 * tiles and the coach. With no meals logged the section is the §1 empty
 * state: "Log your first meal to see protein remaining."
 */
import { UtensilsCrossed } from 'lucide-react';
import type { CoachContext } from '../../data/types';
import { EmptyState, MacroBar, SectionHeader } from '../../ui';

export interface MacroSectionProps {
  ctx: CoachContext;
  emptyText?: string;
  onLogMeal: () => void;
}

export default function MacroSection({ ctx, emptyText, onLogMeal }: MacroSectionProps) {
  const { totals, targets, mealsLogged } = ctx.nutrition;
  const nothingLogged = mealsLogged <= 0 && totals.kc <= 0 && totals.p <= 0;
  const dayWord = ctx.dayType === 'lift' ? 'lift day' : 'rest day';

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
          <MacroBar label="Protein" value={totals.p} target={targets.p} color="green" />
          <MacroBar
            label={`Carbs · ${dayWord}`}
            value={totals.c}
            target={targets.carbsRange[1]}
            targetLabel={`${targets.carbsRange[0]}–${targets.carbsRange[1]}`}
            range={targets.carbsRange}
            color="blue"
          />
          <MacroBar label="Fat" value={totals.f} target={targets.f} floor={targets.fatFloor} color="yellow" />
          <MacroBar label="Fiber" value={totals.fi} target={targets.fi} color="neutral" />
        </div>
      )}
    </section>
  );
}
