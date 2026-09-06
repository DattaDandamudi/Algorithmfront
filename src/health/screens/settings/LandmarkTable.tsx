/**
 * Settings §4 — the 15-muscle weekly volume table (SPEC §4, engine/strength).
 *
 * MEV / MAV / MRV are ADVISORY BANDS. Nothing in the app takes sets away
 * because a number was crossed, so this table is drawn as three editable
 * numbers per muscle with `VOLUME_ADVISORY_NOTE` beneath it — never as a limit,
 * a progress bar toward a ceiling, or a red row. `mrv` in particular has no
 * trial support and is labelled "context" in its own column note.
 *
 * Reset restores `landmarkDefaults(trainingLevel)`, whose level multipliers are
 * our heuristic (the module says so, and so does the copy beside the button).
 * It is destructive — it discards every row the user tuned — so it confirms.
 */
import { RotateCcw } from 'lucide-react';
import { useHealth } from '../../data/store';
import type { Muscle, VolumeLandmark } from '../../data/types';
import { MUSCLES, landmarkDefaults } from '../../engine/exerciseDb';
import { VOLUME_ADVISORY_NOTE } from '../../engine/strength';
import { Button, toast } from '../../ui';
import { NumberField, Note, SubHeading } from './fields';
import { useConfirm } from './useConfirm';
import { landmarksMatch, muscleLabel } from './util';

const MAX_SETS = 40;

type Key = keyof VolumeLandmark;

const COLUMNS: Array<{ key: Key; head: string; full: string }> = [
  { key: 'mev', head: 'MEV', full: 'minimum effective volume' },
  { key: 'mav', head: 'MAV', full: 'maximum adaptive volume' },
  { key: 'mrv', head: 'MRV', full: 'maximum recoverable volume' },
];

export default function LandmarkTable() {
  const { state, actions } = useHealth();
  const confirm = useConfirm();
  const training = state.settings.training;
  const level = state.settings.profile.trainingLevel;
  const landmarks = training.volumeLandmarks;
  const levelDefaults = landmarkDefaults(level);
  const isDefault = landmarksMatch(landmarks, levelDefaults);

  const setCell = (muscle: Muscle, key: Key, value: number) => {
    const row = { ...landmarks[muscle], [key]: value };
    actions.updateTraining({ volumeLandmarks: { ...landmarks, [muscle]: row } });
  };

  const reset = async () => {
    const ok = await confirm({
      title: 'Reset every volume landmark?',
      body: `Replaces all 45 numbers with the ${level} table. Any row you tuned is lost — there is no undo. Nothing else changes: landmarks are advisory either way.`,
      confirmLabel: 'Reset landmarks',
      danger: true,
    });
    if (!ok) return;
    actions.updateTraining({ volumeLandmarks: levelDefaults });
    toast('Volume landmarks reset');
  };

  return (
    <>
      <SubHeading
        action={
          <Button variant="ghost" size="sm" icon={<RotateCcw aria-hidden />} onClick={reset} disabled={isDefault}>
            Reset
          </Button>
        }
      >
        Weekly volume landmarks
      </SubHeading>

      <Note>{VOLUME_ADVISORY_NOTE}</Note>

      <div role="table" aria-label="Weekly set landmarks per muscle" className="text-[12px]">
        <div role="row" className="grid grid-cols-[minmax(0,1fr)_54px_54px_54px] gap-1 items-end pb-1">
          <span role="columnheader" className="hx-label">
            Muscle
          </span>
          {COLUMNS.map((c) => (
            <span key={c.key} role="columnheader" className="hx-label text-center" title={c.full}>
              {c.head}
            </span>
          ))}
        </div>
        {MUSCLES.map((m) => {
          const row = landmarks[m];
          return (
            <div role="row" key={m} className="grid grid-cols-[minmax(0,1fr)_54px_54px_54px] gap-1 items-start py-1 border-t border-hx-border/60">
              <span role="rowheader" className="text-[13px] leading-[44px] text-hx-text truncate">
                {muscleLabel(m)}
              </span>
              {COLUMNS.map((c) => (
                <span role="cell" key={c.key}>
                  <NumberField
                    label={`${muscleLabel(m)} ${c.head} — ${c.full}, sets per week`}
                    hideLabel
                    value={row[c.key]}
                    min={0}
                    max={MAX_SETS}
                    step={1}
                    validate={(n) => order(c.key, n, row)}
                    onCommit={(n) => setCell(m, c.key, n)}
                  />
                </span>
              ))}
            </div>
          );
        })}
      </div>

      <Note className="text-hx-muted">
        Sets per muscle per week. MEV is where growth reliably starts, MAV the productive band, MRV context only — it is shown so the number has a name, not because crossing it means anything. Reset
        uses the {level} table; those level multipliers are our heuristic, not a measured progression.
      </Note>
    </>
  );
}

/** Keep a row readable: mev ≤ mav ≤ mrv, explained inline instead of clamped. */
function order(key: Key, n: number, row: VolumeLandmark): string | null {
  if (key === 'mev' && n > row.mav) return `MEV can’t be above MAV (${row.mav}).`;
  if (key === 'mav' && n < row.mev) return `MAV can’t be below MEV (${row.mev}).`;
  if (key === 'mav' && n > row.mrv) return `MAV can’t be above MRV (${row.mrv}).`;
  if (key === 'mrv' && n < row.mav) return `MRV can’t be below MAV (${row.mav}).`;
  return null;
}
