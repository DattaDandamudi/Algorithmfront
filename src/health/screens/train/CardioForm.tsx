/**
 * The short form for the three non-strength kinds — cardio, mobility and
 * sport. Deliberately not the set-by-set logger: a 40-minute run and a yoga
 * class have a duration and an effort, and asking for anything more is how
 * logging stops happening.
 *
 * Duration × session RPE is what `load.sessionLoad` turns into training load
 * for these kinds (mobility and sport at a discount), so those two fields are
 * the only ones that change a number anywhere else; distance and heart rate
 * are recorded because they are worth having, not because the model needs
 * them. Distance is stored in kilometres and shown in miles for a lb user.
 */
import type { CardioDetail, WorkoutKind } from '../../data/types';
import { Button, Chip, Stepper } from '../../ui';
import { Note } from './TrainCard';
import type { WorkoutDraft } from './draft';
import {
  SRPE_CHOICES,
  distanceUnit,
  kindLabel,
  toDisplayDistance,
  toKmDistance,
  type Units,
} from './trainUtils';

export interface CardioFormProps {
  draft: WorkoutDraft;
  units: Units;
  onChange: (next: WorkoutDraft) => void;
  onSave: (done: { durationMin: number; srpe?: number; note?: string }) => void;
  onDiscard: () => void;
}

const MAX_DURATION_MIN = 480;

export default function CardioForm({ draft, units, onChange, onSave, onDiscard }: CardioFormProps) {
  const kind: WorkoutKind = draft.kind;
  const cardio = draft.cardio ?? {};
  const duration = draft.baseMinutes;
  const srpe = draft.srpe ?? null;

  const setCardio = (patch: Partial<CardioDetail>) => {
    const next: CardioDetail = { ...cardio, ...patch };
    for (const key of Object.keys(next) as Array<keyof CardioDetail>) {
      const v = next[key];
      if (v === undefined || v === null || v === '' || v === 0) delete next[key];
    }
    onChange({ ...draft, cardio: next });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="hx-card p-4 flex flex-col gap-5">
        <h2 className="text-[15px] leading-5 font-semibold text-hx-text">Log {kindLabel(kind).toLowerCase()}</h2>

        {kind !== 'mobility' && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] leading-4 text-hx-muted">{kind === 'sport' ? 'Sport' : 'Activity'}</span>
            <input
              type="text"
              value={cardio.sport ?? ''}
              onChange={(e) => setCardio({ sport: e.target.value })}
              placeholder={kind === 'sport' ? 'Football, padel, climbing…' : 'Run, row, cycle…'}
              className="h-11 rounded-xl border border-hx-border bg-hx-card2 px-3 text-[15px] leading-5 text-hx-text placeholder:text-hx-muted outline-none focus-visible:border-hx-blue"
            />
          </label>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] leading-4 text-hx-muted">Duration</span>
          <Stepper
            label="Duration in minutes"
            value={duration}
            onChange={(v) => onChange({ ...draft, baseMinutes: Math.max(0, Math.round(v)) })}
            step={5}
            min={0}
            max={MAX_DURATION_MIN}
            unit="min"
            size="lg"
          />
        </div>

        {kind === 'cardio' && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] leading-4 text-hx-muted">Distance (optional)</span>
            <Stepper
              label={`Distance in ${distanceUnit(units)}`}
              value={toDisplayDistance(cardio.distanceKm, units)}
              onChange={(v) => setCardio({ distanceKm: toKmDistance(v, units) })}
              step={0.1}
              min={0}
              dp={2}
              unit={distanceUnit(units)}
            />
          </div>
        )}

        {kind !== 'mobility' && (
          <div className="flex gap-2">
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <span className="text-[12px] leading-4 text-hx-muted">Avg HR</span>
              <Stepper
                label="Average heart rate"
                value={cardio.avgHr ?? 0}
                onChange={(v) => setCardio({ avgHr: Math.round(v) })}
                step={1}
                min={0}
                max={230}
                unit="bpm"
              />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <span className="text-[12px] leading-4 text-hx-muted">Max HR</span>
              <Stepper
                label="Maximum heart rate"
                value={cardio.maxHr ?? 0}
                onChange={(v) => setCardio({ maxHr: Math.round(v) })}
                step={1}
                min={0}
                max={230}
                unit="bpm"
              />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] leading-4 text-hx-muted">
            Session RPE — how hard it felt, 1 (nothing) to 10 (maximal)
          </span>
          <div role="group" aria-label="Session RPE" className="flex gap-1.5 overflow-x-auto hx-no-scrollbar -mx-1 px-1">
            {SRPE_CHOICES.map((v) => (
              <Chip
                key={v}
                size="sm"
                color="yellow"
                active={srpe === v}
                pressed={srpe === v}
                onClick={() => onChange({ ...draft, srpe: srpe === v ? undefined : v })}
                aria-label={`Session RPE ${v}`}
              >
                {v}
              </Chip>
            ))}
          </div>
          <Note>
            Duration × session RPE is what this becomes in your training load
            {kind === 'cardio' ? '' : ', at a discount for lower-intensity work'}.
          </Note>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] leading-4 text-hx-muted">Note (optional)</span>
          <textarea
            value={draft.note ?? ''}
            onChange={(e) => onChange({ ...draft, note: e.target.value })}
            rows={2}
            className="rounded-xl border border-hx-border bg-hx-card2 px-3 py-2 text-[14px] leading-5 text-hx-text placeholder:text-hx-muted outline-none focus-visible:border-hx-blue"
            placeholder="Easy pace, felt good…"
          />
        </label>
      </div>

      <Button
        size="lg"
        fullWidth
        disabled={duration <= 0}
        onClick={() =>
          onSave({
            durationMin: duration,
            ...(srpe !== null ? { srpe } : {}),
            ...(draft.note?.trim() ? { note: draft.note.trim() } : {}),
          })
        }
      >
        Save session
      </Button>
      <Button variant="ghost" size="sm" onClick={onDiscard} className="self-center">
        Discard
      </Button>
    </div>
  );
}
