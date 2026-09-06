/**
 * Nutrition frequency counters — SPEC §3 "for his labs": red-meat servings/wk,
 * fish servings/wk, home-cooked %, fiber average — over the trailing 7 days
 * and over the selected range (counts normalised per week), plus the
 * lab-linked habit lines (§7 #13/#14, engine/micronutrients.labLinkedHabits).
 * Display-only: general information with the "confirm with your doctor" cue
 * (§6.7); nothing here interprets a lab as disease.
 */
import { Utensils } from 'lucide-react';
import { COACH_CHIPS, DOCTOR_CUE, type FrequencyCounters } from '../../engine';
import { Button, EmptyState } from '../../ui';
import { TrendCard } from './TrendCard';
import type { FrequencyRow, RangeWindow } from './series';

export interface NutritionCardProps {
  rows: FrequencyRow[];
  habits: string[];
  week: FrequencyCounters;
  range: FrequencyCounters;
  win: RangeWindow;
  onLogMeal: () => void;
  onOpenCoach: (prompt: string) => void;
}

const meals = (n: number) => `${n} meal${n === 1 ? '' : 's'}`;

export default function NutritionCard({ rows, habits, week, range, win, onLogMeal, onOpenCoach }: NutritionCardProps) {
  const action = (
    <Button variant="ghost" size="sm" onClick={() => onOpenCoach(COACH_CHIPS[7])}>
      Ask the coach
    </Button>
  );

  if (week.totalMeals === 0 && range.totalMeals === 0) {
    return (
      <TrendCard
        title="Food frequency"
        caption="Red meat · fish · home-cooked · fiber"
        action={action}
        empty={
          <EmptyState
            icon={<Utensils />}
            title="No meals to count yet"
            hint="Log meals — the AI bar tags red meat, fish and home-cooked for you — to start your weekly counters."
            action={{ label: 'Log a meal', onClick: onLogMeal }}
          />
        }
      />
    );
  }

  const showRange = win.days > 7;
  const cell = 'py-2 text-right text-[15px] font-semibold tabular-nums';

  return (
    <TrendCard
      title="Food frequency"
      caption={`${meals(week.totalMeals)} tagged this week${showRange ? ` · ${meals(range.totalMeals)} in the ${win.label}` : ''}`}
      action={action}
      meaning="Counted from meal tags — these are the habits that move the labs you track: oily fish for the omega-3 index, iron-rich meals for ferritin, home cooking for lead and sodium exposure, fiber for the daily target."
    >
      <table className="w-full text-[13px] leading-5">
        <thead>
          <tr>
            <th scope="col" className="hx-label pb-2 text-left font-medium">
              Habit
            </th>
            <th scope="col" className="hx-label pb-2 text-right font-medium">
              This week
            </th>
            {showRange && (
              <th scope="col" className="hx-label pb-2 text-right font-medium">
                {win.label}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-hx-border">
              <th scope="row" className="py-2 text-left font-medium text-hx-text">
                {r.label}
                <span className="block text-[11px] leading-4 font-normal text-hx-muted">{r.hint}</span>
              </th>
              <td className={`${cell} text-hx-text`}>{r.week}</td>
              {showRange && <td className={`${cell} text-hx-text2`}>{r.range}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {habits.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Lab-linked habits">
          {habits.map((h) => (
            <li key={h} className="rounded-xl border-l-2 border-hx-yellow bg-hx-card2 px-3 py-2 text-[13px] leading-5 text-hx-text2">
              {h}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] leading-4 text-hx-muted">General wellness information from your own labs — {DOCTOR_CUE}</p>
    </TrendCard>
  );
}
