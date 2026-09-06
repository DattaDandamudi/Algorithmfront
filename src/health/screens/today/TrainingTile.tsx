/**
 * Training tile — Today's answer to "what am I doing today?" (plan 2b).
 *
 * Full width, straight after the metric tiles, and one tap from the Train tab
 * (`openTrain('today')`). It has four states and never invents a fifth:
 *
 *  - **logged** — one or more sessions already recorded today: what each one
 *    was, how long, session RPE and the load it carried, plus any personal
 *    record set today;
 *  - **planned** — the split says today is a session and the engine has
 *    suggestions: the first three exercises with their sets × reps, suggested
 *    load and the *mode word* (add load / hold load / back off), with the
 *    engine's own reason for the top exercise;
 *  - **rest** — the split says rest: no plan, but anything logged still counts;
 *  - **no plan yet** — a session day the engine cannot fill (no history), or
 *    no training context at all.
 *
 * Every number is read from `ctx.training` — sets, reps, loads, duration, RPE,
 * load units and the week-on-week change are all engine output; the tile only
 * converts kg to the user's display unit and picks the words. Mode and deload
 * states always carry a word beside their tone (SPEC §0 — colour is never the
 * only signal), and the single call to action is a 48 px button.
 */
import { CheckCircle2, Dumbbell, Moon, Trophy } from 'lucide-react';
import type { ISODate, TrainingContext, Workout } from '../../data/types';
import { COACH_CHIPS } from '../../engine';
import { fmt, kgToLb } from '../../lib/format';
import { Button, SectionHeader, bandText } from '../../ui';
import { SESSION_LABEL } from './TodayHeader';

/** How many planned exercises the tile lists before it summarises the rest. */
export const PLANNED_PREVIEW = 3;

/** `PlannedExercise.mode` → the word beside the tone (never a bare colour). */
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

/** kg from the engine → the user's display unit. Display only; storage stays kg. */
function loadText(kg: number | null | undefined, units: 'lb' | 'kg'): string | null {
  if (!isNum(kg)) return null;
  if (units === 'lb') return `${fmt(kgToLb(kg), 0)} lb`;
  return `${fmt(kg, Number.isInteger(kg) ? 0 : 1)} kg`;
}

