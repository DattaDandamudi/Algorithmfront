/**
 * Adherence card — SPEC §3: protein-hit days, calorie-hit days and the
 * logging-streak calendar as ONE 12-week heatmap with a lens selector (three
 * stacked calendars would push the frequency counters below the fold), plus
 * streak and hit-day counters. Hit tolerances live in engine/adherence.ts
 * (protein ≥ target − 10 g; kcal within −400/+50) — consistency, not
 * precision, is what the self-monitoring evidence rewards.
 */
import { CalendarCheck } from 'lucide-react';
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
/** Green for the two "hit" lenses (on-track); blue for the informational logging calendar. */
const COLOR: Record<HeatMode, string> = { protein: 'var(--hx-green)', kcal: 'var(--hx-green)', logging: 'var(--hx-blue)' };

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
            icon={<CalendarCheck />}
            title="Nothing logged yet"
            hint="Log your first meal to start your adherence calendar — hit days and streaks build from there."
            action={{ label: 'Log a meal', onClick: onLogMeal }}
          />
        }
      />
    );
  }

  return (
    <TrendCard
      title="Adherence"
      caption={`Last ${HEAT_WEEKS} weeks · ${TITLE[mode].toLowerCase()}`}
      meaning="Consistency beats precision — daily weigh-ins and logging on most days are what make the trend and expenditure trustworthy; breaks of a month or more risk regain."
    >
      <SegmentedControl<HeatMode> options={LENSES} value={mode} onChange={setMode} ariaLabel="Adherence lens" className="self-start" />

      <Heatmap ariaLabel={`${TITLE[mode]}, last ${HEAT_WEEKS} weeks`} weeks={HEAT_WEEKS} end={today} days={heat[mode]} legend={legend[mode]} color={COLOR[mode]} />

      <div className="grid grid-cols-2 gap-3">
        <Readout label="Logging streak" value={loggingStreak} unit={days(loggingStreak)} />
        <Readout label="Weigh-in streak" value={weighInStreak} unit={days(weighInStreak)} />
        <Readout label="Protein hit" value={`${counts.proteinHitDays30}/30`} sub="days in the last 30" />
        <Readout label="Calories hit" value={`${counts.kcalHitDays30}/30`} sub="days in the last 30" />
      </div>
    </TrendCard>
  );
}
