/**
 * Chunked reader for the Apple Health `export.xml` (Settings §9 Imports).
 *
 * Apple's export is one XML file of hundreds of megabytes, of which >99.9 % is
 * `<Record …/>` samples (every heart-rate reading ever taken) and a few hundred
 * `<Workout>` elements. `file.text()` on that file would materialise the whole
 * string, and a DOM parse would allocate a node per sample, so this reads the
 * file in `APPLE_CHUNK_BYTES` slices, scans each slice for complete `<Workout>`
 * elements, throws every byte between them away, and hands only those elements
 * to the tested parser in `data/workoutImport.parseAppleWorkouts`.
 *
 * Memory is therefore one chunk plus, at most, one open workout element —
 * never the file. Between chunks the scan yields to the event loop with a
 * macrotask so the Settings screen keeps painting and the button stays
 * cancellable by navigating away.
 *
 * Bytes are decoded with a streaming TextDecoder: a slice boundary can land in
 * the middle of a multi-byte character (an accented workout name), and decoding
 * each slice independently would turn that character into U+FFFD.
 *
 * The 200 MB cap bounds work, not the file: a bigger export is scanned from its
 * LAST 200 MB rather than its first. Apple writes `<Workout>` elements after
 * the sample data, so the first 200 MB of a 600 MB export contains none of them
 * and would report a confident zero; the tail contains all of them unless the
 * user has ~200 000 sessions. When that happens the result says so — the window
 * it read is reported, never hidden behind a count.
 */
import { parseAppleWorkouts, type WorkoutParseResult } from '../../data/workoutImport';
import type { Workout } from '../../data/types';
import { formatBytes } from './util';

/** Largest export this browser-side reader will accept. */
export const APPLE_MAX_BYTES = 200 * 1024 * 1024;
/** Slice size; big enough that a 200 MB file is ~50 reads, small enough to stay responsive. */
export const APPLE_CHUNK_BYTES = 4 * 1024 * 1024;
/** A `<Workout>` element is a few KB. Past this we assume the close tag is missing and resync. */
const MAX_ELEMENT_CHARS = 1024 * 1024;
/** Kept at the end of a chunk so a `<Workout` split across the boundary is still found. */
const TAG_TAIL = 16;
const MAX_ERRORS = 20;
const CLOSE = '</Workout>';

/** The slice of `File` this scanner needs — so tests can hand it a stub. */
export interface ChunkedSource {
  size: number;
  slice(start: number, end: number): { arrayBuffer(): Promise<ArrayBuffer> };
}

export interface AppleScanResult extends WorkoutParseResult {
  /** Bytes actually read — the whole file, or the last `maxBytes` of it. */
  bytesRead: number;
  chunks: number;
  /** `<Record` samples walked past and never parsed — the bulk of the file. */
  recordsSkipped: number;
  /** True when the file was over the cap and only its tail was scanned. */
  truncated: boolean;
  /** Byte offset the scan started at (0 unless truncated). */
  scannedFrom: number;
}

export interface AppleScanOptions {
  chunkBytes?: number;
  maxBytes?: number;
  onProgress?: (bytesRead: number, total: number) => void;
  /** Injectable for tests; defaults to a macrotask so the UI can paint. */
  yieldBetweenChunks?: () => Promise<void>;
}

const macrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const RECORD_TAG = '<Record';

/**
 * Occurrences of `<Record` in a span. Counted over the raw decoded chunks (with
 * a 6-character carry between them) rather than over what the element scan
 * discards, so the number is the same whatever the chunk size.
 */
function countRecords(s: string): number {
  let n = 0;
  for (let i = s.indexOf(RECORD_TAG); i >= 0; i = s.indexOf(RECORD_TAG, i + RECORD_TAG.length)) n++;
  return n;
}

interface Drained {
  /** Complete `<Workout …/>` or `<Workout …>…</Workout>` element texts. */
  elements: string[];
  /** What must be carried into the next chunk (an open element, or a tag tail). */
  rest: string;
  problems: string[];
}

/**
 * Pull every complete workout element out of `buffer`, discarding everything
 * between them. `final` drops the look-ahead tail (nothing more is coming).
 *
 * Exported for its own test: this, not the regex in `workoutImport`, is what
 * decides whether an element split across a 4 MB boundary survives.
 */
