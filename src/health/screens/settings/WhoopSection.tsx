/**
 * Settings §6 — WHOOP connection (SPEC §5 "WHOOP connection").
 *
 * WHOOP's API is OAuth 2 and needs a server to hold a client secret; this app
 * is local-only (no backend), so "connection" means one of two honest paths:
 *   1. CSV import — the `physiological_cycles.csv` from WHOOP's data export,
 *      parsed by data/whoopImport.parseWhoopCsv, overlaid with
 *      mergeWhoopRecords (only WHOOP-owned fields are written; meals, weight
 *      and tobacco are untouched) and applied with actions.patchDay per day.
 *   2. Manual entry — the morning numbers (recovery, HRV, RHR, strain, sleep,
 *      need, debt, bedtime, wake) for today or any chosen date.
 * Either marks `settings.whoop.connected` so the readiness ring uses recovery %.
 */
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { FileUp, Save } from 'lucide-react';
import { useHealth, useRecords } from '../../data/store';
import type { DailyRecord, HHMM, ISODate } from '../../data/types';
import { mergeWhoopRecords, parseWhoopCsv, WHOOP_FIELDS, type WhoopParseResult } from '../../data/whoopImport';
import { formatDateShort } from '../../lib/dates';
import { Banner, Button, toast } from '../../ui';
import { DateField, KV, Note, NumberField, Pill, SubHeading, TimeField } from './fields';
import { relativeTime } from './util';

const MAX_ERRORS_SHOWN = 5;

interface ImportSummary {
  parsed: WhoopParseResult;
  updated: number;
  created: number;
  fileName: string;
}

/** Only the numeric WHOOP fields are draft-able; bt/wk are strings. */
type NumericWhoopField = 'rec' | 'hrv' | 'rhr' | 'strn' | 'slh' | 'sln' | 'dbt';
interface ManualDraft {
  rec?: number;
  hrv?: number;
  rhr?: number;
  strn?: number;
  slh?: number;
  sln?: number;
  dbt?: number;
  bt?: HHMM;
  wk?: HHMM;
}

function draftFromRecord(r: DailyRecord | undefined): ManualDraft {
  if (!r) return {};
  return { rec: r.rec, hrv: r.hrv, rhr: r.rhr, strn: r.strn, slh: r.slh, sln: r.sln, dbt: r.dbt, bt: r.bt, wk: r.wk };
}

const NUMERIC: Array<{ key: NumericWhoopField; label: string; unit: string; min: number; max: number; step?: number; dp?: number }> = [
  { key: 'rec', label: 'Recovery', unit: '%', min: 0, max: 100 },
  { key: 'hrv', label: 'HRV (rMSSD)', unit: 'ms', min: 1, max: 300 },
  { key: 'rhr', label: 'Resting HR', unit: 'bpm', min: 25, max: 150 },
  { key: 'strn', label: 'Day strain', unit: '/21', min: 0, max: 21, step: 0.1, dp: 1 },
  { key: 'slh', label: 'Sleep', unit: 'h', min: 0, max: 16, step: 0.25, dp: 2 },
  { key: 'sln', label: 'Sleep need', unit: 'h', min: 0, max: 16, step: 0.25, dp: 2 },
  { key: 'dbt', label: 'Sleep debt', unit: 'min', min: 0, max: 900, step: 5 },
];

export default function WhoopSection({ today, now }: { today: ISODate; now: number }) {
  const { state, actions } = useHealth();
  const records = useRecords();
  const whoop = state.settings.whoop;
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const whoopDays = useMemo(() => records.filter((r) => r.rec !== undefined || r.hrv !== undefined || r.strn !== undefined).length, [records]);
  const latest = useMemo(() => [...records].reverse().find((r) => r.rec !== undefined || r.hrv !== undefined), [records]);

  const statusLabel = whoop.connected ? (whoop.source === 'csv' ? 'Connected · CSV import' : 'Connected · manual entry') : 'Not connected';

  // --- CSV import -----------------------------------------------------------
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-importing the same file
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = parseWhoopCsv(text);
      const { merged, updated, created } = mergeWhoopRecords(state.days, parsed.records);
      for (const rec of merged) {
        const patch: Partial<DailyRecord> = {};
        for (const f of WHOOP_FIELDS) if (rec[f] !== undefined) Object.assign(patch, { [f]: rec[f] });
        actions.patchDay(rec.d, patch);
      }
      if (parsed.records.length > 0) {
        actions.setSettings((s) => ({ ...s, whoop: { ...s.whoop, connected: true, source: 'csv', lastImportAt: Date.now() } }));
        toast(`Imported ${parsed.records.length} WHOOP day${parsed.records.length === 1 ? '' : 's'}`);
      } else {
        toast('No WHOOP rows could be imported', 'warn');
      }
      setSummary({ parsed, updated, created, fileName: file.name });
    } catch (err) {
      setSummary({ parsed: { records: [], skipped: 0, errors: [err instanceof Error ? err.message : 'Could not read the file.'], columnsFound: [] }, updated: 0, created: 0, fileName: file.name });
      toast('Import failed', 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Pill tone={whoop.connected ? 'green' : 'neutral'}>{statusLabel}</Pill>
        <span className="text-[12px] text-hx-muted">{whoop.lastImportAt ? `Last import ${relativeTime(whoop.lastImportAt, now)}` : ''}</span>
      </div>
      <div>
        <KV k="Days with WHOOP data" v={whoopDays} />
        <KV k="Latest" v={latest ? `${formatDateShort(latest.d)} · ${latest.rec !== undefined ? `${latest.rec}% recovery` : `${latest.hrv} ms HRV`}` : '—'} />
        <KV k="Readiness source" v={whoop.connected && state.settings.profile.wearable === 'whoop' ? 'WHOOP recovery %' : 'HRV band (no recovery %)'} />
      </div>

      <Note>
        WHOOP’s API uses OAuth, which needs a server to keep a client secret — this app runs entirely in your browser with no backend, so there is no “Connect WHOOP” button. Import the CSV from
        WHOOP’s data export or type the morning numbers in; the readiness ring, sleep need and HRV baseline work the same either way.
      </Note>

      <SubHeading>Import CSV</SubHeading>
      <Note>
        In the WHOOP app: Profile → Data export → request → unzip → <span className="text-hx-text">physiological_cycles.csv</span>. Only recovery, HRV, RHR, strain, sleep, need, debt, bedtime and wake are
        written; meals, weight and tobacco on those days stay as they are.
      </Note>
      <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-hidden onChange={onFile} />
      <Button variant="secondary" fullWidth icon={<FileUp aria-hidden />} loading={importing} onClick={() => fileRef.current?.click()}>
        Choose physiological_cycles.csv
      </Button>
      {summary && <ImportResultCard summary={summary} onDismiss={() => setSummary(null)} />}

      <ManualEntry today={today} />
    </>
  );
}

