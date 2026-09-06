/**
 * Settings §9 — Workout imports (SPEC §5; data/workoutImport, appleStream).
 *
 * Three hidden file inputs, the same idiom as the WHOOP CSV import above: the
 * file is read in this browser, parsed by the pure `data/workoutImport`
 * functions, and handed to `actions.importWorkouts`, which owns dedupe (by
 * `externalId`, or same day + kind within 10 minutes) and never overwrites a
 * session that was typed by hand.
 *
 * Counts are reported exactly as they come back — sessions read, added, and
 * skipped as duplicates — so re-importing a bigger export of the same history
 * honestly reads "0 added, N already here" instead of claiming success. Rows
 * the parser could not read at all are counted separately and their reasons
 * listed, because a silent drop is how an import loses a year of training.
 *
 * The Apple export is the odd one: hundreds of megabytes, almost all of it
 * `<Record>` samples. It is streamed in 4 MB chunks by ./appleStream, which
 * skips everything that is not a `<Workout>` element and never builds a DOM.
 */
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Activity, FileSpreadsheet, FileUp, Watch } from 'lucide-react';
import { downloadText, exportFilename } from '../../data/export';
import { useHealth, useWorkouts } from '../../data/store';
import { parseWorkoutFile, type WorkoutParseResult } from '../../data/workoutImport';
import type { TrainingSettings, WorkoutImportResult, WorkoutSource } from '../../data/types';
import { formatDateShort } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Banner, Button, toast } from '../../ui';
import { APPLE_MAX_BYTES, scanAppleWorkouts } from './appleStream';
import { KV, Note, SubHeading } from './fields';
import { formatBytes, relativeTime } from './util';

const MAX_ERRORS_SHOWN = 5;
const MB = 1024 * 1024;

type ImportKey = 'whoop' | 'strava' | 'apple';

interface SourceSpec {
  key: ImportKey;
  label: string;
  file: string;
  accept: string;
  icon: typeof Watch;
  /** Where the file comes from, in the user's own app. */
  where: string;
  stamp: keyof NonNullable<TrainingSettings['imports']>;
}

const SOURCES: SourceSpec[] = [
  { key: 'whoop', label: 'WHOOP', file: 'workouts.csv', accept: '.csv,text/csv', icon: Watch, where: 'WHOOP app → Profile → Data export → unzip', stamp: 'whoopAt' },
  { key: 'strava', label: 'Strava', file: 'activities.csv', accept: '.csv,text/csv', icon: Activity, where: 'strava.com → Settings → My Account → Download or Delete Your Account → unzip', stamp: 'stravaAt' },
  { key: 'apple', label: 'Apple Health', file: 'export.xml', accept: '.xml,text/xml,application/xml', icon: FileUp, where: 'Health app → your photo → Export All Health Data → unzip', stamp: 'appleAt' },
];

interface Summary {
  fileName: string;
  source: WorkoutSource | null;
  parsed: WorkoutParseResult;
  result: WorkoutImportResult | null;
  /** Apple only: what the streaming scan walked through. */
  scan?: { bytesRead: number; chunks: number; recordsSkipped: number; truncated: boolean };
}

