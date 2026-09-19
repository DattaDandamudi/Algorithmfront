/**
 * MealsList — today's entries as a ledger (DESIGN.md "Ledger"; INTEGRATION_
 * NOTES: one entry per food item, grouped by clock time `t`): the time in a
 * 56 px agate column on the first entry of each occasion, the meal in
 * .hx-body, an AI entry's `assumptions` (and its confidence word, with a tone
 * square) in .hx-hedge beneath, protein and kcal in .hx-fig-sm flush right,
 * rows divided by hairlines. The whole row is the edit button (§9); Delete
 * lives in the editor it opens. The running totals sit under a double
 * hairline as one figure line and one caption sentence naming every target,
 * an overshoot written out in words (colour is never the only carrier).
 *
 * Empty state uses the SPEC §1 copy: "Log your first meal to see protein
 * remaining."
 */
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
  onLogFirst: () => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function MealsList({ meals, totals, targets, onEdit, onLogFirst }: MealsListProps) {
  const groups = groupMealsByTime(meals);
  const occasions = groups.filter((g) => g.isOccasion).length;

  return (
    <section className="mt-10 flex flex-col" aria-label="Meals">
      <SectionHeader title="Meals" caption={groups.length ? `${plural(occasions, 'meal')}, ${plural(meals.length, 'item')}` : undefined} />

      {groups.length === 0 ? (
        <EmptyState className="mt-4" title="No meals yet today" hint="Log your first meal to see protein remaining." action={{ label: 'Type a meal', onClick: onLogFirst }} />
      ) : (
        <>
          <ul className="hx-ledger mt-4" role="list">
            {groups.map((g) => g.meals.map((m, i) => <Entry key={m.id} meal={m} time={i === 0 ? formatClock(g.t) : null} slot={g.isOccasion} onEdit={onEdit} />))}
          </ul>
          <Totals totals={totals} targets={targets} />
        </>
      )}
    </section>
  );
}

function Entry({ meal: m, time, slot, onEdit }: { meal: Meal; time: string | null; slot: boolean; onEdit: (meal: Meal) => void }) {
  const band = typeof m.conf === 'number' ? confidenceBand(m.conf) : null;
  const uncertain = band !== null && band.band !== 'high';
  return (
    <li className="hx-row">
      {/* The button spans the row's padding so the whole 56 px is the target; the hairline stays outside it. */}
      <button type="button" onClick={() => onEdit(m)} aria-label={`Edit ${m.n}`} className="hx-press w-full -my-3 py-3 min-h-[56px] flex items-start gap-3 text-left">
        <span className="hx-agate w-14 shrink-0 pt-[3px]">{time ?? ''}</span>
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="hx-body">{m.n}</span>
          {uncertain && band && (
            <span className={`hx-label mt-0.5 ${bandText(band.color)}`}>
              {band.color !== 'neutral' && <span className="hx-tone mr-1.5" aria-hidden />}
              {band.band === 'med' ? 'Medium' : 'Low'} confidence
            </span>
          )}
          {m.as && band && <span className="hx-hedge mt-0.5">{m.as}</span>}
          {!slot && <span className="hx-hedge mt-0.5">Not a meal slot</span>}
        </span>
        <span className="hx-fig-sm text-hx-text shrink-0 text-right whitespace-nowrap">
          {fmt(m.p)}
          <span className="hx-unit">g</span>
          <span className="ml-3">{fmt(m.kc)}</span>
          <span className="hx-unit">kcal</span>
        </span>
      </button>
    </li>
  );
}

function Totals({ totals, targets }: { totals: Macros; targets: Macros }) {
  const kcOver = totals.kc > targets.kc;
  // Protein and fiber are floors, not ceilings — only kcal, fat and carbs can be "over".
  const part = (name: string, v: number, t: number, unit: string, floor: boolean) => {
    const over = !floor && v > t;
    return (
      <span key={name}>
        {name} {fmt(v)} of {fmt(t)}
        {unit}
        {over && (
          <span className="text-hx-red">
            , {fmt(round(v - t))}
            {unit} over
          </span>
        )}
        .{' '}
      </span>
    );
  };
  return (
    <div role="group" aria-label="Running totals versus targets" className="mt-1">
      <div className="hx-hair-2" aria-hidden />
      <div className="pt-3 flex items-baseline justify-between gap-3">
        <span className="hx-body">Total</span>
        <span className="hx-fig-sm text-hx-text text-right whitespace-nowrap">
          {fmt(totals.p)}
          <span className="hx-unit">g</span>
          <span className={`ml-3 ${kcOver ? 'text-hx-red' : ''}`}>{fmt(totals.kc)}</span>
          <span className="hx-unit">kcal</span>
        </span>
      </div>
      <p className="hx-cap mt-1">
        {part('Protein', totals.p, targets.p, ' g', true)}
        {part('Calories', totals.kc, targets.kc, '', false)}
        {part('Fat', totals.f, targets.f, ' g', false)}
        {part('Carbs', totals.c, targets.c, ' g', false)}
        {part('Fiber', totals.fi, targets.fi, ' g', true)}
      </p>
    </div>
  );
}
