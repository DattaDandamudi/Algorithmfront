/**
 * Settings §4 — Bloodwork summary (SPEC §6.7, display-only).
 *
 * Rows show label · value+unit · status pill (low/high/elevated red,
 * low-normal yellow, normal green). Expanding a row edits value / unit /
 * status / tested-on / retest dates and shows the engine's per-marker
 * guidance (`micronutrients.markerGuidance`): general ranges + habits with
 * the doctor cue, or — for elevated lead — an escalation card that says
 * "Needs physician follow-up" and never a self-care tip. Retest reminders
 * come from `micronutrients.retestReminders` (planned retest date, else
 * tested-on + 90 days for low/elevated markers).
 *
 * The app never interprets a lab as disease; every number rendered here is
 * the user's own marker value.
 */
import { useMemo, useState } from 'react';
import { ChevronDown, Plus, Stethoscope, Trash2 } from 'lucide-react';
import { useHealth } from '../../data/store';
import type { BloodMarker, ISODate, MarkerStatus } from '../../data/types';
import { markerGuidance, retestReminders, type RetestReminder } from '../../engine/micronutrients';
import { formatDateShort } from '../../lib/dates';
import { Banner, Button, toast } from '../../ui';
import { useConfirm } from './useConfirm';
import { DateField, Note, NumberField, Pill, SelectField, SubHeading, TextField } from './fields';
import { MARKER_STATUS_OPTIONS, dueReminders, markerTone, markerValueText, slugKey } from './util';

export const GENERAL_RANGES_SENTENCE = 'General ranges for information only — confirm dosing and any changes with your doctor.';

function reminderText(r: RetestReminder): string {
  if (r.dueInDays === null || !r.suggestedRetest) return '';
  const when = formatDateShort(r.suggestedRetest);
  if (r.dueInDays < 0) return `${r.marker.label} retest overdue by ${Math.abs(r.dueInDays)} day${Math.abs(r.dueInDays) === 1 ? '' : 's'} (${when})`;
  if (r.dueInDays === 0) return `${r.marker.label} retest due today`;
  return `${r.marker.label} retest in ${r.dueInDays} day${r.dueInDays === 1 ? '' : 's'} (${when})`;
}

