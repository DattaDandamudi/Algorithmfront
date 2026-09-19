/**
 * SignalDots — the overnight signals as a ruled list (SPEC §0: no state is
 * carried by colour alone).
 *
 * Each signal is a row divided by hairlines: its name, the reading flush
 * right, then the state in words with how far that reading sat from the
 * user's own normal and which way, and the threshold that would flag it
 * ("Outside your range, 2.2 SD below your normal, flags from 1.3 SD below").
 * A deviating signal carries a tone square before its state word; an in-range
 * one carries none, so the list still parses in greyscale and every row is
 * announced by its text. The old lamp dots are gone.
 *
 * Two things this row must not get wrong, both handled in `format.ts`: the
 * engine's `z` is on the STRAIN axis (HRV and blood oxygen arrive sign-flipped
 * relative to the reading), and the outlier rule is ONE-SIDED, so the threshold
 * is spelled out in the single direction that can actually flag.
 *
 * Purely presentational: it renders whatever `signals` it is handed, and says
 * so plainly when it is handed none.
 */
import type { StressSignal } from '../../data/types';
import { bandText } from '../../ui';
import { signalLabel, signalStateText, signalThresholdText, signalTone, signalValueText, signalZText } from './format';

export interface SignalDotsProps {
  /** The overnight signals to list (e.g. `stress.outliers`). */
  signals: StressSignal[];
  /** Copy when the list is empty. */
  emptyText?: string;
  className?: string;
}

export default function SignalDots({
  signals,
  emptyText = 'No overnight signals yet: HRV, resting heart rate, respiratory rate, skin temperature, blood oxygen and sleep debt appear here as they arrive.',
  className = '',
}: SignalDotsProps) {
  if (!signals.length) {
    return <p className={`hx-cap ${className}`}>{emptyText}</p>;
  }

  return (
    <ul className={`flex flex-col ${className}`} aria-label="Overnight signals">
      {signals.map((s) => {
        const tone = signalTone(s);
        const deviating = tone !== 'neutral' && s.deviating;
        const threshold = signalThresholdText(s);
        return (
          <li key={s.key} className="flex flex-col gap-0.5 py-2 min-w-0 border-t border-hx-border first:border-t-0 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3 min-w-0">
              <span className="hx-body min-w-0 truncate">{signalLabel(s)}</span>
              <span className="hx-ui text-hx-text shrink-0">{signalValueText(s)}</span>
            </div>
            <p className="hx-cap">
              <span className={`hx-label ${deviating ? bandText(tone) : ''}`}>
                {deviating && <span className="hx-tone mr-1.5" aria-hidden />}
                {signalStateText(s)}
              </span>
              {', '}
              {signalZText(s)}
              {threshold ? `, ${threshold}` : ''}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
