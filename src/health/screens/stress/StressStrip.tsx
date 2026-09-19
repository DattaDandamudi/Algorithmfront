/**
 * StressStrip — the morning check-in as a 56 px ledger row under the readiness
 * hero (SPEC §1, plan 2b). Today puts it inside its `.hx-ledger`, so this file
 * renders rows, not a section.
 *
 * Two states, one job:
 *  - today's check-in is missing: the whole row is the button into Log's
 *    check-in section: label, "Not yet today", the verb "Check in" flush
 *    right, and the question as a hedge beneath (one tap, never a hidden
 *    entry point);
 *  - it is done: the Hooper band in WORDS with its tone square, plus the
 *    leading line of the whole stack: "N of 5 overnight signals outside your
 *    range". The count leads; the fused index never appears alone here,
 *    because a single number reads as a finding and a count does not.
 *
 * The illness note is a second row whenever the engine flags it, in either
 * state. It lists the engine's own reasons, names no condition, and points at
 * the existing doctor cue — it is not a diagnosis and must never read like one.
 *
 * Presentational: `stress` may be undefined (engine still warming up) and
 * every field inside it may be null.
 */
import type { StressContext } from '../../data/types';
import { bandText } from '../../ui';
import { calibratingLine, hooperBandWord, hooperTotalText, signalsLine, stressBandWord, worseRunLine } from './format';

export const CHECK_IN_PROMPT = 'How did you sleep and how do you feel?';
export const CHECK_IN_HINT = 'Four 1–7 questions — sleep, fatigue, stress, soreness. About twenty seconds.';
export const CHECK_IN_CTA = 'Check in';
export const CHECK_IN_LABEL = 'Morning check-in';
export const NOT_YET_TODAY = 'Not yet today';
/** Never a diagnosis: the flag describes signals and routes to a clinician. */
export const ILLNESS_NOTE = 'Several overnight signals moved together for more than a day. This is not a diagnosis — if you feel unwell or it persists, check with your doctor.';

export interface StressStripProps {
  /** Undefined while the engine has nothing to say. */
  stress?: StressContext;
  /** One tap into Log's check-in section. */
  onCheckIn: () => void;
  /** When given, the completed row is the button into Trends. */
  onOpenDetail?: () => void;
  className?: string;
}

export default function StressStrip({ stress, onCheckIn, onOpenDetail, className = '' }: StressStripProps) {
  const checkIn = stress?.checkIn;
  // No context yet reads the same as "not checked in yet" — both want the prompt.
  const missing = !checkIn || checkIn.missingToday !== false;
  const illness = stress?.illness;
  const reasons = illness?.flag ? (illness.reasons ?? []).filter((r) => !!r) : [];

  const hooper = hooperBandWord(checkIn?.band);
  const strain = stressBandWord(stress?.band);
  const signals = signalsLine(stress?.signalsDeviating ?? 0, stress?.signalsAvailable ?? 0);
  const worse = worseRunLine(checkIn?.worseRun);
  const learning = stress?.calibrating ? calibratingLine(stress.nRef) : null;

  let row: JSX.Element;
  if (missing) {
    row = (
      <button type="button" onClick={onCheckIn} className={`hx-row hx-press text-left ${className}`}>
        <span className="w-full flex items-center justify-between gap-3">
          <span className="hx-body min-w-0">{CHECK_IN_LABEL}</span>
          <span className="flex items-center gap-3 shrink-0">
            <span className="hx-cap">{NOT_YET_TODAY}</span>
            <span className="hx-ui text-hx-text">{CHECK_IN_CTA}</span>
          </span>
        </span>
        <span className="hx-hedge mt-0.5">{CHECK_IN_PROMPT}</span>
        {learning && <span className="hx-hedge">{learning}</span>}
      </button>
    );
  } else {
    const inner = (
      <>
        <span className="w-full flex items-center justify-between gap-3">
          <span className="hx-body min-w-0">{CHECK_IN_LABEL}</span>
          <span className="flex items-center gap-3 shrink-0">
            <span className={`hx-label ${bandText(hooper.tone)}`}>
              {hooper.tone !== 'neutral' && <span className="hx-tone mr-1.5" aria-hidden />}
              {hooper.label}
            </span>
            {onOpenDetail && <span className="hx-ui text-hx-text">Open Trends</span>}
          </span>
        </span>
        <span className="hx-cap mt-0.5">{`${signals}. ${strain.label}.`}</span>
        <span className="hx-cap">{`Hooper ${hooperTotalText(checkIn?.total ?? null)}, lower is better.`}</span>
        {worse && <span className="hx-cap">{worse}</span>}
        {learning && <span className="hx-hedge">{learning}</span>}
      </>
    );
    row = onOpenDetail ? (
      <button type="button" onClick={onOpenDetail} className={`hx-row hx-press text-left ${className}`}>
        {inner}
      </button>
    ) : (
      <div className={`hx-row ${className}`}>{inner}</div>
    );
  }

  return (
    <>
      {row}
      {illness?.flag && (
        <div className="hx-row" role="status">
          <div className="hx-note border-hx-yellow">
            <p className="hx-body">
              <span className="hx-label text-hx-yellow">
                <span className="hx-tone mr-1.5" aria-hidden />
                Caution
              </span>{' '}
              <span>Your overnight signals look unusual.</span>
            </p>
            {reasons.length > 0 && <p className="hx-cap mt-0.5">{reasons.join(', ')}</p>}
            <p className="hx-hedge mt-0.5">{ILLNESS_NOTE}</p>
          </div>
        </div>
      )}
    </>
  );
}
