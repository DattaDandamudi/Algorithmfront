/**
 * Today / Dashboard — SPEC §1 with the v3 stack folded in, top → bottom:
 *  1. header (date · day-type chip · banners: escalation / storage / retest)
 *  2. Readiness hero ring + modifiers + "Why this score"
 *  3. stress strip (check-in prompt, or the Hooper band and the overnight
 *     signal count) — directly under the hero, because it is the other half of
 *     "how am I today" and the check-in is the input the hero is missing
 *  4. morning weigh-in prompt      5. metric tiles (2-col)
 *  6. training tile → Train        7. predicted-energy curve
 *     (6 and 7 are the day ahead: what you are doing, and when you will have
 *     the energy for it)
 *  8. macro remaining bars         9. insight cards (max 3)
 * 10. weight trend card           11. tobacco tile
 * 12. bedtime / caffeine nudges   +  the wellness-only footer.
 *
 * Every number is read from `useTodayModel()` (store → engine context); this
 * file only wires navigation: tiles/cards → Coach pre-fills, prompts → Log
 * deep-links, the training tile → Train, banners → Settings sections, quick
 * actions → store actions.
 */
import { InsightCard, SectionHeader, toast } from '../ui';
import { COACH_CHIPS, isWeight } from '../engine';
import { hhmmToMinutes } from '../lib/dates';
import { useNav } from '../nav';
import { EnergyCard, StressStrip } from './stress';
import { BACKUP_SNOOZE_DAYS, type TodayBanner } from './today/banners';
import MacroSection from './today/MacroSection';
import MetricTiles from './today/MetricTiles';
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
  // (Log.tsx header). When it is not due the strip drops the ask and shows the
  // overnight signals instead; nothing about the numbers changes.
  const promptAfter = hhmmToMinutes(settings.checkIn.promptAfter);
  const nowMin = hhmmToMinutes(ctx.nowHHMM);
  const askCheckIn = settings.checkIn.enabled && (promptAfter === null || nowMin === null || nowMin >= promptAfter);
  const stress =
    ctx.stress && !askCheckIn && ctx.stress.checkIn.missingToday
      ? { ...ctx.stress, checkIn: { ...ctx.stress.checkIn, missingToday: false } }
      : ctx.stress;

  // Reference weight for the per-meal protein ceiling: latest scale → trend → profile.
  const bodyWeightLb = ctx.weight.latest ?? ctx.weight.trend ?? profile.weightLb;

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

  return (
    <div className="flex flex-col">
      <TodayHeader today={today} dayType={ctx.dayType} session={ctx.sessionType} banners={m.banners} onOpenSettings={openSettings} onDismissBanner={dismissBanner} />

      <ReadinessHero readiness={ctx.readiness} onAskCoach={openCoach} />

      <StressStrip stress={stress} onCheckIn={() => openLog('checkin')} onOpenDetail={() => setTab('trends')} />

      {showWeighIn && <WeighInPrompt onLog={() => openLog('weight')} onDismiss={() => actions.setSettings({ lastWeighPromptDate: today })} />}

      <MetricTiles
        ctx={ctx}
        prompts={m.prompts}
        empty={m.empty}
        hrv7={m.hrv7}
        smoothedTdee={m.smoothedTdee}
        bodyWeightLb={bodyWeightLb}
        baseline={m.nutritionBaseline}
        onOpenCoach={(p) => openCoach(p)}
      />

      <TrainingTile
        training={ctx.training}
        today={today}
        units={settings.training.units}
        onOpenTrain={() => openTrain('today')}
        onOpenCoach={(p) => openCoach(p)}
      />

      <EnergyCard energy={ctx.energy} nowHHMM={ctx.nowHHMM} onOpenCoach={(p) => openCoach(p)} coachPrompt={COACH_CHIPS[11]} />

      <MacroSection ctx={ctx} bodyWeightLb={bodyWeightLb} emptyText={m.empty.protein} onLogMeal={() => openLog('meal')} />

      {m.insights.length > 0 && (
        <section className="px-4 pb-5 flex flex-col gap-3" aria-label="Insights">
          <SectionHeader title="Insights" caption="From your own numbers — tap to ask the coach" />
          {m.insights.map((ins) => (
            <InsightCard key={ins.id} insight={ins} onOpen={(prompt) => openCoach(prompt)} />
          ))}
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
        onGoingToBed={() => openLog('bedtime')}
        onAskCoach={(p) => openCoach(p)}
      />

      <footer className="px-4 pt-1 pb-2 text-center">
        <p className="text-[11px] leading-4 text-hx-muted">Wellness information only — not medical advice.</p>
      </footer>
    </div>
  );
}
