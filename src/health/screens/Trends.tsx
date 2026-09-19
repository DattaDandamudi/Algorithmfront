/**
 * Trends — SPEC §3 as the graphics desk's page (DESIGN.md "Trends").
 *
 * The masthead row ("Trends" in .hx-masthead, the 7D / 30D / 90D / 1Y toggle
 * as words with an ink underline) is the ONE sticky header in the app, because
 * the range control is live: stock at 96 percent, no blur, a hairline
 * beneath. The range sentence ("Last 30 days, 13 Aug to 11 Sep") is the
 * dateline under it and scrolls with the page. Then every card is a figure
 * (running head, `.hx-fig` lead with its band word, the deck, the chart, a
 * source line, the meaning as a hedge), divided by 40 px of space; the ink
 * rule is spent exactly three times, at the group boundaries:
 *
 *  ── body                weight (the lead figure), expenditure, steps
 *  ── sleep and recovery  HRV, resting heart rate, sleep
 *  ── training and stress load, volume, overnight strain, resilience, impact
 *     the record           food frequency, adherence (last because it is the record)
 *
 * Every number comes from `useTrendsModel()` (store, engine, series); this
 * file only owns the range state and wires card actions to navigation
 * (Log deep-links, Coach pre-fills, Train, Settings for the WHOOP connection).
 * The medical line closes the tab as the colophon under a hairline.
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
      {/* The one sticky header: stock at 96 percent, no blur, a hairline beneath. The control's own
          hairline overlaps it by a pixel so the words sit on one line, not two. */}
      <header className="sticky top-0 z-20 bg-hx-base/[0.96] px-5 pt-5">
        <div className="flex items-end justify-between gap-4">
          <h1 className="hx-masthead text-hx-text pb-3">Trends</h1>
          <SegmentedControl<ChartRange> options={RANGES} value={range} onChange={setRange} size="sm" ariaLabel="Date range" className="-mb-px" />
        </div>
        <div className="hx-hair" aria-hidden />
      </header>

      <div className="px-5 flex flex-col">
        <p className="hx-hedge pt-3 pb-4" aria-live="polite">
          {rangeCaption(win)}
        </p>

        {/* ── body */}
        <WeightCard rule weight={ctx.weight} series={m.weight} win={win} units={profile.units} targets={targets} onLogWeight={() => openLog('weight')} onOpenCoach={openCoach} />

        <ExpenditureCard ctx={ctx} tdee={m.tdee} win={win} targets={targets} onLogWeight={() => openLog('weight')} onOpenCoach={openCoach} />

        <StepsCard steps={ctx.steps} series={m.steps.series} stats={m.steps.stats} win={win} />

        {/* ── sleep and recovery */}
        <HrvCard rule hrv={ctx.hrv} series={m.hrv} win={win} onOpenCoach={openCoach} onOpenSettings={openWhoop} />

        <RhrCard rhr={ctx.rhr} series={m.rhr} band={m.rhrBand} win={win} onOpenSettings={openWhoop} />

        <SleepCard sleep={ctx.sleep} series={m.sleep} consistency={m.bedSd} offsets={m.bedOffsets} win={win} bedTarget={profile.bedTarget} onLogBedtime={() => openLog('bedtime')} onOpenCoach={openCoach} />

        {/* ── training and stress */}
        <LoadCard rule load={ctx.training?.load} series={m.load} win={win} onOpenTrain={() => openTrain('today')} />

        <VolumeCard weeklySets={ctx.training?.weeklySets} weeks={m.volume} onOpenTrain={() => openTrain('today')} />

        <StressCard
          stress={ctx.stress}
          osi={m.stress.osi}
          osiBand={m.stress.osiBand}
          checkIn={m.stress.checkIn}
          range={win.range}
          // The strain series is capped (see `STRESS_SERIES_MAX_DAYS`), so the
          // source line names the window that was actually drawn, not the toggle.
          windowLabel={m.stress.days === win.days ? win.label : `last ${m.stress.days} days`}
          dateFormat={dateFormat}
          onCheckIn={() => openLog('checkin')}
          onOpenCoach={openCoach}
        />

        <ResilienceCard resilience={ctx.stress?.resilience} load={m.resilience.load} recovery={m.resilience.recovery} range={win.range} dateFormat={dateFormat} />

        <ImpactCard impact={ctx.impact} />

        {/* the record */}
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

        <div className="hx-hair mt-10" aria-hidden />
        <footer className="pt-3 pb-6">
          <p className="hx-hedge">Wellness information only, not medical advice.</p>
        </footer>
      </div>
    </div>
  );
}
