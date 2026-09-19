/**
 * Training — Today's answer to "what am I doing today?" (plan 2b), set as a
 * fixture: a running head with the week's load as its dateline, a 56 px
 * fixture row that is the button into the Train tab, then the planned lifts
 * as `.hx-body` lines with the plan word in its tone.
 *
 * It has four states and never invents a fifth:
 *
 *  - **logged** — one or more sessions already recorded today: what each one
 *    was, how long, session RPE and the load it carried, plus any personal
 *    record set today;
 *  - **planned** — the split says today is a session and the engine has
 *    suggestions: the first three exercises with their sets × reps, suggested
 *    load and the *plan word* (add load / hold load / back off), with the
 *    engine's own reason for the top exercise;
 *  - **rest** — the split says rest: no plan, but anything logged still counts;
 *  - **no plan yet** — a session day the engine cannot fill (no history), or
 *    no training context at all.
 *
 * Every number is read from `ctx.training` — sets, reps, loads, duration, RPE,
 * load units and the week-on-week change are all engine output; this file
 * only converts kg to the user's display unit and picks the words. Plan and
 * deload states always carry a word beside their tone (SPEC §0 — colour is
 * never the only signal).
 */
import type { ISODate, TrainingContext, Workout } from '../../data/types';
import { COACH_CHIPS } from '../../engine';
import { fmt, kgToLb } from '../../lib/format';
import { Button, SectionHeader, bandText } from '../../ui';
import { SESSION_LABEL } from './TodayHeader';

/** How many planned exercises the fixture lists before it summarises the rest. */
export const PLANNED_PREVIEW = 3;

/** `PlannedExercise.mode` to the word beside the tone (never a bare colour). */
export const MODE_WORD = {
  progress: { text: 'add load', tone: 'green' },
  hold: { text: 'hold load', tone: 'neutral' },
  reduce: { text: 'back off', tone: 'yellow' },
} as const;

export const REST_TITLE = 'Rest day';
export const REST_HINT = 'Nothing planned. Anything you do log — a walk, mobility, sport — still counts toward your load.';
export const NO_PLAN_HINT = 'No suggestions yet — log a session or two and the plan fills in with your own loads.';
export const EMPTY_HINT = 'Log your first session and today’s plan, your loads and your weekly volume all start here.';

