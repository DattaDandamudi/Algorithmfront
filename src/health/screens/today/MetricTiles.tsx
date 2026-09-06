/**
 * Secondary metric tiles — SPEC §1 #3, in the mandated order:
 * Sleep · HRV · RHR · Steps · Protein remaining (lg, full width) · Calories.
 *
 * Every tile shows "vs your 30-day average" (RHR: 28-day, §1) with a ▲/▼
 * coloured by the metric's good direction — the engine's BaselineDelta
 * already carries `good`, so the tile never decides direction itself.
 * Tapping a tile opens the Coach pre-filled with a contextual prompt from
 * `suggestedPrompts(ctx)` (WHOOP pattern: chips carry most coach traffic).
 */
import type { ReactNode } from 'react';
import type { Band, CoachContext, HrvBand } from '../../data/types';
import { COACH_CHIPS, PROTEIN_PER_MEAL_GKG, type EmptyStates, type SuggestedPrompts } from '../../engine';
import { fmt, fmtMinutes, lbToKg, round } from '../../lib/format';
import { ProgressRing, Sparkline, Tile, bandBg } from '../../ui';

const HRV_LABEL: Record<HrvBand, { text: string; band: Band }> = {
  balanced: { text: 'Balanced', band: 'green' },
  unbalanced: { text: 'Unbalanced', band: 'yellow' },
  low: { text: 'Low', band: 'red' },
  poor: { text: 'Poor', band: 'red' },
  insufficient: { text: 'Baseline forming', band: 'neutral' },
};

/** Hours short of need that still reads as on-track / caution (§6.4 hours-vs-need). */
const SLEEP_OK_SHORT_MIN = 30;
const SLEEP_WARN_SHORT_MIN = 60;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Pick the contextual coach prompt for a tile from the engine's suggestions. */
export function tilePrompt(tile: 'sleep' | 'hrv' | 'rhr' | 'steps' | 'protein' | 'calories', ctx: CoachContext, prompts: SuggestedPrompts): string {
  switch (tile) {
    case 'sleep':
      return prompts.sleep[0] ?? COACH_CHIPS[5];
    case 'hrv':
      return (
        prompts.recovery.find((p) => /HRV/.test(p)) ??
        (ctx.readiness.band === 'red' ? COACH_CHIPS[2] : prompts.recovery.find((p) => /recovery/.test(p)) ?? prompts.recovery[0] ?? COACH_CHIPS[2])
      );
    case 'rhr':
      return prompts.recovery[0] ?? COACH_CHIPS[0];
    case 'steps': {
      const today = ctx.steps.today;
      if (isNum(today) && today < ctx.steps.goalMin) return 'How do I close my step gap today?';
      return prompts.today[0] ?? COACH_CHIPS[0];
    }
    case 'protein':
      return prompts.nutrition.find((p) => /protein/i.test(p)) ?? prompts.nutrition[0] ?? COACH_CHIPS[1];
    case 'calories':
      return prompts.nutrition.find((p) => p === COACH_CHIPS[3]) ?? prompts.nutrition[0] ?? COACH_CHIPS[3];
  }
}

function sleepBand(deltaMin: number | null): Band | undefined {
  if (deltaMin === null) return undefined;
  if (deltaMin >= -SLEEP_OK_SHORT_MIN) return 'green';
  if (deltaMin >= -SLEEP_WARN_SHORT_MIN) return 'yellow';
  return 'red';
}

