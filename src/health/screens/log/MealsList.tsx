/**
 * MealsList — today's entries grouped by eating occasion (INTEGRATION_NOTES:
 * one entry per food item, grouped by clock time `t`), with per-entry edit and
 * delete, plus the running totals row (kcal · P · F · C · fiber vs targets).
 *
 * Empty state uses the SPEC §1 copy: "Log your first meal to see protein
 * remaining."
 */
import { Pencil, Trash2, Utensils } from 'lucide-react';
import type { Macros, Meal } from '../../data/types';
import { confidenceBand } from '../../ai/foodLocal';
import { formatClock } from '../../lib/dates';
import { fmt } from '../../lib/format';
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
    <div className="space-y-3">
      <SectionHeader title="Today's meals" caption={groups.length ? `${occasions} ${occasions === 1 ? 'meal' : 'meals'} · ${meals.length} ${meals.length === 1 ? 'item' : 'items'}` : undefined} />

      {groups.length === 0 ? (
        <EmptyState icon={<Utensils />} title="No meals yet today" hint="Log your first meal to see protein remaining." action={{ label: 'Type a meal', onClick: onLogFirst }} />
      ) : (
        <ul className="space-y-2" role="list">
          {groups.map((g) => (
            <li key={g.t} className="hx-card overflow-hidden">
              <div className="flex items-baseline justify-between px-4 pt-3 pb-1">
                <span className="text-[13px] font-semibold text-hx-text">{formatClock(g.t)}</span>
                <span className="text-[12px] text-hx-text2">
                  {fmt(g.kc)} kcal · {fmt(g.p)} g P{!g.isOccasion && <span className="text-hx-muted"> · not a meal slot</span>}
                </span>
              </div>
              <ul role="list">
                {g.meals.map((m) => {
                  const band = typeof m.conf === 'number' ? confidenceBand(m.conf) : null;
                  return (
                    <li key={m.id} className="flex items-center gap-1 pl-4 pr-1 py-1 border-t border-hx-border/60 first:border-t-0">
                      <button type="button" onClick={() => onEdit(m)} className="flex-1 min-w-0 text-left py-2 min-h-[44px]" aria-label={`Edit ${m.n}`}>
                        <span className="block text-[14px] leading-5 text-hx-text truncate">
                          {m.n}
                          {band && band.band !== 'high' && <span className={`ml-2 text-[11px] uppercase tracking-wide ${bandText(band.color)}`}>{band.label} conf.</span>}
                        </span>
                        <span className="block text-[12px] leading-4 text-hx-text2">
                          {fmt(m.g)} g · {fmt(m.kc)} kcal · {fmt(m.p)} g P · {fmt(m.f)} g F · {fmt(m.c)} g C
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onEdit(m)}
                        aria-label={`Edit ${m.n}`}
                        className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-xl text-hx-muted hover:text-hx-text hover:bg-hx-card2"
                      >
                        <Pencil className="w-4 h-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(m)}
                        aria-label={`Delete ${m.n}`}
                        className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-xl text-hx-muted hover:text-hx-red hover:bg-hx-card2"
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
    </div>
  );
}

function TotalsRow({ totals, targets }: { totals: Macros; targets: Macros }) {
  const cells: Array<{ label: string; v: number; t: number; dp?: number }> = [
    { label: 'kcal', v: totals.kc, t: targets.kc },
    { label: 'Protein', v: totals.p, t: targets.p },
    { label: 'Fat', v: totals.f, t: targets.f },
    { label: 'Carbs', v: totals.c, t: targets.c },
    { label: 'Fiber', v: totals.fi, t: targets.fi },
  ];
  return (
    <div className="hx-card px-3 py-3 grid grid-cols-5 gap-1" role="group" aria-label="Running totals versus targets">
      {cells.map((c) => {
        const over = c.v > c.t && c.label !== 'Protein' && c.label !== 'Fiber';
        return (
          <div key={c.label} className="min-w-0 text-center">
            <div className="text-[10px] leading-3 uppercase tracking-wider text-hx-muted truncate">{c.label}</div>
            <div className={`mt-1 text-[15px] leading-5 font-semibold ${over ? 'text-hx-red' : 'text-hx-text'}`}>{fmt(c.v, c.dp ?? 0)}</div>
            <div className="text-[11px] leading-4 text-hx-text2">/ {fmt(c.t)}</div>
          </div>
        );
      })}
    </div>
  );
}
