/**
 * Settings §3 — Training split. Seven weekday selects (SessionType); the
 * default is the spec's 4-day upper/lower (Mon upper, Tue lower, Thu upper,
 * Fri lower). Lift vs rest drives carb cycling (§6.5) and the coach's
 * "progress your {split_day} loads" copy, so the note shows the carb ranges
 * that follow from the split. The same list, in the same shape, is the
 * Onboarding week step.
 */
import { DEFAULT_SPLIT } from '../../data/defaults';
import { useHealth } from '../../data/store';
import type { SessionType, Weekday } from '../../data/types';
import { weekdayShort } from '../../lib/dates';
import { Button, toast } from '../../ui';
import { useConfirm } from './useConfirm';
import { Note, SelectField } from './fields';
import { SESSION_OPTIONS, isLiftSession } from './util';

/** Training weeks read Mon to Sun. */
const WEEK: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LONG: Record<Weekday, string> = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };

export default function SplitSection() {
  const { state, actions } = useHealth();
  const confirm = useConfirm();
  const split = state.settings.profile.split;
  const t = state.settings.targets;
  const liftDays = WEEK.filter((w) => isLiftSession(split[w])).length;
  const isDefault = WEEK.every((w) => split[w] === DEFAULT_SPLIT[w]);

  const set = (w: Weekday, s: SessionType) => actions.updateProfile({ split: { ...split, [w]: s } });

  const reset = async () => {
    const ok = await confirm({
      title: 'Reset to the 4-day upper/lower split?',
      body: 'Monday upper, Tuesday lower, Thursday upper, Friday lower. Wednesday, Saturday and Sunday rest.',
      confirmLabel: 'Reset',
    });
    if (!ok) return;
    actions.updateProfile({ split: { ...DEFAULT_SPLIT } });
    toast('Split reset to upper/lower');
  };

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <Note>
          {liftDays} lift day{liftDays === 1 ? '' : 's'} a week. Lift days get {t.carbsLift[0]}–{t.carbsLift[1]} g carbs, rest and cardio days {t.carbsRest[0]}–{t.carbsRest[1]} g.
        </Note>
        <Button variant="ghost" size="sm" onClick={reset} disabled={isDefault} className="-my-3">
          Reset
        </Button>
      </div>
      <ul className="m-0 p-0 list-none flex flex-col gap-2">
        {WEEK.map((w) => (
          <li key={w} className="flex items-center gap-4 min-h-11">
            <span className="hx-label w-14 shrink-0">{weekdayShort(w)}</span>
            <SelectField<SessionType> label={`${WEEKDAY_LONG[w]} session`} hideLabel value={split[w]} options={SESSION_OPTIONS} onChange={(v) => set(w, v)} className="flex-1 min-w-0" />
          </li>
        ))}
      </ul>
      <Note>Override a single day from the Log screen (the lift / rest toggle) without changing the split.</Note>
    </>
  );
}
