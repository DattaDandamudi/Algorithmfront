/**
 * MealsList — today's entries grouped by eating occasion (INTEGRATION_NOTES:
 * one entry per food item, grouped by clock time `t`), with per-entry edit and
 * delete, plus the running totals row (kcal, protein, fat, carbs, fiber vs
 * targets). AI-sourced entries (those carrying `conf`) also show their
 * `assumptions` as a subtitle — the whole row is the edit button, so tapping
 * it opens the editor (§9).
 *
 * These are READINGS, not controls, so the list and the totals are `.hx-card`
 * (DESIGN.md "Material system") inside one span-2 cell of the Log bento.
 *
 * Empty state uses the SPEC §1 copy: "Log your first meal to see protein
 * remaining."
 */
import { Pencil, Trash2, Utensils } from 'lucide-react';
import type { Macros, Meal } from '../../data/types';
import { confidenceBand } from '../../ai/foodLocal';
import { formatClock } from '../../lib/dates';
import { fmt, round } from '../../lib/format';
import { EmptyState, SectionHeader, bandText } from '../../ui';
import { groupMealsByTime } from './logUtils';

export interface MealsListProps {
  meals: Meal[];
  totals: Macros;
  targets: Macros;
  onEdit: (meal: Meal) => void;
  onDelete: (meal: Meal) => void;
  onLogFirst: () => void;
}

export default function MealsList({ meals, totals, targets, onEdit, onDelete, onLogFirst }: MealsListProps) {
  const groups = groupMealsByTime(meals);
  const occasions = groups.filter((g) => g.isOccasion).length;

  return (
    <section className="hx-span-2 flex flex-col gap-3" aria-label="Today's meals">
      <SectionHeader
        title="Today's meals"
        caption={groups.length ? `${occasions} ${occasions === 1 ? 'meal' : 'meals'}, ${meals.length} ${meals.length === 1 ? 'item' : 'items'}` : undefined}
      />

      {groups.length === 0 ? (
        <EmptyState icon={<Utensils />} title="No meals yet today" hint="Log your first meal to see protein remaining." action={{ label: 'Type a meal', onClick: onLogFirst }} />
      ) : (
        <ul className="flex flex-col gap-2" role="list">
          {groups.map((g) => (
            <li key={g.t} className="hx-card overflow-hidden">
              <div className="flex items-baseline justify-between gap-3 px-4 pt-3 pb-1">
                <span className="hx-display text-[15px] leading-5 font-semibold text-hx-text">
                  {formatClock(g.t)}
                  {!g.isOccasion && <span className="block text-[13px] leading-[18px] font-normal text-hx-muted">not a meal slot</span>}
                </span>
                <span className="hx-display text-[13px] leading-[18px] text-hx-text2 text-right">
                  {fmt(g.kc)} kcal, {fmt(g.p)} g protein
                </span>
              </div>
              <ul role="list">
                {g.meals.map((m) => {
                  const band = typeof m.conf === 'number' ? confidenceBand(m.conf) : null;
                  return (
                    <li key={m.id} className="flex items-center gap-1 pl-4 pr-1 py-1 border-t border-hx-border/60 first:border-t-0">
                      <button type="button" onClick={() => onEdit(m)} className="flex-1 min-w-0 text-left py-2 min-h-[44px]" aria-label={`Edit ${m.n}`}>
                        <span className="block text-[15px] leading-5 text-hx-text truncate">
                          {m.n}
                          {band && band.band !== 'high' && <span className={`ml-2 text-[13px] ${bandText(band.color)}`}>{band.band === 'med' ? 'medium' : 'low'} confidence</span>}
                        </span>
                        <span className="hx-display block text-[13px] leading-[18px] text-hx-text2">
                          {fmt(m.g)} g, {fmt(m.kc)} kcal
                        </span>
                        <span className="hx-display block text-[13px] leading-[18px] text-hx-muted">
                          {fmt(m.p)} g protein, {fmt(m.f)} g fat, {fmt(m.c)} g carbs
                        </span>
                        {m.as && band && <span className="block text-[13px] leading-[18px] text-hx-muted truncate">{m.as}</span>}
                      </button>
                      <button
                        type="button"
                        onClick={() => onEdit(m)}
                        aria-label={`Edit ${m.n}`}
                        className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-ctl text-hx-muted hover:text-hx-text hover:bg-hx-card2"
                      >
                        <Pencil className="w-4 h-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(m)}
                        aria-label={`Delete ${m.n}`}
                        className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-ctl text-hx-muted hover:text-hx-red hover:bg-hx-card2"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <TotalsRow totals={totals} targets={targets} />
    </section>
  );
}

function TotalsRow({ totals, targets }: { totals: Macros; targets: Macros }) {
  // Five columns at 390 px: the labels are the `hx-label` style and "Prot"
  // keeps them on one line, with the sr-only word carrying the full name.
  const cells: Array<{ key: 'kc' | 'p' | 'f' | 'c' | 'fi'; label: string; full: string; v: number; t: number }> = [
    { key: 'kc', label: 'kcal', full: 'Calories', v: totals.kc, t: targets.kc },
    { key: 'p', label: 'Prot', full: 'Protein', v: totals.p, t: targets.p },
    { key: 'f', label: 'Fat', full: 'Fat', v: totals.f, t: targets.f },
    { key: 'c', label: 'Carbs', full: 'Carbs', v: totals.c, t: targets.c },
    { key: 'fi', label: 'Fiber', full: 'Fiber', v: totals.fi, t: targets.fi },
  ];
  return (
    <div className="hx-card px-3 py-3 grid grid-cols-5 gap-1.5" role="group" aria-label="Running totals versus targets">
      {cells.map((c) => {
        // Protein and fiber are floors, not ceilings — only kcal/fat/carbs can be "over".
        const over = c.v > c.t && c.key !== 'p' && c.key !== 'fi';
        const by = round(c.v - c.t);
        return (
          <div key={c.key} className="min-w-0">
            <div className="hx-label truncate" aria-hidden>
              {c.label}
            </div>
            <span className="sr-only">{c.full}</span>
            <div className={`hx-display mt-0.5 text-[17px] leading-6 font-semibold truncate ${over ? 'text-hx-red' : 'text-hx-text'}`}>{fmt(c.v)}</div>
            {over ? (
              // Colour is never the only carrier (R6-12): the overshoot is written out.
              <div className="text-[13px] leading-[18px] text-hx-red truncate">
                <span aria-hidden>+{fmt(by)} over</span>
                <span className="sr-only">
                  over target by {fmt(by)}, target {fmt(c.t)}
                </span>
              </div>
            ) : (
              <div className="hx-display text-[13px] leading-[18px] text-hx-text2 truncate">of {fmt(c.t)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