/** Hours-vs-need mini bar + debt line for the Sleep tile's `sub` slot. */
function SleepSub({ hours, need, debtMin }: { hours: number; need: number | null; debtMin: number | null }) {
  const frac = need && need > 0 ? Math.min(1, hours / need) : null;
  const deltaMin = need === null ? null : Math.round((hours - need) * 60);
  const band = sleepBand(deltaMin) ?? 'neutral';
  return (
    <div className="flex flex-col gap-1 text-hx-text2">
      {frac !== null && (
        <div className="h-1.5 w-full rounded-full bg-hx-card2 overflow-hidden" aria-hidden>
          <div className={`h-full rounded-full ${bandBg(band)}`} style={{ width: `${Math.round(frac * 100)}%` }} />
        </div>
      )}
      <span className="text-[12px] leading-4 text-hx-text2">
        {need !== null ? `of ${fmt(need, 1)} h need` : 'need unknown'}
        {isNum(debtMin) && debtMin > 0 ? ` · ${fmtMinutes(debtMin)} debt` : ''}
      </span>
    </div>
  );
}

export interface MetricTilesProps {
  ctx: CoachContext;
  prompts: SuggestedPrompts;
  empty: EmptyStates;
  hrv7: Array<number | null>;
  smoothedTdee: number | null;
  /** Reference body weight (lb) for the per-meal protein ceiling. */
  bodyWeightLb: number;
  onOpenCoach: (prompt: string) => void;
}

