/**
 * Today — SPEC §1 with the v3 stack folded in, set as the page in DESIGN.md
 * "Today, in ASCII": one column, 20 px margins, a 350 px measure, three ink
 * rules and then space.
 *
 *  masthead             the date in .hx-head, the day type as a tag, the ink
 *                       rule that draws in on mount; any notices beneath it
 *  hero                 the score prints; verdict, dial, confidence, source,
 *                       the training chip; the deck; "Why this score"
 *  ledger               the morning check-in and the weigh-in prompt as rows
 *  ── Last night and this morning     the box score: Sleep | HRV / RHR | Steps
 *  ── Food              Protein remaining / Calories remaining, then macros
 *  Training             a fixture row into Train and the planned lifts
 *  Energy               the predicted curve, solid to now and dashed after
 *  Insights             briefs
 *  Weight               the Kalman-smoothed trend with its band
 *  Tobacco              count, streak, the 7-day strip
 *  Tonight              bedtime countdown, caffeine cutoff, last meal
 *  colophon             the medical line under a hairline
 *
 * Every number is read from `useTodayModel()` (store, then engine context);
 * this file only wires navigation: cells and rows pre-fill the Coach, prompts
 * deep-link into Log, the fixture row opens Train, notices open a Settings
 * section, quick actions call store actions.
 */
import { InsightCard, SectionHeader, toast } from '../ui';
import { COACH_CHIPS, isWeight } from '../engine';
import { formatClock, hhmmToMinutes } from '../lib/dates';
import { useNav } from '../nav';
import { EnergyCard, StressStrip } from './stress';
import { BACKUP_SNOOZE_DAYS, type TodayBanner } from './today/banners';
import MacroSection from './today/MacroSection';
import MetricTiles, { FoodLedger, mealsLeftText } from './today/MetricTiles';
import { NudgeStrip, WeighInPrompt } from './today/Nudges';
import ReadinessHero from './today/ReadinessHero';
import TobaccoTile from './today/TobaccoTile';
import TodayHeader from './today/TodayHeader';
import TrainingTile from './today/TrainingTile';
import WeightTrendCard from './today/WeightTrendCard';
import { useTodayModel } from './today/useTodayModel';

/** The weigh-in prompt is a *morning* prompt (§2): hide it from noon onward. */
const WEIGH_PROMPT_UNTIL_HOUR = 12;

