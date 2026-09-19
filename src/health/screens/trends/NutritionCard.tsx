/**
 * Nutrition frequency counters — SPEC §3 "for his labs": red-meat servings/wk,
 * fish servings/wk, home-cooked %, fiber average, over the trailing 7 days and
 * over the selected range (counts normalised per week), as a ruled table, plus
 * the lab-linked habit lines (§7 #13/#14, engine/micronutrients.labLinkedHabits).
 * Display-only: general information with the "confirm with your doctor" cue
 * (§6.7); nothing here interprets a lab as disease.
 */
import { COACH_CHIPS, DOCTOR_CUE, type FrequencyCounters } from '../../engine';
import { Button, EmptyState } from '../../ui';
import { TrendCard } from './TrendCard';
import type { RangeWindow } from './series';
import type { FrequencyRow } from './summaries';

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
        caption="Red meat, fish, home-cooked meals and fiber"
        action={action}
        empty={
          <EmptyState
            title="No meals to count yet"
            hint="Log meals (the AI bar tags red meat, fish and home-cooked for you) to start your weekly counters."
            action={{ label: 'Log a meal', onClick: onLogMeal }}
          />
        }
      />
    );
  }

  const showRange = win.days > 7;
  // Sentence case in a column head: "last 30 days" is a fragment mid-sentence.
  const rangeHeading = win.label.charAt(0).toUpperCase() + win.label.slice(1);
  const cell = 'hx-ui py-3 text-right align-baseline';

  return (
    <TrendCard
      title="Food frequency"
      caption={`${meals(week.totalMeals)} tagged this week`}
      action={action}
      source={`Counted from meal tags: ${meals(week.totalMeals)} this week${showRange ? `, ${meals(range.totalMeals)} in the ${win.label}, shown per week` : ''}.`}
      meaning="These are the habits that move the labs you track: oily fish for the omega-3 index, iron-rich meals for ferritin, home cooking for lead and sodium exposure, fiber for the daily target."
    >
      <table className="w-full">
        <thead>
          <tr>
            <th scope="col" className="hx-label pb-2 text-left">
              Habit
            </th>
            <th scope="col" className="hx-label pb-2 text-right">
              This week
            </th>
            {showRange && (
              <th scope="col" className="hx-label pb-2 text-right">
                {rangeHeading}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-hx-border">
              <th scope="row" className="py-3 text-left font-normal align-baseline">
                <span className="hx-body block">{r.label}</span>
                <span className="hx-cap block">{r.hint}</span>
              </th>
              <td className={`${cell} text-hx-text`}>{r.week}</td>
              {showRange && <td className={`${cell} text-hx-text2`}>{r.range}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {habits.length > 0 && (
        <div className="flex flex-col">
          <span className="hx-label">From your labs</span>
          <ul className="flex flex-col" aria-label="Lab-linked habits">
            {habits.map((h) => (
              <li key={h} className="hx-body py-2 border-t border-hx-border first:border-t-0 first:pt-1">
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="hx-hedge">General wellness information from your own labs. {DOCTOR_CUE}</p>
    </TrendCard>
  );
}
