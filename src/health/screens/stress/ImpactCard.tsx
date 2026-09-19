/**
 * ImpactCard — your own behaviours against your own metrics (the N-of-1 grid).
 *
 * Every row shows the shrunk difference in means as a figure with its 95%
 * interval in brackets and the word "likely" or "unclear" beside it, then the
 * CI drawn as a 1 px text2 line from lo to hi through a dotted zero hairline
 * with a 2 px bone tick at the estimate, the number of days on each side, how
 * much of the estimate came from published priors rather than from you, and
 * the named confound when the engine found one. An interval that spans zero
 * is labelled as spanning zero, in words: the bar is never the only carrier.
 *
 * The association caveat sits on the figure, above the rows, as a note with
 * its own lead ("Association, not cause."), not in a footnote or behind a tap.
 * These are observational differences between your own days; nothing here
 * establishes cause.
 *
 * The strength word is not the q-value dressed up. The q is computed on the
 * *unshrunk* difference and the number beside it is the *shrunk* posterior, so
 * the two can disagree: an interval that spans zero, or an estimate shrinkage
 * pulled to the other side of zero from the user's own days. `strengthWord`
 * only says "Consistent signal" when all three agree; otherwise the row reads
 * "Mixed evidence" and `strengthCaveat` names the disagreement. "likely" is
 * written only beside a consistent signal; every other row reads "unclear".
 *
 * Each bar is scaled to its own interval (the metrics have different units),
 * so bar LENGTHS are not comparable between rows and the caption says so.
 */
import type { BehaviourEffect, ImpactContext } from '../../data/types';
import { IMPACT_HEURISTIC_NOTE, usesHeuristicThreshold } from '../../engine/impact';
import { EmptyState } from '../../ui';
import { TOKEN, useMeasuredWidth } from '../../ui/charts';
import { Note, TrendCard, Word } from '../trends/TrendCard';
import { IMPACT_CAVEAT, ciBar, ciText, daysLine, effectValueText, shrinkageLine, strengthCaveat, strengthWord, type CiBarGeometry } from './format';

export const MIN_DAYS_NOTE = 'A behaviour needs at least 5 days with it and 5 without in the last 90 before it is reported at all.';

/** The caveat's lead phrase, set first in the note. */
const CAVEAT_LEAD = 'Association, not cause.';

export interface ImpactCardProps {
  /** Undefined while the engine has nothing to report. */
  impact?: ImpactContext;
  /** Cap the number of rows. Default 4. */
  max?: number;
}

const BAR_H = 20;

/** The 95% interval as a 1 px text2 line from lo to hi, a 2 px bone tick at the estimate, a dotted hairline at zero. */
function CiBar({ bar, label }: { bar: CiBarGeometry; label: string }) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const x = (pct: number) => Math.round((pct / 100) * width * 100) / 100;
  const mid = BAR_H / 2;
  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={BAR_H} viewBox={`0 0 ${width} ${BAR_H}`} role="img" aria-label={label} className="block">
        <line x1={x(bar.zeroPct)} x2={x(bar.zeroPct)} y1={0} y2={BAR_H} stroke={TOKEN.text2} strokeWidth={1} strokeDasharray="1 3" />
        <line x1={x(bar.loPct)} x2={x(bar.hiPct)} y1={mid} y2={mid} stroke={TOKEN.text2} strokeWidth={1} shapeRendering="crispEdges" />
        <line x1={x(bar.pointPct)} x2={x(bar.pointPct)} y1={mid - 6} y2={mid + 6} stroke={TOKEN.text} strokeWidth={2} shapeRendering="crispEdges" />
      </svg>
    </div>
  );
}

function EffectRow({ effect }: { effect: BehaviourEffect }) {
  const bar = ciBar(effect.deltaMean, effect.lo95, effect.hi95);
  const strength = strengthWord(effect);
  const caveat = strengthCaveat(effect);
  const shrink = shrinkageLine(effect.shrunkToPrior);
  const title = effect.label || `${effect.behaviour} on ${effect.metric}`;
  const likely = strength.tone === 'green';
  const interval = ciText(effect.lo95, effect.hi95);

  return (
    <li className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 border-t border-hx-border first:border-t-0">
      <p className="hx-body">{title}</p>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="hx-fig-sm text-hx-text">{effectValueText(effect)}</span>
        <span className="hx-cap">({interval})</span>
        <Word word={likely ? 'likely' : 'unclear'} tone={strength.tone} />
      </div>

      {bar && <CiBar bar={bar} label={`${title}: ${effectValueText(effect)}, ${interval}`} />}

      <p className="hx-cap">
        <Word word={strength.label} tone={strength.tone} />
        {`, ${daysLine(effect.nYes, effect.nNo)}${caveat ? `; ${caveat}` : ''}.`}
      </p>
      {shrink && <p className="hx-cap">{shrink}</p>}
      {effect.confound && (
        <p className="hx-cap">
          <Word word="Confounded" tone="yellow" />
          {`: ${effect.confound}`}
        </p>
      )}
    </li>
  );
}

export default function ImpactCard({ impact, max = 4 }: ImpactCardProps) {
  const effects = (impact?.effects ?? []).slice(0, Math.max(0, max));
  const pending = (impact?.pending ?? []).filter((p) => !!p);
  // "Hard training", "short sleep" and "late bedtime" are the user's own
  // quartiles, not a published cut-off. The engine says so in one sentence;
  // this is where that sentence is shown, and it is shown only when one of
  // those rows is actually on screen.
  const heuristic = effects.some((e) => usesHeuristicThreshold(e.behaviour));

  if (!effects.length) {
    return (
      <TrendCard
        title="What moves your numbers"
        caption="Your own behaviours against your own metrics, associations only"
        empty={
          <EmptyState
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
      caption={`${effects.length} ${effects.length === 1 ? 'comparison' : 'comparisons'}, last 90 days`}
      source="Each bar is the 95% interval scaled to its own row with a tick at the estimate and a dotted line at zero, so bar lengths are not comparable between rows; read the numbers."
      meaning="Estimates are pulled toward published averages when you have few days, and the p-values are corrected across every behaviour and metric tested together."
    >
      {/* The caveat sits above the rows, on the figure, never a footnote. */}
      <Note tone="neutral" lead={CAVEAT_LEAD}>
        {IMPACT_CAVEAT.replace(`${CAVEAT_LEAD} `, '')}
      </Note>

      <ul className="flex flex-col">
        {effects.map((e) => (
          <EffectRow key={`${e.behaviour}|${e.metric}`} effect={e} />
        ))}
      </ul>

      {heuristic && <Note tone="neutral">{IMPACT_HEURISTIC_NOTE}</Note>}

      {pending.length > 0 && (
        <p className="hx-cap">
          Still counting days for: {pending.join(', ')}. {MIN_DAYS_NOTE}
        </p>
      )}
    </TrendCard>
  );
}
