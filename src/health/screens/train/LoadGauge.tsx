/**
 * The fitness / fatigue / form gauge, shared by Train ▸ Today and the
 * Analysis load card.
 *
 * Reading order is the audit's, not the tradition's: **absolute acute load
 * and the week-on-week change lead**, because that is what any advice in this
 * app is allowed to act on (+10%/wk is a soft guidance line, never a block —
 * `LOAD_NOTES.weekOverWeek`). The acute:chronic ratio is shaded in *below*
 * them and carries `LOAD_NOTES.acwrDescriptive` verbatim: Impellizzeri 2020
 * found the ratio has fundamental statistical pitfalls and no causal
 * identification, so it is described here and never used to change a
 * recommendation.
 *
 * Fitness / fatigue / form come from the Banister model; when its time
 * constants are still the 42/7 priors (`tauIsPrior`) the card says so rather
 * than presenting a placeholder as a personal fit.
 *
 * The same promise covers where the load itself came from. A WHOOP day carries
 * no load — it carries a strain, converted by `a·(2^(s/b) − 1)`, and until eight
 * days have both a strain and a logged session those constants are the assumed
 * a = 25 / b = 3.5 prior, which the module's own simulation puts outside the
 * ±20 % band. So when the block is built on the prior AND any of these numbers
 * came from WHOOP (`whoopIsPrior` with a `whoop`/`mixed` source), the card says
 * so with `LOAD_NOTES.whoopPrior` — an estimated series must never read like a
 * measured one.
 */
import type { TrainingContext } from '../../data/types';
import { LOAD_NOTES, WEEKLY_LOAD_SOFT_CAP_PCT } from '../../engine';
import { fmt } from '../../lib/format';
import { bandSoftBg, bandText } from '../../ui';
import { Note, Stat } from './TrainCard';
import { acwrBandWord, formBandTone, formBandWord, formatPct } from './trainUtils';

export interface LoadGaugeProps {
  load: TrainingContext['load'];
}

export default function LoadGauge({ load }: LoadGaugeProps) {
  const wow = load.weekOverWeekPct;
  const wowWord =
    wow === null
      ? 'not enough history'
      : wow > WEEKLY_LOAD_SOFT_CAP_PCT
        ? `above the +${WEEKLY_LOAD_SOFT_CAP_PCT}% guidance line`
        : wow < -WEEKLY_LOAD_SOFT_CAP_PCT
          ? 'lighter than last week'
          : 'steady';
  const formTone = formBandTone(load.formBand);
  // Only when WHOOP actually fed the series: on a purely logged block the
  // conversion never ran, and a note about it would be noise.
  const whoopPrior = load.whoopIsPrior === true && (load.source === 'whoop' || load.source === 'mixed');

  return (
    <div className="flex flex-col gap-4">
      {/* Lead: absolute load and its week-on-week change. */}
      <div className="flex gap-4">
        <Stat label="Acute load (7-day)" value={fmt(Math.round(load.acute7), 0)} sub={`${fmt(Math.round(load.weeklyLoad), 0)} units logged this week`} className="flex-1" />
        <Stat label="vs last week" value={formatPct(wow)} sub={wowWord} className="flex-1" />
      </div>

      {/* Banister state. */}
      <div className="flex gap-3 border-t border-hx-border pt-3">
        <Stat label="Fitness" value={fmt(Math.round(load.fitness), 0)} className="flex-1" />
        <Stat label="Fatigue" value={fmt(Math.round(load.fatigue), 0)} className="flex-1" />
        <Stat
          label="Form"
          value={`${load.form > 0 ? '+' : load.form < 0 ? '−' : ''}${fmt(Math.abs(Math.round(load.form)), 0)}`}
          sub={formBandWord(load.formBand)}
          tone={formTone}
          className="flex-1"
        />
      </div>

      {/* Below the decision numbers, and explicitly descriptive. */}
      <div className="border-t border-hx-border pt-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] leading-4 text-hx-muted">Acute : chronic</span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] leading-4 font-medium ${bandSoftBg('neutral')} ${bandText('neutral')}`}
          >
            {load.acwr === null ? '—' : fmt(load.acwr, 2)}
          </span>
          <span className="text-[12px] leading-4 text-hx-text2">{acwrBandWord(load.acwrBand)}</span>
        </div>
        <Note>{LOAD_NOTES.acwrDescriptive}</Note>
        {whoopPrior && <Note>{LOAD_NOTES.whoopPrior}</Note>}
        {load.tauIsPrior && <Note>{LOAD_NOTES.tauPrior}</Note>}
      </div>
    </div>
  );
}
