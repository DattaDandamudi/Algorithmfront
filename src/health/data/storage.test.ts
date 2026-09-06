import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_CAP,
  KEYS,
  QUOTA_MESSAGE,
  StorageWriteError,
  attachFlushListeners,
  checkIntegrity,
  checksum,
  clearAllStorage,
  createDebouncedWriter,
  discoverShardMonths,
  discoverWorkoutMonths,
  estimateBytesUsed,
  isQuotaError,
  loadAll,
  pruneIndex,
  readChat,
  readIndex,
  readSettings,
  readShard,
  readWorkoutDraft,
  resetStorageCache,
  serializeShard,
  shardMonthFromKey,
  storageAvailable,
  workoutMonthFromKey,
  writeChat,
  writeIndex,
  writeSettings,
  writeShard,
  writeWorkoutDraft,
  writeWorkoutShard,
  type ShardIndex,
} from './storage';
import { DEFAULT_SETTINGS } from './defaults';
import { SCHEMA_VERSION, type ChatMessage, type DailyRecord, type Workout } from './types';

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

describe('createDebouncedWriter — failed writes (R4-7) and listener option (R4-4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    uninstallWindow();
    resetStorageCache();
  });

  it('keeps a failed write pending and retries with back-off (2 s, 5 s, 15 s), then waits for flush()/schedule()', () => {
    let ok = false;
    const run = vi.fn(() => ok);
    const w = createDebouncedWriter(run, 500, 2000, { listeners: false });
    w.schedule();
    vi.advanceTimersByTime(500);
    expect(run).toHaveBeenCalledTimes(1);
    expect(w.pending()).toBe(true); // failed → still pending
    vi.advanceTimersByTime(1999);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(2); // +2 s
    vi.advanceTimersByTime(5000);
    expect(run).toHaveBeenCalledTimes(3); // +5 s
    vi.advanceTimersByTime(15000);
    expect(run).toHaveBeenCalledTimes(4); // +15 s
    vi.advanceTimersByTime(60_000);
    expect(run).toHaveBeenCalledTimes(4); // no further automatic retries …
    expect(w.pending()).toBe(true); // … but the write is not forgotten
    ok = true;
    w.flush(); // hide/unload/manual flush tries again
    expect(run).toHaveBeenCalledTimes(5);
    expect(w.pending()).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(run).toHaveBeenCalledTimes(5);
  });

  it('a schedule() during back-off retries within `wait`, and a throwing run counts as a failure', () => {
    let boom = true;
    const run = vi.fn(() => {
      if (boom) throw new Error('disk');
    });
    const w = createDebouncedWriter(run, 500, 2000, { listeners: false });
    w.schedule();
    vi.advanceTimersByTime(500);
    expect(run).toHaveBeenCalledTimes(1);
    expect(w.pending()).toBe(true);
    boom = false;
    w.schedule(); // e.g. the user cleared chat to free space
    vi.advanceTimersByTime(500);
    expect(run).toHaveBeenCalledTimes(2);
    expect(w.pending()).toBe(false);
    // A successful write resets the back-off: the next failure starts at 2 s again.
    boom = true;
    w.schedule();
    vi.advanceTimersByTime(500);
    expect(run).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(2000);
    expect(run).toHaveBeenCalledTimes(4);
  });

  it('cancel() drops a pending (failed) write and its retry timer', () => {
    const run = vi.fn(() => false);
    const w = createDebouncedWriter(run, 500, 2000, { listeners: false });
    w.schedule();
    vi.advanceTimersByTime(500);
    expect(w.pending()).toBe(true);
    w.cancel();
    expect(w.pending()).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('listeners: false attaches nothing; attachFlushListeners returns a working detach', () => {
    const doc = installWindow(memoryStorage());
    const win = g.window as { addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
    createDebouncedWriter(vi.fn(), 500, 2000, { listeners: false });
    expect(doc.addEventListener).not.toHaveBeenCalled();
    expect(win.addEventListener).not.toHaveBeenCalled();
    const fire = vi.fn();
    const detach = attachFlushListeners(fire);
    expect(doc.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(win.addEventListener).toHaveBeenCalledWith('pagehide', fire);
    expect(win.addEventListener).toHaveBeenCalledWith('beforeunload', fire);
    const onHide = doc.addEventListener.mock.calls.find((c) => c[0] === 'visibilitychange')![1] as () => void;
    onHide(); // visible → nothing
    expect(fire).not.toHaveBeenCalled();
    doc.visibilityState = 'hidden';
    onHide();
    expect(fire).toHaveBeenCalledTimes(1);
    detach();
    expect(doc.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(win.removeEventListener).toHaveBeenCalledWith('pagehide', fire);
    expect(win.removeEventListener).toHaveBeenCalledWith('beforeunload', fire);
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

  it('R4-5: keeps an unreadable shard under hx:corrupt before overwriting or removing it', () => {
    ls.setItem(KEYS.shard('2026-07'), '{not json');
    let index = writeShard('2026-07', [{ d: '2026-07-01', w: 175 }], EMPTY_INDEX);
    expect(ls.getItem(KEYS.corrupt('2026-07'))).toBe('{not json');
    expect(readShard('2026-07').shard?.days['01'].w).toBe(175);
    // A readable shard is never copied (the earlier capture stays as is).
    index = writeShard('2026-07', [{ d: '2026-07-01', w: 176 }], index);
    expect(ls.getItem(KEYS.corrupt('2026-07'))).toBe('{not json');
    // Removing an unreadable month (nothing in memory for it) preserves it too.
    ls.setItem(KEYS.shard('2026-06'), JSON.stringify({ v: 1, ym: '2026-06' }));
    index = writeShard('2026-06', [], index);
    expect(ls.getItem(KEYS.shard('2026-06'))).toBeNull();
    expect(index.shards['2026-06']).toBeUndefined();
    expect(JSON.parse(ls.getItem(KEYS.corrupt('2026-06')) as string)).toEqual({ v: 1, ym: '2026-06' });
    // Settings / chat get the same treatment.
    ls.setItem(KEYS.settings, '{oops');
    writeSettings(DEFAULT_SETTINGS);
    expect(ls.getItem(KEYS.corrupt('settings'))).toBe('{oops');
    ls.setItem(KEYS.chat, '[broken');
    writeChat([]);
    expect(ls.getItem(KEYS.corrupt('chat'))).toBe('[broken');
    // Corrupt copies are app keys: counted in usage, never mistaken for shards, wiped by clearAllStorage.
    expect(discoverShardMonths()).toEqual(['2026-07']);
    expect(loadAll().integrity.problems).toEqual([]);
    clearAllStorage();
    expect(ls.getItem(KEYS.corrupt('2026-07'))).toBeNull();
    expect(estimateBytesUsed()).toBe(0);
  });

  it('R4-5: loadAll returns a rebuilt index (no missing/unreadable months) and lists corruptMonths', () => {
    let index = writeShard('2026-09', REC_SEP, EMPTY_INDEX);
    index = writeShard('2026-08', REC_AUG, index);
    writeIndex({ ...index, shards: { ...index.shards, '2026-05': { count: 4, sum: 1 } } });
    ls.setItem(KEYS.shard('2026-07'), '{not json');
    const res = loadAll();
    expect(Object.keys(res.index.shards).sort()).toEqual(['2026-08', '2026-09']);
    expect(res.index.shards['2026-09']).toEqual(index.shards['2026-09']);
    expect(res.corruptMonths).toEqual(['2026-07']);
    const text = res.integrity.problems.join('\n');
    expect(text).toMatch(/2026-05 listed in index \(4 days\) but missing/);
    expect(text).toMatch(/hx:corrupt:2026-07/);
    expect(pruneIndex(readIndex() as ShardIndex).shards['2026-05']).toBeUndefined();
    expect(pruneIndex(index)).toBe(index); // nothing stale → same object
  });

  it('readSettings / readChat / shardMonthFromKey', () => {
    expect(readSettings()).toBeNull();
    expect(readChat()).toEqual([]);
    writeSettings(DEFAULT_SETTINGS);
    expect(readSettings()?.profile.name).toBe(DEFAULT_SETTINGS.profile.name);
    ls.setItem(KEYS.settings, '"str"');
    expect(readSettings()).toBeNull();
    writeChat([{ id: 'c1', role: 'user', text: 'hi', ts: 1 }]);
    expect(readChat()).toHaveLength(1);
    ls.setItem(KEYS.chat, '{"not":"array"}');
    expect(readChat()).toEqual([]);
    expect(shardMonthFromKey('hx:log:2026-09')).toBe('2026-09');
    expect(shardMonthFromKey('hx:log:index')).toBeNull();
    expect(shardMonthFromKey('hx:corrupt:2026-09')).toBeNull();
    expect(shardMonthFromKey('hx:settings')).toBeNull();
  });

  it('R4-7: the quota message tells the user what the UI can actually do', () => {
    ls.failWith = { name: 'QuotaExceededError' };
    expect(() => writeChat([])).toThrow(/export a JSON backup, then clear the coach history or all data/);
    expect(QUOTA_MESSAGE).not.toMatch(/old months/);
  });
});

// ---------------------------------------------------------------------------
// Workout shards (hx:wk:YYYY-MM) — the second shard family
// ---------------------------------------------------------------------------

const WK = (over: Partial<Workout> & { id: string; d: string }): Workout => ({
  start: '18:00',
  durationMin: 60,
  kind: 'strength',
  source: 'manual',
  ...over,
});

describe('workout shards', () => {
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

  const SESSIONS: Workout[] = [
    WK({ id: 'w1', d: '2026-09-01', srpe: 7, load: 420 }),
    WK({ id: 'w2', d: '2026-09-03', kind: 'cardio', start: '07:15', durationMin: 40 }),
    WK({ id: 'w3', d: '2026-08-28' }),
  ];

  it('writes, indexes and reloads both families independently', () => {
    let index = writeShard('2026-09', REC_SEP, EMPTY_INDEX);
    index = writeWorkoutShard('2026-09', SESSIONS, index);
    index = writeWorkoutShard('2026-08', SESSIONS, index);

    expect(Object.keys(index.workouts ?? {})).toEqual(['2026-09', '2026-08']);
    expect(index.workouts!['2026-09'].count).toBe(2);
    expect(index.workouts!['2026-08'].count).toBe(1);

    const res = loadAll();
    expect(Object.keys(res.workouts).sort()).toEqual(['w1', 'w2', 'w3']);
    expect(res.workouts.w2.kind).toBe('cardio');
    expect(res.integrity.workoutShards).toBe(2);
    expect(res.integrity.workouts).toBe(3);
    expect(res.integrity.problems).toEqual([]);
    // Day records are untouched by a workout write.
    expect(Object.keys(res.days)).toHaveLength(REC_SEP.length);
  });

  it('never treats the draft key as a shard', () => {
    expect(workoutMonthFromKey('hx:wk:2026-09')).toBe('2026-09');
    expect(workoutMonthFromKey(KEYS.workoutDraft)).toBeNull();
    expect(workoutMonthFromKey('hx:wk:draft')).toBeNull();
    expect(workoutMonthFromKey('hx:log:2026-09')).toBeNull();

    writeWorkoutDraft({ exercises: [], startedAt: '18:00' });
    const index = writeWorkoutShard('2026-09', SESSIONS, EMPTY_INDEX);
    expect(discoverWorkoutMonths()).toEqual(['2026-09']);
    expect(Object.keys(index.workouts ?? {})).toEqual(['2026-09']);

    const res = loadAll();
    expect(res.integrity.problems).toEqual([]);
    expect(Object.keys(res.workouts)).toEqual(['w1', 'w2']);
    expect(readWorkoutDraft()).toEqual({ exercises: [], startedAt: '18:00' });
  });

  it('reports a checksum mismatch and still loads the sessions', () => {
    const index = writeWorkoutShard('2026-09', SESSIONS, EMPTY_INDEX);
    const raw = JSON.parse(ls.getItem(KEYS.wk('2026-09'))!) as { items: Record<string, Workout> };
    raw.items.w1.durationMin = 999;
    ls.setItem(KEYS.wk('2026-09'), JSON.stringify(raw));

    const res = loadAll();
    expect(res.workouts.w1.durationMin).toBe(999);
    expect(res.integrity.problems.join(' ')).toMatch(/Workout shard 2026-09 does not match its index entry/);
    expect(index.workouts!['2026-09'].count).toBe(2);
  });

  it('preserves an unreadable workout shard instead of losing it', () => {
    const index = writeWorkoutShard('2026-09', SESSIONS, EMPTY_INDEX);
    ls.setItem(KEYS.wk('2026-09'), '{ this is not json');

    const bad = loadAll();
    expect(bad.corruptWorkoutMonths).toEqual(['2026-09']);
    expect(bad.integrity.problems.join(' ')).toMatch(/Workout shard 2026-09 is not valid JSON/);

    writeWorkoutShard('2026-09', SESSIONS, index);
    expect(ls.getItem(KEYS.corrupt('wk:2026-09'))).toBe('{ this is not json');
    expect(loadAll().integrity.problems).toEqual([]);
  });

  it('drops the shard and its index entry when a month empties out', () => {
    let index = writeWorkoutShard('2026-09', SESSIONS, EMPTY_INDEX);
    index = writeWorkoutShard('2026-09', [], index);
    expect(ls.getItem(KEYS.wk('2026-09'))).toBeNull();
    expect(index.workouts!['2026-09']).toBeUndefined();
    expect(loadAll().workouts).toEqual({});
  });

  it('prunes workout index entries whose shard is gone, and leaves day entries alone', () => {
    let index = writeShard('2026-09', REC_SEP, EMPTY_INDEX);
    index = writeWorkoutShard('2026-09', SESSIONS, index);
    ls.removeItem(KEYS.wk('2026-09'));
    const pruned = pruneIndex(index);
    expect(pruned.workouts!['2026-09']).toBeUndefined();
    expect(pruned.shards['2026-09']).toBeDefined();
  });

  it('loads a v1 index that has no workouts key at all', () => {
    const v1: ShardIndex = { version: 1, shards: {}, updatedAt: 1 };
    writeIndex(v1);
    writeShard('2026-09', REC_SEP, v1);
    const res = loadAll();
    expect(res.workouts).toEqual({});
    expect(res.integrity.workoutShards).toBe(0);
    expect(res.integrity.problems).toEqual([]);
  });

  it('clearAllData removes the draft along with both shard families', () => {
    writeWorkoutShard('2026-09', SESSIONS, writeShard('2026-09', REC_SEP, EMPTY_INDEX));
    writeWorkoutDraft({ live: true });
    clearAllStorage();
    expect(ls.getItem(KEYS.workoutDraft)).toBeNull();
    expect(ls.getItem(KEYS.wk('2026-09'))).toBeNull();
    expect(ls.getItem(KEYS.shard('2026-09'))).toBeNull();
  });
});
