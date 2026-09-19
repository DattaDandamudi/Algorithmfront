/**
 * Readiness hero — SPEC §1 #1/#2, plus the v3 explanation (plan 2b), set as
 * the page's lead (DESIGN.md "Today, in ASCII").
 *
 * The score prints once, flush left, in `.hx-score`; a right column 24 px in
 * carries the short verdict word in the band colour, the 44 px hairline dial
 * beside "of 100", the confidence line, the source hedge and the training
 * chip. A 56 px leader hairline under the numeral leads into the deck: the
 * engine's full verdict, unedited, in Literata 20/26 in the band colour, then
 * the explainer as a hedge. At three digits or "Calibrating" the column wraps
 * under the numeral.
 *
 * The dial and its number mirror WHOOP's bands from the SCORE ALONE
 * (`bandOf`: green ≥ 67, yellow 34–66, red < 34) — the score is the data and
 * is never recoloured (review R1-1). The engine's forcing rule (recovery
 * < 34 % or the HRV 7-day mean below the lower SWC gives "Light day") lives in
 * `readiness.band` and is carried only by the verdict word, the deck and the
 * chip; when it downgrades the band a note under the deck says why, so a
 * green 72 with a red "Light day" is explained in the open, not contradictory.
 * That note also carries the rule's own evidence line (the `hrvForcing`
 * modifier's reason, from `FORCING_EVIDENCE`).
 *
 * The training chip is the §6.3 conversion (Progress / Train, hold loads /
 * Light day). It PRE-FILLS the Coach with "Should I train today?" without
 * sending (R1-8). It is an action, not a toggle: Chip's `active` is the kit's
 * band wash only and emits no aria-pressed (R6-11).
 *
 * ## The three v3 additions
 * 1. **Modifiers.** Things that moved the verdict after the score was
 *    computed, listed in the open as a note with the word for what each did
 *    ("Lowered the verdict" / "Worth knowing") beside its tone.
 * 2. **"Why this score".** A native `<details>` between hairlines: a 48 px
 *    `.hx-ui` summary, and inside it the contributors as a ledger (label in
 *    `.hx-body`, points in `.hx-fig-sm` flush right, the facts line beneath),
 *    the confidence band and the WHOOP blend. Written for a reader who has
 *    never seen a standard deviation.
 * 3. **Calibrating.** Until the personal baseline is established the word
 *    "Calibrating" sits where the number goes, in `.hx-fig` text2, rather than
 *    a figure the user would take literally. The inputs are still listed.
 *
 * Presentational: every v3 field is optional and an older `Readiness` (no
 * contributors, no confidence) renders the hero alone.
 */
import { ChevronDown, Dumbbell, Feather, Footprints } from 'lucide-react';
import type { Band, Readiness, ReadinessContributor, ReadinessModifier } from '../../data/types';
import { COACH_CHIPS, bandOf } from '../../engine';
import { fmt, fmtSigned } from '../../lib/format';
import { Chip, Ring, bandText, type Tone } from '../../ui';
import { hooperTotalText } from '../stress';

const SOURCE_CAPTION: Record<Readiness['source'], string> = {
  whoop: 'WHOOP recovery',
  hrv: 'your HRV baseline',
  none: 'no signal yet',
};

/** One word beside the dial (§1 "big number + one-line verdict"); the full sentence sits under it. */
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
export const FORCED_REASON = 'HRV 7-day mean below your normal range forces a light day.';

/** Copy that the tests and the Playwright a11y probe pin. */
export const CALIBRATING_WORD = 'Calibrating';
export const CALIBRATING_NOTE =
  'Your baseline is still being learned, so there is no readiness number yet — a score against a normal we have not measured would be a guess. The inputs below are what it will be built from.';
export const MODIFIERS_TITLE = 'What changed the verdict';
export const WHY_SUMMARY = 'Why this score';
export const WHY_LEAD =
  'Each input is compared with your own normal, then weighted and added up. “SD” is how far from your normal it sits — about 1 SD is a normal off day. “Points” is what it moved the score by.';
