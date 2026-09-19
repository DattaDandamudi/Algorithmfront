/**
 * The box score and the food ledger — SPEC §1 #3, in the spec's order.
 *
 * `MetricTiles` (default) renders the four box-score cells Today places
 * straight inside its `.hx-score-grid`: Sleep | HRV over Resting HR | Steps.
 * `FoodLedger` renders the two ledger rows under the "Food" running head:
 * Protein remaining and Calories remaining, each with a `.hx-fig` figure flush
 * right, a 2 px progress rule and the pacing captions.
 *
 * Every cell shows "vs your 30-day average" (RHR: 28-day, §1) with a ▲/▼
 * coloured by the metric's good direction — the engine's BaselineDelta
 * already carries `good`, so the cell never decides direction itself. The
 * metrics that accumulate through the day (Protein / Calories / Steps) are
 * the exception until the evening: a partial count against full days would
 * read as a deficit at breakfast, so they caption the 30-day mean ("30-day
 * avg 176 g/day", "30-day avg 8,048/day") and only switch to the ▲/▼ delta
 * once the day is essentially complete (R1-4 / R7-4, DAY_COMPLETE_HOUR).
 * HRV is the other exception: its ▲/▼ is against the 28-day reference the
 * SWC is centred on — the one number the hero and the coach call "baseline"
 * (R7-8) — not the 30-day arithmetic mean.
 * Tapping a cell or a row opens the Coach pre-filled with a contextual prompt
 * from `suggestedPrompts(ctx)` (WHOOP pattern: chips carry most coach traffic).
 */
import type { ReactNode } from 'react';
import type { Band, BaselineDelta, CoachContext, HrvBand } from '../../data/types';
import { BASELINE_READINGS, COACH_CHIPS, PROTEIN_PER_MEAL_GKG, type EmptyStates, type SuggestedPrompts } from '../../engine';
import { fmt, fmtMinutes, lbToKg, round } from '../../lib/format';
import { Delta, Sparkline, Tile, type TileDelta } from '../../ui';
import { goalBandLabel } from '../trends/series';
import ProgressRule from './ProgressRule';
import type { NutritionBaseline } from './useTodayModel';

