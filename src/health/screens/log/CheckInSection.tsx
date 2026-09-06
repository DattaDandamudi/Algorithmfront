/**
 * CheckInSection — the daily Hooper check-in and the two optional instruments,
 * in Log (SPEC §2 "logging must take seconds"; plan 2g).
 *
 * DAILY. Four 1–7 items (sleep quality, fatigue, stress, muscle soreness), each
 * as a seven-button scale with a WORDED ANCHOR AT BOTH ENDS and a word for the
 * chosen step — a bare "5" means nothing, "Fairly tired" does. Every button is
 * a native radio (so arrow keys, `aria-checked` and grouping come free) inside
 * a 44 px label; selection is shown by INVERSION plus the spoken word, never by
 * hue alone.
 *
 * Nothing is preselected: an untouched item stays "not answered yet" and is
 * simply not written, so the store never records a 4 the user did not choose.
 * Save is ONE `saveCheckIn` write for every answered item.
 *
 * "Skip today" is a first-class button beside Save, not a hidden escape. It
 * writes nothing — a skipped day is an absent day, which is exactly what the
 * engine's `missingToday` expects — and it can be undone in place.
 *
 * WEEKLY / MONTHLY. The SRSS (eight items, Sundays) and the PSS-4 (four items,
 * once a month) are separate cards below the daily one, off unless Settings
 * turns them on and hidden again as soon as the week/month has an answer. They
 * reuse the daily idiom exactly — the same `Question` row, the same radios in
 * 44 px labels, the same "nothing preselected" rule — and they save through the
 * same `onSave` (`saveCheckIn`) write, each with its own Skip. What they store
 * is TOTALS, not items (see ./instruments): a subscale is all-or-nothing, so a
 * half-answered instrument writes nothing at all rather than a sum no other
 * week could be compared with.
 */
import { useId, useState } from 'react';
import { CheckCircle2, Pencil } from 'lucide-react';
import type { CheckInItem, CheckInSettings, DailyRecord, ISODate } from '../../data/types';
import { Button, SectionHeader } from '../../ui';
import { CHECK_IN_META, HOOPER_MAX, checkInWord, hooperTotal, orderedCheckInItems } from '../stress/format';
import {
  PSS_ITEMS,
  PSS_LOW,
  PSS_HIGH,
  PSS_MAX,
  PSS_MAX_STEP,
  PSS_STEM,
  PSS_STEPS,
  SRSS_HIGH,
  SRSS_LOW,
  SRSS_MAX_STEP,
  SRSS_SCALE_LABEL,
  SRSS_STEPS,
  SRSS_SUBSCALE_MAX,
  pss4Line,
  pss4Reading,
  pss4Total,
  pss4Values,
  pssDue,
  pssWord,
  srssDue,
  srssScaleItems,
  srssSubtotal,
  srssSubtotalLine,
  srssValues,
  srssWeekStart,
  srssWord,
  type CheckInWrite,
  type PssAnswers,
  type PssItemKey,
  type SrssAnswers,
  type SrssItemKey,
  type SrssScale,
} from './instruments';

const STEPS = [1, 2, 3, 4, 5, 6, 7] as const;

export const SKIP_LABEL = 'Skip today';
export const SAVE_LABEL = 'Save check-in';
export const UNANSWERED = 'Not answered yet';

export const SRSS_TITLE = 'Weekly recovery & stress';
export const SRSS_SAVE_LABEL = 'Save weekly scale';
export const SRSS_SKIP_LABEL = 'Skip this week';
export const PSS_TITLE = 'Monthly perceived stress';
export const PSS_SAVE_LABEL = 'Save monthly scale';
export const PSS_SKIP_LABEL = 'Skip this month';

/** Only the totals are stored, so re-answering starts from a blank scale. */
export const REANSWER_NOTE = 'Only the totals are kept, not the individual answers — answering again replaces them.';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

type Answers = Partial<Record<CheckInItem, number>>;