/** The one line of explainer under the deck. */
export const EXPLAINER = 'The morning answer to how much strain your body can take today.';
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
 * rather than claiming there was no reading. The middle dots are pinned.
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
  // Dial: the score's WHOOP band. Verdict word, deck and chip: the (possibly forced) engine band.
  const scoreBand = calibrating ? 'neutral' : bandOf(score);
  // Calibrating still has a verdict — it just has no number, so the word stays.
  const verdictBand: Band = has || calibrating ? band : 'neutral';
  const chipLabel = training === '—' ? 'No verdict yet' : training;
  const ChipIcon = band === 'green' ? Dumbbell : band === 'red' ? Feather : Footprints;

  const contributors = readiness.contributors ?? [];
  const confidence = readiness.confidence;
  const blend = readiness.blendWeight;
  // The forcing rule already has its own note; listing it twice reads as two
  // separate findings. Its *evidence* is not dropped with it — `forcingHedge`
  // moves the modifier's reason into that note.
  const modifiers = (readiness.modifiers ?? []).filter((m) => !(forced && m.key === 'hrvForcing'));
  const forcingHedge = forced ? (readiness.modifiers ?? []).find((m) => m.key === 'hrvForcing')?.reason ?? null : null;
  const rangeWord = calibrating ? 'Provisional' : 'Confidence';

  return (
    <section className="pt-7 flex flex-col text-left" aria-labelledby="hx-readiness-title">
      <h2 id="hx-readiness-title" className="sr-only">
        Readiness
      </h2>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-5">
        {/* The score, once, flush left. Three digits or a word push the column under it. */}
        <div className={has ? 'shrink-0' : 'basis-full'}>
          {calibrating ? (
            <span className="hx-fig text-hx-text2">{CALIBRATING_WORD}</span>
          ) : has ? (
            <span className="hx-score hx-print block text-hx-text">{fmt(score)}</span>
          ) : (
            <span className="hx-fig text-hx-muted">—</span>
          )}
        </div>

        <div className="grow basis-40 min-w-0 flex flex-col items-start gap-1.5">
          <span className={`hx-head ${bandText(verdictBand)}`}>{SHORT_VERDICT[verdictBand]}</span>
          <div className="flex items-center gap-2">
            <Ring value={calibrating ? null : score} band={scoreBand} label="Readiness" />
            <span className="hx-agate">{has ? 'of 100' : 'no number yet'}</span>
          </div>
          {confidence && <span className="hx-label">{`${rangeWord} ${fmt(confidence.lo)}–${fmt(confidence.hi)}`}</span>}
          <span className="hx-hedge">{`From ${SOURCE_CAPTION[source]}`}</span>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Chip
              active
              color={band}
              icon={<ChipIcon aria-hidden />}
              onClick={() => onAskCoach(COACH_CHIPS[0], false)}
              aria-label={`Training verdict: ${chipLabel}. Ask the coach "Should I train today?"`}
            >
              {chipLabel}
            </Chip>
            <span className="hx-agate">Tap to ask the coach</span>
          </div>
        </div>
      </div>

      {/* The leader: a 56 px hairline under the numeral, then the deck. */}
      <div className="hx-hair w-14 mt-6" aria-hidden />
      <p className={`hx-deck text-[20px] leading-[26px] mt-4 ${bandText(verdictBand)}`}>{verdict}</p>
      <p className="hx-hedge mt-2">{EXPLAINER}</p>

      {calibrating && (
        <p className="hx-cap mt-3" role="note">
          {CALIBRATING_NOTE}
        </p>
      )}

      {forced && (
        <div className="hx-note border-hx-red mt-4" role="note">
          <p className="hx-body">
            <span className="hx-label text-hx-red">
              <span className="hx-tone mr-1.5" aria-hidden />
              Forced
            </span>{' '}
            <span>{FORCED_REASON}</span>
          </p>
          <p className="hx-cap mt-1">{detail}</p>
          {forcingHedge && <p className="hx-hedge mt-1">{forcingHedge}</p>}
        </div>
      )}

      {modifiers.length > 0 && (
        <div className="hx-note border-hx-text2 mt-4" role="note">
          <p className="hx-label">{MODIFIERS_TITLE}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {modifiers.map((m) => {
              const eff = MODIFIER_EFFECT[m.effect] ?? MODIFIER_EFFECT.note;
              return (
                <li key={m.key}>
                  <p className="hx-body">
                    <span className={`hx-label ${bandText(eff.tone)}`}>
                      <span className="hx-tone mr-1.5" aria-hidden />
                      {eff.text}
                    </span>
                    <span className="text-hx-text2"> · </span>
                    <span>{m.label}</span>
                  </p>
                  <p className="hx-hedge">{m.reason}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* The disclosure sits between hairlines; the bottom one leads into the ledger rows beneath. */}
      <div className="hx-hair mt-6" aria-hidden />
      {contributors.length > 0 && (
        <>
          <details className="group">
            <summary className="hx-ui text-hx-text list-none cursor-pointer min-h-12 flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              {WHY_SUMMARY}
              <ChevronDown className="w-4 h-4 shrink-0 text-hx-text2 transition-transform group-open:rotate-180 motion-reduce:transition-none" strokeWidth={1.5} aria-hidden />
            </summary>
            <div className="pb-4 flex flex-col gap-4">
              <p className="hx-hedge">{WHY_LEAD}</p>
              <ul className="hx-ledger">
                {contributors.map((c) => {
                  const eff = CONTRIBUTOR_EFFECT[c.effect] ?? CONTRIBUTOR_EFFECT.flat;
                  return (
                    <li key={c.key} className="hx-row">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="hx-body min-w-0">{c.label}</span>
                        <span className="hx-fig-sm text-hx-text shrink-0">
                          {`${fmtSigned(c.points, 1)} `}
                          <span className="hx-unit">pts</span>
                        </span>
                      </div>
                      <p className="hx-cap">{contributorFacts(c, eff.text)}</p>
                    </li>
                  );
                })}
              </ul>
              {confidence && (
                <p className="hx-cap">
                  {`The ${calibrating ? 'provisional range' : 'confidence band'} ${fmt(confidence.lo)}–${fmt(confidence.hi)} is built from ${fmt(confidence.nInputs)} of ${fmt(contributors.length)} inputs. It widens when an input is missing, because an unknown could have gone either way${
                    calibrating ? ', and it will settle as your baseline fills in' : ''
                  }.`}
                </p>
              )}
              {isNum(blend) && blend > 0 && (
                <p className="hx-cap">
                  {blend >= 1
                    ? WHOOP_ONLY_NOTE
                    : // Rounded once and subtracted, so the two halves always read as 100%.
                      `Blend: ${Math.round(blend * 100)}% WHOOP recovery, ${100 - Math.round(blend * 100)}% your own signals — an import ramps in over a week so the number never steps.`}
                </p>
              )}
            </div>
          </details>
          <div className="hx-hair" aria-hidden />
        </>
      )}
    </section>
  );
}
