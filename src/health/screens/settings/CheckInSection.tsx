/**
 * Settings §5 — Daily check-in (SPEC §5; engine/stress, screens/log/CheckInSection).
 *
 * The subjective four (Hooper: sleep quality, fatigue, stress, soreness) track
 * training load with better sensitivity than the objective ones (Saw 2016), so
 * they are a real input to readiness — but only if answering stays cheap. This
 * card is the honesty valve: the prompt can be turned off entirely, any item
 * can be dropped, and the time it starts asking is the user's.
 *
 * The weekly SRSS and monthly PSS-4 are separate instruments with their own
 * recall windows (a week, a month) — never asked daily, and off by default.
 * `DailyRecord` carries `srssR`, `srssS` and `pss4`, so their answers have a
 * home and appear in the CSV export; the Log screen still shows a labelled
 * placeholder where the items will go, and the hints below say exactly that
 * rather than implying the questionnaires are live.
 *
 * Cycle tracking sits here because it is the same kind of daily question: with
 * it on, Log offers a "menstruating today" flag and the weight filter widens
 * its band across those days instead of reading water as fat.
 */
import { useMemo } from 'react';
import { Check } from 'lucide-react';
import { useHealth, useRecords } from '../../data/store';
import type { CheckInItem } from '../../data/types';
import { formatDateShort } from '../../lib/dates';
import { Chip } from '../../ui';
import { Field, KV, Note, SubHeading, TimeField, Toggle } from './fields';
import { CHECK_IN_ITEMS, normalizeHHMM } from './util';

export default function CheckInSection() {
  const { state, actions } = useHealth();
  const records = useRecords();
  const c = state.settings.checkIn;
  const profile = state.settings.profile;

  const answered = useMemo(() => records.filter((r) => r.qs !== undefined || r.qf !== undefined || r.qt !== undefined || r.qo !== undefined), [records]);
  const last = answered.length ? answered[answered.length - 1] : undefined;

  const set = (patch: Partial<typeof c>) => actions.setSettings((s) => ({ ...s, checkIn: { ...s.checkIn, ...patch } }));

  const toggleItem = (key: CheckInItem) => {
    const on = c.items.includes(key);
    // Never leave the prompt with nothing to ask: the last item stays put and
    // the switch above is the way to stop being asked at all.
    if (on && c.items.length === 1) return;
    const next = on ? c.items.filter((k) => k !== key) : CHECK_IN_ITEMS.map((i) => i.key).filter((k) => k === key || c.items.includes(k));
    set({ items: next });
  };

  return (
    <>
      <Toggle
        label="Ask on Today"
        checked={c.enabled}
        hint="A prompt on the Today screen. Off means the items are never asked; anything already answered is kept."
        onChange={(enabled) => set({ enabled })}
      />

      <Field label="Items to ask" hint={c.items.length === 1 ? 'One item left — turn the prompt off above if you would rather not be asked at all.' : `${c.items.length} of 4 · about ${c.items.length * 5} seconds.`}>
        <div className="flex flex-wrap gap-2">
          {CHECK_IN_ITEMS.map((item) => {
            const on = c.items.includes(item.key);
            return (
              // State is the tick + aria-pressed + the wash, never the wash alone.
              <Chip key={item.key} size="sm" pressed={on} active={on} color="blue" icon={on ? <Check aria-hidden /> : undefined} disabled={!c.enabled} onClick={() => toggleItem(item.key)}>
                {item.label}
              </Chip>
            );
          })}
        </div>
      </Field>
      <ul className="text-[12px] leading-4 text-hx-muted space-y-0.5">
        {CHECK_IN_ITEMS.filter((i) => c.items.includes(i.key)).map((i) => (
          <li key={i.key}>
            <span className="text-hx-text2">{i.label}</span> — {i.hint}, 1–7
          </li>
        ))}
      </ul>

      <TimeField
        label="Ask from"
        value={c.promptAfter}
        hint="Today stays quiet before this. Set it after you normally wake so the question lands once you can answer it."
        onChange={(v) => {
          const t = normalizeHHMM(v);
          if (t) set({ promptAfter: t });
        }}
      />

      <div>
        <KV k="Days with a check-in" v={answered.length} />
        <KV k="Most recent" v={last ? formatDateShort(last.d) : '—'} />
      </div>

      <SubHeading>Longer instruments</SubHeading>
      <Note>
        These have their own recall windows, so they are asked on their own schedule and never every day. Both are off until you want them.
      </Note>
      <Toggle
        label="Weekly recovery & stress (SRSS)"
        checked={c.weeklySrss}
        hint="Eight items, Sundays. Not collectable yet — Log shows a labelled placeholder where they will go, and nothing is stored until the items ship."
        onChange={(weeklySrss) => set({ weeklySrss })}
      />
      <Toggle
        label="Monthly perceived stress (PSS-4)"
        checked={c.monthlyPss}
        hint="Four items, once a month, because its question asks about “the last month”. Same placeholder for now."
        onChange={(monthlyPss) => set({ monthlyPss })}
      />

      <SubHeading>Cycle</SubHeading>
      <Toggle
        label="Track menstrual cycle"
        checked={profile.tracksCycle === true}
        hint="Adds a “menstruating today” flag to Log. The weight filter then widens its band on those days instead of reading water retention as fat gained."
        onChange={(tracksCycle) => actions.updateProfile({ tracksCycle })}
      />
    </>
  );
}
