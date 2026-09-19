/**
 * Settings §4 — Bloodwork summary (SPEC §6.7, display-only).
 *
 * A ledger of markers: the label, the status as a word with its tone square
 * (low/high/elevated red, low-normal amber, normal green), the test date, and
 * the value flush right as a table figure with its unit. Opening a row edits
 * value / unit / status / tested-on / retest dates and shows the engine's
 * per-marker guidance (`micronutrients.markerGuidance`): general ranges and
 * habits with the doctor cue as a read-only inset, or, for elevated lead, an
 * escalation note that says "Needs physician follow-up" and never a self-care
 * tip. Retest reminders come from `micronutrients.retestReminders` (planned
 * retest date, else tested-on + 90 days for low/elevated markers). The app
 * never invents a lab date: a flagged marker with no test date gets an
 * explicit "add your test date to schedule a retest" line in the same note, so
 * the reminder is visible on a fresh install (review R2-5;
 * `util.bloodworkAttention`).
 *
 * The app never interprets a lab as disease; every number rendered here is
 * the user's own marker value.
 */
import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useHealth } from '../../data/store';
import type { BloodMarker, ISODate, MarkerStatus } from '../../data/types';
import { markerGuidance, retestReminders, type RetestReminder } from '../../engine/micronutrients';
import { formatDateShort } from '../../lib/dates';
import { Banner, Button, toast } from '../../ui';
import { useConfirm } from './useConfirm';
import { DateField, Inset, Note, NumberField, SelectField, StateWord, SubHeading, TextField } from './fields';
import { MARKER_STATUS_OPTIONS, bloodworkAttention, markerTone, markerValueText, slugKey } from './util';

export const GENERAL_RANGES_SENTENCE = 'General ranges for information only — confirm dosing and any changes with your doctor.';

function reminderText(r: RetestReminder): string {
  if (r.dueInDays === null || !r.suggestedRetest) return '';
  const when = formatDateShort(r.suggestedRetest);
  if (r.dueInDays < 0) return `${r.marker.label} retest overdue by ${Math.abs(r.dueInDays)} day${Math.abs(r.dueInDays) === 1 ? '' : 's'} (${when})`;
  if (r.dueInDays === 0) return `${r.marker.label} retest due today`;
  return `${r.marker.label} retest in ${r.dueInDays} day${r.dueInDays === 1 ? '' : 's'} (${when})`;
}

/** "19 ng/mL" splits into the figure and its unit so the unit never shares the numeral's face. */
function valueParts(m: BloodMarker): { figure: string; unit: string } {
  const text = markerValueText(m);
  const match = /^([\d.,]+)\s*(.*)$/.exec(text);
  return match ? { figure: match[1], unit: match[2] } : { figure: text, unit: '' };
}

