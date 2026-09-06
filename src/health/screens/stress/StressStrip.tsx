/**
 * StressStrip — the compact Today strip under the readiness hero (SPEC §1,
 * plan 2b).
 *
 * Two states, one job:
 *  - today's check-in is missing → a single ≥ 44 px prompt straight into
 *    Log's check-in section (one tap, never a hidden entry point);
 *  - it is done → the Hooper band in WORDS with its tone dot, plus the
 *    leading line of the whole stack: "N of 5 overnight signals outside your
 *    range". The count leads; the fused index never appears alone here,
 *    because a single number reads as a finding and a count does not.
 *
 * The illness note is shown whenever the engine flags it, in either state. It
 * lists the engine's own reasons, names no condition, and points at the
 * existing doctor cue — it is not a diagnosis and must never read like one.
 *
 * Presentational: `stress` may be undefined (engine still warming up) and
 * every field inside it may be null.
 */
import { ClipboardCheck, Thermometer } from 'lucide-react';
import type { StressContext } from '../../data/types';
import { Button, bandBg, bandText } from '../../ui';
import { calibratingLine, hooperBandWord, hooperTotalText, signalsLine, stressBandWord, worseRunLine } from './format';

export const CHECK_IN_PROMPT = 'How did you sleep and how do you feel?';
export const CHECK_IN_HINT = 'Four 1–7 questions — sleep, fatigue, stress, soreness. About twenty seconds.';
export const CHECK_IN_CTA = 'Check in';
/** Never a diagnosis: the flag describes signals and routes to a clinician. */
export const ILLNESS_NOTE = 'Several overnight signals moved together for more than a day. This is not a diagnosis — if you feel unwell or it persists, check with your doctor.';

export interface StressStripProps {
  /** Undefined while the engine has nothing to say. */
  stress?: StressContext;
  /** One tap into Log's check-in section. */
  onCheckIn: () => void;
  /** Optional "See the detail" → Trends. */
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

  return (
    <section aria-label="Stress and recovery" className={`px-4 pb-5 ${className}`}>
      <div className="hx-card p-4 flex flex-col gap-3">
        {missing ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-[15px] leading-5 font-semibold text-hx-text">{CHECK_IN_PROMPT}</p>
              <p className="text-[13px] leading-5 text-hx-text2">{CHECK_IN_HINT}</p>
            </div>
            <Button size="lg" fullWidth icon={<ClipboardCheck aria-hidden />} onClick={onCheckIn}>
              {CHECK_IN_CTA}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="hx-label">Today's check-in</span>
                <p className={`mt-1 text-[17px] leading-6 font-semibold ${bandText(hooper.tone)}`}>
                  <span className={`inline-block align-middle w-2 h-2 rounded-full mr-2 ${bandBg(hooper.tone)}`} aria-hidden />
                  {hooper.label}
                </p>
                <p className="text-[12px] leading-4 text-hx-muted">Hooper {hooperTotalText(checkIn?.total ?? null)} · lower is better</p>
              </div>
              {onOpenDetail && (
                <Button variant="ghost" size="sm" className="shrink-0" onClick={onOpenDetail}>
                  See the detail
                </Button>
              )}
            </div>
            <p className="flex items-start gap-2 text-[13px] leading-5 text-hx-text2">
              <span className={`mt-[7px] w-1.5 h-1.5 rounded-full shrink-0 ${bandBg(strain.tone)}`} aria-hidden />
              <span className="min-w-0">
                <span className="text-hx-text font-medium">{signals}</span>
                {' · '}
                {strain.label}
              </span>
            </p>
            {worse && <p className="text-[12px] leading-4 text-hx-yellow">{worse}</p>}
          </div>
        )}

        {stress?.calibrating && <p className="text-[12px] leading-4 text-hx-muted">{calibratingLine(stress.nRef)}</p>}

        {illness?.flag && (
          <div className="rounded-xl border border-hx-yellow/40 bg-hx-yellow/10 p-3 flex items-start gap-2" role="status">
            <Thermometer className="w-4 h-4 mt-0.5 shrink-0 text-hx-yellow" aria-hidden />
            <div className="min-w-0">
              <p className="text-[13px] leading-5 font-semibold text-hx-yellow">Your overnight signals look unusual</p>
              {reasons.length > 0 && <p className="text-[12px] leading-4 text-hx-text2 mt-0.5">{reasons.join(' · ')}</p>}
              <p className="text-[12px] leading-4 text-hx-text2 mt-0.5">{ILLNESS_NOTE}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
