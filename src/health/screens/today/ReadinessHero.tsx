/**
 * Readiness hero — SPEC §1 #1/#2, plus the v3 explanation (plan 2b).
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
 *
 * ## The three v3 additions
 * 1. **Modifiers.** `readiness.modifiers` are the things that moved the verdict
 *    *after* the score was computed — the HRV forcing rule, an overreached
 *    training form, an ACWR spike, major overnight strain, a possible illness.
 *    They are listed in the open, each with the word for what it did
 *    ("Lowered the verdict" / "Worth knowing") beside its tone, because a
 *    verdict that disagrees with its own number is otherwise unreadable.
 * 2. **"Why this score".** A native `<details>` — no JS, keyboard-operable,
 *    collapsed by default so the hero stays a hero — listing every contributor
 *    with its raw value, how far it sits from that user's own normal (the z, in
 *    words: "0.4 SD above your normal"), and the points it moved the score by,
 *    then the confidence band and the WHOOP blend. This is the thing no
 *    wearable app does, so it is written for a reader who has never seen a
 *    standard deviation: units on every number, a plain-English lead, and no
 *    symbol that is not explained beside it.
 * 3. **Calibrating.** Until the personal baseline is established the score has
 *    nothing trustworthy to stand on, so the hero shows the WORD "Calibrating"
 *    where the number goes rather than a figure the user would take literally.
 *    The inputs are still listed underneath — they are what the score will be
 *    built from, and watching them fill in is the honest version of progress.
 *
 * Presentational: every v3 field is optional and an older/hand-built
 * `Readiness` (no contributors, no confidence) renders exactly as before.
 */
import { ChevronDown, Dumbbell, Feather, Footprints } from 'lucide-react';
import type { Band, Readiness, ReadinessContributor, ReadinessModifier } from '../../data/types';
import { COACH_CHIPS, bandOf } from '../../engine';
import { fmt, fmtSigned } from '../../lib/format';
import { Chip, Ring, bandText, type Tone } from '../../ui';
import { hooperTotalText } from '../stress';

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

/** Copy that the tests and the Playwright a11y probe pin. */
export const CALIBRATING_WORD = 'Calibrating';
export const CALIBRATING_NOTE =
  'Your baseline is still being learned, so there is no readiness number yet — a score against a normal we have not measured would be a guess. The inputs below are what it will be built from.';
export const MODIFIERS_TITLE = 'What changed the verdict';
export const WHY_SUMMARY = 'Why this score';
export const WHY_LEAD =
  'Each input is compared with your own normal, then weighted and added up. “SD” is how far from your normal it sits — about 1 SD is a normal off day. “Points” is what it moved the score by.';
/**
 * A full WHOOP week ramps the blend to 1, so the wearable's own score IS the
 * number and every own input contributes 0 points. Said plainly, otherwise a
 * row reading "0.7 SD below your normal · no effect" looks like a bug.
 */
export const WHOOP_ONLY_NOTE =
  'Today’s number is WHOOP’s own recovery score, so your other inputs scored 0 points — they are listed as context, and they take the number back over if the import stops.';

const MODIFIER_EFFECT: Record<ReadinessModifier['effect'], { text: string; tone: Tone }> = {
  downgrade: { text: 'Lowered the verdict', tone: 'yellow' },
  note: { text: 'Worth knowing', tone: 'neutral' },
};

const CONTRIBUTOR_EFFECT: Record<ReadinessContributor['effect'], { text: string; tone: Tone }> = {
  up: { text: 'raised the score', tone: 'green' },
  down: { text: 'lowered the score', tone: 'yellow' },
  flat: { text: 'no effect', tone: 'neutral' },
};