interface Draft {
  /** The day this draft belongs to — a midnight rollover reseeds it. */
  date: ISODate;
  answers: Answers;
  /** True once the user asked to change an already-saved check-in. */
  editing: boolean;
  skipped: boolean;
}

/** Pull the already-saved answers out of the day's record. */
function savedAnswers(record: DailyRecord | undefined, items: CheckInItem[]): Answers {
  const out: Answers = {};
  if (!record) return out;
  for (const k of items) {
    const v = record[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v);
  }
  return out;
}

const freshDraft = (date: ISODate, answers: Answers): Draft => ({ date, answers, editing: false, skipped: false });

export interface CheckInSectionProps {
  /** The calendar day being checked in. */
  date: ISODate;
  /** That day's record — anything already saved pre-fills the scales. */
  record: DailyRecord | undefined;
  settings: CheckInSettings;
  /**
   * Every day already in the store. Used ONLY to ask whether this week already
   * has an SRSS and this month a PSS-4, so a Sunday answered once is not asked
   * again on Monday. Omitted, the gates fall back to the day's own record —
   * correct on the day it is answered, merely more eager on the days after.
   */
  records?: readonly DailyRecord[];
  /** One write: the parent calls `actions.saveCheckIn(date, values)`. */
  onSave: (values: CheckInWrite) => void;
  /** Fired when the user skips the DAILY check-in (writes nothing). */
  onSkip?: () => void;
  /** Deep link into Settings → Check-in. */
  onOpenSettings?: () => void;
}

