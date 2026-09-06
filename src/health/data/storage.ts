/**
 * §10 Data durability — sharded localStorage persistence.
 *
 * Keys:
 *   hx:log:index        → ShardIndex  { version, shards: { 'YYYY-MM': { count, sum } }, updatedAt }
 *   hx:log:YYYY-MM      → Shard       { v, ym, days: { 'DD': DailyRecord } }
 *   hx:settings         → AppSettings
 *   hx:chat             → ChatMessage[]
 *   hx:corrupt:<name>   → raw text of an unreadable shard/settings/chat value, captured just
 *                         before the app overwrote or removed it (R4-5: nothing is silently lost)
 *
 * Every setItem is wrapped for QuotaExceededError. Shards are validated on load
 * against the index (count + FNV-1a checksum) and problems are reported, never
 * thrown — a corrupt shard is skipped, not fatal.
 */
import type { AppSettings, ChatMessage, DailyRecord, ISODate, IntegrityReport } from './types';
import { SCHEMA_VERSION } from './types';
import { yearMonthOf } from '../lib/dates';

export const KEYS = {
  index: 'hx:log:index',
  shard: (ym: string) => `hx:log:${ym}`,
  settings: 'hx:settings',
  chat: 'hx:chat',
  /** Raw copy of an unreadable value; `name` is 'YYYY-MM', 'settings' or 'chat'. */
  corrupt: (name: string) => `hx:corrupt:${name}`,
  prefix: 'hx:',
} as const;

/** ~5 MiB soft quota shared per origin. */
export const QUOTA_BYTES = 5 * 1024 * 1024;
export const QUOTA_WARN_RATIO = 0.7;
export const CHAT_CAP = 60;

/**
 * Actionable quota message (R4-7): the UI has "Export JSON", "Clear chat" and
 * "Clear all data" — it has no per-month delete, so don't ask for one.
 */
export const QUOTA_MESSAGE = 'Storage quota exceeded — export a JSON backup, then clear the coach history or all data to free space.';

export interface ShardIndex {
  version: number;
  shards: Record<string, { count: number; sum: number }>;
  updatedAt: number;
}

export interface Shard {
  v: number;
  ym: string;
  days: Record<string, DailyRecord>;
}

export class StorageWriteError extends Error {
  readonly quota: boolean;
  constructor(message: string, quota: boolean) {
    super(message);
    this.name = 'StorageWriteError';
    this.quota = quota;
  }
}

let lsCache: Storage | null | undefined;

/**
 * Resolve localStorage once. A SecurityError (blocked storage, some private
 * modes) means "unavailable"; a QuotaExceededError on the probe means the
 * origin is *full*, which is still "available" — safeSet reports the quota
 * error properly instead of masquerading as unavailable.
 */
function getLS(): Storage | null {
  if (lsCache !== undefined) return lsCache;
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      lsCache = null;
      return lsCache;
    }
    const ls = window.localStorage;
    try {
      const probe = '__hx_probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
    } catch (e) {
      if (!isQuotaError(e)) {
        lsCache = null;
        return lsCache;
      }
    }
    lsCache = ls;
  } catch {
    lsCache = null;
  }
  return lsCache;
}

/** Test hook: forget the cached localStorage handle. */
export function resetStorageCache(): void {
  lsCache = undefined;
}

export function storageAvailable(): boolean {
  return getLS() !== null;
}

export function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { name?: string; code?: number };
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  );
}

