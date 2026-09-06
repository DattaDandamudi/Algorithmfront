/**
 * Settings §8 — Data (SPEC §10 durability, Part D).
 *
 * - Storage usage bar against the ~5 MiB per-origin localStorage quota
 *   (warns at 70 %, matching storage.QUOTA_WARN_RATIO), last saved, last
 *   write error.
 * - Export: JSON is the full-fidelity primary format (also stamps
 *   settings.lastExportAt); CSV is the flattened secondary format.
 * - Import JSON with merge / replace; both confirm (replace is destructive).
 * - Integrity check re-validates every shard against the index (count +
 *   checksum) and lists problems.
 * - Demo data (once), Clear all data (typed double-confirm).
 * - Backup reminder when the last JSON export is older than 14 days —
 *   localStorage is not guaranteed durable.
 */
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Database, FileJson, FileSpreadsheet, FileUp, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { downloadText, exportFilename, parseImport } from '../../data/export';
import { QUOTA_BYTES } from '../../data/storage';
import { useHealth, useRecords } from '../../data/store';
import type { ImportResult, IntegrityReport } from '../../data/types';
import { yearMonthOf } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Banner, Button, SegmentedControl, toast, type Tone } from '../../ui';
import { useConfirm } from './useConfirm';
import { Field, KV, Note, SubHeading } from './fields';
import { EXPORT_REMINDER_DAYS, daysSince, formatBytes, relativeTime } from './util';

type ImportMode = 'merge' | 'replace';
const MODE_OPTIONS: Array<{ value: ImportMode; label: string }> = [
  { value: 'merge', label: 'Merge' },
  { value: 'replace', label: 'Replace' },
];
const CLEAR_WORD = 'DELETE';

/** Bar colour: green under 50 %, yellow to the 70 % warn ratio, red above. */
function usageTone(ratio: number): Tone {
  if (ratio >= 0.7) return 'red';
  if (ratio >= 0.5) return 'yellow';
  return 'green';
}