export default function CheckInSection(props: CheckInSectionProps) {
  const { date, record, settings, records, onSave } = props;
  const known = records ?? (record ? [record] : []);

  // A saved instrument keeps its card for the rest of the day so the answer can
  // be read back (and redone); from tomorrow the gate below hides it.
  const srssSavedToday = isNum(record?.srssR) || isNum(record?.srssS);
  const pssSavedToday = isNum(record?.pss4);

  return (
    <div className="flex flex-col gap-4">
      <DailyCheckIn {...props} />
      {(srssDue(date, settings, known) || (settings.weeklySrss && srssSavedToday)) && (
        <WeeklySrssCard date={date} record={record} onSave={onSave} />
      )}
      {(pssDue(date, settings, known) || (settings.monthlyPss && pssSavedToday)) && (
        <MonthlyPssCard date={date} record={record} onSave={onSave} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The shared question row — one item, one radiogroup, anchors at both ends
// ---------------------------------------------------------------------------

interface QuestionProps {
  label: string;
  /** The scale's own descriptive words for the item, when it has them. */
  hint?: string;
  /** Read-out beside the label: the word for the pick, or UNANSWERED. */
  answer: string;
  /** Accessible name of the radiogroup. */
  aria: string;
  /** `name` for the radios — one group per item. */
  name: string;
  steps: readonly number[];
  /** The word spoken for step `n`; it goes in the radio's accessible name. */
  wordAt: (n: number) => string;
  value: number | undefined;
  low: string;
  high: string;
  onPick: (n: number) => void;
}

function Question({ label, hint, answer, aria, name, steps, wordAt, value, low, high, onPick }: QuestionProps) {
  const first = steps[0];
  const last = steps[steps.length - 1];
  return (
    <div className="min-w-0 flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <span className="hx-label">{label}</span>
        <span className={`text-[13px] leading-5 shrink-0 ${value === undefined ? 'text-hx-muted' : 'font-medium text-hx-text'}`}>{answer}</span>
      </div>
      {hint && <p className="text-[11px] leading-4 text-hx-muted -mt-1">{hint}</p>}
      <div className="flex gap-[3px] -mx-1" role="radiogroup" aria-label={aria}>
        {steps.map((n) => {
          const selected = value === n;
          return (
            <label key={n} className="relative flex-1 min-w-0 h-11 cursor-pointer">
              <input
                type="radio"
                name={name}
                value={n}
                checked={selected}
                onChange={() => onPick(n)}
                aria-label={`${n} — ${wordAt(n)}`}
                className="peer sr-only"
              />
              <span
                className={`absolute inset-0 rounded-xl border flex items-center justify-center text-[15px] font-semibold transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-hx-blue ${
                  selected ? 'bg-hx-text text-hx-base border-hx-text' : 'bg-hx-card2 text-hx-text2 border-hx-border hover:border-hx-neutral'
                }`}
              >
                {n}
              </span>
            </label>
          );
        })}
      </div>
      <div className="flex items-start justify-between gap-3 text-[11px] leading-4 text-hx-muted">
        <span className="min-w-0">
          {first} · {low}
        </span>
        <span className="min-w-0 text-right">
          {last} · {high}
        </span>
      </div>
    </div>
  );
}

/** The "skipped, nothing written" state every card shares. */
function SkippedCard({ title, caption, onUndo }: { title: string; caption: string; onUndo: () => void }) {
  return (
    <div className="hx-card p-4 flex flex-col gap-3">
      <SectionHeader title={title} caption={caption} />
      <p className="text-[13px] leading-5 text-hx-text2">Nothing was written — skipping simply leaves it unanswered.</p>
      <Button variant="secondary" size="md" className="self-start" onClick={onUndo}>
        Answer it anyway
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Daily — the Hooper four
// ---------------------------------------------------------------------------

function DailyCheckIn({ date, record, settings, onSave, onSkip, onOpenSettings }: CheckInSectionProps) {
  const groupId = useId();
  const items = orderedCheckInItems(settings.items);
  const saved = savedAnswers(record, items);
  const savedCount = items.filter((k) => saved[k] !== undefined).length;

  // Same identity trick the Log screen uses for its AI client slot: a draft
  // from another day is stale, so it is replaced in-render rather than in an
  // effect (no flash of yesterday's answers after midnight).
  const [stored, setStored] = useState<Draft>(() => freshDraft(date, saved));
  const draft = stored.date === date ? stored : freshDraft(date, saved);
  const patch = (p: Partial<Draft>) => setStored((prev) => ({ ...(prev.date === date ? prev : freshDraft(date, saved)), ...p }));

  // Saved answers seed the scales; the draft wins once the user touches one.
  const answers: Answers = { ...saved, ...draft.answers };
  const answeredKeys = items.filter((k) => answers[k] !== undefined);
  const total = hooperTotal(answers, items);

  const setAnswer = (key: CheckInItem, value: number) => patch({ answers: { ...draft.answers, [key]: value }, skipped: false });

  const save = () => {
    const values: CheckInWrite = {};
    for (const k of answeredKeys) values[k] = answers[k];
    onSave(values);
    patch({ editing: false, skipped: false });
  };

  const skip = () => {
    patch({ skipped: true, editing: false });
    onSkip?.();
  };

  const caption =
    savedCount > 0 && !draft.editing
      ? `Saved for ${items.length === savedCount ? 'all four items' : `${savedCount} of ${items.length} items`}`
      : '1 = best, 7 = worst on every item — about twenty seconds.';

  // --- nothing to ask -------------------------------------------------------
  if (items.length === 0) {
    return (
      <div className="hx-card p-4 flex flex-col gap-3">
        <SectionHeader title="Daily check-in" caption="No questions selected." />
        <p className="text-[13px] leading-5 text-hx-text2">Pick which of the four items to ask under Settings → Check-in.</p>
        {onOpenSettings && (
          <Button variant="secondary" size="md" onClick={onOpenSettings} className="self-start">
            Open Settings
          </Button>
        )}
      </div>
    );
  }

  // --- skipped for today ----------------------------------------------------
  if (draft.skipped && savedCount === 0) {
    return (
      <div className="hx-card p-4 flex flex-col gap-3">
        <SectionHeader title="Daily check-in" caption="Skipped today — nothing was saved." />
        <p className="text-[13px] leading-5 text-hx-text2">A skipped day is simply an absent day: it does not count against you and nothing was written.</p>
        <Button variant="secondary" size="md" className="self-start" onClick={() => patch({ skipped: false })}>
          Check in anyway
        </Button>
      </div>
    );
  }

  // --- already saved, not editing ------------------------------------------
  if (savedCount > 0 && !draft.editing) {
    return (
      <div className="hx-card p-4 flex flex-col gap-3">
        <SectionHeader
          title="Daily check-in"
          caption={caption}
          action={
            <Button variant="ghost" size="sm" icon={<Pencil aria-hidden />} onClick={() => patch({ editing: true })}>
              Edit
            </Button>
          }
        />
        <p className="flex items-center gap-2 text-[15px] leading-5 font-semibold text-hx-green">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />
          {total === null ? 'Checked in' : `Checked in · Hooper ${total} of ${HOOPER_MAX}`}
        </p>
        <ul className="flex flex-col gap-1">
          {items.map((k) => (
            <li key={k} className="flex items-baseline justify-between gap-3 text-[13px] leading-5">
              <span className="text-hx-text2 min-w-0 truncate">{CHECK_IN_META[k].label}</span>
              <span className="text-hx-text shrink-0">
                {answers[k] === undefined ? UNANSWERED : `${checkInWord(k, answers[k])} · ${answers[k]}/7`}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[12px] leading-4 text-hx-muted">Lower is better on all four — the total is the Hooper index.</p>
      </div>
    );
  }

  // --- the form -------------------------------------------------------------
  return (
    <div className="hx-card p-4 flex flex-col gap-4">
      <SectionHeader title="Daily check-in" caption={caption} />

      {items.map((key) => {
        const meta = CHECK_IN_META[key];
        const value = answers[key];
        return (
          <Question
            key={key}
            label={meta.label}
            answer={value === undefined ? UNANSWERED : `${checkInWord(key, value)} · ${value}/7`}
            aria={meta.aria}
            name={`${groupId}-${key}`}
            steps={STEPS}
            wordAt={(n) => meta.words[n - 1]}
            value={value}
            low={meta.low}
            high={meta.high}
            onPick={(n) => setAnswer(key, n)}
          />
        );
      })}

      <p className="text-[12px] leading-4 text-hx-text2" role="status">
        {total === null
          ? `${answeredKeys.length} of ${items.length} answered — the Hooper total needs all ${items.length}.`
          : `Hooper total ${total} of ${HOOPER_MAX} · lower is better.`}
      </p>

      <div className="flex flex-col gap-2">
        <Button size="lg" fullWidth onClick={save} disabled={answeredKeys.length === 0}>
          {SAVE_LABEL}
        </Button>
        <Button variant="secondary" size="md" fullWidth onClick={skip}>
          {SKIP_LABEL}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weekly — SRSS, eight items in two subscales of four
// ---------------------------------------------------------------------------

interface InstrumentDraft<A> {
  /** The period this draft belongs to — a rollover into a new week/month reseeds it. */
  period: string;
  answers: A;
  editing: boolean;
  skipped: boolean;
}

const freshInstrument = <A,>(period: string, answers: A): InstrumentDraft<A> => ({ period, answers, editing: false, skipped: false });

interface InstrumentCardProps {
  date: ISODate;
  record: DailyRecord | undefined;
  onSave: (values: CheckInWrite) => void;
}

function WeeklySrssCard({ date, record, onSave }: InstrumentCardProps) {
  const groupId = useId();
  const period = srssWeekStart(date);
  const [stored, setStored] = useState<InstrumentDraft<SrssAnswers>>(() => freshInstrument(period, {}));
  const draft = stored.period === period ? stored : freshInstrument<SrssAnswers>(period, {});
  const patch = (p: Partial<InstrumentDraft<SrssAnswers>>) =>
    setStored((prev) => ({ ...(prev.period === period ? prev : freshInstrument<SrssAnswers>(period, {})), ...p }));

  const answers = draft.answers;
  const values = srssValues(answers);
  const rawR = record?.srssR;
  const rawS = record?.srssS;
  const savedR = isNum(rawR) ? Math.round(rawR) : null;
  const savedS = isNum(rawS) ? Math.round(rawS) : null;
  const savedToday = savedR !== null || savedS !== null;

  const setAnswer = (key: SrssItemKey, value: number) => patch({ answers: { ...answers, [key]: value }, skipped: false });

  const save = () => {
    onSave(values);
    patch({ editing: false, skipped: false, answers: {} });
  };

  if (draft.skipped && !savedToday) {
    return (
      <SkippedCard
        title={SRSS_TITLE}
        caption="Skipped this week — nothing was saved."
        onUndo={() => patch({ skipped: false })}
      />
    );
  }

  // --- answered today -------------------------------------------------------
  if (savedToday && !draft.editing) {
    return (
      <div className="hx-card p-4 flex flex-col gap-3">
        <SectionHeader
          title={SRSS_TITLE}
          caption="Saved for this week."
          as="h3"
          action={
            <Button variant="ghost" size="sm" icon={<Pencil aria-hidden />} onClick={() => patch({ editing: true, answers: {} })}>
              Answer again
            </Button>
          }
        />
        <p className="flex items-center gap-2 text-[15px] leading-5 font-semibold text-hx-green">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />
          {`Recovery ${savedR === null ? '—' : savedR} · Stress ${savedS === null ? '—' : savedS} (of ${SRSS_SUBSCALE_MAX} each)`}
        </p>
        <p className="text-[12px] leading-4 text-hx-muted">High recovery and low stress is the good corner. {REANSWER_NOTE}</p>
      </div>
    );
  }

  // --- the form -------------------------------------------------------------
  return (
    <div className="hx-card p-4 flex flex-col gap-4">
      <SectionHeader
        title={SRSS_TITLE}
        as="h3"
        caption="Eight items, 0 to 6, asked once a week — usually Sunday. About a minute."
      />
      {draft.editing && <p className="text-[12px] leading-4 text-hx-muted">{REANSWER_NOTE}</p>}

      {(['recovery', 'stress'] as const).map((scale) => (
        <SrssSubscale key={scale} scale={scale} groupId={groupId} answers={answers} onPick={setAnswer} />
      ))}

      <div className="flex flex-col gap-2">
        <Button size="lg" fullWidth onClick={save} disabled={Object.keys(values).length === 0}>
          {SRSS_SAVE_LABEL}
        </Button>
        <Button variant="secondary" size="md" fullWidth onClick={() => patch({ skipped: true, editing: false })}>
          {SRSS_SKIP_LABEL}
        </Button>
      </div>
      <p className="text-[12px] leading-4 text-hx-muted">
        Each subscale is stored as its total out of {SRSS_SUBSCALE_MAX}, so a subscale is only saved once all four of its items are answered.
      </p>
    </div>
  );
}

function SrssSubscale({
  scale,
  groupId,
  answers,
  onPick,
}: {
  scale: SrssScale;
  groupId: string;
  answers: SrssAnswers;
  onPick: (key: SrssItemKey, n: number) => void;
}) {
  const items = srssScaleItems(scale);
  const total = srssSubtotal(answers, scale);
  const answered = items.filter((i) => answers[i.key] !== undefined).length;
  return (
    <div className="flex flex-col gap-4 min-w-0">
      <p className="hx-label text-hx-text2">{SRSS_SCALE_LABEL[scale]}</p>
      {items.map((item) => {
        const value = answers[item.key];
        return (
          <Question
            key={item.key}
            label={item.label}
            hint={item.hint}
            answer={value === undefined ? UNANSWERED : `${srssWord(value)} · ${value}/${SRSS_MAX_STEP}`}
            aria={item.aria}
            name={`${groupId}-${item.key}`}
            steps={SRSS_STEPS}
            wordAt={(n) => srssWord(n)}
            value={value}
            low={SRSS_LOW}
            high={SRSS_HIGH}
            onPick={(n) => onPick(item.key, n)}
          />
        );
      })}
      <p className="text-[12px] leading-4 text-hx-text2" role="status">
        {srssSubtotalLine(scale, total, answered)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monthly — PSS-4 (items 2 and 3 reverse-scored; see ./instruments)
// ---------------------------------------------------------------------------

function MonthlyPssCard({ date, record, onSave }: InstrumentCardProps) {
  const groupId = useId();
  const period = date.slice(0, 7);
  const [stored, setStored] = useState<InstrumentDraft<PssAnswers>>(() => freshInstrument(period, {}));
  const draft = stored.period === period ? stored : freshInstrument<PssAnswers>(period, {});
  const patch = (p: Partial<InstrumentDraft<PssAnswers>>) =>
    setStored((prev) => ({ ...(prev.period === period ? prev : freshInstrument<PssAnswers>(period, {})), ...p }));

  const answers = draft.answers;
  const total = pss4Total(answers);
  const answered = PSS_ITEMS.filter((i) => answers[i.key] !== undefined).length;
  const values = pss4Values(answers);
  const rawPss = record?.pss4;
  const saved = isNum(rawPss) ? Math.round(rawPss) : null;

  const setAnswer = (key: PssItemKey, value: number) => patch({ answers: { ...answers, [key]: value }, skipped: false });

  const save = () => {
    onSave(values);
    patch({ editing: false, skipped: false, answers: {} });
  };

  if (draft.skipped && saved === null) {
    return (
      <SkippedCard
        title={PSS_TITLE}
        caption="Skipped this month — nothing was saved."
        onUndo={() => patch({ skipped: false })}
      />
    );
  }

  // --- answered this month --------------------------------------------------
  if (saved !== null && !draft.editing) {
    return (
      <div className="hx-card p-4 flex flex-col gap-3">
        <SectionHeader
          title={PSS_TITLE}
          caption="Saved for this month."
          as="h3"
          action={
            <Button variant="ghost" size="sm" icon={<Pencil aria-hidden />} onClick={() => patch({ editing: true, answers: {} })}>
              Answer again
            </Button>
          }
        />
        <p className="flex items-center gap-2 text-[15px] leading-5 font-semibold text-hx-green">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />
          {`PSS-4 ${saved} of ${PSS_MAX}`}
        </p>
        <p className="text-[12px] leading-4 text-hx-muted">
          That is {pss4Reading(saved)} — a description of the month, not a diagnosis. {REANSWER_NOTE}
        </p>
      </div>
    );
  }

  // --- the form -------------------------------------------------------------
  return (
    <div className="hx-card p-4 flex flex-col gap-4">
      <SectionHeader
        title={PSS_TITLE}
        as="h3"
        caption="Four items asked once a month — they ask about the last month, which is why they are never asked daily."
      />
      <p className="text-[13px] leading-5 text-hx-text2">{PSS_STEM}</p>
      {draft.editing && <p className="text-[12px] leading-4 text-hx-muted">{REANSWER_NOTE}</p>}

      {PSS_ITEMS.map((item) => {
        const value = answers[item.key];
        return (
          <Question
            key={item.key}
            label={item.label}
            // The read-out names the RAW pick even on the two reverse-scored
            // items: the flip belongs to the total, never to what is shown.
            answer={value === undefined ? UNANSWERED : `${pssWord(value)} · ${value}/${PSS_MAX_STEP}`}
            aria={item.aria}
            name={`${groupId}-${item.key}`}
            steps={PSS_STEPS}
            wordAt={(n) => pssWord(n)}
            value={value}
            low={PSS_LOW}
            high={PSS_HIGH}
            onPick={(n) => setAnswer(item.key, n)}
          />
        );
      })}

      <p className="text-[12px] leading-4 text-hx-text2" role="status">
        {pss4Line(total, answered)}
      </p>

      <div className="flex flex-col gap-2">
        <Button size="lg" fullWidth onClick={save} disabled={Object.keys(values).length === 0}>
          {PSS_SAVE_LABEL}
        </Button>
        <Button variant="secondary" size="md" fullWidth onClick={() => patch({ skipped: true, editing: false })}>
          {PSS_SKIP_LABEL}
        </Button>
      </div>
      <p className="text-[12px] leading-4 text-hx-muted">
        Stored as one total out of {PSS_MAX}, so nothing is saved until all four are answered. It describes how the month felt — it is not a diagnosis.
      </p>
    </div>
  );
}
