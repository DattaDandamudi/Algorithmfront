/**
 * The load block, shared by Train ▸ Today and the Analysis load section: a
 * box score (DESIGN.md "Three block types"), not a card.
 *
 * Reading order is the audit's, not the tradition's: **absolute acute load
 * and the week-on-week change lead** the box score, because that is what any
 * advice in this app is allowed to act on (+10%/wk is a soft guidance line,
 * never a block — `LOAD_NOTES.weekOverWeek`). Fitness and fatigue follow as
 * the second pair and form, the difference, as a full-width row with its band
 * word and tone square. The acute:chronic ratio comes *last*, as a ledger row
 * under the box score, and carries `LOAD_NOTES.acwrDescriptive` verbatim:
 * Impellizzeri 2020 found the ratio has fundamental statistical pitfalls and
 * no causal identification, so it is described here and never used to change
 * a recommendation. Analysis passes `showAcwr={false}` because its figure
 * carries the ratio with the same note as its caption.
 *
 * Fitness / fatigue / form come from the Banister model; when its time
 * constants are still the 42/7 priors (`tauIsPrior`) the block says so rather
 * than presenting a placeholder as a personal fit.
 *
 * The same promise covers where the load itself came from. A WHOOP day carries
 * no load — it carries a strain, converted by `a·(2^(s/b) − 1)`, and until eight
 * days have both a strain and a logged session those constants are the assumed
 * a = 25 / b = 3.5 prior, which the module's own simulation puts outside the
 * ±20 % band. So when the block is built on the prior AND any of these numbers
 * came from WHOOP (`whoopIsPrior` with a `whoop`/`mixed` source), it says so
 * with `LOAD_NOTES.whoopPrior` — an estimated series must never read like a
 * measured one.
 */
import type { ReactNode } from 'react';
import type { TrainingContext } from '../../data/types';
import { LOAD_NOTES, WEEKLY_LOAD_SOFT_CAP_PCT } from '../../engine';
import { fmt } from '../../lib/format';
import { bandText } from '../../ui';
import { Note, Stat } from './TrainCard';
import { acwrBandTone, acwrBandWord, formBandTone, formBandWord, formatPct } from './trainUtils';

export interface LoadGaugeProps {
  load: TrainingContext['load'];
  /** The "what this means" line under the block, set as a hedge. */
  meaning?: ReactNode;
  /** Draw the acute:chronic row and its note. Default true. */
  showAcwr?: boolean;
}

export default function LoadGauge({ load, meaning, showAcwr = true }: LoadGaugeProps) {
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
  const acwrTone = acwrBandTone(load.acwrBand);
  // Only when WHOOP actually fed the series: on a purely logged block the
  // conversion never ran, and a note about it would be noise.
  const whoopPrior = load.whoopIsPrior === true && (load.source === 'whoop' || load.source === 'mixed');
  const form = `${load.form > 0 ? '+' : load.form < 0 ? '−' : ''}${fmt(Math.abs(Math.round(load.form)), 0)}`;

  return (
    <div className="flex flex-col">
      <div className="hx-score-grid">
        {/* Lead: absolute load and its week-on-week change, one number each. */}
        <Stat size="lg" label="Acute load (7-day)" value={fmt(Math.round(load.acute7), 0)} sub={`${fmt(Math.round(load.weeklyLoad), 0)} units logged this week`} />
        <Stat size="lg" label="vs last week" value={formatPct(wow)} sub={wowWord} />
        {/* The Banister state. */}
        <Stat size="lg" label="Fitness" value={fmt(Math.round(load.fitness), 0)} />
        <Stat size="lg" label="Fatigue" value={fmt(Math.round(load.fatigue), 0)} />
        <div className="hx-row border-t border-hx-border">
          <div className="flex items-baseline justify-between gap-3">
            <span className="hx-label">Form</span>
            <span className="hx-fig text-hx-text text-right shrink-0">{form}</span>
          </div>
          <span className={`hx-label mt-1 ${formTone === 'neutral' ? '' : bandText(formTone)}`}>
            {formTone !== 'neutral' && <span className="hx-tone mr-1.5" aria-hidden />}
            {formBandWord(load.formBand)}
          </span>
        </div>
      </div>

      {showAcwr && (
        <div className="hx-ledger mt-4 border-t border-hx-border">
          {/* Below the decision numbers, and explicitly descriptive. */}
          <div className="hx-row">
            <div className="flex items-baseline justify-between gap-3">
              <span className="hx-body">Acute : chronic</span>
              <span className="hx-fig text-hx-text text-right shrink-0">{load.acwr === null ? '—' : fmt(load.acwr, 2)}</span>
            </div>
            <span className={`hx-label mt-1 ${acwrTone === 'neutral' ? '' : bandText(acwrTone)}`}>
              {acwrTone !== 'neutral' && <span className="hx-tone mr-1.5" aria-hidden />}
              {acwrBandWord(load.acwrBand)}
            </span>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {showAcwr && <Note>{LOAD_NOTES.acwrDescriptive}</Note>}
        {whoopPrior && <Note>{LOAD_NOTES.whoopPrior}</Note>}
        {load.tauIsPrior && <Note>{LOAD_NOTES.tauPrior}</Note>}
        {meaning && (
          <p className="hx-hedge">
            <span>What this means: </span>
            {meaning}
          </p>
        )}
      </div>
    </div>
  );
}
