/**
 * Trends — SPEC §3 laid out as the bento in DESIGN.md.
 *
 * Type on the ground at the top: the screen title, the range toggle (a well
 * with the chosen segment raised out of it) and the window caption. Then one
 * `.hx-bento`, every card a span-2 tile:
 *
 *  weight        HERO — span-2 and the tallest tile: the smoothed level leads
 *                at 36 px, then the rate, the chart and the target band
 *  expenditure   the posterior that explains the weight
 *  HRV, RHR      recovery, the two signals a lifter reads together
 *  sleep         hours vs need, then bedtime regularity
 *  steps         the cheapest expenditure lever
 *  load, volume  the training that drives both
 *  stress        overnight strain and the check-in overlay
 *  resilience    load vs recovery
 *  impact        what moves your numbers
 *  nutrition     food frequency for the labs
 *  adherence     the logging record, last because it is the record
 *
 * Nothing here is a 1×1: every card carries a chart, a heatmap or a table
 * wider than 140 px, which the bento rules make span-2.
 *
 * Every number comes from `useTrendsModel()` (store → engine → series); this
 * file only owns the range state and wires card actions to navigation
 * (Log deep-links, Coach pre-fills, Train, Settings for the WHOOP connection).
 */
import { useState } from 'react';
import { useNav } from '../nav';
import { SegmentedControl } from '../ui';
import type { ChartRange } from '../ui/charts';
import { ImpactCard, ResilienceCard, StressCard } from './stress';
import AdherenceCard from './trends/AdherenceCard';
import ExpenditureCard from './trends/ExpenditureCard';
import LoadCard from './trends/LoadCard';
import NutritionCard from './trends/NutritionCard';
import { HrvCard, RhrCard } from './trends/RecoveryCards';
import SleepCard from './trends/SleepCard';
import StepsCard from './trends/StepsCard';
import VolumeCard from './trends/VolumeCard';
import WeightCard from './trends/WeightCard';
import { bucketDateFormat, rangeCaption } from './trends/series';
import { useTrendsModel } from './trends/useTrendsModel';

const RANGES: Array<{ value: ChartRange; label: string }> = [
  { value: '7D', label: '7D' },
  { value: '30D', label: '30D' },
  { value: '90D', label: '90D' },
  { value: '1Y', label: '1Y' },
];
/** 30 days is the baseline window used everywhere else (§0), so it is the natural landing range. */
const DEFAULT_RANGE: ChartRange = '30D';

export default function Trends() {
  const [range, setRange] = useState<ChartRange>(DEFAULT_RANGE);
  const m = useTrendsModel(range);
  const { openCoach, openLog, openSettings, openTrain } = useNav();
  const { ctx, settings, win } = m;
  const { profile, targets } = settings;
  // The HRV / RHR empty states promise the WHOOP entry form, so deep-link to that Section (review R2-10).
  const openWhoop = () => openSettings('whoop');
  const dateFormat = bucketDateFormat(win.bucket);

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-20 bg-hx-base/90 backdrop-blur px-4 pt-5 pb-3 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="hx-display text-[22px] leading-7 font-semibold text-hx-text">Trends</h1>
          <SegmentedControl<ChartRange> options={RANGES} value={range} onChange={setRange} size="sm" ariaLabel="Date range" />
        </div>
        <p className="text-[13px] leading-[18px] text-hx-muted" aria-live="polite">
          {rangeCaption(win)}
        </p>
      </header>

      <div className="hx-bento px-4 pb-6">
        <WeightCard weight={ctx.weight} series={m.weight} win={win} units={profile.units} targets={targets} onLogWeight={() => openLog('weight')} onOpenCoach={openCoach} />

        <ExpenditureCard ctx={ctx} tdee={m.tdee} win={win} targets={targets} onLogWeight={() => openLog('weight')} onOpenCoach={openCoach} />

        <HrvCard hrv={ctx.hrv} series={m.hrv} win={win} onOpenCoach={openCoach} onOpenSettings={openWhoop} />

        <RhrCard rhr={ctx.rhr} series={m.rhr} band={m.rhrBand} win={win} onOpenSettings={openWhoop} />

        <SleepCard sleep={ctx.sleep} series={m.sleep} consistency={m.bedSd} offsets={m.bedOffsets} win={win} bedTarget={profile.bedTarget} onLogBedtime={() => openLog('bedtime')} onOpenCoach={openCoach} />

        <StepsCard steps={ctx.steps} series={m.steps.series} stats={m.steps.stats} win={win} />

        <LoadCard load={ctx.training?.load} series={m.load} win={win} onOpenTrain={() => openTrain('today')} />

        <VolumeCard weeklySets={ctx.training?.weeklySets} weeks={m.volume} onOpenTrain={() => openTrain('today')} />

        <StressCard
          stress={ctx.stress}
          osi={m.stress.osi}
          osiBand={m.stress.osiBand}
          checkIn={m.stress.checkIn}
          range={win.range}
          // The strain series is capped (see `STRESS_SERIES_MAX_DAYS`), so the
          // caption names the window that was actually drawn, not the toggle.
          windowLabel={m.stress.days === win.days ? win.label : `last ${m.stress.days} days`}
          dateFormat={dateFormat}
          onCheckIn={() => openLog('checkin')}
          onOpenCoach={openCoach}
        />

        <ResilienceCard
          resilience={ctx.stress?.resilience}
          load={m.resilience.load}
          recovery={m.resilience.recovery}
          range={win.range}
          dateFormat={dateFormat}
        />

        <ImpactCard impact={ctx.impact} />

        <NutritionCard rows={m.frequency.rows} habits={m.frequency.habits} week={m.frequency.week} range={m.frequency.range} win={win} onLogMeal={() => openLog('meal')} onOpenCoach={openCoach} />

        <AdherenceCard
          today={m.today}
          heat={m.adherence.heat}
          legend={m.adherence.legend}
          loggingStreak={m.adherence.loggingStreak}
          weighInStreak={m.adherence.weighInStreak}
          counts={ctx.adherence}
          onLogMeal={() => openLog('meal')}
        />
      </div>

      <footer className="px-4 pt-1 pb-2 text-left">
        <p className="text-[12px] leading-4 text-hx-muted">Wellness information only, not medical advice.</p>
      </footer>
    </div>
  );
}
