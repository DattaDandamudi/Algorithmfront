// @vitest-environment jsdom
/**
 * Provider-level durability tests (R4-9): HealthStoreProvider mounted with
 * @testing-library/react, fake timers and an in-memory localStorage stub.
 */
import { StrictMode } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthStoreProvider, useHealth } from './store';
import { KEYS, readIndex, resetStorageCache, writeChat, writeIndex, writeSettings, writeShard, writeWorkoutShard, type Shard, type ShardIndex, type WorkoutShard } from './storage';
import { DEFAULT_SETTINGS } from './defaults';
import { SCHEMA_VERSION, type ChatMessage, type Workout } from './types';

type Ctx = ReturnType<typeof useHealth>;

interface MemStorage extends Storage {
  /** Make setItem throw QuotaExceededError for keys this returns true for. */
  failOn?: (key: string) => boolean;
  /** Every key setItem was asked to write (including failed attempts). */
  writes: string[];
}

function memoryStorage(): MemStorage {
  const map = new Map<string, string>();
  const ls = {
    failOn: undefined as MemStorage['failOn'],
    writes: [] as string[],
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
      if (k !== '__hx_probe__') ls.writes.push(k);
      if (ls.failOn && k !== '__hx_probe__' && ls.failOn(k)) throw { name: 'QuotaExceededError' };
      map.set(k, String(v));
    },
  };
  return ls as unknown as MemStorage;
}

const EMPTY_INDEX: ShardIndex = { version: SCHEMA_VERSION, shards: {}, updatedAt: 0 };
const C1: ChatMessage = { id: 'c1', role: 'user', text: 'Should I train?', ts: 1 };
const C2: ChatMessage = { id: 'c2', role: 'assistant', text: 'Yes, hold loads.', ts: 2 };
const C3: ChatMessage = { id: 'c3', role: 'user', text: 'Thanks', ts: 3 };

let ls: MemStorage;
let ctx: Ctx;

function Probe() {
  ctx = useHealth();
  return null;
}

function mount(strict = false) {
  const tree = (
    <HealthStoreProvider>
      <Probe />
    </HealthStoreProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const shard = (ym: string): Shard | null => {
  const raw = ls.getItem(KEYS.shard(ym));
  return raw ? (JSON.parse(raw) as Shard) : null;
};
const hxKeys = () => Array.from({ length: ls.length }, (_, i) => ls.key(i)).filter((k): k is string => !!k && k.startsWith(KEYS.prefix)).sort();
const storageEvent = (key: string | null) =>
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: key ? ls.getItem(key) : null }));
  });
const setVisibility = (v: 'visible' | 'hidden') => Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });

beforeEach(() => {
  vi.useFakeTimers();
  ls = memoryStorage();
  Object.defineProperty(window, 'localStorage', { value: ls, configurable: true, writable: true });
  resetStorageCache();
});

afterEach(() => {
  cleanup();
  setVisibility('visible');
  vi.useRealTimers();
  resetStorageCache();
});

describe('HealthStoreProvider — R7-13 future-dated records', () => {
  it('"Going to bed" for tomorrow never gains an EWMA trend weight, in state or on disk', () => {
    vi.setSystemTime(new Date(2026, 8, 6, 22, 30, 0));
    mount();
    act(() => {
      ctx.actions.setWeight('2026-09-05', 172);
      ctx.actions.setWeight('2026-09-06', 171.8);
      ctx.actions.logBedtime('2026-09-07', '23:10');
    });
    expect(ctx.state.days['2026-09-06'].wt).toBe(171.98);
    expect(ctx.state.days['2026-09-07']).toEqual({ d: '2026-09-07', bt: '23:10' });
    tick(500);
    expect(shard('2026-09')?.days['07']).toEqual({ d: '2026-09-07', bt: '23:10' });
    expect(shard('2026-09')?.days['06'].wt).toBe(171.98);
  });
});

