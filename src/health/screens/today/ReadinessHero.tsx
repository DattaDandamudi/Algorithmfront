/**
 * Readiness hero — SPEC §1 #1/#2.
 *
 * The ring mirrors WHOOP's bands (green ≥ 67, yellow 34–66, red < 34) and is
 * framed the way WHOOP frames recovery: "the morning answer to how much strain
 * your body can take today." The score is never altered by the engine's
 * forcing rule (recovery < 34 % or HRV below the lower SWC → red / "Light
 * day"), so when `readiness.forced` is set the ring can legitimately show a
 * high number in red — the `detail` sentence is rendered underneath so the
 * user sees why (integration notes).
 *
 * The training chip is the §6.3 conversion (Progress / Train, hold loads /
 * Light day) and opens the Coach with "Should I train today?" auto-sent.
 */
import { Dumbbell, Feather, Footprints } from 'lucide-react';
import type { Readiness } from '../../data/types';
import { COACH_CHIPS } from '../../engine';
import { fmt } from '../../lib/format';
import { Chip, Ring, bandText } from '../../ui';

const SOURCE_CAPTION: Record<Readiness['source'], string> = {
  whoop: 'WHOOP recovery',
  hrv: 'HRV-based',
  none: 'no signal',
};

export interface ReadinessHeroProps {
  readiness: Readiness;
  onAskCoach: (prompt: string, send?: boolean) => void;
}

export default function ReadinessHero({ readiness, onAskCoach }: ReadinessHeroProps) {
  const { score, band, verdict, training, source, detail, forced } = readiness;
  const has = score !== null;
  const chipLabel = training === '—' ? 'No verdict yet' : training;
  const ChipIcon = band === 'green' ? Dumbbell : band === 'red' ? Feather : Footprints;

  return (
    <section className="px-4 pt-2 pb-5 flex flex-col items-center text-center" aria-labelledby="hx-readiness-title">
      <Ring value={score} band={band} size={216} stroke={14} label="Readiness">
        <span className={`text-[60px] leading-none font-semibold tracking-tight ${has ? 'text-hx-text' : 'text-hx-muted'}`}>
          {has ? fmt(score) : '—'}
        </span>
        <span id="hx-readiness-title" className="hx-label mt-2">
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
        <p className="mt-2 text-[13px] leading-5 text-hx-text2 max-w-[320px]" role="note">
          {detail}
        </p>
      )}

      <div className="mt-4 flex flex-col items-center gap-1.5">
        <Chip
          active
          color={band}
          icon={<ChipIcon aria-hidden />}
          onClick={() => onAskCoach(COACH_CHIPS[0], true)}
          aria-label={`Training verdict: ${chipLabel}. Ask the coach "Should I train today?"`}
        >
          {chipLabel}
        </Chip>
        <span className="text-[12px] leading-4 text-hx-muted">Tap to ask the coach</span>
      </div>
    </section>
  );
}
