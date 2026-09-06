/**
 * Today / Dashboard — SPEC §1, top → bottom exactly:
 *  1. header (date · day-type chip · banners: escalation / storage / retest)
 *  2. Readiness hero ring          3. training verdict chip
 *  4. morning weigh-in prompt      5. metric tiles (2-col)
 *  6. macro remaining bars         7. insight cards (max 3)
 *  8. weight trend card            9. tobacco tile
 * 10. bedtime / caffeine nudges   +  the wellness-only footer.
 *
 * Every number is read from `useTodayModel()` (store → engine context); this
 * file only wires navigation: tiles/cards → Coach pre-fills, prompts → Log
 * deep-links, banners → Settings sections, quick actions → store actions.
 */
import { InsightCard, SectionHeader, toast } from '../ui';
import { isWeight } from '../engine';
import { useNav } from '../nav';
import { BACKUP_SNOOZE_DAYS, type TodayBanner } from './today/banners';
import MacroSection from './today/MacroSection';
import MetricTiles from './today/MetricTiles';
import { NudgeStrip, WeighInPrompt } from './today/Nudges';
import ReadinessHero from './today/ReadinessHero';
import TobaccoTile from './today/TobaccoTile';
import TodayHeader from './today/TodayHeader';
import WeightTrendCard from './today/WeightTrendCard';
import { useTodayModel } from './today/useTodayModel';

/** The weigh-in prompt is a *morning* prompt (§2): hide it from noon onward. */
const WEIGH_PROMPT_UNTIL_HOUR = 12;

export default function Today() {
  const m = useTodayModel();
  const { ctx, settings, actions, today } = m;
  const { openCoach, openLog, openSettings } = useNav();
  const profile = settings.profile;

  const showWeighIn = !isWeight(m.todayRecord?.w) && m.now.getHours() < WEIGH_PROMPT_UNTIL_HOUR && settings.lastWeighPromptDate !== today;

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