const HRV_LABEL: Record<HrvBand, { text: string; band: Band }> = {
  balanced: { text: 'Balanced', band: 'green' },
  unbalanced: { text: 'Unbalanced', band: 'yellow' },
  low: { text: 'Low', band: 'red' },
  poor: { text: 'Poor', band: 'red' },
  insufficient: { text: 'Calibrating', band: 'neutral' },
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * A box-score cell is 159 px wide, and the kit's Delta is a non-wrapping
 * inline-flex, so "▲ 11 ms vs 28-day baseline" would break inside the number.
 * Let the caption drop to its own line and keep the glyph and figure whole.
 */
const CELL = '[&_span.inline-flex]:flex-wrap [&_span.inline-flex>span:first-child]:whitespace-nowrap';

/** Pick the contextual coach prompt for a cell from the engine's suggestions. */
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

/**
 * HRV cell label (R1-9): a neutral "Calibrating" until the engine's one
 * baseline gate (≥ 21 readings in 30 days) passes — a coloured Balanced /
 * Unbalanced / Low label from a provisional range would contradict the hero.
 */
export function hrvTileLabel(hrv: CoachContext['hrv']): { text: string; band: Band } {
  const days = hrv.daysOfData ?? hrv.delta.n ?? 0;
  const established = hrv.baselineEstablished ?? days >= BASELINE_READINGS;
  if (!established || hrv.band === 'insufficient') {
    return { text: `Calibrating, ${fmt(Math.min(days, BASELINE_READINGS))}/${BASELINE_READINGS} days`, band: 'neutral' };
  }
  return HRV_LABEL[hrv.band] ?? HRV_LABEL.insufficient;
}

/** "30-day avg 176 g/day" ("30-day avg 8,048/day" for a unit-less metric) — null when there is no history to average. */
export function baselineCaption(bd: BaselineDelta, unit = ''): string | null {
  return isNum(bd.baseline) && bd.n > 0 ? `30-day avg ${fmt(bd.baseline)}${unit ? ` ${unit}` : ''}/day` : null;
}

/** ▲/▼ vs the 30-day mean, only once the day is essentially complete (R1-4 intake, R7-4 steps). */
export function dayCompleteDelta(bd: BaselineDelta, dayComplete: boolean, unit?: string): TileDelta | undefined {
  if (!dayComplete || !isNum(bd.delta)) return undefined;
  return { value: bd.delta, good: bd.good, unit };
}

/** "Goal 8–10k" only when both targets are whole thousands, else the exact numbers ("Goal 7,500–10,000") — the Trends rule (R7-11). */
export function stepsGoalLabel(goalMin: number, goalMax: number): string {
  return `Goal ${goalBandLabel(goalMin, goalMax)}`;
}

/**
 * HRV ▲/▼ (R7-8): against the 28-day reference the SWC is centred on
 * (`baseline28`, engine/hrv.ts) — the figure the hero detail and the coach
 * also call "baseline". While it is still forming the cell falls back to the
 * 30-day arithmetic mean and says so in the caption. Higher HRV is good.
 */
export function hrvTileDelta(hrv: CoachContext['hrv']): TileDelta {
  if (isNum(hrv.today) && isNum(hrv.baseline28)) {
    const d = round(hrv.today - hrv.baseline28, 2);
    return { value: d, good: d > 0 ? true : d < 0 ? false : null, unit: 'ms', caption: 'vs 28-day baseline' };
  }
  return { value: hrv.delta.delta, good: hrv.delta.good, unit: 'ms', caption: 'vs 30-day avg' };
}

export interface MetricTilesProps {
  ctx: CoachContext;
  prompts: SuggestedPrompts;
  empty: EmptyStates;
  hrv7: Array<number | null>;
  /** Used by the calories row; accepted here so both halves take one props object. */
  provisionalTdee: number | null;
  /** Reference body weight (lb) for the per-meal protein ceiling (the protein row). */
  bodyWeightLb: number;
  /** 30-day intake baselines for the food rows; `dayComplete` also gates the steps delta. */
  baseline: NutritionBaseline;
  onOpenCoach: (prompt: string) => void;
}

/** The four box-score cells; place the fragment straight inside `.hx-score-grid`. */
export default function MetricTiles({ ctx, prompts, empty, hrv7, baseline, onOpenCoach }: MetricTilesProps) {
  const open = (tile: Parameters<typeof tilePrompt>[0]) => () => onOpenCoach(tilePrompt(tile, ctx, prompts));

  // --- Sleep: hours vs need as a progress rule, the debt in words ---------
  const sleepHours = ctx.sleep.hours;
  const need = ctx.sleep.need;
  const debt = ctx.sleep.debtMin;
  const sleepSub: ReactNode = isNum(sleepHours) && isNum(debt) && debt > 0 ? `${fmtMinutes(debt)} debt` : undefined;
  const sleepRule =
    isNum(sleepHours) && isNum(need) && need > 0 ? (
      <ProgressRule value={sleepHours} max={need} label="Sleep versus need" end={`of ${fmt(need, 1)} h`} valueText={`${fmt(sleepHours, 1)} of ${fmt(need, 1)} h`} />
    ) : undefined;

  // --- HRV -----------------------------------------------------------------
  const hrvMeta = hrvTileLabel(ctx.hrv);
  const swc: [number, number] | null = isNum(ctx.hrv.swcLower) && isNum(ctx.hrv.swcUpper) ? [ctx.hrv.swcLower, ctx.hrv.swcUpper] : null;
  const hasHrvSpark = hrv7.some((v) => v !== null);
  const hrvSpark = hasHrvSpark ? (
    <span className="flex items-center gap-2">
      <Sparkline values={hrv7} band={swc} highlightLast width={104} height={24} title="HRV, last 7 days" />
      <span className="hx-agate">7 days</span>
    </span>
  ) : undefined;

  // --- Steps ---------------------------------------------------------------
  const steps = ctx.steps.today;
  const stepsGoalHit = isNum(steps) && steps >= ctx.steps.goalMin;
  // R7-4: a partial count vs the mean of full days is not a change — same gate as intake.
  const stepsDelta = dayCompleteDelta(ctx.steps, baseline.dayComplete);
  const stepsAvg = stepsDelta ? null : baselineCaption(ctx.steps);
  const stepsPct = isNum(steps) && ctx.steps.goalMin > 0 ? Math.round((steps / ctx.steps.goalMin) * 100) : null;
  const stepsRule = isNum(steps) ? (
    <ProgressRule
      value={steps}
      max={ctx.steps.goalMin}
      tone={stepsGoalHit ? 'green' : 'blue'}
      label="Steps toward goal"
      end={stepsPct !== null ? `${fmt(stepsPct)}%` : undefined}
      valueText={`${fmt(steps)} of ${fmt(ctx.steps.goalMin)} steps`}
    />
  ) : undefined;

  return (
    <>
      <Tile
        className={CELL}
        label="Sleep"
        value={sleepHours}
        dp={1}
        unit="h"
        delta={{ value: ctx.sleep.delta.delta, good: ctx.sleep.delta.good, dp: 1, unit: 'h' }}
        sub={sleepSub}
        chart={sleepRule}
        chartLayout="stack"
        emptyHint={empty.sleep ?? "Log last night's sleep or connect WHOOP."}
        onClick={open('sleep')}
      />
      <Tile
        className={CELL}
        label="HRV"
        value={ctx.hrv.today}
        unit="ms"
        band={hrvMeta.band}
        sub={hrvMeta.text}
        delta={hrvTileDelta(ctx.hrv)}
        chart={hrvSpark}
        chartLayout="stack"
        emptyHint={empty.hrv ?? 'Log HRV or connect WHOOP to start your baseline.'}
        onClick={open('hrv')}
      />
      <Tile
        className={CELL}
        label="Resting HR"
        value={ctx.rhr.today}
        unit="bpm"
        delta={{ value: ctx.rhr.delta, good: ctx.rhr.good, unit: 'bpm', caption: 'vs 28-day avg' }}
        sub={isNum(ctx.rhr.baseline) ? `Baseline ${fmt(ctx.rhr.baseline)} bpm` : undefined}
        emptyHint="Log resting HR or connect WHOOP."
        onClick={open('rhr')}
      />
      <Tile
        className={CELL}
        label="Steps"
        value={steps}
        delta={stepsDelta}
        sub={
          <span className="flex flex-col">
            <span>{`${stepsGoalLabel(ctx.steps.goalMin, ctx.steps.goalMax)}${stepsGoalHit ? ', reached' : ''}`}</span>
            {stepsAvg && <span className="hx-cap">{stepsAvg}</span>}
          </span>
        }
        band={stepsGoalHit ? 'green' : undefined}
        chart={stepsRule}
        chartLayout="stack"
        emptyHint="Log steps or connect WHOOP."
        onClick={open('steps')}
      />
    </>
  );
}

/** "3 meals left" / "1 meal left" / "No meals left". */
export function mealsLeftText(n: number): string {
  if (n <= 0) return 'No meals left';
  return `${fmt(n)} ${n === 1 ? 'meal' : 'meals'} left`;
}

/**
 * The food ledger: Protein remaining (protein-first, §6.5, with pacing) and
 * Calories remaining, as two tappable ledger rows. Place inside `.hx-ledger`.
 */
export function FoodLedger({ ctx, prompts, provisionalTdee, bodyWeightLb, baseline, onOpenCoach }: MetricTilesProps) {
  const open = (tile: Parameters<typeof tilePrompt>[0]) => () => onOpenCoach(tilePrompt(tile, ctx, prompts));

  // --- Protein (protein-first, §6.5) ----------------------------------------
  const n = ctx.nutrition;
  const proteinLeft = Math.max(0, n.remaining.p);
  const proteinTarget = n.targets.p;
  const soFar = n.totals.p;
  // The engine's per-meal band (from the same reference weight as the pacing) wins; the
  // prop-derived figure is the fallback for contexts built before it existed.
  const maxPerMeal = isNum(n.maxPerMeal) ? n.maxPerMeal : round(PROTEIN_PER_MEAL_GKG[1] * lbToKg(bodyWeightLb));
  const minPerMeal = isNum(n.minPerMeal) ? n.minPerMeal : round(PROTEIN_PER_MEAL_GKG[0] * lbToKg(bodyWeightLb));
  // §6.5 "nudge if a meal slot lands < 31 g" (R3-7).
  const lowSlot = n.lastMealBelowMin === true && isNum(n.lastMealProtein);
  const left = mealsLeftText(n.mealsLeft).toLowerCase();
  let proteinBand: Band | undefined;
  let pacing: string;
  if (n.remaining.p <= 0) {
    proteinBand = 'green';
    pacing = n.remaining.p < 0 ? `Target hit, ${fmt(-n.remaining.p)} g over.` : 'Target hit.';
  } else if (n.mealsLeft <= 0) {
    proteinBand = 'red';
    pacing = 'No meal slots left before bed.';
  } else if (isNum(n.proteinPerMealNeeded)) {
    const aboveMax = n.proteinPerMealNeeded > maxPerMeal;
    proteinBand = aboveMax || lowSlot ? 'yellow' : undefined;
    // Colour is never the only carrier (R6-12): say the ceiling breach in words.
    const perMeal = `~${fmt(n.proteinPerMealNeeded)} g × ${left}${aboveMax ? `, above your ${fmt(maxPerMeal)} g/meal max, so spread it across an extra meal` : ''}.`;
    pacing = lowSlot ? `Last meal ${fmt(n.lastMealProtein)} g, under your ${fmt(minPerMeal)} g floor. ${perMeal}` : perMeal;
  } else {
    proteinBand = lowSlot ? 'yellow' : undefined;
    pacing = lowSlot ? `Last meal ${fmt(n.lastMealProtein)} g, under your ${fmt(minPerMeal)} g floor. ${mealsLeftText(n.mealsLeft)}.` : `${mealsLeftText(n.mealsLeft)}.`;
  }
  const proteinPct = proteinTarget > 0 ? Math.round((soFar / proteinTarget) * 100) : 0;
  const proteinDelta = dayCompleteDelta(baseline.protein, baseline.dayComplete, 'g');
  const proteinAvg = proteinDelta ? null : baselineCaption(baseline.protein, 'g');
  const logged = n.mealsLogged > 0 ? `, ${fmt(n.mealsLogged)} ${n.mealsLogged === 1 ? 'meal' : 'meals'} logged` : ', nothing logged yet';

  // --- Calories ------------------------------------------------------------
  const kcalLeft = n.remaining.kc;
  const kcalOver = kcalLeft < 0;
  const tdee = ctx.expenditure.valid && isNum(ctx.expenditure.tdee) ? ctx.expenditure.tdee : null;
  let kcalSub: string;
  if (kcalOver) kcalSub = `over your ${fmt(n.targets.kc)} kcal target`;
  else if (tdee !== null) kcalSub = `of ${fmt(n.targets.kc)}, TDEE about ${fmt(tdee)}`;
  else if (isNum(provisionalTdee)) kcalSub = `of ${fmt(n.targets.kc)}, TDEE about ${fmt(provisionalTdee)} (still calibrating)`;
  else kcalSub = `of ${fmt(n.targets.kc)} kcal`;
  const kcalDelta = dayCompleteDelta(baseline.kcal, baseline.dayComplete, 'kcal');
  const kcalAvg = kcalDelta ? null : baselineCaption(baseline.kcal, 'kcal');
  const kcalPct = n.targets.kc > 0 ? Math.round((n.totals.kc / n.targets.kc) * 100) : 0;

  return (
    <>
      <button type="button" onClick={open('protein')} className="hx-row hx-press text-left">
        <span className="w-full flex items-baseline justify-between gap-3">
          <span className="hx-body min-w-0">Protein remaining</span>
          <span className="hx-fig text-hx-text shrink-0">
            {fmt(proteinLeft)}
            <span className="hx-unit">g</span>
          </span>
        </span>
        <ProgressRule
          className="mt-2"
          value={soFar}
          max={proteinTarget}
          tone={proteinBand ?? 'ink'}
          label="Protein eaten"
          end={`${fmt(proteinPct)}%`}
          valueText={`${fmt(soFar)} of ${fmt(proteinTarget)} g`}
        />
        <span className="hx-cap mt-2">{pacing}</span>
        <span className="hx-cap">{`${fmt(soFar)} g of ${fmt(proteinTarget)} g eaten${logged}.`}</span>
        {proteinDelta ? (
          <Delta className="mt-1" value={proteinDelta.value} good={proteinDelta.good} unit={proteinDelta.unit} />
        ) : (
          proteinAvg && <span className="hx-cap">{proteinAvg}</span>
        )}
      </button>

      <button type="button" onClick={open('calories')} className="hx-row hx-press text-left">
        <span className="w-full flex items-baseline justify-between gap-3">
          <span className="hx-body min-w-0">{kcalOver ? 'Calories over' : 'Calories remaining'}</span>
          <span className="hx-fig text-hx-text shrink-0">
            {fmt(Math.abs(kcalLeft))}
            <span className="hx-unit">{kcalOver ? 'kcal over' : 'kcal'}</span>
          </span>
        </span>
        <ProgressRule
          className="mt-2"
          value={n.totals.kc}
          max={n.targets.kc}
          tone={kcalOver ? 'red' : 'ink'}
          label="Calories eaten"
          end={`${fmt(kcalPct)}%`}
          valueText={`${fmt(n.totals.kc)} of ${fmt(n.targets.kc)} kcal`}
        />
        <span className="hx-cap mt-2">{kcalSub}</span>
        {kcalDelta ? <Delta className="mt-1" value={kcalDelta.value} good={kcalDelta.good} unit={kcalDelta.unit} /> : kcalAvg && <span className="hx-cap">{kcalAvg}</span>}
      </button>
    </>
  );
}