/** Raw values arrive in the input's own unit; the key says which. */
const VALUE_TEXT: Record<string, (v: number) => string> = {
  hrv: (v) => `${fmt(v)} ms`,
  rhr: (v) => `${fmt(v)} bpm`,
  sleep: (v) => `${fmt(v, 1)} h`,
  load: (v) => `${fmt(v)} load`,
  subj: (v) => hooperTotalText(v),
  whoop: (v) => `${fmt(v)}%`,
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** "54 ms" / "12 of 28" / "no reading" — never a bare number without its unit. */
export function contributorValueText(c: ReadinessContributor): string {
  if (!isNum(c.value)) return 'no reading';
  const f = VALUE_TEXT[c.key];
  return f ? f(c.value) : fmt(c.value, 1);
}

/** The z in words: a standard deviation means nothing to most readers on its own. */
export function contributorZText(z: number | null | undefined): string {
  if (!isNum(z)) return 'not compared with your normal';
  if (Math.abs(z) < 0.05) return 'right on your normal';
  return `${fmt(Math.abs(z), 1)} SD ${z > 0 ? 'above' : 'below'} your normal`;
}

/**
 * The line under a contributor's name: what it read, how far that is from
 * normal, and what it did. An imported score (WHOOP) has a value but no z —
 * it is not standardised against anything — so it simply skips that clause
 * rather than claiming there was no reading.
 */
export function contributorFacts(c: ReadinessContributor, effectText: string): string {
  const parts: string[] = [];
  if (isNum(c.value)) {
    parts.push(contributorValueText(c));
    if (isNum(c.z)) parts.push(contributorZText(c.z));
  } else {
    parts.push('no reading yet, so it counts as unknown');
  }
  parts.push(effectText);
  return parts.join(' · ');
}

export interface ReadinessHeroProps {
  readiness: Readiness;
  onAskCoach: (prompt: string, send?: boolean) => void;
}

export default function ReadinessHero({ readiness, onAskCoach }: ReadinessHeroProps) {
  const { score, band, verdict, training, source, detail, forced } = readiness;
  const calibrating = readiness.calibrating === true;
  const has = score !== null && !calibrating;
  // Ring + number: the score's WHOOP band. Verdict + chip: the (possibly forced) engine band.
  const scoreBand = calibrating ? 'neutral' : bandOf(score);
  const chipLabel = training === '—' ? 'No verdict yet' : training;
  const ChipIcon = band === 'green' ? Dumbbell : band === 'red' ? Feather : Footprints;

  const contributors = readiness.contributors ?? [];
  const confidence = readiness.confidence;
  const blend = readiness.blendWeight;
  // The forcing rule already has its own block below the ring; listing it twice
  // reads as two separate findings.
  const modifiers = (readiness.modifiers ?? []).filter((m) => !(forced && m.key === 'hrvForcing'));

  return (
    <section className="px-4 pt-2 pb-5 flex flex-col items-center text-center" aria-labelledby="hx-readiness-title">
      <Ring value={calibrating ? null : score} band={scoreBand} size={216} stroke={14} label="Readiness">
        {calibrating ? (
          <span className="text-[26px] leading-8 font-semibold tracking-tight text-hx-text2">{CALIBRATING_WORD}</span>
        ) : (
          <span className={`text-[60px] leading-none font-semibold tracking-tight ${has ? 'text-hx-text' : 'text-hx-muted'}`}>
            {has ? fmt(score) : '—'}
          </span>
        )}
        {/* Calibrating still has a verdict — it just has no number, so the word
            stays and the band colour does not. */}
        <span className={`mt-1 text-[15px] leading-5 font-semibold ${has ? bandText(band) : 'text-hx-text2'}`}>
          {SHORT_VERDICT[has || calibrating ? band : 'neutral']}
        </span>
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
      {calibrating && (
        <p className="mt-2 max-w-[330px] text-[13px] leading-5 text-hx-text2" role="note">
          {CALIBRATING_NOTE}
        </p>
      )}
      {forced && (
        <div className="mt-2 max-w-[320px]" role="note">
          <p className="text-[13px] leading-5 font-medium text-hx-text2">{FORCED_REASON}</p>
          <p className="mt-0.5 text-[12px] leading-4 text-hx-muted">{detail}</p>
        </div>
      )}

      {modifiers.length > 0 && (
        <div className="mt-3 w-full max-w-[334px] text-left rounded-2xl border border-hx-border bg-hx-card2 px-3.5 py-3" role="note">
          <p className="hx-label">{MODIFIERS_TITLE}</p>
          <ul className="mt-1.5 flex flex-col gap-2">
            {modifiers.map((m) => {
              const eff = MODIFIER_EFFECT[m.effect] ?? MODIFIER_EFFECT.note;
              return (
                <li key={m.key}>
                  <p className="text-[13px] leading-5">
                    <span className={`font-semibold ${bandText(eff.tone)}`}>{eff.text}</span>
                    <span className="text-hx-muted"> · </span>
                    <span className="font-medium text-hx-text">{m.label}</span>
                  </p>
                  <p className="text-[12px] leading-4 text-hx-muted">{m.reason}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {contributors.length > 0 && (
        <details className="mt-3 w-full max-w-[334px] text-left rounded-2xl border border-hx-border bg-hx-card2 overflow-hidden group">
          <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer min-h-11 px-3.5 py-3 flex items-center justify-between gap-2 text-[14px] leading-5 font-semibold text-hx-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hx-blue">
            {WHY_SUMMARY}
            <ChevronDown className="w-4 h-4 shrink-0 text-hx-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
          </summary>
          <div className="px-3.5 pb-3.5 flex flex-col gap-2.5">
            <p className="text-[12px] leading-4 text-hx-muted">{WHY_LEAD}</p>
            <ul className="flex flex-col">
              {contributors.map((c) => {
                const eff = CONTRIBUTOR_EFFECT[c.effect] ?? CONTRIBUTOR_EFFECT.flat;
                return (
                  <li key={c.key} className="py-2 border-b border-hx-border last:border-b-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 text-[13px] leading-5 font-medium text-hx-text">{c.label}</span>
                      <span className={`shrink-0 text-[13px] leading-5 font-semibold tabular-nums ${bandText(eff.tone)}`}>{fmtSigned(c.points, 1)} pts</span>
                    </div>
                    <p className="mt-0.5 text-[12px] leading-4 text-hx-muted">{contributorFacts(c, eff.text)}</p>
                  </li>
                );
              })}
            </ul>
            {confidence && (
              <p className="text-[12px] leading-4 text-hx-text2">
                <span className="font-medium text-hx-text">
                  {calibrating ? 'Provisional' : 'Confidence'} {fmt(confidence.lo)}–{fmt(confidence.hi)}
                </span>{' '}
                · built from {fmt(confidence.nInputs)} of {fmt(contributors.length)} inputs. The band widens when an input is missing, because an unknown could have gone either way
                {calibrating ? ', and it will settle as your baseline fills in' : ''}.
              </p>
            )}
            {isNum(blend) && blend > 0 && (
              <p className="text-[12px] leading-4 text-hx-text2">
                {blend >= 1
                  ? WHOOP_ONLY_NOTE
                  : // Rounded once and subtracted, so the two halves always read as 100%.
                    `Blend: ${Math.round(blend * 100)}% WHOOP recovery, ${100 - Math.round(blend * 100)}% your own signals — an import ramps in over a week so the number never steps.`}
              </p>
            )}
          </div>
        </details>
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
