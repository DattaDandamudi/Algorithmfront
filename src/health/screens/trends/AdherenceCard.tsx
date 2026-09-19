/**
 * Adherence figure — SPEC §3: protein-hit days, calorie-hit days and the
 * logging-streak calendar as ONE 12-week heat map with a lens selector (three
 * stacked calendars would push the counters below the fold), filled by ink
 * density rather than a colour ramp, plus streak and hit-day counters as a
 * box score. Hit tolerances live in engine/adherence.ts (protein ≥ target −
 * 10 g; kcal within −400/+50): consistency, not precision, is what the
 * self-monitoring evidence rewards.
 */
import { useState } from 'react';
import type { CoachContext, ISODate } from '../../data/types';
import { EmptyState, SegmentedControl } from '../../ui';
import { Heatmap, type HeatmapDay } from '../../ui/charts';
import { Readout, TrendCard } from './TrendCard';
import { HEAT_WEEKS, type HeatMode } from './summaries';

const LENSES: Array<{ value: HeatMode; label: string }> = [
  { value: 'protein', label: 'Protein' },
  { value: 'kcal', label: 'Calories' },
  { value: 'logging', label: 'Logging' },
];
const TITLE: Record<HeatMode, string> = { protein: 'Protein-hit days', kcal: 'Calorie-hit days', logging: 'Logging calendar' };

export interface AdherenceCardProps {
  today: ISODate;
  heat: Record<HeatMode, HeatmapDay[]>;
  legend: Record<HeatMode, string[]>;
  loggingStreak: number;
  weighInStreak: number;
  /** 30-day hit counts from the context (adherence.adherenceCounts). */
  counts: CoachContext['adherence'];
  onLogMeal: () => void;
}

const days = (n: number) => (n === 1 ? 'day' : 'days');

export default function AdherenceCard({ today, heat, legend, loggingStreak, weighInStreak, counts, onLogMeal }: AdherenceCardProps) {
  const [mode, setMode] = useState<HeatMode>('protein');
  const anyLogged = heat.logging.some((d) => d.level !== null);

  if (!anyLogged) {
    return (
      <TrendCard
        title="Adherence"
        caption={`Hit days and streaks over the last ${HEAT_WEEKS} weeks`}
        empty={
          <EmptyState
            title="Nothing logged yet"
            hint="Log your first meal to start your adherence calendar; hit days and streaks build from there."
            action={{ label: 'Log a meal', onClick: onLogMeal }}
          />
        }
      />
    );
  }

  return (
    <TrendCard
      title="Adherence"
      caption={`Last ${HEAT_WEEKS} weeks`}
      source={`${TITLE[mode]}, one cell a day; the darker the cell, the closer the day came.`}
      meaning="Consistency beats precision: daily weigh-ins and logging on most days are what make the trend and expenditure trustworthy, and breaks of a month or more risk regain."
    >
      <SegmentedControl<HeatMode> options={LENSES} value={mode} onChange={setMode} ariaLabel="Adherence lens" className="self-start" />

      <Heatmap ariaLabel={`${TITLE[mode]}, last ${HEAT_WEEKS} weeks`} weeks={HEAT_WEEKS} end={today} days={heat[mode]} legend={legend[mode]} />

      <div className="hx-score-grid">
        <Readout label="Logging streak" value={loggingStreak} unit={days(loggingStreak)} />
        <Readout label="Weigh-in streak" value={weighInStreak} unit={days(weighInStreak)} />
        <Readout label="Protein hit" value={`${counts.proteinHitDays30}/30`} sub="days in the last 30" />
        <Readout label="Calories hit" value={`${counts.kcalHitDays30}/30`} sub="days in the last 30" />
      </div>
    </TrendCard>
  );
}
