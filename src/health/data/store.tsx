/**
 * Health store — React context over the sharded localStorage layer.
 *
 * - State lives in memory; every change marks the affected month shards (and
 *   settings / chat) dirty and schedules a debounced write (500 ms, 2 s max).
 * - Derived fields kept in sync here so every consumer agrees:
 *     • daily totals (kc/p/f/c/fi) from itemised meals
 *     • EWMA trend weight `wt` (recomputed from the first weigh-in onward
 *       whenever any scale weight or the alpha changes)
 * - Records are immutable; unchanged records keep their object identity so the
 *   dirty-shard diff is a cheap reference comparison.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  AISettings,
  AppSettings,
  ChatMessage,
  DailyRecord,
  FoodItem,
  HHMM,
  HealthActions,
  HealthState,
  ImportResult,
  ISODate,
  IntegrityReport,
  Meal,
  Profile,
  StorageStatus,
  Targets,
} from './types';
import { SCHEMA_VERSION } from './types';
import { mergeSettings } from './defaults';
import {
  CHAT_CAP,
  QUOTA_BYTES,
  QUOTA_WARN_RATIO,
  StorageWriteError,
  checkIntegrity as checkIntegrityStorage,
  clearAllStorage,
  createDebouncedWriter,
  estimateBytesUsed,
  loadAll,
  readIndex,
  writeChat,
  writeSettings,
  writeShard,
  type ShardIndex,
} from './storage';
import { buildCSV, buildExportJSON, parseImport } from './export';
import { generateDemoData } from './seed';
import { computeEwmaTrend } from '../engine/weight';
import { todayISO, yearMonthOf } from '../lib/dates';
import { round, uid } from '../lib/format';

interface HealthContextValue {
  state: HealthState;
  actions: HealthActions;
}

const HealthContext = createContext<HealthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

type Days = Record<ISODate, DailyRecord>;

const MEAL_TOTAL_KEYS = ['kc', 'p', 'f', 'c', 'fi'] as const;

/** Recompute totals from meals. Returns the same object if nothing changed. */
export function withTotals(rec: DailyRecord): DailyRecord {
  if (!rec.meals || rec.meals.length === 0) {
    if (rec.meals && rec.meals.length === 0) {
      const next = { ...rec };
      delete next.meals;
      for (const k of MEAL_TOTAL_KEYS) delete next[k];
      return next;
    }
    return rec;
  }
  const sums = { kc: 0, p: 0, f: 0, c: 0, fi: 0 };
  for (const m of rec.meals) {
    sums.kc += Number(m.kc) || 0;
    sums.p += Number(m.p) || 0;
    sums.f += Number(m.f) || 0;
    sums.c += Number(m.c) || 0;
    sums.fi += Number(m.fi) || 0;
  }
  const rounded = { kc: round(sums.kc), p: round(sums.p), f: round(sums.f), c: round(sums.c), fi: round(sums.fi, 1) };
  if (MEAL_TOTAL_KEYS.every((k) => rec[k] === rounded[k])) return rec;
  return { ...rec, ...rounded };
}

/** Remove undefined keys so persisted JSON stays compact. */
function compact<T extends object>(obj: T): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out as T;
}

/** Apply EWMA trend to every record; preserves identity of unchanged records. */
export function applyTrend(days: Days, alpha: number): Days {
  const records = Object.values(days);
  const trend = computeEwmaTrend(records, alpha);
  let changed = false;
  const next: Days = { ...days };
  for (const r of records) {
    const wt = trend.get(r.d);
    if (wt === undefined) {
      if (r.wt !== undefined) {
        const c = { ...r };
        delete c.wt;
        next[r.d] = c;
        changed = true;
      }
      continue;
    }
    if (r.wt !== wt) {
      next[r.d] = { ...r, wt };
      changed = true;
    }
  }
  return changed ? next : days;
}

function sortRecords(days: Days): DailyRecord[] {
  return Object.values(days).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
}

function changedMonths(prev: Days, next: Days): Set<string> {
  const months = new Set<string>();
  if (prev === next) return months;
  for (const k of Object.keys(prev)) if (prev[k] !== next[k]) months.add(yearMonthOf(k));
  for (const k of Object.keys(next)) if (!(k in prev)) months.add(yearMonthOf(k));
  return months;
}

