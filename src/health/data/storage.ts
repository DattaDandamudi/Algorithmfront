/**
 * §10 Data durability — sharded localStorage persistence.
 *
 * Keys:
 *   hx:log:index      → ShardIndex  { version, shards: { 'YYYY-MM': { count, sum } }, updatedAt }
 *   hx:log:YYYY-MM    → Shard       { v, ym, days: { 'DD': DailyRecord } }
 *   hx:settings       → AppSettings
 *   hx:chat           → ChatMessage[]
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
  prefix: 'hx:',
} as const;

/** ~5 MiB soft quota shared per origin. */
export const QUOTA_BYTES = 5 * 1024 * 1024;
export const QUOTA_WARN_RATIO = 0.7;
export const CHAT_CAP = 60;

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

function getLS(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = '__hx_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
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
    if (isQuotaError(e)) throw new StorageWriteError('Storage quota exceeded — export your data and clear old months.', true);
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

/** Bytes used by this app's keys (UTF-16 → ×2). */
export function estimateBytesUsed(): number {
  const ls = getLS();
  if (!ls) return 0;
  let total = 0;
  try {
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (!k || !k.startsWith(KEYS.prefix)) continue;
      const v = ls.getItem(k) ?? '';
      total += (k.length + v.length) * 2;
    }
  } catch {
    /* ignore */
  }
  return total;
}

// ---------------------------------------------------------------------------
// Index & shards
// ---------------------------------------------------------------------------

export function readIndex(): ShardIndex | null {
  const raw = safeGet(KEYS.index);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ShardIndex;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.shards !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeIndex(index: ShardIndex): void {
  safeSet(KEYS.index, JSON.stringify(index));
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

export function readShard(ym: string): { shard: Shard | null; raw: string | null; error?: string } {
  const raw = safeGet(KEYS.shard(ym));
  if (!raw) return { shard: null, raw: null };
  try {
    const parsed = JSON.parse(raw) as Shard;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.days !== 'object') {
      return { shard: null, raw, error: `Shard ${ym} has an unexpected shape` };
    }
    return { shard: parsed, raw };
  } catch (e) {
    return { shard: null, raw, error: `Shard ${ym} is not valid JSON (${e instanceof Error ? e.message : 'parse error'})` };
  }
}

/** Discover shard keys present in storage (in case the index is missing/stale). */
export function discoverShardMonths(): string[] {
  const ls = getLS();
  if (!ls) return [];
  const months: string[] = [];
  try {
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith('hx:log:') && k !== KEYS.index) months.push(k.slice('hx:log:'.length));
    }
  } catch {
    /* ignore */
  }
  return months.sort();
}

export interface LoadResult {
  days: Record<ISODate, DailyRecord>;
  settings: AppSettings | null;
  chat: ChatMessage[];
  integrity: IntegrityReport;
  bytesUsed: number;
  available: boolean;
}

/** Load everything and validate shards against the index. Never throws. */
export function loadAll(): LoadResult {
  const available = storageAvailable();
  const problems: string[] = [];
  const days: Record<ISODate, DailyRecord> = {};
  let records = 0;

  const index = readIndex();
  const indexed = index ? Object.keys(index.shards) : [];
  const discovered = discoverShardMonths();
  const months = Array.from(new Set([...indexed, ...discovered])).sort();

  if (available && !index && discovered.length) problems.push('Shard index missing — rebuilt from stored months.');

  for (const ym of months) {
    const { shard, raw, error } = readShard(ym);
    const entry = index?.shards[ym];
    if (!raw) {
      if (entry) problems.push(`Shard ${ym} listed in index (${entry.count} days) but missing from storage.`);
      continue;
    }
    if (!entry) problems.push(`Shard ${ym} present in storage but not in index.`);
    if (error || !shard) {
      problems.push(error ?? `Shard ${ym} unreadable.`);
      continue;
    }
    if (entry && entry.sum !== checksum(raw)) problems.push(`Shard ${ym} checksum mismatch — contents changed outside the app or were truncated.`);
    const keys = Object.keys(shard.days);
    if (entry && entry.count !== keys.length) problems.push(`Shard ${ym} has ${keys.length} days, index expected ${entry.count}.`);
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
    try {
      settings = JSON.parse(rawSettings) as AppSettings;
    } catch {
      problems.push('Settings were corrupt and reset to defaults.');
    }
  }

  let chat: ChatMessage[] = [];
  const rawChat = safeGet(KEYS.chat);
  if (rawChat) {
    try {
      const parsed = JSON.parse(rawChat);
      if (Array.isArray(parsed)) chat = parsed as ChatMessage[];
    } catch {
      problems.push('Coach history was corrupt and cleared.');
    }
  }

  return {
    days,
    settings,
    chat,
    integrity: { version: index?.version ?? SCHEMA_VERSION, shards: months.length, records, problems, checkedAt: Date.now() },
    bytesUsed: estimateBytesUsed(),
    available,
  };
}

/** Re-validate stored shards against the index without mutating anything. */
export function checkIntegrity(): IntegrityReport {
  return loadAll().integrity;
}

export function writeSettings(settings: AppSettings): void {
  safeSet(KEYS.settings, JSON.stringify(settings));
}

export function writeChat(chat: ChatMessage[]): void {
  safeSet(KEYS.chat, JSON.stringify(chat.slice(-CHAT_CAP)));
}

export function clearAllStorage(): void {
  const ls = getLS();
  if (!ls) return;
  const keys: string[] = [];
  try {
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith(KEYS.prefix)) keys.push(k);
    }
    keys.forEach((k) => ls.removeItem(k));
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
  /** Run pending write now (if any). */
  flush(): void;
  cancel(): void;
  pending(): boolean;
}

/**
 * Debounce with maxWait: coalesces bursts of edits into one write ~500 ms after
 * the last change, but never waits more than `maxWait` since the first pending
 * change. Also flushes on visibilitychange (hidden) and pagehide/beforeunload.
 */
export function createDebouncedWriter(run: () => void, wait = 500, maxWait = 2000): DebouncedWriter {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstPendingAt: number | null = null;
  let isPending = false;

  const fire = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    firstPendingAt = null;
    if (!isPending) return;
    isPending = false;
    run();
  };

  const schedule = () => {
    isPending = true;
    const now = Date.now();
    if (firstPendingAt === null) firstPendingAt = now;
    if (timer) clearTimeout(timer);
    const remainingMax = Math.max(0, firstPendingAt + maxWait - now);
    timer = setTimeout(fire, Math.min(wait, remainingMax));
  };

  const onHide = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') fire();
  };
  if (typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', fire);
    window.addEventListener('beforeunload', fire);
  }

  return {
    schedule,
    flush: fire,
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      isPending = false;
      firstPendingAt = null;
      if (typeof window !== 'undefined') {
        document.removeEventListener('visibilitychange', onHide);
        window.removeEventListener('pagehide', fire);
        window.removeEventListener('beforeunload', fire);
      }
    },
    pending: () => isPending,
  };
}