export default function BloodworkSection({ today }: { today: ISODate }) {
  const { state, actions } = useHealth();
  const confirm = useConfirm();
  const markers = state.settings.profile.bloodwork;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const reminders = useMemo(() => retestReminders(markers, today), [markers, today]);
  const due = useMemo(() => dueReminders(reminders), [reminders]);
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

  return (
    <>
      {due.length > 0 && (
        <Banner kind={due.some((r) => r.overdue) ? 'warn' : 'info'}>
          <span className="font-semibold">Retest reminders</span>
          <ul className="mt-1 space-y-0.5">
            {due.map((r) => (
              <li key={r.marker.key} className={r.overdue ? 'text-hx-red' : undefined}>
                {reminderText(r)}
              </li>
            ))}
          </ul>
        </Banner>
      )}

      {markers.length === 0 ? (
        <Note>No markers on file. Add the results you want the coach to keep in mind — it will only ever describe them, never diagnose.</Note>
      ) : (
        <ul className="divide-y divide-hx-border/60 -mx-1">
          {markers.map((m) => (
            <MarkerRow key={m.key} marker={m} open={openKey === m.key} reminder={reminderFor(m.key)} today={today} onToggle={() => setOpenKey((k) => (k === m.key ? null : m.key))} onChange={(patch) => update(m.key, patch)} onRemove={() => remove(m)} />
          ))}
        </ul>
      )}

      {adding ? (
        <AddMarkerForm today={today} onAdd={add} onCancel={() => setAdding(false)} />
      ) : (
        <Button variant="secondary" fullWidth icon={<Plus aria-hidden />} onClick={() => setAdding(true)}>
          Add a marker
        </Button>
      )}

      <Note className="text-hx-muted">{GENERAL_RANGES_SENTENCE}</Note>
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

  return (
    <li>
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={onToggle} className="w-full min-h-[52px] flex items-center gap-3 px-1 py-2 text-left hover:bg-hx-card2/60 rounded-xl transition-colors">
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-medium text-hx-text truncate">{m.label}</span>
          <span className="block text-[12px] leading-4 text-hx-muted">
            {m.testedOn ? `Tested ${formatDateShort(m.testedOn)}` : 'Test date not set'}
            {reminder?.overdue ? ' · retest overdue' : ''}
          </span>
        </span>
        <span className="text-[15px] font-semibold text-hx-text whitespace-nowrap">{markerValueText(m)}</span>
        <Pill tone={tone}>{statusLabel}</Pill>
        <ChevronDown className={`w-4 h-4 shrink-0 text-hx-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div id={panelId} className="px-1 pb-4 pt-1 space-y-4">
          <TextField label="Label" value={m.label} maxLength={40} onChange={(label) => onChange({ label })} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Value" value={Number.isFinite(m.value) && !(m.value === 0 && !m.unit) ? m.value : null} min={0} max={100000} dp={2} step={m.unit === '%' ? 0.1 : 1} placeholder="—" onCommit={(value) => onChange({ value })} onClear={() => onChange({ value: 0 })} />
            <TextField label="Unit" value={m.unit} maxLength={12} placeholder="ng/mL" onChange={(unit) => onChange({ unit })} />
          </div>
          <SelectField<MarkerStatus> label="Status (from your lab report)" value={m.status} options={MARKER_STATUS_OPTIONS} onChange={(status) => onChange({ status })} />
          <div className="grid grid-cols-2 gap-3">
            <DateField label="Tested on" value={m.testedOn} max={today} onChange={(testedOn) => onChange({ testedOn })} />
            <DateField label="Retest on" value={m.retestOn} hint={!m.retestOn && reminder?.suggestedRetest ? `Suggested ${formatDateShort(reminder.suggestedRetest)}` : undefined} onChange={(retestOn) => onChange({ retestOn })} />
          </div>
          <TextField label="Your note" value={m.note ?? ''} multiline rows={2} maxLength={280} placeholder="What your doctor said, dose agreed, next steps…" onChange={(note) => onChange({ note: note || undefined })} />

          {guidance.escalate ? (
            <Banner kind="error">
              <span className="flex items-center gap-2 font-semibold">
                <Stethoscope className="w-4 h-4" aria-hidden /> {guidance.headline}
              </span>
              <p className="mt-1 text-hx-text2">{guidance.generalInfo}</p>
              {guidance.habits.length > 0 && (
                <>
                  <p className="mt-2 font-medium">To raise with your doctor</p>
                  <ul className="mt-0.5 list-disc pl-4 space-y-0.5 text-hx-text2">
                    {guidance.habits.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </>
              )}
            </Banner>
          ) : (
            <div className="rounded-xl border border-hx-border bg-hx-card2/60 px-3 py-3 space-y-2">
              <p className="text-[13px] font-semibold text-hx-text">{guidance.headline}</p>
              <p className="text-[13px] leading-5 text-hx-text2">{guidance.generalInfo}</p>
              {guidance.habits.length > 0 && (
                <ul className="list-disc pl-4 space-y-1 text-[13px] leading-5 text-hx-text2">
                  {guidance.habits.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="danger" size="sm" icon={<Trash2 aria-hidden />} onClick={onRemove}>
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
    <div className="rounded-xl border border-hx-border bg-hx-card2/40 px-3 py-3 space-y-3">
      <SubHeading>New marker</SubHeading>
      <TextField label="Label" value={draft.label} maxLength={40} placeholder="e.g. HbA1c" onChange={(label) => setDraft((d) => ({ ...d, label }))} />
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Value" value={draft.value} min={0} max={100000} dp={2} placeholder="—" onCommit={(value) => setDraft((d) => ({ ...d, value }))} onClear={() => setDraft((d) => ({ ...d, value: null }))} />
        <TextField label="Unit" value={draft.unit} maxLength={12} placeholder="%" onChange={(unit) => setDraft((d) => ({ ...d, unit }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField<MarkerStatus> label="Status" value={draft.status} options={MARKER_STATUS_OPTIONS} onChange={(status) => setDraft((d) => ({ ...d, status }))} />
        <DateField label="Tested on" value={draft.testedOn} max={today} onChange={(testedOn) => setDraft((d) => ({ ...d, testedOn }))} />
      </div>
      <div className="flex gap-2">
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