export default function ImportsSection({ now }: { now: number }) {
  const { state, actions } = useHealth();
  const workouts = useWorkouts();
  const [busy, setBusy] = useState<ImportKey | null>(null);
  const [progress, setProgress] = useState<{ read: number; total: number } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const refs = {
    whoop: useRef<HTMLInputElement>(null),
    strava: useRef<HTMLInputElement>(null),
    apple: useRef<HTMLInputElement>(null),
  };

  const imports = state.settings.training.imports ?? {};
  const bySource = useMemo(() => {
    const counts: Partial<Record<WorkoutSource, number>> = {};
    for (const w of workouts) counts[w.source] = (counts[w.source] ?? 0) + 1;
    return counts;
  }, [workouts]);
  const latest = workouts.length ? workouts[workouts.length - 1] : undefined;

  const stamp = (spec: SourceSpec) => actions.updateTraining({ imports: { ...state.settings.training.imports, [spec.stamp]: Date.now() } });

  /** Hand parsed sessions to the store and report exactly what it did. */
  const apply = (spec: SourceSpec, fileName: string, parsed: WorkoutParseResult, source: WorkoutSource | null, scan?: Summary['scan']) => {
    const result = parsed.workouts.length ? actions.importWorkouts(parsed.workouts) : null;
    setSummary({ fileName, source, parsed, result, scan });
    if (result && result.added > 0) {
      stamp(spec);
      toast(`Imported ${result.added} session${result.added === 1 ? '' : 's'}`);
    } else if (parsed.workouts.length > 0) {
      stamp(spec);
      toast('Everything in that file was already here', 'warn');
    } else {
      toast(`No sessions found in ${fileName}`, 'warn');
    }
  };

  const onFile = (spec: SourceSpec) => async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so the same file can be chosen twice
    if (!file) return;
    setBusy(spec.key);
    setSummary(null);
    setProgress(null);
    try {
      if (spec.key === 'apple') {
        const scan = await scanAppleWorkouts(file, { onProgress: (read, total) => setProgress({ read, total }) });
        const parsed: WorkoutParseResult = { workouts: scan.workouts, skipped: scan.skipped, errors: scan.errors, columnsFound: [] };
        apply(spec, file.name, parsed, 'apple', { bytesRead: scan.bytesRead, chunks: scan.chunks, recordsSkipped: scan.recordsSkipped, truncated: scan.truncated });
      } else {
        const text = await file.text();
        const parsed = parseWorkoutFile(file.name, text);
        apply(spec, file.name, parsed, parsed.source);
      }
    } catch (err) {
      setSummary({
        fileName: file.name,
        source: null,
        parsed: { workouts: [], skipped: 0, errors: [err instanceof Error ? err.message : 'Could not read the file.'], columnsFound: [] },
        result: null,
      });
      toast('Import failed', 'error');
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const exportWorkouts = () => {
    const name = exportFilename('csv', new Date(now), 'workouts');
    downloadText(name, actions.exportWorkoutsCSV(), 'text/csv');
    toast(`Exported ${name}`);
  };

  return (
    <>
      <div>
        <KV k="Sessions stored" v={workouts.length} />
        <KV
          k="Where they came from"
          v={
            workouts.length
              ? (Object.keys(bySource) as WorkoutSource[])
                  .sort()
                  .map((s) => `${bySource[s]} ${s}`)
                  .join(' · ')
              : '—'
          }
        />
        <KV k="Most recent" v={latest ? `${formatDateShort(latest.d)} · ${latest.title ?? latest.kind}` : '—'} />
      </div>

      <Note>
        Files are parsed in this browser and never uploaded. Each session keeps the id its source gave it, so importing a longer export later adds only what is new — the rest is recognised and skipped.
        A session you typed yourself always wins over an imported one on the same day.
      </Note>

      {SOURCES.map((spec) => {
        const Icon = spec.icon;
        const at = imports[spec.stamp];
        return (
          <div key={spec.key}>
            <SubHeading action={<span className="text-[12px] text-hx-muted">{at ? relativeTime(at, now) : 'never'}</span>}>{spec.label}</SubHeading>
            <Note className="text-hx-muted mb-2">
              {spec.where} → <span className="text-hx-text">{spec.file}</span>
              {spec.key === 'apple'
                ? `. Read in 4 MB chunks; the heart-rate samples are skipped, not parsed. Over ${Math.round(APPLE_MAX_BYTES / MB)} MB only the last ${Math.round(
                    APPLE_MAX_BYTES / MB,
                  )} MB are read — that is where Apple writes the workouts — and the result says so.`
                : '.'}
            </Note>
            <input ref={refs[spec.key]} type="file" accept={spec.accept} className="sr-only" tabIndex={-1} aria-hidden onChange={onFile(spec)} />
            <Button variant="secondary" fullWidth icon={<Icon aria-hidden />} loading={busy === spec.key} disabled={busy !== null && busy !== spec.key} onClick={() => refs[spec.key].current?.click()}>
              Choose {spec.file}
            </Button>
            {busy === spec.key && progress && (
              <p role="status" className="mt-1.5 text-[12px] leading-4 text-hx-muted">
                Read {formatBytes(progress.read)} of {formatBytes(progress.total)}…
              </p>
            )}
          </div>
        );
      })}

      {summary && <ImportSummaryCard summary={summary} onDismiss={() => setSummary(null)} />}

      <SubHeading>Export</SubHeading>
      <Button variant="secondary" fullWidth icon={<FileSpreadsheet aria-hidden />} disabled={!workouts.length} onClick={exportWorkouts}>
        Export workouts CSV
      </Button>
      <Note className="text-hx-muted">
        One row per session — date, kind, duration, session RPE, load, distance and heart rate. Sets are summarised, not itemised; the JSON export under Data is the one that round-trips every set.
      </Note>
    </>
  );
}

// ---------------------------------------------------------------------------

function ImportSummaryCard({ summary, onDismiss }: { summary: Summary; onDismiss: () => void }) {
  const { fileName, parsed, result, source, scan } = summary;
  const read = parsed.workouts.length;
  const added = result?.added ?? 0;
  const skipped = result?.skipped ?? 0;
  const errors = [...parsed.errors, ...(result?.errors ?? [])];
  const kind = read === 0 ? 'error' : added === 0 || parsed.skipped > 0 || errors.length > 0 ? 'warn' : 'success';

  return (
    <Banner kind={kind} onDismiss={onDismiss}>
      <p className="font-semibold truncate">
        {fileName}
        {source ? ` · ${source}` : ''}
      </p>
      <p className="text-hx-text2">
        {read} session{read === 1 ? '' : 's'} read · {added} added · {skipped} already here
        {parsed.skipped > 0 ? ` · ${parsed.skipped} unreadable` : ''}
      </p>
      {scan && (
        <p className="mt-1 text-hx-muted">
          Scanned {scan.truncated ? 'the last ' : ''}
          {formatBytes(scan.bytesRead)} in {scan.chunks} chunk{scan.chunks === 1 ? '' : 's'}; {fmt(scan.recordsSkipped)} record sample{scan.recordsSkipped === 1 ? '' : 's'} skipped.
        </p>
      )}
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
