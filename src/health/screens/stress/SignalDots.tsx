/**
 * SignalDots — the overnight signals as labelled dots (SPEC §0: no state is
 * carried by colour alone).
 *
 * Each signal gets a dot, its name, the reading, how far that reading sat from
 * the user's own normal and which way, the threshold that would flag it, and
 * the state in words ("Outside your range · 2.2 SD below your normal · flags
 * from 1.3 SD below"). A deviating signal is a FILLED dot, an in-range one is a
 * hollow ring — so the list still parses in greyscale, and every dot is
 * announced by its row text.
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
import { bandBg, bandBorder, bandText } from '../../ui';
import { signalLabel, signalStateText, signalThresholdText, signalTone, signalValueText, signalZText } from './format';

export interface SignalDotsProps {
  /** The overnight signals to list (e.g. `stress.outliers`). */
  signals: StressSignal[];
  /** Copy when the list is empty. */
  emptyText?: string;
  className?: string;
}

export default function SignalDots({ signals, emptyText = 'No overnight signals yet — HRV, resting heart rate, respiratory rate, skin temperature, blood oxygen and sleep debt appear here as they arrive.', className = '' }: SignalDotsProps) {
  if (!signals.length) {
    return <p className={`text-[13px] leading-5 text-hx-muted ${className}`}>{emptyText}</p>;
  }

  return (
    <ul className={`flex flex-col gap-2 ${className}`} aria-label="Overnight signals">
      {signals.map((s) => {
        const tone = signalTone(s);
        const deviating = tone !== 'neutral' && s.deviating;
        return (
          <li key={s.key} className="flex items-start gap-2.5 min-w-0">
            <span
              className={`mt-[5px] w-2.5 h-2.5 rounded-full shrink-0 border-2 ${bandBorder(tone)} ${deviating ? bandBg(tone) : 'bg-transparent'}`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2 min-w-0">
                <span className="text-[13px] leading-5 font-medium text-hx-text truncate">{signalLabel(s)}</span>
                <span className="text-[13px] leading-5 text-hx-text2 shrink-0">{signalValueText(s)}</span>
              </div>
              <p className="text-[12px] leading-4 text-hx-muted">
                <span className={`font-medium ${bandText(tone)}`}>{signalStateText(s)}</span>
                {' · '}
                {signalZText(s)}
                {signalThresholdText(s) ? ` · ${signalThresholdText(s)}` : ''}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