export default function DataSection({ now }: { now: number }) {
  const { state, actions } = useHealth();
  const records = useRecords();
  const confirm = useConfirm();
  const storage = state.storage;
  const settings = state.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [report, setReport] = useState<IntegrityReport | null>(storage.integrity);

  const months = useMemo(() => new Set(records.map((r) => yearMonthOf(r.d))).size, [records]);
  const ratio = Math.min(1, storage.bytesUsed / QUOTA_BYTES);
  const tone = usageTone(ratio);
  const sinceExport = daysSince(settings.lastExportAt, now);
  const needsBackup = records.length > 0 && (sinceExport === null || sinceExport >= EXPORT_REMINDER_DAYS);

  // --- Export ----------------------------------------------------------------
  const exportJSON = () => {
    const name = exportFilename('json');
    downloadText(name, actions.exportJSON(), 'application/json');
    toast(`Exported ${name}`);
  };
  const exportCSV = () => {
    const name = exportFilename('csv');
    downloadText(name, actions.exportCSV(), 'text/csv');
    toast(`Exported ${name}`);
  };

  // --- Import ----------------------------------------------------------------
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast('Could not read the file', 'error');
      return;
    }
    const preview = parseImport(text);
    if (!preview.ok) {
      setImportResult({ ok: false, recordsImported: 0, settingsImported: false, chatImported: false, errors: preview.errors });
      toast('Nothing importable in that file', 'error');
      return;
    }
    const what = [
      `${preview.days.length} day record${preview.days.length === 1 ? '' : 's'}`,
      preview.settings ? 'settings' : null,
      preview.chat ? `${preview.chat.length} chat messages` : null,
    ]
      .filter(Boolean)
      .join(', ');
    const ok = await confirm({
      title: mode === 'replace' ? 'Replace everything with this file?' : 'Merge this file into your data?',
      body:
        mode === 'replace'
          ? `${file.name} holds ${what}. Replace deletes all ${records.length} days currently stored, then loads the file. ${
              preview.settings ? 'Settings come from the file' : 'Settings return to defaults'
            }; the coach chat is ${preview.chat ? 'replaced by the file’s' : 'cleared'}. Your API key stays in this browser. Export a backup first if you are unsure.`
          : `${file.name} holds ${what}. Merge keeps your data: days in the file overwrite the same days here${
              preview.settings ? ', the file’s settings replace yours (your API key stays)' : ''
            }${preview.chat?.length ? ', and chat messages you don’t already have are added' : ''}.`,
      confirmLabel: mode === 'replace' ? 'Replace all' : 'Merge',
      danger: mode === 'replace',
      secondary: { label: 'Export JSON first', onClick: exportJSON },
    });
    if (!ok) return;
    const result = actions.importJSON(text, mode);
    setImportResult(result);
    if (result.ok) toast(`Imported ${result.recordsImported} day${result.recordsImported === 1 ? '' : 's'}${result.settingsImported ? ' + settings' : ''}`);
    else toast('Import failed', 'error');
  };

  // --- Integrity / demo / clear ------------------------------------------------
  const runIntegrity = () => {
    const r = actions.checkIntegrity();
    setReport(r);
    if (r.problems.length) toast(`${r.problems.length} problem${r.problems.length === 1 ? '' : 's'} found`, 'warn');
    else toast('Storage looks consistent');
  };

  const loadDemo = async () => {
    const ok = await confirm({
      title: 'Load 45 days of demo data?',
      body: 'Adds a deterministic demo history (weigh-ins, WHOOP mornings, meals, tobacco) onto your log. Days you already have are overwritten where the demo has values. This can only be done once.',
      confirmLabel: 'Load demo',
    });
    if (!ok) return;
    actions.loadDemoData();
    toast('Demo data loaded');
  };

  const clearAll = async () => {
    const first = await confirm({
      title: 'Clear all data?',
      body: `Deletes ${records.length} day${records.length === 1 ? '' : 's'} across ${months} month${months === 1 ? '' : 's'}, your settings, favorites, bloodwork and chat from this browser. There is no undo.`,
      confirmLabel: 'Continue',
      danger: true,
      secondary: { label: 'Export JSON first', onClick: exportJSON },
    });
    if (!first) return;
    const second = await confirm({
      title: 'Really delete everything?',
      body: `Type ${CLEAR_WORD} to confirm. The app returns to onboarding afterwards.`,
      confirmLabel: 'Delete everything',
      danger: true,
      requireText: CLEAR_WORD,
    });
    if (!second) return;
    actions.clearAllData();
    toast('All data cleared');
  };

  return (
    <>
      {!storage.available && <Banner kind="error">localStorage is unavailable in this browser — nothing you log will persist. Export regularly or switch browsers.</Banner>}
      {storage.available && storage.lastError && <Banner kind="error">{storage.lastError}</Banner>}
      {storage.available && !storage.lastError && storage.quotaWarning && (
        <Banner kind="warn" action={{ label: 'Export JSON', onClick: exportJSON }}>
          Storage is {fmt(ratio * 100)}% of the ~5 MB quota — export a JSON backup, then clear the coach history or all data to free space.
        </Banner>
      )}
      {needsBackup && (
        <Banner kind="info" action={{ label: 'Export JSON backup', onClick: exportJSON }}>
          localStorage isn’t guaranteed durable — export a JSON backup. {sinceExport === null ? 'You have never exported.' : `Last export ${sinceExport} days ago.`}
        </Banner>
      )}

      <Field label="Storage used">
        <div
          role="meter"
          aria-label="Storage used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuetext={`${formatBytes(storage.bytesUsed)} of ${formatBytes(QUOTA_BYTES)}`}
          className="h-2.5 w-full rounded-full bg-hx-card2 border border-hx-border overflow-hidden"
        >
          <div className={`h-full rounded-full ${tone === 'green' ? 'bg-hx-green' : tone === 'yellow' ? 'bg-hx-yellow' : 'bg-hx-red'}`} style={{ width: `${Math.max(1, ratio * 100)}%` }} />
        </div>
        <div className="flex justify-between text-[12px] text-hx-muted">
          <span>
            {formatBytes(storage.bytesUsed)} of {formatBytes(QUOTA_BYTES)} ({fmt(ratio * 100, ratio < 0.01 ? 1 : 0)}%)
          </span>
          <span>warns at 70%</span>
        </div>
      </Field>
      <div>
        <KV k="Records" v={`${records.length} day${records.length === 1 ? '' : 's'} · ${months} month shard${months === 1 ? '' : 's'}`} />
        <KV k="Last saved" v={relativeTime(storage.lastSavedAt, now)} />
        <KV k="Last JSON export" v={relativeTime(settings.lastExportAt, now)} />
        <KV k="Chat messages" v={state.chat.length} />
      </div>

      <SubHeading>Export</SubHeading>
      <div className="grid grid-cols-2 gap-2">
        <Button icon={<FileJson aria-hidden />} onClick={exportJSON}>
          Export JSON
        </Button>
        <Button variant="secondary" icon={<FileSpreadsheet aria-hidden />} onClick={exportCSV} disabled={!records.length}>
          Export CSV
        </Button>
      </div>
      <Note className="text-hx-muted">JSON round-trips everything (days, settings, chat) except your API key, which never leaves this browser. CSV is one flat row per day for spreadsheets — meals are summarised, not itemised.</Note>

      <SubHeading>Import JSON</SubHeading>
      <div className="flex items-center gap-3">
        <SegmentedControl<ImportMode> ariaLabel="Import mode" size="sm" options={MODE_OPTIONS} value={mode} onChange={setMode} />
        <span className="text-[12px] leading-4 text-hx-muted">{mode === 'merge' ? 'Keeps your data; file wins on overlap.' : 'Wipes days, settings and chat, then loads the file.'}</span>
      </div>
      <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-hidden onChange={onFile} />
      <Button variant="secondary" fullWidth icon={<FileUp aria-hidden />} onClick={() => fileRef.current?.click()}>
        Choose a JSON export
      </Button>
      {importResult && (
        <Banner kind={importResult.ok ? (importResult.errors.length ? 'warn' : 'success') : 'error'} onDismiss={() => setImportResult(null)}>
          {importResult.ok ? (
            <p>
              Imported {importResult.recordsImported} day{importResult.recordsImported === 1 ? '' : 's'}
              {importResult.settingsImported ? ', settings' : ''}
              {importResult.chatImported ? ', chat' : ''}.
            </p>
          ) : (
            <p className="font-semibold">Import failed</p>
          )}
          {importResult.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-hx-text2 space-y-0.5">
              {importResult.errors.slice(0, 5).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
              {importResult.errors.length > 5 && <li>…and {importResult.errors.length - 5} more</li>}
            </ul>
          )}
        </Banner>
      )}

      <SubHeading>Integrity</SubHeading>
      <Button variant="secondary" fullWidth icon={<ShieldCheck aria-hidden />} onClick={runIntegrity}>
        Run integrity check
      </Button>
      {report && (
        <div className="rounded-xl border border-hx-border bg-hx-card2/40 px-3 py-1">
          <KV k="Schema" v={`v${report.version}`} />
          <KV k="Shards" v={report.shards} />
          <KV k="Records" v={report.records} />
          <KV k="Checked" v={relativeTime(report.checkedAt, now)} />
          <KV k="Problems" v={report.problems.length === 0 ? <span className="text-hx-green">none</span> : <span className="text-hx-red">{report.problems.length}</span>} />
          {report.problems.length > 0 && (
            <ul className="py-2 list-disc pl-4 text-[13px] leading-5 text-hx-text2 space-y-0.5">
              {report.problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <Note className="text-hx-muted">Validates every month shard against the index (record count + checksum). Problems found on load are repaired on the next save: index entries for missing months are dropped, unreadable months are moved to <span className="font-mono">hx:corrupt:</span> keys, and this report refreshes.</Note>

      <SubHeading>Demo & reset</SubHeading>
      <Button variant="secondary" fullWidth icon={<Sparkles aria-hidden />} onClick={loadDemo} disabled={settings.demoLoaded}>
        {settings.demoLoaded ? 'Demo data already loaded' : 'Load 45 days of demo data'}
      </Button>
      <Button variant="danger" fullWidth icon={<Trash2 aria-hidden />} onClick={clearAll}>
        Clear all data
      </Button>
      <Note className="text-hx-muted flex items-start gap-2">
        <Database className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
        <span>
          Everything lives under this browser’s <span className="font-mono">hx:</span> localStorage keys, sharded by month. Writes are debounced (~0.5 s, 2 s max) and flushed when the tab hides.
        </span>
      </Note>
    </>
  );
}