const KIND_WORD: Record<Workout['kind'], string> = {
  strength: 'Strength',
  cardio: 'Cardio',
  mobility: 'Mobility',
  sport: 'Sport',
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** kg from the engine in the user’s display unit. Display only; storage stays kg. */
function loadText(kg: number | null | undefined, units: 'lb' | 'kg'): string | null {
  if (!isNum(kg)) return null;
  if (units === 'lb') return `${fmt(kgToLb(kg), 0)} lb`;
  return `${fmt(kg, Number.isInteger(kg) ? 0 : 1)} kg`;
}

/** "62 min, RPE 8, 496 load" — only the parts the session actually has. */
export function workoutLine(w: Workout): string {
  const parts: string[] = [];
  if (isNum(w.durationMin) && w.durationMin > 0) parts.push(`${fmt(w.durationMin)} min`);
  if (isNum(w.srpe)) parts.push(`RPE ${fmt(w.srpe, Number.isInteger(w.srpe) ? 0 : 1)}`);
  if (isNum(w.load)) parts.push(`${fmt(w.load)} load`);
  if (isNum(w.cardio?.distanceKm)) parts.push(`${fmt(w.cardio.distanceKm, 1)} km`);
  if (isNum(w.cardio?.avgHr)) parts.push(`avg HR ${fmt(w.cardio.avgHr)}`);
  return parts.join(', ');
}

/** The session's own name: its title, else its split slot, else its kind. */
export function workoutTitle(w: Workout): string {
  if (w.title && w.title.trim()) return w.title.trim();
  if (w.session && w.session !== 'rest') return SESSION_LABEL[w.session];
  return KIND_WORD[w.kind] ?? 'Session';
}

export interface TrainingTileProps {
  /** Undefined while the engine has no training block at all. */
  training?: TrainingContext;
  /** The day being described — personal records are matched against it. */
  today: ISODate;
  /** Display units for suggested loads (`settings.training.units`). */
  units: 'lb' | 'kg';
  /** Deep link into the Train tab's today view (`openTrain('today')`). */
  onOpenTrain: () => void;
  onOpenCoach?: (prompt: string) => void;
}

export default function TrainingTile({ training, today, units, onOpenTrain, onOpenCoach }: TrainingTileProps) {
  const logged = training?.todayWorkouts ?? [];
  const planned = training?.plannedExercises ?? [];
  const session = training?.todaySession ?? 'rest';
  const prsToday = (training?.prs7d ?? []).filter((pr) => pr.d === today);
  const load = training?.load;
  const deload = training?.deload;

  const state: 'logged' | 'planned' | 'rest' | 'none' = logged.length > 0 ? 'logged' : planned.length > 0 ? 'planned' : !training ? 'none' : session === 'rest' ? 'rest' : 'none';

  const sessionName = !training ? 'Nothing logged yet' : session === 'rest' ? REST_TITLE : SESSION_LABEL[session];
  const title = state === 'logged' ? workoutTitle(logged[0]) : sessionName;
  const statusWord = state === 'logged' ? 'Logged' : state === 'planned' ? 'Planned' : state === 'rest' ? 'Rest' : 'No plan yet';
  const status =
    state === 'planned'
      ? `${statusWord}, ${fmt(planned.length)} exercise${planned.length === 1 ? '' : 's'}`
      : state === 'logged' && logged.length > 1
        ? `${statusWord}, ${fmt(logged.length)} sessions`
        : statusWord;
  const cta = state === 'logged' ? 'See today’s session' : state === 'planned' ? 'Open today’s session' : 'Log a session';

  // "This week 2,394 load, +6% on last week" — both numbers straight from the engine.
  let loadLine: string | undefined;
  if (load && load.source !== 'none' && isNum(load.weeklyLoad) && load.weeklyLoad > 0) {
    loadLine = `This week ${fmt(load.weeklyLoad)} load`;
    if (isNum(load.weekOverWeekPct)) {
      const pct = Math.round(load.weekOverWeekPct);
      // "+0%" is not a change; say so in words rather than printing a zero.
      loadLine += pct === 0 ? ', level with last week' : `, ${pct > 0 ? '+' : '−'}${fmt(Math.abs(pct))}% on last week`;
    }
  }

  return (
    <section className="mt-10" aria-label="Training">
      <SectionHeader as="h2" rule={false} title="Training" caption={loadLine} />

      <div className="hx-ledger mt-4">
        <button type="button" onClick={onOpenTrain} className="hx-row hx-press flex-row items-center justify-between gap-3 text-left">
          <span className="min-w-0 flex flex-col">
            <span className="hx-ui text-hx-text">{title}</span>
            <span className="hx-cap">{status}</span>
          </span>
          <span className="hx-ui text-hx-text shrink-0">{cta}</span>
        </button>
      </div>

      {state === 'logged' && (
        <ul className="mt-3 flex flex-col gap-1">
          {logged.map((w) => (
            <li key={w.id} className="hx-body">
              {logged.length > 1 && <span>{workoutTitle(w)}, </span>}
              <span className="text-hx-text2">{workoutLine(w) || 'Logged'}</span>
            </li>
          ))}
        </ul>
      )}

      {state === 'planned' && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {planned.slice(0, PLANNED_PREVIEW).map((ex) => {
            const mode = MODE_WORD[ex.mode] ?? MODE_WORD.hold;
            const kg = loadText(ex.loadKg, units);
            return (
              <li key={ex.exerciseId} className="flex items-baseline justify-between gap-3">
                <span className="hx-body min-w-0">
                  {ex.name}{' '}
                  <span className="text-hx-text2">{`${ex.sets} × ${ex.reps[0]}–${ex.reps[1]}${kg ? ` @ ${kg}` : ''}`}</span>
                </span>
                <span className={`hx-label shrink-0 ${bandText(mode.tone)}`}>
                  {mode.tone !== 'neutral' && <span className="hx-tone mr-1.5" aria-hidden />}
                  {mode.text}
                </span>
              </li>
            );
          })}
          {planned.length > PLANNED_PREVIEW && <li className="hx-cap">{`+${fmt(planned.length - PLANNED_PREVIEW)} more in Train`}</li>}
        </ul>
      )}

      {state === 'planned' && planned[0]?.reason && <p className="hx-cap mt-2">{planned[0].reason}</p>}
      {state === 'rest' && <p className="hx-body text-hx-text2 mt-3">{REST_HINT}</p>}
      {state === 'none' && <p className="hx-body text-hx-text2 mt-3">{training ? NO_PLAN_HINT : EMPTY_HINT}</p>}

      {prsToday.length > 0 && (
        <p className="hx-note border-hx-green hx-body mt-3" role="status">
          <span className="hx-label text-hx-green">
            <span className="hx-tone mr-1.5" aria-hidden />
            Personal record:
          </span>{' '}
          <span>{prsToday.map((pr) => `${pr.name} ${pr.kind === 'reps' ? `${fmt(pr.value)} reps` : (loadText(pr.value, units) ?? fmt(pr.value, 1))}`).join(', ')}</span>
        </p>
      )}

      {deload?.recommended && (
        <p className="hx-note border-hx-yellow hx-body mt-3">
          <span className="hx-label text-hx-yellow">
            <span className="hx-tone mr-1.5" aria-hidden />
            Deload suggested
          </span>
          {deload.reasons.length > 0 && <span>{` — ${deload.reasons.join(', ')}`}</span>}
        </p>
      )}

      {onOpenCoach && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => onOpenCoach(COACH_CHIPS[8])}>
          Ask the coach
        </Button>
      )}
    </section>
  );
}