export default function MetricTiles({ ctx, prompts, empty, hrv7, smoothedTdee, bodyWeightLb, onOpenCoach }: MetricTilesProps) {
  const open = (tile: Parameters<typeof tilePrompt>[0]) => () => onOpenCoach(tilePrompt(tile, ctx, prompts));

  // --- Sleep ---------------------------------------------------------------
  const sleepHours = ctx.sleep.hours;
  const sleepSub: ReactNode = isNum(sleepHours) ? <SleepSub hours={sleepHours} need={ctx.sleep.need} debtMin={ctx.sleep.debtMin} /> : null;

  // --- HRV -----------------------------------------------------------------
  const hrvMeta = HRV_LABEL[ctx.hrv.band] ?? HRV_LABEL.insufficient;
  const swc: [number, number] | null = isNum(ctx.hrv.swcLower) && isNum(ctx.hrv.swcUpper) ? [ctx.hrv.swcLower, ctx.hrv.swcUpper] : null;
  const hasHrvSpark = hrv7.some((v) => v !== null);

  // --- Steps ---------------------------------------------------------------
  const steps = ctx.steps.today;
  const stepsGoalHit = isNum(steps) && steps >= ctx.steps.goalMin;

  // --- Protein (protein-first, §6.5) ----------------------------------------
  const n = ctx.nutrition;
  const proteinLeft = Math.max(0, n.remaining.p);
  const proteinTarget = n.targets.p;
  const soFar = n.totals.p;
  const maxPerMeal = round(PROTEIN_PER_MEAL_GKG[1] * lbToKg(bodyWeightLb));
  let proteinBand: Band | undefined;
  let pacing: string;
  if (n.remaining.p <= 0) {
    proteinBand = 'green';
    pacing = n.remaining.p < 0 ? `Target hit — ${fmt(-n.remaining.p)} g over` : 'Target hit';
  } else if (n.mealsLeft <= 0) {
    proteinBand = 'red';
    pacing = 'No meal slots left before bed';
  } else if (isNum(n.proteinPerMealNeeded)) {
    proteinBand = n.proteinPerMealNeeded > maxPerMeal ? 'yellow' : undefined;
    pacing = `~${fmt(n.proteinPerMealNeeded)} g × ${n.mealsLeft} ${n.mealsLeft === 1 ? 'meal' : 'meals'} left`;
  } else {
    pacing = `${n.mealsLeft} ${n.mealsLeft === 1 ? 'meal' : 'meals'} left`;
  }
  const proteinPct = proteinTarget > 0 ? Math.round((soFar / proteinTarget) * 100) : 0;

  // --- Calories ------------------------------------------------------------
  const kcalLeft = n.remaining.kc;
  const kcalOver = kcalLeft < 0;
  const tdee = ctx.expenditure.valid && isNum(ctx.expenditure.tdee) ? ctx.expenditure.tdee : null;
  let kcalSub: string;
  if (kcalOver) kcalSub = `over your ${fmt(n.targets.kc)} kcal target`;
  else if (tdee !== null) kcalSub = `of ${fmt(n.targets.kc)} · TDEE ~${fmt(tdee)}`;
  else if (isNum(smoothedTdee)) kcalSub = `of ${fmt(n.targets.kc)} · TDEE ~${fmt(smoothedTdee)} (last calibrated)`;
  else kcalSub = `of ${fmt(n.targets.kc)} kcal`;

  return (
    <section className="px-4 pb-5" aria-label="Today's metrics">
      <div className="grid grid-cols-2 gap-3">
        <Tile
          label="Sleep"
          value={sleepHours}
          dp={1}
          unit="h"
          delta={{ value: ctx.sleep.delta.delta, good: ctx.sleep.delta.good, dp: 1, unit: 'h' }}
          sub={sleepSub}
          emptyHint={empty.sleep ?? "Log last night's sleep or connect WHOOP."}
          onClick={open('sleep')}
        />
        <Tile
          label="HRV"
          value={ctx.hrv.today}
          unit="ms"
          band={hrvMeta.band}
          sub={hrvMeta.text}
          delta={{ value: ctx.hrv.delta.delta, good: ctx.hrv.delta.good, unit: 'ms' }}
          chart={hasHrvSpark ? <Sparkline values={hrv7} band={swc} highlightLast width={124} height={26} title="HRV, last 7 days" /> : undefined}
          chartLayout="stack"
          emptyHint={empty.hrv ?? 'Log HRV or connect WHOOP to start your baseline.'}
          onClick={open('hrv')}
        />
        <Tile
          label="RHR"
          value={ctx.rhr.today}
          unit="bpm"
          delta={{ value: ctx.rhr.delta, good: ctx.rhr.good, unit: 'bpm', caption: 'vs 28-day avg' }}
          sub={isNum(ctx.rhr.baseline) ? `Baseline ${fmt(ctx.rhr.baseline)} bpm` : undefined}
          emptyHint="Log resting HR or connect WHOOP."
          onClick={open('rhr')}
        />
        <Tile
          label="Steps"
          value={steps}
          delta={{ value: ctx.steps.delta, good: ctx.steps.good }}
          sub={`Goal ${fmt(ctx.steps.goalMin / 1000, 0)}–${fmt(ctx.steps.goalMax / 1000, 0)}k`}
          band={stepsGoalHit ? 'green' : undefined}
          chart={<ProgressRing value={steps} max={ctx.steps.goalMin} color={stepsGoalHit ? 'green' : 'blue'} size={44} stroke={5} label="Steps toward goal" />}
          emptyHint="Log steps or connect WHOOP."
          onClick={open('steps')}
        />
        <Tile
          label="Protein remaining"
          size="lg"
          className="col-span-2"
          value={proteinLeft}
          unit="g"
          band={proteinBand}
          sub={
            <span className="flex flex-col gap-0.5">
              <span>{pacing}</span>
              <span className="text-hx-text2 font-normal">
                {fmt(soFar)} g of {fmt(proteinTarget)} g eaten
                {n.mealsLogged > 0 ? ` · ${n.mealsLogged} ${n.mealsLogged === 1 ? 'meal' : 'meals'} logged` : ' · nothing logged yet'}
              </span>
            </span>
          }
          chart={
            <ProgressRing value={soFar} max={proteinTarget} color="green" size={52} stroke={6} label="Protein eaten">
              <span className="text-[11px] font-semibold text-hx-text2">{proteinPct}%</span>
            </ProgressRing>
          }
          onClick={open('protein')}
        />
        <Tile
          label="Calories remaining"
          className="col-span-2"
          value={Math.abs(kcalLeft)}
          unit="kcal"
          band={kcalOver ? 'red' : undefined}
          sub={kcalSub}
          onClick={open('calories')}
        />
      </div>
    </section>
  );
}
