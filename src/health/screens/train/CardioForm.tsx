/**
 * The short form for the three non-strength kinds — cardio, mobility and
 * sport, as one span-2 tile in the Log sub-view's bento. Deliberately not the
 * set-by-set logger: a 40-minute run and a yoga class have a duration and an
 * effort, and asking for anything more is how logging stops happening.
 *
 * Duration × session RPE is what `load.sessionLoad` turns into training load
 * for these kinds (mobility and sport at a discount), so those two fields are
 * the only ones that change a number anywhere else; distance and heart rate
 * are recorded because they are worth having, not because the model needs
 * them. Distance is stored in kilometres and shown in miles for a lb user.
 *
 * The text fields carry no surface classes of their own: `.hx input` and
 * `.hx textarea` already make every input a well at the control radius, with
 * the 16 px type that stops Mobile Safari zooming the page on focus.
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
    <div className="hx-bento">
      <section aria-label={`Log ${kindLabel(kind).toLowerCase()}`} className="hx-card hx-span-2 p-4 flex flex-col gap-5">
        <h2 className="hx-display text-[17px] leading-6 font-semibold text-hx-text">Log {kindLabel(kind).toLowerCase()}</h2>

        {kind !== 'mobility' && (
          <label className="flex flex-col gap-1.5">
            <span className="hx-label">{kind === 'sport' ? 'Sport' : 'Activity'}</span>
            <input
              type="text"
              value={cardio.sport ?? ''}
              onChange={(e) => setCardio({ sport: e.target.value })}
              placeholder={kind === 'sport' ? 'Football, padel, climbing…' : 'Run, row, cycle…'}
              className="h-11 px-3 text-hx-text placeholder:text-hx-muted"
            />
          </label>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="hx-label">Duration</span>
          <Stepper
            className="w-full"
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
            <span className="hx-label">Distance (optional)</span>
            <Stepper
              className="w-full"
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
              <span className="hx-label">Avg HR, bpm</span>
              <Stepper
                className="w-full"
                label="Average heart rate"
                value={cardio.avgHr ?? 0}
                onChange={(v) => setCardio({ avgHr: Math.round(v) })}
                step={1}
                min={0}
                max={230}
              />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <span className="hx-label">Max HR, bpm</span>
              <Stepper
                className="w-full"
                label="Maximum heart rate"
                value={cardio.maxHr ?? 0}
                onChange={(v) => setCardio({ maxHr: Math.round(v) })}
                step={1}
                min={0}
                max={230}
              />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="hx-label">Session RPE — how hard it felt, 1 (nothing) to 10 (maximal)</span>
          <div role="group" aria-label="Session RPE" className="grid grid-cols-5 gap-1.5">
            {SRPE_CHOICES.map((v) => (
              <Chip
                key={v}
                size="sm"
                color="yellow"
                active={srpe === v}
                pressed={srpe === v}
                onClick={() => onChange({ ...draft, srpe: srpe === v ? undefined : v })}
                aria-label={`Session RPE ${v}`}
                className="w-full px-0"
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
          <span className="hx-label">Note (optional)</span>
          <textarea
            value={draft.note ?? ''}
            onChange={(e) => onChange({ ...draft, note: e.target.value })}
            rows={2}
            className="px-3 py-2 text-hx-text placeholder:text-hx-muted"
            placeholder="Easy pace, felt good…"
          />
        </label>
      </section>

      <Button
        size="lg"
        fullWidth
        className="hx-span-2"
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
      <Button variant="ghost" size="sm" onClick={onDiscard} className="hx-span-2 justify-self-center">
        Discard
      </Button>
    </div>
  );
}