function initialState(): { state: HealthState; index: ShardIndex } {
  const loaded = loadAll();
  const settings = mergeSettings(loaded.settings);
  const days = applyTrend(loaded.days, settings.targets.ewmaAlpha);
  const bytes = loaded.bytesUsed;
  const storage: StorageStatus = {
    ok: loaded.available,
    available: loaded.available,
    bytesUsed: bytes,
    quotaWarning: bytes > QUOTA_BYTES * QUOTA_WARN_RATIO,
    integrity: loaded.integrity,
    lastError: loaded.available ? undefined : 'localStorage is unavailable — data will not persist in this browser.',
  };
  const index = readIndex() ?? { version: SCHEMA_VERSION, shards: {}, updatedAt: 0 };
  return { state: { ready: true, settings, days, chat: loaded.chat.slice(-CHAT_CAP), storage }, index };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function HealthStoreProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(initialState, []);
  const [state, setState] = useState<HealthState>(initial.state);
  const stateRef = useRef(state);
  stateRef.current = state;
  const indexRef = useRef<ShardIndex>(initial.index);
  const dirty = useRef({ months: new Set<string>(), settings: false, chat: false });

  const persist = useCallback(() => {
    const s = stateRef.current;
    const d = dirty.current;
    if (!d.months.size && !d.settings && !d.chat) return;
    if (!s.storage.available) {
      d.months.clear();
      d.settings = false;
      d.chat = false;
      return;
    }
    let lastError: string | undefined;
    const records = Object.values(s.days);
    try {
      for (const ym of Array.from(d.months)) {
        indexRef.current = writeShard(ym, records, indexRef.current);
        d.months.delete(ym);
      }
      if (d.settings) {
        writeSettings(s.settings);
        d.settings = false;
      }
      if (d.chat) {
        writeChat(s.chat);
        d.chat = false;
      }
    } catch (e) {
      lastError = e instanceof StorageWriteError ? e.message : e instanceof Error ? e.message : 'Write failed';
    }
    const bytes = estimateBytesUsed();
    setState((prev) => ({
      ...prev,
      storage: {
        ...prev.storage,
        ok: !lastError,
        bytesUsed: bytes,
        quotaWarning: bytes > QUOTA_BYTES * QUOTA_WARN_RATIO,
        lastError,
        lastSavedAt: lastError ? prev.storage.lastSavedAt : Date.now(),
      },
    }));
  }, []);

  const writer = useMemo(() => createDebouncedWriter(persist, 500, 2000), [persist]);
  useEffect(() => () => writer.cancel(), [writer]);

  // Self-heal: when the load found index/checksum problems but the data itself
  // was readable, rewrite every month shard + the index once so they agree.
  useEffect(() => {
    const s = stateRef.current;
    if (!s.storage.available || !s.storage.integrity?.problems.length) return;
    for (const d of Object.keys(s.days)) dirty.current.months.add(yearMonthOf(d));
    if (dirty.current.months.size) writer.schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Core mutation: compute next days, keep totals + trend in sync, mark dirty shards. */
  const mutateDays = useCallback(
    (fn: (days: Days, settings: AppSettings) => Days) => {
      setState((prev) => {
        const raw = fn(prev.days, prev.settings);
        if (raw === prev.days) return prev;
        // Keep totals in sync for any record whose identity changed.
        const totalled: Days = { ...raw };
        for (const k of Object.keys(raw)) {
          if (raw[k] !== prev.days[k]) totalled[k] = compact(withTotals(raw[k]));
        }
        const next = applyTrend(totalled, prev.settings.targets.ewmaAlpha);
        const months = changedMonths(prev.days, next);
        if (!months.size) return prev;
        months.forEach((m) => dirty.current.months.add(m));
        writer.schedule();
        return { ...prev, days: next };
      });
    },
    [writer],
  );

  const mutateSettings = useCallback(
    (fn: (s: AppSettings) => AppSettings) => {
      setState((prev) => {
        const nextSettings = fn(prev.settings);
        if (nextSettings === prev.settings) return prev;
        dirty.current.settings = true;
        let days = prev.days;
        if (nextSettings.targets.ewmaAlpha !== prev.settings.targets.ewmaAlpha) {
          days = applyTrend(prev.days, nextSettings.targets.ewmaAlpha);
          changedMonths(prev.days, days).forEach((m) => dirty.current.months.add(m));
        }
        writer.schedule();
        return { ...prev, settings: nextSettings, days };
      });
    },
    [writer],
  );

  const mutateChat = useCallback(
    (fn: (c: ChatMessage[]) => ChatMessage[]) => {
      setState((prev) => {
        const next = fn(prev.chat);
        if (next === prev.chat) return prev;
        dirty.current.chat = true;
        writer.schedule();
        return { ...prev, chat: next.slice(-CHAT_CAP) };
      });
    },
    [writer],
  );

  const actions = useMemo<HealthActions>(() => {
    const patchDay = (d: ISODate, patch: Partial<DailyRecord>) =>
      mutateDays((days) => {
        const cur = days[d] ?? { d };
        const next = compact({ ...cur, ...patch, d });
        return { ...days, [d]: next };
      });

    const addMeal: HealthActions['addMeal'] = (d, meal) => {
      const full: Meal = { ...meal, id: meal.id ?? uid('m') };
      mutateDays((days) => {
        const cur = days[d] ?? { d };
        return { ...days, [d]: { ...cur, meals: [...(cur.meals ?? []), full] } };
      });
      return full;
    };

    const setSettings: HealthActions['setSettings'] = (update) =>
      mutateSettings((s) => (typeof update === 'function' ? update(s) : { ...s, ...update }));

    return {
      patchDay,
      addMeal,
      updateMeal: (d, id, patch) =>
        mutateDays((days) => {
          const cur = days[d];
          if (!cur?.meals) return days;
          const idx = cur.meals.findIndex((m) => m.id === id);
          if (idx < 0) return days;
          const meals = cur.meals.slice();
          meals[idx] = { ...meals[idx], ...patch, id };
          return { ...days, [d]: { ...cur, meals } };
        }),
      removeMeal: (d, id) =>
        mutateDays((days) => {
          const cur = days[d];
          if (!cur?.meals) return days;
          const meals = cur.meals.filter((m) => m.id !== id);
          if (meals.length === cur.meals.length) return days;
          return { ...days, [d]: { ...cur, meals } };
        }),
      repeatDay: (from, to) => {
        const src = stateRef.current.days[from]?.meals ?? [];
        if (!src.length) return 0;
        mutateDays((days) => {
          const cur = days[to] ?? { d: to };
          const copies = src.map((m) => ({ ...m, id: uid('m'), src: 'repeat' as const }));
          return { ...days, [to]: { ...cur, meals: [...(cur.meals ?? []), ...copies] } };
        });
        return src.length;
      },
      setWeight: (d, lb) => patchDay(d, { w: lb === null || !Number.isFinite(lb) ? undefined : round(lb, 1) }),
      adjustTobacco: (d, delta) =>
        mutateDays((days) => {
          const cur = days[d] ?? { d };
          const tob = Math.max(0, (cur.tob ?? 0) + delta);
          if (tob === (cur.tob ?? 0) && cur.tob !== undefined) return days;
          return { ...days, [d]: { ...cur, tob } };
        }),
      logCaffeine: (d, time: HHMM) =>
        mutateDays((days) => {
          const cur = days[d] ?? { d };
          return { ...days, [d]: { ...cur, caf: [...(cur.caf ?? []), time].sort() } };
        }),
      logBedtime: (d, time: HHMM) => patchDay(d, { bt: time }),
      setSettings,
      updateProfile: (patch: Partial<Profile>) => mutateSettings((s) => ({ ...s, profile: { ...s.profile, ...patch } })),
      updateTargets: (patch: Partial<Targets>) => mutateSettings((s) => ({ ...s, targets: { ...s.targets, ...patch } })),
      updateAI: (patch: Partial<AISettings>) => mutateSettings((s) => ({ ...s, ai: { ...s.ai, ...patch } })),
      toggleFavorite: (item: FoodItem) =>
        mutateSettings((s) => {
          const exists = s.favorites.some((f) => f.id === item.id);
          const favorites = exists ? s.favorites.filter((f) => f.id !== item.id) : [...s.favorites, { ...item, starred: true }];
          return { ...s, favorites };
        }),
      touchRecent: (item: FoodItem) =>
        mutateSettings((s) => {
          const today = todayISO();
          const rest = s.recents.filter((r) => r.id !== item.id);
          const prev = s.recents.find((r) => r.id === item.id);
          const recents = [{ ...item, lastUsed: today, useCount: (prev?.useCount ?? 0) + 1 }, ...rest].slice(0, 20);
          return { ...s, recents };
        }),
      appendChat: (msg) => mutateChat((c) => [...c, msg]),
      updateChat: (id, patch) =>
        mutateChat((c) => {
          const idx = c.findIndex((m) => m.id === id);
          if (idx < 0) return c;
          const next = c.slice();
          next[idx] = { ...next[idx], ...patch };
          return next;
        }),
      clearChat: () => mutateChat(() => []),
      importJSON: (json, mode): ImportResult => {
        const parsed = parseImport(json);
        if (!parsed.ok) return { ok: false, recordsImported: 0, settingsImported: false, chatImported: false, errors: parsed.errors };
        mutateDays((days) => {
          if (mode === 'replace') {
            // Months that vanish are detected by the shard diff and deleted on write.
            const next: Days = {};
            for (const r of parsed.days) next[r.d] = r;
            return next;
          }
          const next: Days = { ...days };
          for (const r of parsed.days) next[r.d] = { ...(next[r.d] ?? {}), ...r, d: r.d };
          return next;
        });
        if (parsed.settings) mutateSettings(() => parsed.settings as AppSettings);
        if (parsed.chat) mutateChat(() => parsed.chat as ChatMessage[]);
        return {
          ok: true,
          recordsImported: parsed.days.length,
          settingsImported: !!parsed.settings,
          chatImported: !!parsed.chat,
          errors: parsed.errors,
        };
      },
      exportJSON: () => {
        const s = stateRef.current;
        mutateSettings((st) => ({ ...st, lastExportAt: Date.now() }));
        return buildExportJSON(s.settings, s.days, s.chat);
      },
      exportCSV: () => buildCSV(sortRecords(stateRef.current.days)),
      loadDemoData: () => {
        const s = stateRef.current;
        const demo = generateDemoData(s.settings, todayISO());
        mutateDays((days) => {
          const next: Days = { ...days };
          for (const r of demo) next[r.d] = { ...(next[r.d] ?? {}), ...r, d: r.d };
          return next;
        });
        mutateSettings((st) => ({ ...st, demoLoaded: true, onboarded: true, whoop: { ...st.whoop, connected: true, source: 'manual', lastImportAt: Date.now() } }));
      },
      clearAllData: () => {
        // Don't cancel the writer: that would also detach the flush-on-hide
        // listeners for the rest of the session. A pending timer is harmless
        // (persist() no-ops when nothing is dirty).
        clearAllStorage();
        indexRef.current = { version: SCHEMA_VERSION, shards: {}, updatedAt: 0 };
        dirty.current = { months: new Set(), settings: false, chat: false };
        const fresh = initialState();
        setState(fresh.state);
      },
      flush: () => writer.flush(),
      checkIntegrity: (): IntegrityReport => {
        writer.flush();
        const report = checkIntegrityStorage();
        setState((prev) => ({ ...prev, storage: { ...prev.storage, integrity: report, bytesUsed: estimateBytesUsed() } }));
        return report;
      },
    };
  }, [mutateDays, mutateSettings, mutateChat, writer]);

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useHealth(): HealthContextValue {
  const ctx = useContext(HealthContext);
  if (!ctx) throw new Error('useHealth must be used inside <HealthStoreProvider>');
  return ctx;
}

/** All records sorted ascending by date (memoised on the days map identity). */
export function useRecords(): DailyRecord[] {
  const { state } = useHealth();
  return useMemo(() => sortRecords(state.days), [state.days]);
}

export function useDay(d: ISODate): DailyRecord | undefined {
  const { state } = useHealth();
  return state.days[d];
}

/** Current Date, re-rendering every `intervalMs` (default: once a minute). */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export { sortRecords };