/** FNV-1a 32-bit checksum over a string. Cheap, deterministic, good enough for corruption detection. */
export function checksum(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function safeSet(key: string, value: string): void {
  const ls = getLS();
  if (!ls) throw new StorageWriteError('localStorage unavailable', false);
  try {
    ls.setItem(key, value);
  } catch (e) {
    if (isQuotaError(e)) throw new StorageWriteError(QUOTA_MESSAGE, true);
    throw new StorageWriteError(e instanceof Error ? e.message : 'Write failed', false);
  }
}

function safeGet(key: string): string | null {
  const ls = getLS();
  if (!ls) return null;
  try {
    return ls.getItem(key);
  } catch {
    return null;
  }
}

function safeRemove(key: string): void {
  const ls = getLS();
  if (!ls) return;
  try {
    ls.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** All keys currently in storage that belong to this app. */
function appKeys(): string[] {
  const ls = getLS();
  if (!ls) return [];
  const keys: string[] = [];
  try {
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith(KEYS.prefix)) keys.push(k);
    }
  } catch {
    /* ignore */
  }
  return keys;
}

/** Bytes used by this app's keys (UTF-16 → ×2). */
export function estimateBytesUsed(): number {
  const ls = getLS();
  if (!ls) return 0;
  let total = 0;
  try {
    for (const k of appKeys()) total += (k.length + (ls.getItem(k) ?? '').length) * 2;
  } catch {
    /* ignore */
  }
  return total;
}

/**
 * R4-5: before a stored value is overwritten or removed, keep it under
 * hx:corrupt:<name> if it is unreadable — the app can't load it, but the user
 * (or a future migration) may still salvage it via devtools. Best-effort: if the
 * copy itself fails (quota), the main write goes ahead and reports its own error.
 */
function preserveIfCorrupt(key: string, name: string, readable: (raw: string) => boolean): void {
  const raw = safeGet(key);
  if (!raw || readable(raw)) return;
  try {
    safeSet(KEYS.corrupt(name), raw);
  } catch {
    /* best-effort */
  }
}

function parsesToObject(raw: string): boolean {
  try {
    const p = JSON.parse(raw);
    return !!p && typeof p === 'object';
  } catch {
    return false;
  }
}

function parsesToArray(raw: string): boolean {
  try {
    return Array.isArray(JSON.parse(raw));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Index & shards
// ---------------------------------------------------------------------------

export function readIndex(): ShardIndex | null {
  const raw = safeGet(KEYS.index);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ShardIndex;
    if (!parsed || typeof parsed !== 'object' || !parsed.shards || typeof parsed.shards !== 'object' || Array.isArray(parsed.shards)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeIndex(index: ShardIndex): void {
  safeSet(KEYS.index, JSON.stringify(index));
}

/**
 * Drop index entries whose shard is absent from storage (R4-5). Returns the
 * same object when nothing needs pruning so callers can compare identity.
 */
export function pruneIndex(index: ShardIndex): ShardIndex {
  const present = new Set(discoverShardMonths());
  const stale = Object.keys(index.shards).filter((ym) => !present.has(ym));
  if (!stale.length) return index;
  const shards = { ...index.shards };
  for (const ym of stale) delete shards[ym];
  return { ...index, shards };
}

export function serializeShard(ym: string, records: DailyRecord[]): { json: string; count: number; sum: number } {
  const days: Record<string, DailyRecord> = {};
  for (const r of records) {
    if (yearMonthOf(r.d) !== ym) continue;
    days[r.d.slice(8, 10)] = r;
  }
  const shard: Shard = { v: SCHEMA_VERSION, ym, days };
  const json = JSON.stringify(shard);
  return { json, count: Object.keys(days).length, sum: checksum(json) };
}

/** Write one month shard and update the index entry. Throws StorageWriteError on failure. */
export function writeShard(ym: string, records: DailyRecord[], index: ShardIndex): ShardIndex {
  const { json, count, sum } = serializeShard(ym, records);
  const next: ShardIndex = { ...index, version: SCHEMA_VERSION, shards: { ...index.shards }, updatedAt: Date.now() };
  preserveIfCorrupt(KEYS.shard(ym), ym, (raw) => readShardRaw(ym, raw).shard !== null);
  if (count === 0) {
    safeRemove(KEYS.shard(ym));
    delete next.shards[ym];
  } else {
    safeSet(KEYS.shard(ym), json);
    next.shards[ym] = { count, sum };
  }
  writeIndex(next);
  return next;
}

function readShardRaw(ym: string, raw: string): { shard: Shard | null; raw: string; error?: string } {
  try {
    const parsed = JSON.parse(raw) as Shard;
    if (!parsed || typeof parsed !== 'object' || !parsed.days || typeof parsed.days !== 'object') {
      return { shard: null, raw, error: `Shard ${ym} has an unexpected shape` };
    }
    return { shard: parsed, raw };
  } catch (e) {
    return { shard: null, raw, error: `Shard ${ym} is not valid JSON (${e instanceof Error ? e.message : 'parse error'})` };
  }
}

export function readShard(ym: string): { shard: Shard | null; raw: string | null; error?: string } {
  const raw = safeGet(KEYS.shard(ym));
  if (!raw) return { shard: null, raw: null };
  return readShardRaw(ym, raw);
}

/** 'hx:log:YYYY-MM' → 'YYYY-MM'; null for any other key (incl. the index). */
export function shardMonthFromKey(key: string): string | null {
  const m = /^hx:log:(\d{4}-\d{2})$/.exec(key);
  return m ? m[1] : null;
}

/** Discover shard keys present in storage (in case the index is missing/stale). */
export function discoverShardMonths(): string[] {
  const months: string[] = [];
  for (const k of appKeys()) {
    const ym = shardMonthFromKey(k);
    if (ym) months.push(ym);
  }
  return months.sort();
}

export function readSettings(): AppSettings | null {
  const raw = safeGet(KEYS.settings);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as AppSettings) : null;
  } catch {
    return null;
  }
}

export function readChat(): ChatMessage[] {
  const raw = safeGet(KEYS.chat);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export interface LoadResult {
  days: Record<ISODate, DailyRecord>;
  settings: AppSettings | null;
  chat: ChatMessage[];
  integrity: IntegrityReport;
  bytesUsed: number;
  available: boolean;
  /**
   * The index as storage actually is: one entry per *readable* shard (count +
   * checksum recomputed), no entries for missing or unreadable shards (R4-5).
   * Use this — not the stored index — as the baseline for the next write.
   */
  index: ShardIndex;
  /** Months whose shard exists but cannot be parsed; a save of that month moves the raw text to hx:corrupt:YYYY-MM. */
  corruptMonths: string[];
}

/** Load everything and validate shards against the index. Never throws. */
export function loadAll(): LoadResult {
  const available = storageAvailable();
  const problems: string[] = [];
  const days: Record<ISODate, DailyRecord> = {};
  const corruptMonths: string[] = [];
  let records = 0;

  const index = readIndex();
  const rebuilt: ShardIndex = { version: index?.version ?? SCHEMA_VERSION, shards: {}, updatedAt: index?.updatedAt ?? 0 };
  const indexed = index ? Object.keys(index.shards) : [];
  const discovered = discoverShardMonths();
  const months = Array.from(new Set([...indexed, ...discovered])).sort();

  if (available && !index && discovered.length) problems.push('Shard index missing — rebuilt from stored months.');

  for (const ym of months) {
    try {
      loadShardInto(ym);
    } catch (e) {
      problems.push(`Shard ${ym} could not be read (${e instanceof Error ? e.message : 'error'}).`);
    }
  }

  function loadShardInto(ym: string): void {
    const { shard, raw, error } = readShard(ym);
    const entry = index?.shards[ym];
    if (!raw) {
      if (entry) problems.push(`Shard ${ym} listed in index (${entry.count} days) but missing from storage — the entry is dropped on the next save.`);
      return;
    }
    if (!entry) problems.push(`Shard ${ym} present in storage but not in index.`);
    if (error || !shard) {
      corruptMonths.push(ym);
      problems.push(`${error ?? `Shard ${ym} unreadable`}. Its raw text is kept under ${KEYS.corrupt(ym)} on the next save.`);
      return;
    }
    if (entry && entry.sum !== checksum(raw)) problems.push(`Shard ${ym} does not match its index entry (an interrupted save or an edit outside the app). Data was loaded; the index is rebuilt on the next save.`);
    const keys = Object.keys(shard.days);
    if (entry && entry.count !== keys.length) problems.push(`Shard ${ym} has ${keys.length} days, index expected ${entry.count}.`);
    rebuilt.shards[ym] = { count: keys.length, sum: checksum(raw) };
    for (const dd of keys) {
      const rec = shard.days[dd];
      if (!rec || typeof rec !== 'object' || typeof rec.d !== 'string') {
        problems.push(`Shard ${ym}: day ${dd} is malformed and was skipped.`);
        continue;
      }
      if (!rec.d.startsWith(ym)) {
        problems.push(`Shard ${ym}: record ${rec.d} stored in the wrong month.`);
      }
      days[rec.d] = rec;
      records++;
    }
  }

  let settings: AppSettings | null = null;
  const rawSettings = safeGet(KEYS.settings);
  if (rawSettings) {
    settings = readSettings();
    if (!settings) problems.push('Settings were corrupt and reset to defaults.');
  }

  let chat: ChatMessage[] = [];
  const rawChat = safeGet(KEYS.chat);
  if (rawChat) {
    if (parsesToArray(rawChat)) chat = readChat();
    else if (!parsesToObject(rawChat)) problems.push('Coach history was corrupt and cleared.');
  }

  return {
    days,
    settings,
    chat,
    integrity: { version: index?.version ?? SCHEMA_VERSION, shards: months.length, records, problems, checkedAt: Date.now() },
    bytesUsed: estimateBytesUsed(),
    available,
    index: rebuilt,
    corruptMonths,
  };
}

/** Re-validate stored shards against the index without mutating anything. */
export function checkIntegrity(): IntegrityReport {
  return loadAll().integrity;
}

export function writeSettings(settings: AppSettings): void {
  preserveIfCorrupt(KEYS.settings, 'settings', parsesToObject);
  safeSet(KEYS.settings, JSON.stringify(settings));
}

export function writeChat(chat: ChatMessage[]): void {
  preserveIfCorrupt(KEYS.chat, 'chat', parsesToArray);
  safeSet(KEYS.chat, JSON.stringify(chat.slice(-CHAT_CAP)));
}

export function clearAllStorage(): void {
  const ls = getLS();
  if (!ls) return;
  try {
    appKeys().forEach((k) => ls.removeItem(k));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Debounced writer
// ---------------------------------------------------------------------------

export interface DebouncedWriter {
  /** Schedule a write. */
  schedule(): void;
  /** Run pending write now (if any). A failed write stays pending. */
  flush(): void;
  /** Drop the pending write, stop timers/retries and detach any listeners this writer attached. */
  cancel(): void;
  pending(): boolean;
}

export interface DebouncedWriterOptions {
  /**
   * Attach the flush-on-hide listeners (visibilitychange hidden, pagehide,
   * beforeunload) to this writer. Default true so the writer works standalone;
   * the store provider passes false and manages them in a React effect so a
   * StrictMode remount re-attaches them (R4-4).
   */
  listeners?: boolean;
}

/** Retry schedule after a failed write (R4-7). After the last one the write stays pending until flush()/schedule(). */
export const RETRY_DELAYS_MS = [2000, 5000, 15000] as const;

/**
 * Flush pending writes when the page is hidden or about to unload (SPEC §10).
 * Returns the detach function. Safe to call outside a browser (no-op).
 */
export function attachFlushListeners(fire: () => void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  const onHide = () => {
    if (document.visibilityState === 'hidden') fire();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', fire);
  window.addEventListener('beforeunload', fire);
  return () => {
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', fire);
    window.removeEventListener('beforeunload', fire);
  };
}

/**
 * Debounce with maxWait: coalesces bursts of edits into one write ~500 ms after
 * the last change, but never waits more than `maxWait` since the first pending
 * change. Optionally flushes on visibilitychange (hidden) and pagehide/beforeunload.
 *
 * `run` may return `false` (or throw) to signal a failed write: the write then
 * stays pending and is retried with back-off (RETRY_DELAYS_MS); flush() and any
 * later schedule() also retry it. A new schedule() during a retry runs within
 * `wait` — the user's edit (e.g. clearing chat) may be what frees the space.
 */
export function createDebouncedWriter(run: () => void | boolean, wait = 500, maxWait = 2000, opts: DebouncedWriterOptions = {}): DebouncedWriter {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstPendingAt: number | null = null;
  let isPending = false;
  let failures = 0;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const fire = () => {
    clearTimer();
    firstPendingAt = null;
    if (!isPending) return;
    let ok: boolean;
    try {
      ok = run() !== false;
    } catch {
      ok = false;
    }
    if (ok) {
      isPending = false;
      failures = 0;
      return;
    }
    // Failed: keep pending so flush()/schedule() retry, and back off automatically.
    if (failures < RETRY_DELAYS_MS.length) {
      timer = setTimeout(fire, RETRY_DELAYS_MS[failures]);
    }
    failures++;
  };

  const schedule = () => {
    isPending = true;
    const now = Date.now();
    if (firstPendingAt === null) firstPendingAt = now;
    clearTimer();
    const remainingMax = Math.max(0, firstPendingAt + maxWait - now);
    timer = setTimeout(fire, Math.min(wait, remainingMax));
  };

  const detach = opts.listeners === false ? () => {} : attachFlushListeners(fire);

  return {
    schedule,
    flush: fire,
    cancel: () => {
      clearTimer();
      isPending = false;
      firstPendingAt = null;
      failures = 0;
      detach();
    },
    pending: () => isPending,
  };
}