describe('HealthStoreProvider — debounced persistence', () => {
  it('writes the dirty month shard + index 500 ms after an edit and stamps lastSavedAt', () => {
    mount();
    expect(ctx.state.ready).toBe(true);
    expect(ctx.state.storage.available).toBe(true);
    act(() => ctx.actions.setWeight('2026-09-06', 170.4));
    expect(ctx.state.days['2026-09-06']).toMatchObject({ w: 170.4, wt: 170.4 });
    tick(499);
    expect(ls.getItem(KEYS.shard('2026-09'))).toBeNull();
    tick(1);
    expect(shard('2026-09')?.days['06']).toMatchObject({ d: '2026-09-06', w: 170.4 });
    expect(readIndex()?.shards['2026-09']).toEqual({ count: 1, sum: expect.any(Number) });
    expect(ctx.state.storage.ok).toBe(true);
    expect(ctx.state.storage.lastSavedAt).toBeTypeOf('number');
    expect(ctx.state.storage.bytesUsed).toBeGreaterThan(0);
  });

  it('flushes by 2 s under continuous edits (maxWait)', () => {
    mount();
    for (let t = 0; t < 1900; t += 100) {
      act(() => ctx.actions.adjustTobacco('2026-09-06', 1));
      tick(100);
    }
    expect(ls.getItem(KEYS.shard('2026-09'))).toBeNull();
    act(() => ctx.actions.adjustTobacco('2026-09-06', 1));
    tick(100); // 2.0 s since the first pending edit
    expect(shard('2026-09')?.days['06'].tob).toBe(20);
  });

  it('a quota failure mid-loop keeps the failed month dirty and state intact, then retries with back-off / flush()', () => {
    mount();
    act(() => {
      ctx.actions.setWeight('2026-08-30', 172);
      ctx.actions.setWeight('2026-09-05', 171);
    });
    const sep = KEYS.shard('2026-09');
    ls.failOn = (k) => k === sep;
    tick(500);
    // August landed, September did not; the error is surfaced and actionable.
    expect(shard('2026-08')?.days['30'].w).toBe(172);
    expect(ls.getItem(sep)).toBeNull();
    expect(ctx.state.storage.ok).toBe(false);
    expect(ctx.state.storage.lastError).toMatch(/quota/i);
    expect(ctx.state.storage.lastError).toMatch(/export a JSON backup, then clear the coach history or all data/);
    expect(ctx.state.days['2026-09-05']?.w).toBe(171); // in-memory state untouched
    expect(ls.writes.filter((k) => k === sep)).toHaveLength(1);
    // Automatic retry after 2 s (still failing) …
    tick(2000);
    expect(ls.writes.filter((k) => k === sep)).toHaveLength(2);
    expect(ctx.state.storage.ok).toBe(false);
    // … then space is freed and flush() writes it immediately.
    ls.failOn = undefined;
    act(() => ctx.actions.flush());
    expect(shard('2026-09')?.days['05'].w).toBe(171);
    expect(readIndex()?.shards['2026-09']?.count).toBe(1);
    expect(readIndex()?.shards['2026-08']?.count).toBe(1);
    expect(ctx.state.storage.ok).toBe(true);
    expect(ctx.state.storage.lastError).toBeUndefined();
    // No further writes once everything is clean.
    const n = ls.writes.length;
    tick(60_000);
    expect(ls.writes).toHaveLength(n);
  });

  it('a quota failure is retried automatically on the back-off schedule until it lands', () => {
    mount();
    act(() => ctx.actions.setWeight('2026-09-05', 171));
    ls.failOn = () => true;
    tick(500);
    expect(ctx.state.storage.ok).toBe(false);
    tick(2000);
    ls.failOn = undefined;
    tick(5000); // second retry
    expect(shard('2026-09')?.days['05'].w).toBe(171);
    expect(ctx.state.storage.ok).toBe(true);
  });

  it('replace-import deletes shards for months that vanished', () => {
    mount();
    act(() => {
      ctx.actions.setWeight('2026-08-30', 172);
      ctx.actions.setWeight('2026-09-05', 171);
    });
    tick(500);
    expect(shard('2026-08')).not.toBeNull();
    let result: ReturnType<Ctx['actions']['importJSON']> | undefined;
    act(() => {
      result = ctx.actions.importJSON(JSON.stringify([{ d: '2026-09-06', w: 170 }]), 'replace');
    });
    expect(result?.ok).toBe(true);
    expect(Object.keys(ctx.state.days)).toEqual(['2026-09-06']);
    tick(500);
    expect(ls.getItem(KEYS.shard('2026-08'))).toBeNull();
    expect(readIndex()?.shards['2026-08']).toBeUndefined();
    expect(Object.keys(shard('2026-09')?.days ?? {})).toEqual(['06']);
  });

  it('changing the EWMA alpha rewrites wt in every month', () => {
    mount();
    act(() => {
      ctx.actions.setWeight('2026-08-30', 172);
      ctx.actions.setWeight('2026-08-31', 174);
      ctx.actions.setWeight('2026-09-01', 176);
    });
    tick(500);
    expect(shard('2026-08')?.days['31'].wt).toBe(172.2); // α = 0.10
    act(() => ctx.actions.updateTargets({ ewmaAlpha: 0.25 }));
    tick(500);
    expect(shard('2026-08')?.days['31'].wt).toBe(172.5);
    expect(shard('2026-09')?.days['01'].wt).toBeCloseTo(173.375, 1);
    expect(JSON.parse(ls.getItem(KEYS.settings) as string).targets.ewmaAlpha).toBe(0.25);
  });

  it('clearAllData empties every hx:* key and resets state; a pending timer resurrects nothing', () => {
    mount();
    act(() => {
      ctx.actions.setWeight('2026-09-05', 171);
      ctx.actions.appendChat(C1);
      ctx.actions.updateProfile({ name: 'Someone' });
    });
    tick(500);
    ls.setItem('other-app', 'keep');
    expect(hxKeys().length).toBeGreaterThanOrEqual(3);
    act(() => ctx.actions.adjustTobacco('2026-09-05', 1)); // pending, not yet written
    act(() => ctx.actions.clearAllData());
    expect(hxKeys()).toEqual([]);
    expect(ls.getItem('other-app')).toBe('keep');
    expect(ctx.state.days).toEqual({});
    expect(ctx.state.chat).toEqual([]);
    expect(ctx.state.settings.profile.name).toBe(DEFAULT_SETTINGS.profile.name);
    tick(5000);
    expect(hxKeys()).toEqual([]);
  });
});