export function drainWorkoutElements(buffer: string, final = false): Drained {
  const elements: string[] = [];
  const problems: string[] = [];
  let i = 0;

  for (;;) {
    // `<Workout` also prefixes `<WorkoutStatistics` / `<WorkoutEvent`, which are
    // children; require a tag boundary so only the element itself starts a scan.
    let start = buffer.indexOf('<Workout', i);
    while (start >= 0 && start + 8 < buffer.length && !/[\s/>]/.test(buffer[start + 8])) start = buffer.indexOf('<Workout', start + 8);

    if (start < 0) {
      const keepFrom = final ? buffer.length : Math.max(i, buffer.length - TAG_TAIL);
      return { elements, rest: buffer.slice(keepFrom), problems };
    }

    const gt = buffer.indexOf('>', start);
    if (gt < 0) {
      // Head tag straddles the boundary — carry it whole.
      if (final) problems.push('The file ended inside a workout element.');
      return { elements, rest: final ? '' : buffer.slice(start), problems };
    }
    if (buffer[gt - 1] === '/') {
      elements.push(buffer.slice(start, gt + 1));
      i = gt + 1;
      continue;
    }
    const close = buffer.indexOf(CLOSE, gt);
    if (close < 0) {
      if (buffer.length - start > MAX_ELEMENT_CHARS || final) {
        problems.push(`A workout element had no closing tag and was skipped.`);
        i = gt + 1;
        continue;
      }
      return { elements, rest: buffer.slice(start), problems };
    }
    elements.push(buffer.slice(start, close + CLOSE.length));
    i = close + CLOSE.length;
  }
}

/**
 * Read `file` in chunks and return the workouts it holds. Never allocates the
 * whole file, never builds a DOM, and never parses a `<Record>`.
 */
export async function scanAppleWorkouts(file: ChunkedSource, opts: AppleScanOptions = {}): Promise<AppleScanResult> {
  const maxBytes = opts.maxBytes ?? APPLE_MAX_BYTES;
  const chunkBytes = Math.max(1, opts.chunkBytes ?? APPLE_CHUNK_BYTES);
  const yieldNow = opts.yieldBetweenChunks ?? macrotask;

  const workouts: Workout[] = [];
  const errors: string[] = [];
  let skipped = 0;
  let recordsSkipped = 0;
  let chunks = 0;

  const addErrors = (xs: string[]) => {
    for (const e of xs) if (errors.length < MAX_ERRORS) errors.push(e);
  };

  // Over the cap: read the tail, where the workouts are, and say so.
  const truncated = file.size > maxBytes;
  const scannedFrom = truncated ? file.size - maxBytes : 0;
  if (truncated) {
    errors.push(
      `That export is ${formatBytes(file.size)}, so only its last ${formatBytes(maxBytes)} were read. Apple writes workouts after the sample data, so they are normally all inside that ` +
        `window — but a session older than it would not be found.`,
    );
  }

  let bytesRead = scannedFrom;
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  // Six characters of the previous chunk, so a `<Record` split across the
  // boundary is counted once and never twice.
  let recordCarry = '';

  const take = (final: boolean) => {
    const { elements, rest, problems } = drainWorkoutElements(buffer, final);
    buffer = rest;
    addErrors(problems);
    skipped += problems.length;
    if (elements.length) {
      const parsed = parseAppleWorkouts(elements.join('\n'));
      workouts.push(...parsed.workouts);
      skipped += parsed.skipped;
      addErrors(parsed.errors);
    }
  };

  while (bytesRead < file.size) {
    const end = Math.min(bytesRead + chunkBytes, file.size);
    const buf = await file.slice(bytesRead, end).arrayBuffer();
    bytesRead = end;
    chunks++;
    const last = bytesRead >= file.size;
    const text = decoder.decode(new Uint8Array(buf), { stream: !last });
    recordsSkipped += countRecords(recordCarry + text);
    recordCarry = (recordCarry + text).slice(-(RECORD_TAG.length - 1));
    buffer += text;
    take(last);
    opts.onProgress?.(bytesRead - scannedFrom, file.size - scannedFrom);
    if (!last) await yieldNow();
  }
  if (buffer) take(true);

  return { workouts, skipped, errors, columnsFound: [], bytesRead: bytesRead - scannedFrom, chunks, recordsSkipped, truncated, scannedFrom };
}