export default function BloodworkSection({ today }: { today: ISODate }) {
  const { state, actions } = useHealth();
  const confirm = useConfirm();
  const markers = state.settings.profile.bloodwork;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const reminders = useMemo(() => retestReminders(markers, today), [markers, today]);
  const { due, undated } = useMemo(() => bloodworkAttention(markers, today), [markers, today]);
  const reminderFor = (key: string) => reminders.find((r) => r.marker.key === key) ?? null;

  const save = (next: BloodMarker[]) => actions.updateProfile({ bloodwork: next });
  const update = (key: string, patch: Partial<BloodMarker>) => save(markers.map((m) => (m.key === key ? { ...m, ...patch } : m)));

  const remove = async (m: BloodMarker) => {
    const ok = await confirm({
      title: `Remove ${m.label}?`,
      body: 'The marker, its dates and note are deleted from your profile. Retest reminders and lab-linked insights for it stop.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    save(markers.filter((x) => x.key !== m.key));
    if (openKey === m.key) setOpenKey(null);
    toast(`Removed ${m.label}`);
  };

  const add = (draft: NewMarker) => {
    const key = slugKey(draft.label, markers.map((m) => m.key));
    save([...markers, { key, label: draft.label.trim(), value: draft.value ?? 0, unit: draft.unit.trim(), status: draft.status, testedOn: draft.testedOn }]);
    setAdding(false);
    setOpenKey(key);
    toast(`Added ${draft.label.trim()}`);
  };

  const dueText = due.map(reminderText).filter(Boolean).join('; ');

  return (
    <>
      {(due.length > 0 || undated.length > 0) && (
        <Banner kind={due.some((r) => r.overdue) ? 'warn' : 'info'}>
          {dueText && <span>{dueText}. </span>}
          {undated.length > 0 && (
            <button type="button" onClick={() => setOpenKey(undated[0].key)} className="min-h-11 -my-2 py-2 text-left underline decoration-1 underline-offset-[3px] hover:text-hx-text">
              {undated.map((m) => m.label).join(', ')}: add your test date to schedule a retest (about 90 days for low or elevated markers).
            </button>
          )}
        </Banner>
      )}

      {markers.length === 0 ? (
        <Note>No markers on file. Add the results you want the coach to keep in mind; it will only ever describe them, never diagnose.</Note>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col">
          {markers.map((m) => (
            <MarkerRow key={m.key} marker={m} open={openKey === m.key} reminder={reminderFor(m.key)} today={today} onToggle={() => setOpenKey((k) => (k === m.key ? null : m.key))} onChange={(patch) => update(m.key, patch)} onRemove={() => remove(m)} />
          ))}
        </ul>
      )}

      {adding ? (
        <AddMarkerForm today={today} onAdd={add} onCancel={() => setAdding(false)} />
      ) : (
        <Button variant="secondary" fullWidth onClick={() => setAdding(true)}>
          Add a marker
        </Button>
      )}

      <Note>{GENERAL_RANGES_SENTENCE}</Note>
    </>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

interface MarkerRowProps {
  marker: BloodMarker;
  open: boolean;
  reminder: RetestReminder | null;
  today: ISODate;
  onToggle: () => void;
  onChange: (patch: Partial<BloodMarker>) => void;
  onRemove: () => void;
}

function MarkerRow({ marker: m, open, reminder, today, onToggle, onChange, onRemove }: MarkerRowProps) {
  const tone = markerTone(m.status);
  const statusLabel = MARKER_STATUS_OPTIONS.find((o) => o.value === m.status)?.label ?? m.status;
  const panelId = `hx-marker-${m.key}`;
  const guidance = markerGuidance(m);
  const { figure, unit } = valueParts(m);

  return (
    <li className="border-t border-hx-border first:border-t-0">
      {/* aria-controls only while the panel exists: no dangling ARIA reference when collapsed (review R6-10). */}
      <button type="button" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={onToggle} className="hx-row hx-press flex-row items-center gap-4">
        <span className="flex-1 min-w-0">
          <span className="hx-body block truncate">{m.label}</span>
          <span className="hx-cap block">
            <StateWord tone={tone}>{statusLabel}</StateWord>
            {'  '}
            {m.testedOn ? `Tested ${formatDateShort(m.testedOn)}` : 'Test date not set'}
            {reminder?.overdue ? ', retest overdue' : ''}
          </span>
        </span>
        <span className={`hx-fig-sm whitespace-nowrap ${figure === '—' ? 'text-hx-text2' : 'text-hx-text'}`}>
          {figure}
          {unit && <span className="hx-unit">{unit}</span>}
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-hx-text2 ${open ? 'rotate-180' : ''}`} strokeWidth={1.5} aria-hidden />
      </button>

      {open && (
        <div id={panelId} className="pt-2 pb-8 flex flex-col gap-6">
          <TextField label="Label" value={m.label} maxLength={40} onChange={(label) => onChange({ label })} />
          <div className="grid grid-cols-2 gap-x-6 gap-y-6">
            <NumberField label="Value" value={Number.isFinite(m.value) && !(m.value === 0 && !m.unit) ? m.value : null} min={0} max={100000} dp={2} step={m.unit === '%' ? 0.1 : 1} placeholder="Not set" onCommit={(value) => onChange({ value })} onClear={() => onChange({ value: 0 })} />
            <TextField label="Unit" value={m.unit} maxLength={12} placeholder="ng/mL" onChange={(unit) => onChange({ unit })} />
          </div>
          <SelectField<MarkerStatus> label="Status (from your lab report)" value={m.status} options={MARKER_STATUS_OPTIONS} onChange={(status) => onChange({ status })} />
          <div className="grid grid-cols-2 gap-x-6 gap-y-6">
            <DateField label="Tested on" value={m.testedOn} max={today} onChange={(testedOn) => onChange({ testedOn })} />
            <DateField label="Retest on" value={m.retestOn} hint={!m.retestOn && reminder?.suggestedRetest ? `Suggested ${formatDateShort(reminder.suggestedRetest)}` : undefined} onChange={(retestOn) => onChange({ retestOn })} />
          </div>
          <TextField label="Your note" value={m.note ?? ''} multiline rows={2} maxLength={280} placeholder="What your doctor said, dose agreed, next steps" onChange={(note) => onChange({ note: note || undefined })} />

          {guidance.escalate ? (
            <Banner kind="error" lead={guidance.headline}>
              {guidance.generalInfo}
              {guidance.habits.length > 0 && ` To raise with your doctor: ${guidance.habits.join('; ')}.`}
            </Banner>
          ) : (
            <Inset>
              <p className="hx-label text-hx-text">{guidance.headline}</p>
              <p className="hx-body text-hx-text2">{guidance.generalInfo}</p>
              {guidance.habits.length > 0 && (
                <ul className="m-0 pl-4 list-disc hx-body text-hx-text2 flex flex-col gap-1">
                  {guidance.habits.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              )}
            </Inset>
          )}

          <div className="flex justify-end">
            <Button variant="danger" size="sm" onClick={onRemove}>
              Remove marker
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Add form
// ---------------------------------------------------------------------------

interface NewMarker {
  label: string;
  value: number | null;
  unit: string;
  status: MarkerStatus;
  testedOn?: ISODate;
}

function AddMarkerForm({ today, onAdd, onCancel }: { today: ISODate; onAdd: (m: NewMarker) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<NewMarker>({ label: '', value: null, unit: '', status: 'normal', testedOn: today });
  const canAdd = draft.label.trim().length > 0;
  return (
    <div className="flex flex-col gap-6">
      <SubHeading title="New marker" first />
      <TextField label="Label" value={draft.label} maxLength={40} placeholder="HbA1c" onChange={(label) => setDraft((d) => ({ ...d, label }))} />
      <div className="grid grid-cols-2 gap-x-6 gap-y-6">
        <NumberField label="Value" value={draft.value} min={0} max={100000} dp={2} placeholder="Not set" onCommit={(value) => setDraft((d) => ({ ...d, value }))} onClear={() => setDraft((d) => ({ ...d, value: null }))} />
        <TextField label="Unit" value={draft.unit} maxLength={12} placeholder="%" onChange={(unit) => setDraft((d) => ({ ...d, unit }))} />
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-6">
        <SelectField<MarkerStatus> label="Status" value={draft.status} options={MARKER_STATUS_OPTIONS} onChange={(status) => setDraft((d) => ({ ...d, status }))} />
        <DateField label="Tested on" value={draft.testedOn} max={today} onChange={(testedOn) => setDraft((d) => ({ ...d, testedOn }))} />
      </div>
      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={onCancel}>
          Cancel
        </Button>
        <Button fullWidth disabled={!canAdd} onClick={() => onAdd(draft)}>
          Add marker
        </Button>
      </div>
    </div>
  );
}
