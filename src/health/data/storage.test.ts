import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_CAP,
  KEYS,
  StorageWriteError,
  checkIntegrity,
  checksum,
  clearAllStorage,
  createDebouncedWriter,
  discoverShardMonths,
  estimateBytesUsed,
  isQuotaError,
  loadAll,
  readIndex,
  readShard,
  resetStorageCache,
  serializeShard,
  storageAvailable,
  writeChat,
  writeIndex,
  writeSettings,
  writeShard,
  type ShardIndex,
} from './storage';
import { DEFAULT_SETTINGS } from './defaults';
import { SCHEMA_VERSION, type ChatMessage, type DailyRecord } from './types';

/** Minimal in-memory Storage. `failWith` makes setItem throw for app keys (quota simulation). */
function memoryStorage(): Storage & { failWith?: unknown } {
  const map = new Map<string, string>();
  const ls = {
    failWith: undefined as unknown,
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      // The availability probe must still succeed so the quota path (not "unavailable") is exercised.
      if (ls.failWith && k !== '__hx_probe__') throw ls.failWith;
      map.set(k, String(v));
    },
  };
  return ls as unknown as Storage & { failWith?: unknown };
}

const g = globalThis as unknown as { window?: unknown; document?: unknown };

function installWindow(ls: Storage) {
  const doc = { addEventListener: vi.fn(), removeEventListener: vi.fn(), visibilityState: 'visible' };
  g.window = { localStorage: ls, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  g.document = doc;
  return doc;
}

function uninstallWindow() {
  delete g.window;
  delete g.document;
}

const REC_SEP: DailyRecord[] = [
  { d: '2026-09-04', w: 171.9, tob: 3, hrv: 60 },
  { d: '2026-09-05', w: 171.2, tob: 0, meals: [{ id: 'm1', t: '13:00', n: 'Chicken tikka', g: 200, kc: 330, p: 50, f: 12, c: 6, fi: 1 }] },
  { d: '2026-09-06', w: 170.1 },
];
const REC_AUG: DailyRecord[] = [{ d: '2026-08-30', w: 172.4 }, { d: '2026-08-31', w: 172.0, tob: 2 }];
const EMPTY_INDEX: ShardIndex = { version: SCHEMA_VERSION, shards: {}, updatedAt: 0 };

describe('checksum', () => {
  it('is a stable 32-bit FNV-1a hash', () => {
    expect(checksum('abc')).toBe(checksum('abc'));
    expect(checksum('abc')).toBe(0x1a47e90b); // FNV-1a("abc") reference value
    expect(checksum('')).toBe(0x811c9dc5); // offset basis
    expect(checksum('abc')).not.toBe(checksum('abd'));
    expect(checksum('abc')).not.toBe(checksum('acb'));
    const h = checksum(JSON.stringify(REC_SEP));
    expect(Number.isInteger(h) && h >= 0 && h <= 0xffffffff).toBe(true);
  });
});

describe('serializeShard', () => {
  it('keeps only the month’s records, keys days by DD, and returns count + checksum of the JSON', () => {
    const { json, count, sum } = serializeShard('2026-09', [...REC_AUG, ...REC_SEP]);
    expect(count).toBe(3);
    expect(sum).toBe(checksum(json));
    const shard = JSON.parse(json);
    expect(shard.v).toBe(SCHEMA_VERSION);
    expect(shard.ym).toBe('2026-09');
    expect(Object.keys(shard.days).sort()).toEqual(['04', '05', '06']);
    expect(shard.days['05']).toEqual(REC_SEP[1]);
    expect(serializeShard('2026-07', REC_SEP).count).toBe(0);
    // Deterministic for identical input.
    expect(serializeShard('2026-09', REC_SEP).json).toBe(serializeShard('2026-09', REC_SEP).json);
  });
});

describe('isQuotaError', () => {
  it('recognises the browser quota error shapes', () => {
    expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true);
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError({ code: 1014 })).toBe(true);
    expect(isQuotaError(new Error('boom'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
    expect(isQuotaError('QuotaExceededError')).toBe(false);
  });
});

describe('createDebouncedWriter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    uninstallWindow();
    resetStorageCache();
  });

  it('coalesces a burst of schedules into one write ~500 ms after the last one', () => {
    const run = vi.fn();
    const w = createDebouncedWriter(run, 500, 2000);
    expect(w.pending()).toBe(false);
    w.schedule();
    vi.advanceTimersByTime(200);
    w.schedule();
    vi.advanceTimersByTime(200);
    w.schedule();
    expect(w.pending()).toBe(true);
    vi.advanceTimersByTime(499);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(w.pending()).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('never waits longer than maxWait (2 s) under continuous edits', () => {
    const run = vi.fn();
    const w = createDebouncedWriter(run, 500, 2000);
    for (let t = 0; t < 1900; t += 100) {
      w.schedule();
      vi.advanceTimersByTime(100);
    }
    expect(run).not.toHaveBeenCalled(); // 1.9 s of continuous edits
    w.schedule();
    vi.advanceTimersByTime(100); // t = 2.0 s since the first pending change
    expect(run).toHaveBeenCalledTimes(1);
    // A fresh burst starts a new window.
    w.schedule();
    vi.advanceTimersByTime(500);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('flush() runs the pending write immediately and is a no-op when nothing is pending', () => {
    const run = vi.fn();
    const w = createDebouncedWriter(run);
    w.flush();
    expect(run).not.toHaveBeenCalled();
    w.schedule();
    w.flush();
    expect(run).toHaveBeenCalledTimes(1);
    expect(w.pending()).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('cancel() drops the pending write', () => {
    const run = vi.fn();
    const w = createDebouncedWriter(run);
    w.schedule();
    w.cancel();
    expect(w.pending()).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(run).not.toHaveBeenCalled();
  });

  it('registers visibility/pagehide/beforeunload flush hooks in a browser and removes them on cancel', () => {
    const ls = memoryStorage();
    const doc = installWindow(ls);
    const win = g.window as { addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
    const run = vi.fn();
    const w = createDebouncedWriter(run);
    expect(doc.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(win.addEventListener).toHaveBeenCalledWith('pagehide', expect.any(Function));
    expect(win.addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    // Hidden tab → flush.
    const onHide = doc.addEventListener.mock.calls.find((c) => c[0] === 'visibilitychange')![1] as () => void;
    w.schedule();
    doc.visibilityState = 'hidden';
    onHide();
    expect(run).toHaveBeenCalledTimes(1);
    w.cancel();
    expect(doc.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(win.removeEventListener).toHaveBeenCalledWith('pagehide', expect.any(Function));
    expect(win.removeEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });
});

describe('localStorage layer', () => {
  let ls: Storage & { failWith?: unknown };
  beforeEach(() => {
    ls = memoryStorage();
    installWindow(ls);
    resetStorageCache();
  });
  afterEach(() => {
    uninstallWindow();
    resetStorageCache();
  });

  it('reports availability and is inert without a window', () => {
    expect(storageAvailable()).toBe(true);
    uninstallWindow();
    resetStorageCache(); // the handle is cached per page load; a page never loses `window` mid-session
    expect(storageAvailable()).toBe(false);
    const res = loadAll();
    expect(res.available).toBe(false);
    expect(res.days).toEqual({});
    expect(res.integrity.problems).toEqual([]);
    expect(estimateBytesUsed()).toBe(0);
    expect(() => writeShard('2026-09', REC_SEP, EMPTY_INDEX)).toThrow(StorageWriteError);
  });

  it('writes shards + index and loads them back with a clean integrity report', () => {
    let index = writeShard('2026-09', [...REC_SEP, ...REC_AUG], EMPTY_INDEX);
    index = writeShard('2026-08', [...REC_SEP, ...REC_AUG], index);
    expect(Object.keys(index.shards).sort()).toEqual(['2026-08', '2026-09']);
    expect(index.shards['2026-09'].count).toBe(3);
    expect(index.shards['2026-08'].count).toBe(2);
    expect(readIndex()).toEqual(index);
    expect(discoverShardMonths()).toEqual(['2026-08', '2026-09']);
    writeSettings(DEFAULT_SETTINGS);
    const chat: ChatMessage[] = [{ id: 'c1', role: 'user', text: 'hi', ts: 1 }];
    writeChat(chat);

    const res = loadAll();
    expect(res.available).toBe(true);
    expect(Object.keys(res.days).sort()).toEqual(['2026-08-30', '2026-08-31', '2026-09-04', '2026-09-05', '2026-09-06']);
    expect(res.days['2026-09-05']).toEqual(REC_SEP[1]);
    expect(res.settings).toEqual(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
    expect(res.chat).toEqual(chat);
    expect(res.integrity.problems).toEqual([]);
    expect(res.integrity.shards).toBe(2);
    expect(res.integrity.records).toBe(5);
    expect(res.integrity.version).toBe(SCHEMA_VERSION);
    expect(res.bytesUsed).toBeGreaterThan(0);
    expect(res.bytesUsed).toBe(estimateBytesUsed());
    expect(checkIntegrity().problems).toEqual([]);
  });

  it('removes a shard (and its index entry) when a month has no records left', () => {
    let index = writeShard('2026-09', REC_SEP, EMPTY_INDEX);
    expect(ls.getItem(KEYS.shard('2026-09'))).not.toBeNull();
    index = writeShard('2026-09', [], index);
    expect(ls.getItem(KEYS.shard('2026-09'))).toBeNull();
    expect(index.shards['2026-09']).toBeUndefined();
    expect(loadAll().integrity.problems).toEqual([]);
  });

  it('detects a checksum mismatch when a shard is edited outside the app', () => {
    writeShard('2026-09', REC_SEP, EMPTY_INDEX);
    const key = KEYS.shard('2026-09');
    ls.setItem(key, (ls.getItem(key) as string).replace('171.9', '165.0'));
    const res = loadAll();
    expect(res.integrity.problems).toHaveLength(1);
    expect(res.integrity.problems[0]).toMatch(/2026-09 does not match its index entry/);
    expect(res.days['2026-09-04'].w).toBe(165); // still loaded — problems are warnings
  });

  it('detects count mismatches between index and shard', () => {
    const index = writeShard('2026-09', REC_SEP, EMPTY_INDEX);
    writeIndex({ ...index, shards: { '2026-09': { ...index.shards['2026-09'], count: 7 } } });
    const problems = loadAll().integrity.problems;
    expect(problems.some((p) => /has 3 days, index expected 7/.test(p))).toBe(true);
  });

  it('detects a shard listed in the index but missing from storage', () => {
    writeShard('2026-09', REC_SEP, EMPTY_INDEX);
    ls.removeItem(KEYS.shard('2026-09'));
    const res = loadAll();
    expect(res.integrity.problems).toEqual([expect.stringMatching(/2026-09 listed in index \(3 days\) but missing/)]);
    expect(res.days).toEqual({});
  });

  it('detects a shard present in storage but not in the index, and a missing index', () => {
    writeShard('2026-09', REC_SEP, EMPTY_INDEX);
    ls.setItem(KEYS.shard('2026-08'), serializeShard('2026-08', REC_AUG).json);
    let problems = loadAll().integrity.problems;
    expect(problems).toEqual([expect.stringMatching(/2026-08 present in storage but not in index/)]);
    expect(Object.keys(loadAll().days)).toHaveLength(5); // orphan shard still loaded
    ls.removeItem(KEYS.index);
    problems = loadAll().integrity.problems;
    expect(problems[0]).toMatch(/index missing — rebuilt/);
    expect(problems).toHaveLength(3); // + one "not in index" per shard
  });

  it('skips corrupt JSON, wrong shapes, malformed days and flags records stored in the wrong month', () => {
    writeShard('2026-09', REC_SEP, EMPTY_INDEX);
    ls.setItem(KEYS.shard('2026-07'), '{not json');
    ls.setItem(KEYS.shard('2026-06'), JSON.stringify({ v: 1, ym: '2026-06' }));
    ls.setItem(KEYS.shard('2026-05'), JSON.stringify({ v: 1, ym: '2026-05', days: { '01': { d: '2026-05-01' }, '02': { nope: true }, '03': { d: '2026-04-03' } } }));
    const res = loadAll();
    const p = res.integrity.problems.join('\n');
    expect(p).toMatch(/2026-07 is not valid JSON/);
    expect(p).toMatch(/2026-06 has an unexpected shape/);
    expect(p).toMatch(/2026-05: day 02 is malformed/);
    expect(p).toMatch(/2026-05: record 2026-04-03 stored in the wrong month/);
    expect(res.days['2026-05-01']).toEqual({ d: '2026-05-01' });
    expect(res.days['2026-04-03']).toEqual({ d: '2026-04-03' }); // still loaded, but flagged
    expect(Object.keys(res.days)).toHaveLength(5);
    expect(readShard('2026-07').error).toMatch(/not valid JSON/);
    expect(readShard('2026-01')).toEqual({ shard: null, raw: null });
  });

  it('resets corrupt settings/chat to defaults with a problem line', () => {
    ls.setItem(KEYS.settings, '{oops');
    ls.setItem(KEYS.chat, '{"not":"array"}');
    const res = loadAll();
    expect(res.settings).toBeNull();
    expect(res.chat).toEqual([]);
    expect(res.integrity.problems).toEqual(['Settings were corrupt and reset to defaults.']);
    ls.setItem(KEYS.chat, '[broken');
    expect(loadAll().integrity.problems).toContain('Coach history was corrupt and cleared.');
  });

  it('caps persisted chat at CHAT_CAP', () => {
    const chat: ChatMessage[] = Array.from({ length: CHAT_CAP + 10 }, (_, i) => ({ id: `c${i}`, role: 'user', text: `m${i}`, ts: i }));
    writeChat(chat);
    const stored = JSON.parse(ls.getItem(KEYS.chat) as string) as ChatMessage[];
    expect(stored).toHaveLength(CHAT_CAP);
    expect(stored[0].id).toBe('c10');
  });

  it('surfaces QuotaExceededError as a StorageWriteError with quota=true', () => {
    ls.failWith = { name: 'QuotaExceededError' };
    let err: unknown;
    try {
      writeShard('2026-09', REC_SEP, EMPTY_INDEX);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(StorageWriteError);
    expect((err as StorageWriteError).quota).toBe(true);
    expect((err as StorageWriteError).message).toMatch(/quota/i);
    ls.failWith = new Error('disk on fire');
    expect(() => writeSettings(DEFAULT_SETTINGS)).toThrow(/disk on fire/);
    try {
      writeSettings(DEFAULT_SETTINGS);
    } catch (e) {
      expect((e as StorageWriteError).quota).toBe(false);
    }
  });

  it('estimates bytes for hx: keys only and clears only hx: keys', () => {
    writeShard('2026-09', REC_SEP, EMPTY_INDEX);
    ls.setItem('other-app', 'x'.repeat(1000));
    const json = ls.getItem(KEYS.shard('2026-09')) as string;
    const idx = ls.getItem(KEYS.index) as string;
    expect(estimateBytesUsed()).toBe((KEYS.shard('2026-09').length + json.length + KEYS.index.length + idx.length) * 2);
    clearAllStorage();
    expect(ls.getItem(KEYS.index)).toBeNull();
    expect(ls.getItem(KEYS.shard('2026-09'))).toBeNull();
    expect(ls.getItem('other-app')).toHaveLength(1000);
    expect(estimateBytesUsed()).toBe(0);
  });
});