function ImportResultCard({ summary, onDismiss }: { summary: ImportSummary; onDismiss: () => void }) {
  const { parsed, updated, created, fileName } = summary;
  const ok = parsed.records.length > 0;
  const errors = parsed.errors;
  return (
    <Banner kind={ok ? (parsed.skipped > 0 || errors.length > 0 ? 'warn' : 'success') : 'error'} onDismiss={onDismiss}>
      <p className="font-semibold truncate">{fileName}</p>
      <p className="text-hx-text2">
        {parsed.records.length} day{parsed.records.length === 1 ? '' : 's'} parsed · {updated} updated · {created} new · {parsed.skipped} skipped
      </p>
      {parsed.columnsFound.length > 0 && (
        <p className="mt-1 text-hx-text2">
          <span className="text-hx-muted">Columns found: </span>
          {parsed.columnsFound.join(', ')}
        </p>
      )}
      {errors.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-hx-text2 space-y-0.5">
          {errors.slice(0, MAX_ERRORS_SHOWN).map((e, i) => (
            <li key={i}>{e}</li>
          ))}
          {errors.length > MAX_ERRORS_SHOWN && <li>…and {errors.length - MAX_ERRORS_SHOWN} more</li>}
        </ul>
      )}
    </Banner>
  );
}

// ---------------------------------------------------------------------------
// Manual entry
// ---------------------------------------------------------------------------

function ManualEntry({ today }: { today: ISODate }) {
  const { state, actions } = useHealth();
  const [date, setDate] = useState<ISODate>(today);
  const [draft, setDraft] = useState<ManualDraft>(() => draftFromRecord(state.days[today]));
  const existing = state.days[date];

  const changeDate = (d: string | undefined) => {
    const next = d ?? today;
    setDate(next);
    setDraft(draftFromRecord(state.days[next]));
  };

  const set = <K extends keyof ManualDraft>(k: K, v: ManualDraft[K]) => setDraft((prev) => ({ ...prev, [k]: v }));

  const filled = (Object.keys(draft) as Array<keyof ManualDraft>).filter((k) => draft[k] !== undefined && draft[k] !== '');
  const dirty = filled.some((k) => existing?.[k] !== draft[k]);

  const save = () => {
    const patch: Partial<DailyRecord> = {};
    for (const k of filled) Object.assign(patch, { [k]: draft[k] });
    if (!Object.keys(patch).length) return;
    actions.patchDay(date, patch);
    actions.setSettings((s) => ({ ...s, whoop: { ...s.whoop, connected: true, source: s.whoop.source ?? 'manual' } }));
    toast(`Saved WHOOP numbers for ${formatDateShort(date)}`);
  };

  return (
    <>
      <SubHeading>Manual entry</SubHeading>
      <DateField label="Day" value={date} max={today} hint={existing && filled.length ? 'Showing what is already on file — edit and save.' : 'The waking day the numbers describe.'} onChange={changeDate} />
      <div className="grid grid-cols-2 gap-3">
        {NUMERIC.map((f) => (
          <NumberField key={f.key} label={f.label} value={draft[f.key] ?? null} min={f.min} max={f.max} step={f.step} dp={f.dp} unit={f.unit} placeholder="—" onCommit={(n) => set(f.key, n)} onClear={() => set(f.key, undefined)} />
        ))}
        <TimeField label="Bedtime" value={draft.bt ?? ''} hint="Last night; after midnight is fine." onChange={(bt) => set('bt', bt)} />
        <TimeField label="Wake" value={draft.wk ?? ''} onChange={(wk) => set('wk', wk)} />
      </div>
      <Note className="text-hx-muted">Blank fields are left unchanged on the day. Sleep debt is in minutes; sleep and need in hours.</Note>
      <Button fullWidth icon={<Save aria-hidden />} disabled={!dirty} onClick={save}>
        Save to {date === today ? 'today' : formatDateShort(date)}
      </Button>
    </>
  );
}
