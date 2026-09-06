/**
 * Settings §3 — Training split. Seven weekday selects (SessionType); the
 * default is the spec's 4-day upper/lower (Mon upper, Tue lower, Thu upper,
 * Fri lower). Lift vs rest drives carb cycling (§6.5) and the coach's
 * "progress your {split_day} loads" copy, so the caption shows the carb
 * ranges that follow from the split.
 */
import { RotateCcw } from 'lucide-react';
import { DEFAULT_SPLIT } from '../../data/defaults';
import { useHealth } from '../../data/store';
import type { SessionType, Weekday } from '../../data/types';
import { weekdayShort } from '../../lib/dates';
import { Button, toast } from '../../ui';
import { useConfirm } from './confirm';
import { Note, SelectField } from './fields';
import { SESSION_OPTIONS, isLiftSession } from './util';

/** Training weeks read Mon → Sun. */
const WEEK: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

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
      body: 'Mon upper · Tue lower · Thu upper · Fri lower; Wed, Sat and Sun rest.',
      confirmLabel: 'Reset',
    });
    if (!ok) return;
    actions.updateProfile({ split: { ...DEFAULT_SPLIT } });
    toast('Split reset to upper/lower');
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 -mt-1">
        <Note>
          {liftDays} lift day{liftDays === 1 ? '' : 's'}/wk · lift days get {t.carbsLift[0]}–{t.carbsLift[1]} g carbs, rest and cardio days {t.carbsRest[0]}–{t.carbsRest[1]} g.
        </Note>
        <Button variant="ghost" size="sm" icon={<RotateCcw aria-hidden />} onClick={reset} disabled={isDefault}>
          Reset
        </Button>
      </div>
      <ul className="divide-y divide-hx-border/60">
        {WEEK.map((w) => {
          const s = split[w];
          const lift = isLiftSession(s);
          return (
            <li key={w} className="flex items-center gap-3 py-2">
              <span className="w-10 shrink-0 text-[14px] font-medium text-hx-text">{weekdayShort(w)}</span>
              <span className={`w-2 h-2 rounded-full shrink-0 ${lift ? 'bg-hx-green' : 'bg-hx-neutral/60'}`} aria-hidden />
              <SelectField<SessionType> label={`${weekdayShort(w)} session`} hideLabel value={s} options={SESSION_OPTIONS} onChange={(v) => set(w, v)} className="flex-1" />
            </li>
          );
        })}
      </ul>
      <Note>Override a single day from the Log screen (lift / rest toggle) without changing the split.</Note>
    </>
  );
}