export default function Today() {
  const m = useTodayModel();
  const { ctx, settings, actions, today } = m;
  const { openCoach, openLog, openSettings, openTrain, setTab } = useNav();
  const profile = settings.profile;

  const showWeighIn = !isWeight(m.todayRecord?.w) && m.now.getHours() < WEIGH_PROMPT_UNTIL_HOUR && settings.lastWeighPromptDate !== today;

  // Today owns both check-in prompt gates — Log always offers the section, but
  // `checkIn.enabled` and `checkIn.promptAfter` govern the ASK on this screen
  // (Log.tsx header). When it is not due the row drops the ask and shows the
  // overnight signals instead; nothing about the numbers changes.
  const promptAfter = hhmmToMinutes(settings.checkIn.promptAfter);
  const nowMin = hhmmToMinutes(ctx.nowHHMM);
  const askCheckIn = settings.checkIn.enabled && (promptAfter === null || nowMin === null || nowMin >= promptAfter);
  const stress =
    ctx.stress && !askCheckIn && ctx.stress.checkIn.missingToday ? { ...ctx.stress, checkIn: { ...ctx.stress.checkIn, missingToday: false } } : ctx.stress;

  // Reference weight for the per-meal protein ceiling: the latest scale reading, else the trend, else the profile.
  const bodyWeightLb = ctx.weight.latest ?? ctx.weight.trend ?? profile.weightLb;

  // The Food dateline: meals left as of the minute the model was built on.
  const foodDateline = `${mealsLeftText(ctx.nutrition.mealsLeft)}, ${formatClock(ctx.nowHHMM)}`;

  const plusOne = () => {
    actions.adjustTobacco(today, 1);
    toast('Logged +1 tobacco');
  };
  const smokeFree = () => {
    actions.adjustTobacco(today, 0);
    toast('Marked today smoke-free');
  };

  /** Escalations are acknowledged per marker+value; the backup nag snoozes for a week. */
  const dismissBanner = (b: TodayBanner) => {
    const d = b.dismiss;
    if (!d) return;
    if (d.type === 'escalation') {
      actions.setSettings((s) => ({ ...s, acknowledgedEscalations: Array.from(new Set([...(s.acknowledgedEscalations ?? []), d.key])) }));
    } else {
      actions.setSettings({ backupReminderSnoozedUntil: d.until });
      toast(`Backup reminder snoozed for ${BACKUP_SNOOZE_DAYS} days`);
    }
  };

  const readings = {
    ctx,
    prompts: m.prompts,
    empty: m.empty,
    hrv7: m.hrv7,
    provisionalTdee: m.provisionalTdee,
    bodyWeightLb,
    baseline: m.nutritionBaseline,
    onOpenCoach: (p: string) => openCoach(p),
  };

  return (
    <div className="px-5 flex flex-col">
      <TodayHeader today={today} dayType={ctx.dayType} session={ctx.sessionType} banners={m.banners} onOpenSettings={openSettings} onDismissBanner={dismissBanner} />

      <ReadinessHero readiness={ctx.readiness} onAskCoach={openCoach} />

      <div className="hx-ledger">
        <StressStrip stress={stress} onCheckIn={() => openLog('checkin')} onOpenDetail={() => setTab('trends')} />
        {showWeighIn && <WeighInPrompt onLog={() => openLog('weight')} onDismiss={() => actions.setSettings({ lastWeighPromptDate: today })} />}
      </div>

      <SectionHeader className="mt-10" title="Last night and this morning" caption="vs your 30-day avg" />
      <div className="hx-score-grid mt-4">
        <MetricTiles {...readings} />
      </div>

      <SectionHeader className="mt-10" title="Food" caption={foodDateline} />
      <div className="hx-ledger mt-4">
        <FoodLedger {...readings} />
      </div>
      <MacroSection ctx={ctx} bodyWeightLb={bodyWeightLb} emptyText={m.empty.protein} onLogMeal={() => openLog('meal')} />

      <TrainingTile training={ctx.training} today={today} units={settings.training.units} onOpenTrain={() => openTrain('today')} onOpenCoach={(p) => openCoach(p)} />

      <EnergyCard energy={ctx.energy} nowHHMM={ctx.nowHHMM} onOpenCoach={(p) => openCoach(p)} coachPrompt={COACH_CHIPS[11]} />

      {m.insights.length > 0 && (
        <section className="mt-10" aria-label="Insights">
          <SectionHeader as="h2" rule={false} title="Insights" caption="From your own numbers" />
          <div className="mt-2">
            {m.insights.map((ins) => (
              <InsightCard key={ins.id} insight={ins} onOpen={(prompt) => openCoach(prompt)} />
            ))}
          </div>
        </section>
      )}

      <WeightTrendCard
        weight={ctx.weight}
        series={m.weight}
        units={profile.units}
        calibrationHint={ctx.weight.weighInsThisWeek < 5 ? m.empty.weight : undefined}
        rateReason={m.rateReason}
        onLogWeight={() => openLog('weight')}
        onOpenCoach={(p) => openCoach(p)}
      />

      <TobaccoTile stats={m.tobacco} today={m.tobaccoToday} onPlusOne={plusOne} onSmokeFree={smokeFree} onOpenLog={() => openLog('tobacco')} />

      <NudgeStrip
        countdown={m.countdown}
        caffeineAfterCutoff={ctx.nutrition.caffeineAfterCutoff}
        caffeineCutoff={profile.caffeineCutoff}
        late={m.late}
        mealsLeft={ctx.nutrition.mealsLeft}
        bedTarget={profile.bedTarget}
        onGoingToBed={() => openLog('bedtime')}
        onAskCoach={(p) => openCoach(p)}
      />

      <div className="hx-hair mt-10" aria-hidden />
      <footer className="pt-3 pb-6">
        <p className="hx-hedge">Wellness information only, not medical advice.</p>
      </footer>
    </div>
  );
}
