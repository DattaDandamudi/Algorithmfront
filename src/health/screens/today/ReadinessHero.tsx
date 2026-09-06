/**
 * Readiness hero — SPEC §1 #1/#2.
 *
 * The ring and its number mirror WHOOP's bands from the SCORE ALONE
 * (`bandOf`: green ≥ 67, yellow 34–66, red < 34) — the score is the data and
 * is never recoloured (review R1-1). The engine's forcing rule (recovery
 * < 34 % or the HRV 7-day mean below the lower SWC → "Light day", spec
 * "Thresholds that should change behavior") lives in `readiness.band` and is
 * carried only by the short verdict in the ring centre, the verdict line and
 * the training chip; when it downgrades the band a line under the hero says
 * why, so a green 72 with a red "Light day" is explained, not contradictory.
 *
 * The training chip is the §6.3 conversion (Progress / Train, hold loads /
 * Light day). It PRE-FILLS the Coach with "Should I train today?" without
 * sending (R1-8) — the user confirms before a paid request goes out. It is an
 * action, not a toggle: Chip's `active` is the kit's visual band wash only and
 * emits no aria-pressed (R6-11; `pressed` is reserved for real toggles).
 */
import { Dumbbell, Feather, Footprints } from 'lucide-react';
import type { Band, Readiness } from '../../data/types';
import { COACH_CHIPS, bandOf } from '../../engine';
import { fmt } from '../../lib/format';
import { Chip, Ring, bandText } from '../../ui';

const SOURCE_CAPTION: Record<Readiness['source'], string> = {
  whoop: 'WHOOP recovery',
  hrv: 'HRV-based',
  none: 'no signal',
};

/** One word under the number (§1 "big number + one-line verdict"); the full sentence sits below the ring. */
export const SHORT_VERDICT: Record<Band, string> = {
  green: 'Primed',
  yellow: 'Steady',
  red: 'Run down',
  neutral: 'No signal',
};

/**
 * `forced` is only set when the score's own band is not red, and WHOOP
 * recovery < 34 always is — so a forced downgrade is always the HRV rule.
 */
export const FORCED_REASON = 'HRV 7-day mean below your normal range → light day';

export interface ReadinessHeroProps {
  readiness: Readiness;
  onAskCoach: (prompt: string, send?: boolean) => void;
}

export default function ReadinessHero({ readiness, onAskCoach }: ReadinessHeroProps) {
  const { score, band, verdict, training, source, detail, forced } = readiness;
  const has = score !== null;
  // Ring + number: the score's WHOOP band. Verdict + chip: the (possibly forced) engine band.
  const scoreBand = bandOf(score);
  const chipLabel = training === '—' ? 'No verdict yet' : training;
  const ChipIcon = band === 'green' ? Dumbbell : band === 'red' ? Feather : Footprints;

  return (
    <section className="px-4 pt-2 pb-5 flex flex-col items-center text-center" aria-labelledby="hx-readiness-title">
      <Ring value={score} band={scoreBand} size={216} stroke={14} label="Readiness">
        <span className={`text-[60px] leading-none font-semibold tracking-tight ${has ? 'text-hx-text' : 'text-hx-muted'}`}>
          {has ? fmt(score) : '—'}
        </span>
        <span className={`mt-1 text-[15px] leading-5 font-semibold ${has ? bandText(band) : 'text-hx-text2'}`}>{SHORT_VERDICT[has ? band : 'neutral']}</span>
        <span id="hx-readiness-title" className="hx-label mt-1">
          Readiness
        </span>
      </Ring>

      <p className={`mt-4 text-[17px] leading-6 font-semibold ${has ? bandText(band) : 'text-hx-text2'}`}>{verdict}</p>
      <p className="mt-1 text-[13px] leading-5 text-hx-muted max-w-[300px]">
        The morning answer to how much strain your body can take today.
      </p>
      <p className="mt-1 text-[12px] leading-4 text-hx-muted">
        Source: <span className="text-hx-text2">{SOURCE_CAPTION[source]}</span>
      </p>
      {forced && (
        <div className="mt-2 max-w-[320px]" role="note">
          <p className="text-[13px] leading-5 font-medium text-hx-text2">{FORCED_REASON}</p>
          <p className="mt-0.5 text-[12px] leading-4 text-hx-muted">{detail}</p>
        </div>
      )}

      <div className="mt-4 flex flex-col items-center gap-1.5">
        <Chip
          active
          color={band}
          icon={<ChipIcon aria-hidden />}
          onClick={() => onAskCoach(COACH_CHIPS[0], false)}
          aria-label={`Training verdict: ${chipLabel}. Ask the coach "Should I train today?"`}
        >
          {chipLabel}
        </Chip>
        <span className="text-[12px] leading-4 text-hx-muted">Tap to ask the coach</span>
      </div>
    </section>
  );
}