/** "Lower · 62 min · RPE 8 · 496 load" — only the parts the session actually has. */
export function workoutLine(w: Workout): string {
  const parts: string[] = [];
  if (isNum(w.durationMin) && w.durationMin > 0) parts.push(`${fmt(w.durationMin)} min`);
  if (isNum(w.srpe)) parts.push(`RPE ${fmt(w.srpe, Number.isInteger(w.srpe) ? 0 : 1)}`);
  if (isNum(w.load)) parts.push(`${fmt(w.load)} load`);
  if (isNum(w.cardio?.distanceKm)) parts.push(`${fmt(w.cardio.distanceKm, 1)} km`);
  if (isNum(w.cardio?.avgHr)) parts.push(`avg HR ${fmt(w.cardio.avgHr)}`);
  return parts.join(' · ');
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

  const state: 'logged' | 'planned' | 'rest' | 'none' =
    logged.length > 0 ? 'logged' : planned.length > 0 ? 'planned' : !training ? 'none' : session === 'rest' ? 'rest' : 'none';

  const sessionName = !training ? 'Nothing logged yet' : session === 'rest' ? REST_TITLE : SESSION_LABEL[session];
  const Icon = state === 'logged' ? CheckCircle2 : state === 'rest' ? Moon : Dumbbell;
  const statusWord = state === 'logged' ? 'Logged' : state === 'planned' ? 'Planned' : state === 'rest' ? 'Rest' : 'No plan yet';
  const cta = state === 'logged' ? 'See today’s session' : state === 'planned' ? 'Open today’s session' : 'Log a session';

  // "This week 2,394 load · +6% on last week" — both numbers straight from the engine.
  let loadLine: string | null = null;
  if (load && load.source !== 'none' && isNum(load.weeklyLoad) && load.weeklyLoad > 0) {
    loadLine = `This week ${fmt(load.weeklyLoad)} load`;
    if (isNum(load.weekOverWeekPct)) {
      const pct = Math.round(load.weekOverWeekPct);
      // "+0%" is not a change; say so in words rather than printing a zero.
      loadLine += pct === 0 ? ' · level with last week' : ` · ${pct > 0 ? '+' : '−'}${fmt(Math.abs(pct))}% on last week`;
    }
  }

  return (
    <section className="px-4 pb-5 flex flex-col gap-3" aria-label="Training">
      <SectionHeader
        title="Training"
        caption="Today’s session — planned, logged and what it cost you"
        action={
          onOpenCoach ? (
            <Button variant="ghost" size="sm" onClick={() => onOpenCoach(COACH_CHIPS[8])}>
              Ask the coach
            </Button>
          ) : undefined
        }
      />
      <div className="hx-card p-4 flex flex-col gap-3">
        <div className="min-w-0 flex items-start gap-2">
          <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${state === 'logged' ? 'text-hx-green' : state === 'rest' ? 'text-hx-neutral' : 'text-hx-blue'}`} aria-hidden />
          <div className="min-w-0">
            <p className="text-[17px] leading-6 font-semibold text-hx-text truncate">{state === 'logged' ? workoutTitle(logged[0]) : sessionName}</p>
            <p className="text-[12px] leading-4 text-hx-muted">
              {statusWord}
              {state === 'planned' && ` · ${planned.length} exercise${planned.length === 1 ? '' : 's'}`}
              {state === 'logged' && logged.length > 1 && ` · ${logged.length} sessions`}
            </p>
          </div>
        </div>

        {state === 'logged' && (
          <ul className="flex flex-col gap-1.5">
            {logged.map((w) => (
              <li key={w.id} className="text-[13px] leading-5 text-hx-text2">
                {logged.length > 1 && <span className="text-hx-text font-medium">{workoutTitle(w)} · </span>}
                {workoutLine(w) || 'Logged'}
              </li>
            ))}
          </ul>
        )}

        {state === 'planned' && (
          <ul className="flex flex-col gap-2">
            {planned.slice(0, PLANNED_PREVIEW).map((ex) => {
              const mode = MODE_WORD[ex.mode] ?? MODE_WORD.hold;
              const kg = loadText(ex.loadKg, units);
              return (
                <li key={ex.exerciseId} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-[13px] leading-5 text-hx-text truncate">
                    {ex.name}
                    <span className="text-hx-muted">
                      {' '}
                      {ex.sets} × {ex.reps[0]}–{ex.reps[1]}
                      {kg ? ` @ ${kg}` : ''}
                    </span>
                  </span>
                  <span className={`shrink-0 text-[12px] leading-4 font-medium ${bandText(mode.tone)}`}>{mode.text}</span>
                </li>
              );
            })}
            {planned.length > PLANNED_PREVIEW && (
              <li className="text-[12px] leading-4 text-hx-muted">+{planned.length - PLANNED_PREVIEW} more in Train</li>
            )}
          </ul>
        )}

        {state === 'planned' && planned[0]?.reason && <p className="text-[12px] leading-4 text-hx-text2">{planned[0].reason}</p>}
        {state === 'rest' && <p className="text-[13px] leading-5 text-hx-text2">{REST_HINT}</p>}
        {state === 'none' && <p className="text-[13px] leading-5 text-hx-text2">{training ? NO_PLAN_HINT : EMPTY_HINT}</p>}

        {prsToday.length > 0 && (
          <p className="flex items-start gap-2 text-[13px] leading-5 text-hx-green" role="status">
            <Trophy className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
            <span className="min-w-0">
              Personal record ·{' '}
              {prsToday
                .map((pr) => `${pr.name} ${pr.kind === 'reps' ? `${fmt(pr.value)} reps` : (loadText(pr.value, units) ?? fmt(pr.value, 1))}`)
                .join(', ')}
            </span>
          </p>
        )}

        {deload?.recommended && (
          <p className="text-[12px] leading-4 text-hx-yellow">Deload suggested{deload.reasons.length > 0 ? ` — ${deload.reasons.join(' · ')}` : ''}</p>
        )}

        {loadLine && <p className="text-[12px] leading-4 text-hx-muted">{loadLine}</p>}

        <Button size="lg" fullWidth variant={state === 'planned' ? 'primary' : 'secondary'} icon={<Dumbbell aria-hidden />} onClick={onOpenTrain}>
          {cta}
        </Button>
      </div>
    </section>
  );
}
