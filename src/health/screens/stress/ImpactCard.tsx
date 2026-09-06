/**
 * ImpactCard — your own behaviours against your own metrics (the N-of-1 grid).
 *
 * Every row shows the shrunk difference in means with a 95 % interval drawn as
 * a BAR THROUGH ZERO, the number of days on each side, how much of the estimate
 * came from published priors rather than from you, and the named confound when
 * the engine found one. An interval that spans zero is labelled as spanning
 * zero, in words.
 *
 * The association caveat sits on the card, above the rows — not in a footnote,
 * not behind a tap. These are observational differences between your own days;
 * nothing here establishes cause.
 *
 * Each bar is scaled to its own interval (the metrics have different units),
 * so bar LENGTHS are not comparable between rows and the caption says so.
 */
import { FlaskConical } from 'lucide-react';
import type { BehaviourEffect, ImpactContext } from '../../data/types';
import { EmptyState, bandBg, bandText } from '../../ui';
import { Note, TrendCard } from '../trends/TrendCard';
import { IMPACT_CAVEAT, ciBar, ciText, daysLine, effectValueText, shrinkageLine, strengthWord } from './format';

export const MIN_DAYS_NOTE = 'A behaviour needs at least 5 days with it and 5 without in the last 90 before it is reported at all.';

export interface ImpactCardProps {
  /** Undefined while the engine has nothing to report. */
  impact?: ImpactContext;
  /** Cap the number of rows. Default 4. */
  max?: number;
}

function EffectRow({ effect }: { effect: BehaviourEffect }) {
  const bar = ciBar(effect.deltaMean, effect.lo95, effect.hi95);
  const strength = strengthWord(effect.qValue);
  const shrink = shrinkageLine(effect.shrunkToPrior);
  const title = effect.label || `${effect.behaviour} → ${effect.metric}`;

  return (
    <li className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 border-b border-hx-border last:border-b-0">
      <div className="flex items-baseline justify-between gap-3 min-w-0">
        <span className="text-[14px] leading-5 font-medium text-hx-text min-w-0">{title}</span>
        <span className="text-[15px] leading-5 font-semibold text-hx-text shrink-0 tabular-nums">{effectValueText(effect)}</span>
      </div>

      {bar && (
        <div className="relative h-6 w-full" role="img" aria-label={`${title}: ${effectValueText(effect)}, ${ciText(effect.lo95, effect.hi95)}`}>
          {/* track */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-hx-card2" aria-hidden />
          {/* the 95 % interval */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full ${bar.crossesZero ? 'bg-hx-neutral' : bandBg(strength.tone)}`}
            style={{ left: `${bar.loPct}%`, width: `${Math.max(1, bar.hiPct - bar.loPct)}%` }}
            aria-hidden
          />
          {/* zero reference — always at the middle */}
          <div className="absolute top-0 bottom-0 w-px bg-hx-border" style={{ left: `${bar.zeroPct}%` }} aria-hidden />
          <span className="absolute top-0 text-[10px] leading-3 text-hx-muted -translate-x-1/2" style={{ left: `${bar.zeroPct}%` }} aria-hidden>
            0
          </span>
          {/* the point estimate */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-hx-text ring-2 ring-hx-card"
            style={{ left: `${bar.pointPct}%` }}
            aria-hidden
          />
        </div>
      )}

      <p className="text-[12px] leading-4 text-hx-text2">
        {ciText(effect.lo95, effect.hi95)} · {daysLine(effect.nYes, effect.nNo)}
      </p>
      <p className="text-[12px] leading-4">
        <span className={`font-medium ${bandText(strength.tone)}`}>{strength.label}</span>
        {bar?.crossesZero ? ' · the interval includes zero, so "no difference" is still on the table' : ''}
      </p>
      {shrink && <p className="text-[12px] leading-4 text-hx-muted">{shrink}</p>}
      {effect.confound && <p className="text-[12px] leading-4 text-hx-yellow">Confounded: {effect.confound}</p>}
    </li>
  );
}

export default function ImpactCard({ impact, max = 4 }: ImpactCardProps) {
  const effects = (impact?.effects ?? []).slice(0, Math.max(0, max));
  const pending = (impact?.pending ?? []).filter((p) => !!p);

  if (!effects.length) {
    return (
      <TrendCard
        title="What moves your numbers"
        caption="Your own behaviours vs your own metrics — associations only"
        empty={
          <EmptyState
            icon={<FlaskConical />}
            title="Not enough days yet"
            hint={
              pending.length
                ? `Still counting days for: ${pending.join(', ')}. ${MIN_DAYS_NOTE}`
                : `Keep logging alcohol, caffeine, late meals and training and this compares your days with and without each one. ${MIN_DAYS_NOTE}`
            }
          />
        }
      />
    );
  }

  return (
    <TrendCard
      title="What moves your numbers"
      caption="Difference between your days with and without each behaviour"
      meaning="Bars are scaled to their own interval, so their lengths are not comparable between rows — read the numbers. Estimates are pulled toward published averages when you have few days, and the p-values are corrected across every behaviour and metric tested together."
    >
      {/* The caveat sits above the rows, on the card — never a footnote. */}
      <div className="rounded-xl border border-hx-border bg-hx-card2/60 p-3">
        <p className="text-[12px] leading-4 text-hx-text2">
          <span className="font-semibold text-hx-text">Association, not cause. </span>
          {IMPACT_CAVEAT.replace('Association, not cause. ', '')}
        </p>
      </div>

      <ul className="flex flex-col">
        {effects.map((e) => (
          <EffectRow key={`${e.behaviour}|${e.metric}`} effect={e} />
        ))}
      </ul>

      {pending.length > 0 && <Note tone="neutral">Still counting days for: {pending.join(', ')}. {MIN_DAYS_NOTE}</Note>}
    </TrendCard>
  );
}
