/**
 * CheckInSection — the daily Hooper check-in, in Log (SPEC §2 "logging must
 * take seconds"; plan 2g).
 *
 * Four 1–7 items (sleep quality, fatigue, stress, muscle soreness), each as a
 * seven-button scale with a WORDED ANCHOR AT BOTH ENDS and a word for the
 * chosen step — a bare "5" means nothing, "Fairly tired" does. Every button is
 * a native radio (so arrow keys, `aria-checked` and grouping come free) inside
 * a 44 px label; selection is shown by INVERSION plus the spoken word, never
 * by hue alone.
 *
 * Nothing is preselected: an untouched item stays "not answered yet" and is
 * simply not written, so the store never records a 4 the user did not choose.
 * Save is ONE `saveCheckIn` write for every answered item.
 *
 * "Skip today" is a first-class button beside Save, not a hidden escape. It
 * writes nothing — a skipped day is an absent day, which is exactly what the
 * engine's `missingToday` expects — and it can be undone in place.
 *
 * The weekly SRSS and the monthly PSS-4 belong to this section too, but there
 * is nowhere to persist their items yet (`DailyRecord` carries only qs/qf/qt/
 * qo), so when they are enabled in settings they render as an explicit,
 * clearly-marked placeholder rather than a control that silently drops data.
 */
import { useId, useState } from 'react';
import { CheckCircle2, Pencil } from 'lucide-react';
import type { CheckInItem, CheckInSettings, DailyRecord, ISODate } from '../../data/types';
import { Button, SectionHeader } from '../../ui';
import { CHECK_IN_META, HOOPER_MAX, checkInWord, hooperTotal, orderedCheckInItems } from '../stress/format';

const STEPS = [1, 2, 3, 4, 5, 6, 7] as const;

export const SKIP_LABEL = 'Skip today';
export const SAVE_LABEL = 'Save check-in';
export const UNANSWERED = 'Not answered yet';
export const SRSS_PLACEHOLDER = 'Weekly recovery and stress scale (SRSS) — placeholder. The eight SRSS items are not collected yet: there is nowhere to store them, so nothing is asked rather than asking and dropping the answers. Turn it off under Settings → Check-in.';
export const PSS_PLACEHOLDER = 'Monthly perceived stress scale (PSS-4) — placeholder. The four PSS-4 items are not collected yet: there is nowhere to store them, so nothing is asked rather than asking and dropping the answers. Its recall window is a month, so it is never asked daily. Turn it off under Settings → Check-in.';

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
  /** One write: the parent calls `actions.saveCheckIn(date, values)`. */
  onSave: (values: Partial<Pick<DailyRecord, CheckInItem>>) => void;
  /** Fired when the user skips (writes nothing — an absent day stays absent). */
  onSkip?: () => void;
  /** Deep link into Settings → Check-in. */
  onOpenSettings?: () => void;
}

export default function CheckInSection({ date, record, settings, onSave, onSkip, onOpenSettings }: CheckInSectionProps) {
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
    const values: Partial<Pick<DailyRecord, CheckInItem>> = {};
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
        <Placeholders settings={settings} />
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
          <div key={key} className="min-w-0 flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2 min-w-0">
              <span className="hx-label">{meta.label}</span>
              <span className={`text-[13px] leading-5 shrink-0 ${value === undefined ? 'text-hx-muted' : 'font-medium text-hx-text'}`}>
                {value === undefined ? UNANSWERED : `${checkInWord(key, value)} · ${value}/7`}
              </span>
            </div>
            <div className="flex gap-[3px] -mx-1" role="radiogroup" aria-label={meta.aria}>
              {STEPS.map((n) => {
                const selected = value === n;
                return (
                  <label key={n} className="relative flex-1 min-w-0 h-11 cursor-pointer">
                    <input
                      type="radio"
                      name={`${groupId}-${key}`}
                      value={n}
                      checked={selected}
                      onChange={() => setAnswer(key, n)}
                      aria-label={`${n} — ${meta.words[n - 1]}`}
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
              <span className="min-w-0">1 · {meta.low}</span>
              <span className="min-w-0 text-right">7 · {meta.high}</span>
            </div>
          </div>
        );
      })}

      <p className="text-[12px] leading-4 text-hx-text2" role="status">
        {total === null
          ? `${answeredKeys.length} of ${items.length} answered — the Hooper total needs all ${items.length}.`
          : `Hooper total ${total} of ${HOOPER_MAX} · lower is better.`}
      </p>

      <Placeholders settings={settings} />

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

/** SRSS / PSS-4: enabled in settings but not yet collectable — say so plainly. */
function Placeholders({ settings }: { settings: CheckInSettings }) {
  if (!settings.weeklySrss && !settings.monthlyPss) return null;
  return (
    <div className="flex flex-col gap-2">
      {settings.weeklySrss && (
        <p className="rounded-xl border border-dashed border-hx-border bg-hx-card2/40 p-3 text-[12px] leading-4 text-hx-muted">{SRSS_PLACEHOLDER}</p>
      )}
      {settings.monthlyPss && (
        <p className="rounded-xl border border-dashed border-hx-border bg-hx-card2/40 p-3 text-[12px] leading-4 text-hx-muted">{PSS_PLACEHOLDER}</p>
      )}
    </div>
  );
}