describe('HealthStoreProvider — flush listeners (R4-4)', () => {
  it('survive a StrictMode remount: hiding the tab flushes immediately', () => {
    mount(true);
    act(() => ctx.actions.setWeight('2026-09-06', 170));
    expect(ls.getItem(KEYS.shard('2026-09'))).toBeNull();
    setVisibility('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(shard('2026-09')?.days['06'].w).toBe(170);
  });

  it('pagehide flushes, and unmount flushes then detaches', () => {
    const view = mount();
    act(() => ctx.actions.setWeight('2026-09-06', 170));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(shard('2026-09')?.days['06'].w).toBe(170);
    act(() => ctx.actions.setWeight('2026-09-07', 169));
    view.unmount();
    expect(shard('2026-09')?.days['07'].w).toBe(169);
    const n = ls.writes.length;
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(ls.writes).toHaveLength(n); // detached
  });
});

describe('HealthStoreProvider — multi-tab (R4-1)', () => {
  it('a storage event reloads a clean month, keeps a dirty one (last writer wins), and reloads settings/chat', () => {
    mount();
    // Another tab writes September; this tab has no pending edits for it.
    const other = writeShard('2026-09', [{ d: '2026-09-05', w: 171.2 }], EMPTY_INDEX);
    storageEvent(KEYS.shard('2026-09'));
    expect(ctx.state.days['2026-09-05']).toMatchObject({ w: 171.2, wt: 171.2 });
    // A reload never schedules a write of its own.
    const n = ls.writes.length;
    tick(5000);
    expect(ls.writes).toHaveLength(n);
    // Now this tab edits September (pending); the other tab writes the same month → ours is kept.
    act(() => ctx.actions.setWeight('2026-09-06', 170));
    writeShard('2026-09', [{ d: '2026-09-05', w: 171.2 }, { d: '2026-09-06', w: 999 }], other);
    storageEvent(KEYS.shard('2026-09'));
    expect(ctx.state.days['2026-09-06']?.w).toBe(170);
    tick(500);
    expect(shard('2026-09')?.days['06'].w).toBe(170);
    expect(shard('2026-09')?.days['05'].w).toBe(171.2);
    // Settings and chat reload the same way when clean …
    writeSettings({ ...DEFAULT_SETTINGS, onboarded: true, profile: { ...DEFAULT_SETTINGS.profile, name: 'Other tab' } });
    storageEvent(KEYS.settings);
    expect(ctx.state.settings.profile.name).toBe('Other tab');
    writeChat([C1, C2]);
    storageEvent(KEYS.chat);
    expect(ctx.state.chat.map((m) => m.id)).toEqual(['c1', 'c2']);
    // … and are kept when dirty.
    act(() => ctx.actions.updateProfile({ name: 'Mine' }));
    writeSettings({ ...DEFAULT_SETTINGS, profile: { ...DEFAULT_SETTINGS.profile, name: 'Other tab again' } });
    storageEvent(KEYS.settings);
    expect(ctx.state.settings.profile.name).toBe('Mine');
    // Foreign keys and the index key are ignored for state.
    ls.setItem('other-app', 'x');
    storageEvent('other-app');
    expect(ctx.state.settings.profile.name).toBe('Mine');
  });

  it('a month removed by another tab disappears here too', () => {
    mount();
    act(() => ctx.actions.setWeight('2026-09-05', 171));
    tick(500);
    ls.removeItem(KEYS.shard('2026-09'));
    storageEvent(KEYS.shard('2026-09'));
    expect(ctx.state.days['2026-09-05']).toBeUndefined();
  });

  it('rebuilds the index from storage before writing so another tab’s months survive', () => {
    mount();
    // Another tab adds August (shard + index) — the event has not been processed here.
    writeShard('2026-08', [{ d: '2026-08-30', w: 172 }], EMPTY_INDEX);
    act(() => ctx.actions.setWeight('2026-09-06', 170));
    tick(500);
    expect(Object.keys(readIndex()?.shards ?? {}).sort()).toEqual(['2026-08', '2026-09']);
  });
});

describe('HealthStoreProvider — export/import (R4-2, R4-6)', () => {
  it('export omits ai.apiKey (with a note) and re-importing never clears the local key', () => {
    mount();
    act(() => {
      ctx.actions.updateAI({ provider: 'anthropic-direct', apiKey: 'sk-secret' });
      ctx.actions.setWeight('2026-09-06', 170);
    });
    let json = '';
    act(() => {
      json = ctx.actions.exportJSON();
    });
    expect(json).not.toContain('sk-secret');
    const bundle = JSON.parse(json);
    expect(bundle.settings.ai.apiKey).toBeUndefined();
    expect(bundle.settings.ai.provider).toBe('anthropic-direct');
    expect(bundle.exportNote).toMatch(/apiKey/);
    expect(ctx.state.settings.lastExportAt).toBeTypeOf('number');
    act(() => {
      ctx.actions.importJSON(json, 'replace');
    });
    expect(ctx.state.settings.ai.apiKey).toBe('sk-secret');
    act(() => {
      ctx.actions.importJSON(json, 'merge');
    });
    expect(ctx.state.settings.ai.apiKey).toBe('sk-secret');
    // A file that explicitly carries a key (older exports) wins.
    bundle.settings.ai.apiKey = 'sk-from-file';
    act(() => {
      ctx.actions.importJSON(JSON.stringify(bundle), 'merge');
    });
    expect(ctx.state.settings.ai.apiKey).toBe('sk-from-file');
  });

  it('merge appends unknown chat ids and keeps settings; replace resets settings (keeping key + onboarded) and clears chat', () => {
    mount();
    act(() => {
      ctx.actions.setSettings({ onboarded: true });
      ctx.actions.updateProfile({ name: 'Local' });
      ctx.actions.updateAI({ apiKey: 'sk-1' });
      ctx.actions.appendChat(C1);
      ctx.actions.appendChat(C2);
    });
    // Merge: c2 already exists (ours is kept), c3 is appended.
    act(() => {
      ctx.actions.importJSON(JSON.stringify({ days: [{ d: '2026-09-01', w: 170 }], chat: [{ ...C2, text: 'changed' }, C3] }), 'merge');
    });
    expect(ctx.state.chat.map((m) => m.id)).toEqual(['c1', 'c2', 'c3']);
    expect(ctx.state.chat[1].text).toBe(C2.text);
    expect(ctx.state.settings.profile.name).toBe('Local');
    // Merge with an empty chat array does not wipe the transcript.
    act(() => {
      ctx.actions.importJSON(JSON.stringify({ days: [{ d: '2026-09-02', w: 169 }], chat: [] }), 'merge');
    });
    expect(ctx.state.chat).toHaveLength(3);
    expect(Object.keys(ctx.state.days).sort()).toEqual(['2026-09-01', '2026-09-02']);
    // Replace with a bare array: settings → defaults (key + onboarded kept), chat cleared, days replaced.
    act(() => {
      ctx.actions.importJSON(JSON.stringify([{ d: '2026-09-03', w: 168 }]), 'replace');
    });
    expect(ctx.state.settings.profile.name).toBe(DEFAULT_SETTINGS.profile.name);
    expect(ctx.state.settings.onboarded).toBe(true);
    expect(ctx.state.settings.ai.apiKey).toBe('sk-1');
    expect(ctx.state.chat).toEqual([]);
    expect(Object.keys(ctx.state.days)).toEqual(['2026-09-03']);
    tick(500);
    expect(JSON.parse(ls.getItem(KEYS.chat) as string)).toEqual([]);
  });
});

describe('HealthStoreProvider — self-heal (R4-5)', () => {
  it('prunes index entries for missing shards, moves an unreadable shard to hx:corrupt and refreshes the report', () => {
    let idx = writeShard('2026-09', [{ d: '2026-09-05', w: 171 }], EMPTY_INDEX);
    idx = { ...idx, shards: { ...idx.shards, '2026-07': { count: 3, sum: 1 } } };
    writeIndex(idx);
    ls.setItem(KEYS.shard('2026-08'), '{not json');
    mount();
    const problems = ctx.state.storage.integrity?.problems ?? [];
    expect(problems.join('\n')).toMatch(/2026-07 listed in index/);
    expect(problems.join('\n')).toMatch(/2026-08 is not valid JSON/);
    expect(ctx.state.days['2026-09-05']?.w).toBe(171);
    tick(500);
    expect(Object.keys(readIndex()?.shards ?? {})).toEqual(['2026-09']);
    expect(ls.getItem(KEYS.shard('2026-08'))).toBeNull();
    expect(ls.getItem(KEYS.corrupt('2026-08'))).toBe('{not json');
    expect(ctx.state.storage.integrity?.problems).toEqual([]);
    expect(ctx.state.storage.ok).toBe(true);
    // Nothing left to heal: the next mount is clean and schedules no write.
    cleanup();
    mount();
    expect(ctx.state.storage.integrity?.problems).toEqual([]);
    const n = ls.writes.length;
    tick(5000);
    expect(ls.writes).toHaveLength(n);
  });

  it('heals an index-only problem even when no month is loaded', () => {
    writeIndex({ ...EMPTY_INDEX, shards: { '2026-07': { count: 3, sum: 1 } } });
    mount();
    expect(ctx.state.storage.integrity?.problems.length).toBe(1);
    tick(500);
    expect(readIndex()?.shards).toEqual({});
    expect(ctx.state.storage.integrity?.problems).toEqual([]);
  });
});

describe('HealthStoreProvider — training sessions', () => {
  const wkShard = (ym: string): WorkoutShard | null => {
    const raw = ls.getItem(KEYS.wk(ym));
    return raw ? (JSON.parse(raw) as WorkoutShard) : null;
  };

  const session = (over: Partial<Workout> = {}): Omit<Workout, 'id'> => ({
    d: '2026-09-06',
    start: '18:00',
    durationMin: 60,
    kind: 'strength',
    source: 'manual',
    ...over,
  });

  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 8, 6, 20, 0, 0));
  });

  it('writes a session to its own shard family and stamps the day', () => {
    mount();
    act(() => {
      ctx.actions.addWorkout(session({ srpe: 7 }));
    });
    expect(ctx.state.days['2026-09-06']).toMatchObject({ ld: 420, wko: 1, lift: true });
    tick(500);

    expect(wkShard('2026-09')?.items && Object.keys(wkShard('2026-09')!.items)).toHaveLength(1);
    // Both families are written, and the index knows about both.
    expect(shard('2026-09')?.days['06']).toMatchObject({ ld: 420, wko: 1 });
    expect(Object.keys(readIndex()?.workouts ?? {})).toEqual(['2026-09']);
  });

  it('reloads the session (and its derived day fields) on a fresh mount', () => {
    mount();
    act(() => {
      ctx.actions.addWorkout(session({ srpe: 8, durationMin: 50 }));
    });
    tick(500);
    cleanup();

    mount();
    expect(Object.values(ctx.state.workouts)).toHaveLength(1);
    expect(ctx.state.days['2026-09-06']).toMatchObject({ ld: 400, wko: 1, lift: true });
  });

  it('clears the day fields again when the session is deleted', () => {
    mount();
    let id = '';
    act(() => {
      id = ctx.actions.addWorkout(session({ srpe: 7 })).id;
    });
    act(() => {
      ctx.actions.removeWorkout(id);
    });
    expect(ctx.state.workouts[id]).toBeUndefined();
    expect(ctx.state.days['2026-09-06'].ld).toBeUndefined();
    expect(ctx.state.days['2026-09-06'].wko).toBeUndefined();
    tick(500);
    expect(ls.getItem(KEYS.wk('2026-09'))).toBeNull();
  });

  it('finishWorkout stamps duration, session RPE and the load', () => {
    mount();
    let id = '';
    act(() => {
      id = ctx.actions.addWorkout(session({ durationMin: 0 })).id;
    });
    act(() => {
      ctx.actions.finishWorkout(id, { durationMin: 47, srpe: 8 });
    });
    expect(ctx.state.workouts[id]).toMatchObject({ durationMin: 47, srpe: 8, load: 376 });
    expect(ctx.state.days['2026-09-06'].ld).toBe(376);
  });

  it('importWorkouts dedupes by externalId and by a 10-minute window, keeping the manual entry', () => {
    mount();
    act(() => {
      ctx.actions.addWorkout(session({ start: '18:00', title: 'typed by hand' }));
    });
    let result = { added: 0, skipped: 0, errors: [] as string[] };
    act(() => {
      result = ctx.actions.importWorkouts([
        { id: 'i1', ...session({ start: '18:06', title: 'from WHOOP' }) } as Workout,
        { id: 'i2', ...session({ d: '2026-09-05', start: '07:00', kind: 'cardio' }), externalId: 'whoop:a' } as Workout,
        { id: 'i3', ...session({ d: '2026-09-05', start: '09:30', kind: 'cardio' }), externalId: 'whoop:a' } as Workout,
      ]);
    });
    expect(result).toMatchObject({ added: 1, skipped: 2 });
    const titles = Object.values(ctx.state.workouts).map((w) => w.title);
    expect(titles).toContain('typed by hand');
    expect(titles).not.toContain('from WHOOP');
  });

  it('picks up another tab’s workout shard without touching this tab’s pending edits', () => {
    mount();
    const other: Workout = { id: 'w-other', d: '2026-09-04', start: '17:00', durationMin: 30, kind: 'cardio', source: 'manual', srpe: 5 };
    const index = writeWorkoutShard('2026-09', [other], readIndex() ?? EMPTY_INDEX);
    writeIndex(index);
    storageEvent(KEYS.wk('2026-09'));
    expect(ctx.state.workouts['w-other']).toBeDefined();
    expect(ctx.state.days['2026-09-04']).toMatchObject({ ld: 150, wko: 1 });
  });

  it('ignores the draft key: it is this tab’s scratch space, not shared state', () => {
    mount();
    const before = ctx.state.workouts;
    ls.setItem(KEYS.workoutDraft, JSON.stringify({ live: true }));
    storageEvent(KEYS.workoutDraft);
    expect(ctx.state.workouts).toBe(before);
  });

  it('a calorie target change stamps the freeze date', () => {
    mount();
    act(() => {
      ctx.actions.updateTargets({ kcal: 2100 });
    });
    expect(ctx.state.settings.targets.lastKcalChangeAt).toBe('2026-09-06');
    act(() => {
      ctx.actions.updateTargets({ protein: 190 });
    });
    expect(ctx.state.settings.targets.lastKcalChangeAt).toBe('2026-09-06');
  });

  it('saveCheckIn writes the Hooper items in one go, and recordInsightsShown keeps 14 days', () => {
    mount();
    act(() => {
      ctx.actions.saveCheckIn('2026-09-06', { qs: 3, qf: 4, qt: 2, qo: 5 });
    });
    expect(ctx.state.days['2026-09-06']).toMatchObject({ qs: 3, qf: 4, qt: 2, qo: 5 });

    act(() => {
      for (let i = 1; i <= 20; i++) ctx.actions.recordInsightsShown(`2026-08-${String(i).padStart(2, '0')}`, ['t1']);
    });
    const history = ctx.state.settings.insightHistory ?? {};
    expect(Object.keys(history)).toHaveLength(14);
    expect(Object.keys(history)[0]).toBe('2026-08-07');
  });
});
