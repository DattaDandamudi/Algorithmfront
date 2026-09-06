/**
 * Health store — React context over the sharded localStorage layer.
 *
 * - State lives in memory; every change marks the affected month shards (and
 *   settings / chat) dirty and schedules a debounced write (500 ms, 2 s max).
 * - Derived fields kept in sync here so every consumer agrees:
 *     • daily totals (kc/p/f/c/fi) from itemised meals
 *     • EWMA trend weight `wt` (recomputed from the first weigh-in onward
 *       whenever any scale weight or the alpha changes; never stamped on a
 *       record dated after today — R7-13)
 * - Records are immutable; unchanged records keep their object identity so the
 *   dirty-shard diff is a cheap reference comparison.
 * - Durability (SPEC §10):
 *     • a failed write (quota) stays pending: the writer retries with back-off
 *       and flush()/hide/unload try again; dirty months are never dropped.
 *     • flush-on-hide listeners live in an effect so a StrictMode remount
 *       re-attaches them; the unmount cleanup flushes first.
 *     • multi-tab: a `storage` event for an hx:* key reloads that month /
 *       settings / chat from storage when this tab has no pending edits for it.
 *       If it does, ours are kept and written next — **last writer wins per
 *       month** (per-day merging is not attempted). The index is re-read from
 *       storage before every write so two tabs never diverge on it.
 *     • load-time problems are healed on the first save: index entries for
 *       missing shards are pruned, unreadable shards are moved to
 *       hx:corrupt:YYYY-MM, and the integrity report is refreshed afterwards.
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
  TrainingSettings,
  Workout,
  WorkoutImportResult,
} from './types';
import { mergeSettings } from './defaults';
import {
  CHAT_CAP,
  KEYS,
  QUOTA_BYTES,
  QUOTA_WARN_RATIO,
  StorageWriteError,
  attachFlushListeners,
  checkIntegrity as checkIntegrityStorage,
  clearAllStorage,
  createDebouncedWriter,
  discoverShardMonths,
  discoverWorkoutMonths,
  estimateBytesUsed,
  loadAll,
  pruneIndex,
  readChat,
  readIndex,
  readSettings,
  readShard,
  readWorkoutShard,
  shardMonthFromKey,
  workoutMonthFromKey,
  writeChat,
  writeIndex,
  writeSettings,
  writeShard,
  writeWorkoutShard,
  type ShardIndex,
} from './storage';
import { buildCSV, buildExportJSON, buildWorkoutsCSV, parseImport } from './export';
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
type Workouts = Record<string, Workout>;

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

/**
 * Apply EWMA trend to every record; preserves identity of unchanged records.
 * `through` (the store passes today) caps the trend at max(last weigh-in,
 * today): "Going to bed" writes tomorrow's bedtime before midnight, and that
 * future-dated stub must not be persisted / exported with a trend weight
 * (R7-13). A stale `wt` already on such a record is removed.
 *
 * TODO(phase-1a): also stamp the Kalman state — `kl` (level), `ks` (slope,
 * lb/day), `kv` (level variance) and `ws` (weigh-in rejected by the outlier
 * gate) — from `engine/kalman.computeKalmanTrend(records, through)`, under the
 * same `through` cap and the same identity-preserving rules. EWMA stays as it
 * is: it is kept for export continuity and the Log block line, while the
 * smoothed Kalman level becomes the drawn trend and the decision input.
 */
export function applyTrend(days: Days, alpha: number, through?: ISODate): Days {
  const records = Object.values(days);
  const trend = computeEwmaTrend(records, alpha, through);
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

/** Workouts oldest first, ties broken by start time then id so exports are stable. */
function sortWorkouts(workouts: Workouts): Workout[] {
  return Object.values(workouts).sort((a, b) => {
    if (a.d !== b.d) return a.d < b.d ? -1 : 1;
    if (a.start !== b.start) return a.start < b.start ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function changedMonths(prev: Days, next: Days): Set<string> {
  const months = new Set<string>();
  if (prev === next) return months;
  for (const k of Object.keys(prev)) if (prev[k] !== next[k]) months.add(yearMonthOf(k));
  for (const k of Object.keys(next)) if (!(k in prev)) months.add(yearMonthOf(k));
  return months;
}

/** Same diff for the workout family, keyed by workout id → the month it is dated in. */
function changedWorkoutMonths(prev: Workouts, next: Workouts): Set<string> {
  const months = new Set<string>();
  if (prev === next) return months;
  for (const id of Object.keys(prev)) {
    if (prev[id] !== next[id]) {
      months.add(yearMonthOf(prev[id].d));
      if (next[id]) months.add(yearMonthOf(next[id].d)); // a session moved between months
    }
  }
  for (const id of Object.keys(next)) if (!(id in prev)) months.add(yearMonthOf(next[id].d));
  return months;
}

/**
 * Load units for one session.
 *
 * Phase 0 only honours a stamped `load` or the Foster sRPE rule (session RPE ×
 * minutes). Phase 1e replaces this with `engine/load.sessionLoad`, which adds
 * Edwards/Banister TRIMP for cardio with heart-rate data and the fitted WHOOP
 * strain conversion. Kept here so the store never depends on the engine for a
 * value it must stamp at write time.
 */
export function workoutLoad(w: Workout): number | undefined {
  if (typeof w.load === 'number' && Number.isFinite(w.load)) return w.load;
  if (typeof w.srpe === 'number' && Number.isFinite(w.srpe) && w.durationMin > 0) {
    return Math.round(w.srpe * w.durationMin);
  }
  return undefined;
}

/**
 * Stamp the day's training-derived fields from the sessions logged on it:
 * `ld` (total load units), `wko` (session count) and `lift` (this was a lifting
 * day, whatever the split says). Train is the only writer of `lift` — the
 * nutrition engine reads it to pick lift-day vs rest-day carb targets, so a
 * session logged on a scheduled rest day moves the targets with it.
 *
 * Pure, and identity-preserving when nothing changed.
 */
export function withTrainingDerived(rec: DailyRecord, dayWorkouts: Workout[]): DailyRecord {
  let ld: number | undefined;
  for (const w of dayWorkouts) {
    const l = workoutLoad(w);
    if (l !== undefined) ld = (ld ?? 0) + l;
  }
  const wko = dayWorkouts.length || undefined;
  const lift = dayWorkouts.some((w) => w.kind === 'strength') ? true : undefined;
  // `lift` is only ever set true by a logged session; an explicit user override
  // of false is preserved (it is not ours to clear).
  const nextLift = lift ?? (rec.lift === false ? false : undefined);
  if (rec.ld === ld && rec.wko === wko && rec.lift === nextLift) return rec;
  const next: DailyRecord = { ...rec, ld, wko, lift: nextLift };
  if (ld === undefined) delete next.ld;
  if (wko === undefined) delete next.wko;
  if (nextLift === undefined) delete next.lift;
  return next;
}

/** 'HH:MM' → minutes since midnight, NaN when unparseable. */
function hhmmToMinutes(t: HHMM): number {
  const [h, m] = String(t).split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
}

/**
 * Two sessions are the same if they carry the same `externalId`, or if they
 * fall on the same day with the same kind and start within 10 minutes —
 * re-importing the same WHOOP export must not double a month of training.
 * Returns the session it collides with, so an import never overwrites what was
 * typed by hand.
 */
export function findDuplicateWorkout(candidate: Workout, existing: Workout[]): Workout | null {
  if (candidate.externalId) {
    const byId = existing.find((w) => w.externalId && w.externalId === candidate.externalId);
    if (byId) return byId;
  }
  const start = hhmmToMinutes(candidate.start);
  if (!Number.isFinite(start)) return null;
  return (
    existing.find((w) => {
      if (w.d !== candidate.d || w.kind !== candidate.kind) return false;
      const other = hhmmToMinutes(w.start);
      return Number.isFinite(other) && Math.abs(other - start) <= 10;
    }) ?? null
  );
}

/** Group workouts by their date. */
function workoutsByDay(workouts: Workouts): Map<ISODate, Workout[]> {
  const map = new Map<ISODate, Workout[]>();
  for (const w of Object.values(workouts)) {
    const list = map.get(w.d);
    if (list) list.push(w);
    else map.set(w.d, [w]);
  }
  return map;
}

/**
 * R4-2 / R4-6: the API key and proxy URL never travel in export files, so an
 * import must not wipe the ones stored in this browser — unless the file
 * explicitly carries its own (older exports did).
 */
function withLocalSecrets(incoming: AppSettings, current: AppSettings): AppSettings {
  const ai = compact({ ...incoming.ai, apiKey: incoming.ai.apiKey ?? current.ai.apiKey, proxyUrl: incoming.ai.proxyUrl ?? current.ai.proxyUrl });
  return { ...incoming, ai };
}

/** R4-6 merge: keep every local message, append file messages whose id is new, keep chronological order. */
function mergeChatById(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const seen = new Set(current.map((m) => m.id));
  const added: ChatMessage[] = [];
  for (const m of incoming) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    added.push(m);
  }
  if (!added.length) return current;
  return [...current, ...added].sort((a, b) => a.ts - b.ts);
}

interface Dirty {
  months: Set<string>;
  /** Workout shard months awaiting a write (the second shard family). */
  workoutMonths: Set<string>;
  settings: boolean;
  chat: boolean;
  /** Write the (pruned) index even when no month changed — used by the heal. */
  index: boolean;
}

const freshDirty = (): Dirty => ({ months: new Set(), workoutMonths: new Set(), settings: false, chat: false, index: false });

function initialState(): { state: HealthState; index: ShardIndex; corruptMonths: string[]; corruptWorkoutMonths: string[] } {
  const loaded = loadAll();
  const settings = mergeSettings(loaded.settings);
  const withTraining = applyTrainingDerived(loaded.days, loaded.workouts);
  const days = applyTrend(withTraining, settings.targets.ewmaAlpha, todayISO());
  const bytes = loaded.bytesUsed;
  const storage: StorageStatus = {
    ok: loaded.available,
    available: loaded.available,
    bytesUsed: bytes,
    quotaWarning: bytes > QUOTA_BYTES * QUOTA_WARN_RATIO,
    integrity: loaded.integrity,
    lastError: loaded.available ? undefined : 'localStorage is unavailable — data will not persist in this browser.',
  };
  return {
    state: { ready: true, settings, days, workouts: loaded.workouts, chat: loaded.chat.slice(-CHAT_CAP), storage },
    index: loaded.index,
    corruptMonths: loaded.corruptMonths,
    corruptWorkoutMonths: loaded.corruptWorkoutMonths,
  };
}

/**
 * Re-derive `ld`/`wko`/`lift` for every day that has sessions, and clear them
 * from days that no longer do. Identity-preserving.
 */
function applyTrainingDerived(days: Days, workouts: Workouts): Days {
  const byDay = workoutsByDay(workouts);
  const touched = new Set<ISODate>([...Object.keys(days), ...byDay.keys()]);
  let changed = false;
  const next: Days = { ...days };
  for (const d of touched) {
    const cur = days[d];
    const list = byDay.get(d) ?? [];
    if (!cur) {
      if (!list.length) continue;
      next[d] = withTrainingDerived({ d }, list);
      changed = true;
      continue;
    }
    const updated = withTrainingDerived(cur, list);
    if (updated !== cur) {
      next[d] = updated;
      changed = true;
    }
  }
  return changed ? next : days;
}

interface ReloadScope {
  months?: string[] | 'all';
  workoutMonths?: string[] | 'all';
  settings?: boolean;
  chat?: boolean;
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
  const dirty = useRef<Dirty>(freshDirty());
  const healPending = useRef(false);

  /** Write everything dirty. Returns false when any write failed (the writer then keeps it pending and retries). */
  const persist = useCallback((): boolean => {
    const s = stateRef.current;
    const d = dirty.current;
    if (!d.months.size && !d.workoutMonths.size && !d.settings && !d.chat && !d.index) return true;
    if (!s.storage.available) {
      d.months.clear();
      d.workoutMonths.clear();
      d.settings = false;
      d.chat = false;
      d.index = false;
      return true;
    }
    let lastError: string | undefined;
    const records = Object.values(s.days);
    const sessions = Object.values(s.workouts);
    // R4-1: start from the index as storage has it *now* (another tab may have
    // written months since our last write) so a stale in-memory copy can never
    // resurrect or drop entries; R4-5: entries without a shard are pruned.
    let index = pruneIndex(readIndex() ?? indexRef.current);
    let wroteMonth = false;
    try {
      for (const ym of Array.from(d.months)) {
        index = writeShard(ym, records, index);
        indexRef.current = index;
        d.months.delete(ym);
        wroteMonth = true;
      }
      for (const ym of Array.from(d.workoutMonths)) {
        index = writeWorkoutShard(ym, sessions, index);
        indexRef.current = index;
        d.workoutMonths.delete(ym);
        wroteMonth = true;
      }
      if (d.index) {
        if (!wroteMonth) {
          writeIndex(index);
          indexRef.current = index;
        }
        d.index = false;
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
    // R4-5: once the heal write has landed, re-validate so the warning clears (or lists what is still wrong).
    let integrity: IntegrityReport | undefined;
    if (!lastError && healPending.current) {
      healPending.current = false;
      integrity = checkIntegrityStorage();
    }
    setState((prev) => ({
      ...prev,
      storage: {
        ...prev.storage,
        ok: !lastError,
        bytesUsed: bytes,
        quotaWarning: bytes > QUOTA_BYTES * QUOTA_WARN_RATIO,
        lastError,
        lastSavedAt: lastError ? prev.storage.lastSavedAt : Date.now(),
        integrity: integrity ?? prev.storage.integrity,
      },
    }));
    return !lastError;
  }, []);

  // R4-4: the writer attaches no listeners of its own; they live in the effect
  // below so StrictMode's simulated unmount/remount re-attaches them, and a real
  // unmount flushes before detaching. The writer is never cancel()led — pending
  // work must survive until it is written.
  const writer = useMemo(() => createDebouncedWriter(persist, 500, 2000, { listeners: false }), [persist]);
  useEffect(() => {
    const detach = attachFlushListeners(() => writer.flush());
    return () => {
      writer.flush();
      detach();
    };
  }, [writer]);

  /**
   * R4-1: pull months / settings / chat back in from storage after another tab
   * wrote them. Anything this tab has pending edits for is left alone (last
   * writer wins per month). The trend is re-derived in memory only: a reload
   * must never mark anything dirty, or two tabs could ping-pong a month.
   */
  const reloadFromStorage = useCallback((scope: ReloadScope) => {
    setState((prev) => {
      const d = dirty.current;
      let days = prev.days;
      let workouts = prev.workouts;
      let settings = prev.settings;
      let chat = prev.chat;
      if (scope.workoutMonths) {
        const wanted =
          scope.workoutMonths === 'all'
            ? Array.from(new Set([...Object.values(prev.workouts).map((w) => yearMonthOf(w.d)), ...discoverWorkoutMonths()]))
            : scope.workoutMonths;
        const months = wanted.filter((ym) => !d.workoutMonths.has(ym));
        if (months.length) {
          const drop = new Set(months);
          const next: Workouts = {};
          for (const id of Object.keys(prev.workouts)) {
            if (!drop.has(yearMonthOf(prev.workouts[id].d))) next[id] = prev.workouts[id];
          }
          for (const ym of months) {
            const { shard } = readWorkoutShard(ym);
            if (!shard) continue;
            for (const w of Object.values(shard.items)) {
              if (w && typeof w === 'object' && typeof w.id === 'string' && typeof w.d === 'string') next[w.id] = w;
            }
          }
          workouts = next;
        }
      }
      if (scope.months) {
        const wanted = scope.months === 'all' ? Array.from(new Set([...Object.keys(prev.days).map(yearMonthOf), ...discoverShardMonths()])) : scope.months;
        const months = wanted.filter((ym) => !d.months.has(ym));
        if (months.length) {
          const drop = new Set(months);
          const next: Days = {};
          for (const k of Object.keys(prev.days)) if (!drop.has(yearMonthOf(k))) next[k] = prev.days[k];
          for (const ym of months) {
            const { shard } = readShard(ym);
            if (!shard) continue;
            for (const rec of Object.values(shard.days)) {
              if (rec && typeof rec === 'object' && typeof rec.d === 'string') next[rec.d] = rec;
            }
          }
          days = next;
        }
      }
      if (scope.settings && !d.settings) settings = mergeSettings(readSettings());
      if (scope.chat && !d.chat) chat = readChat().slice(-CHAT_CAP);
      if (days === prev.days && workouts === prev.workouts && settings === prev.settings && chat === prev.chat) return prev;
      if (workouts !== prev.workouts) days = applyTrainingDerived(days, workouts);
      days = applyTrend(days, settings.targets.ewmaAlpha, todayISO());
      const bytes = estimateBytesUsed();
      return { ...prev, days, workouts, settings, chat, storage: { ...prev.storage, bytesUsed: bytes, quotaWarning: bytes > QUOTA_BYTES * QUOTA_WARN_RATIO } };
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let area: Storage | null = null;
    try {
      area = window.localStorage;
    } catch {
      area = null;
    }
    const onStorage = (e: StorageEvent) => {
      // sessionStorage fires the same event name; only react to this origin's localStorage.
      if (e.storageArea && area && e.storageArea !== area) return;
      const key = e.key;
      if (key === null) {
        // storage.clear() in another tab.
        reloadFromStorage({ months: 'all', workoutMonths: 'all', settings: true, chat: true });
        return;
      }
      if (!key.startsWith(KEYS.prefix)) return;
      if (key === KEYS.index) {
        indexRef.current = readIndex() ?? indexRef.current;
        return;
      }
      if (key === KEYS.settings) {
        reloadFromStorage({ settings: true });
        return;
      }
      if (key === KEYS.chat) {
        reloadFromStorage({ chat: true });
        return;
      }
      const ym = shardMonthFromKey(key);
      if (ym) {
        reloadFromStorage({ months: [ym] });
        return;
      }
      // hx:wk:draft deliberately falls through: the live session is this tab's
      // scratch space, not shared state, and workoutMonthFromKey rejects it.
      const wkYm = workoutMonthFromKey(key);
      if (wkYm) reloadFromStorage({ workoutMonths: [wkYm] });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [reloadFromStorage]);

  // Self-heal (R4-5): when the load found problems, rewrite every month shard
  // we hold, empty out unreadable months (their raw text is kept under
  // hx:corrupt:YYYY-MM by writeShard), rewrite settings/chat/index once, and
  // refresh the integrity report after the write lands.
  useEffect(() => {
    const s = stateRef.current;
    if (!s.storage.available || !s.storage.integrity?.problems.length) return;
    const d = dirty.current;
    for (const day of Object.keys(s.days)) d.months.add(yearMonthOf(day));
    for (const ym of initial.corruptMonths) d.months.add(ym);
    for (const w of Object.values(s.workouts)) d.workoutMonths.add(yearMonthOf(w.d));
    for (const ym of initial.corruptWorkoutMonths) d.workoutMonths.add(ym);
    d.settings = true;
    d.chat = true;
    d.index = true;
    healPending.current = true;
    writer.schedule();
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
        const next = applyTrend(totalled, prev.settings.targets.ewmaAlpha, todayISO());
        const months = changedMonths(prev.days, next);
        if (!months.size) return prev;
        months.forEach((m) => dirty.current.months.add(m));
        writer.schedule();
        return { ...prev, days: next };
      });
    },
    [writer],
  );

  /**
   * Core workout mutation. Writes the workout family AND re-derives the
   * affected days' `ld`/`wko`/`lift`, so a saved session immediately moves the
   * day's targets and the training load series without a second round-trip.
   */
  const mutateWorkouts = useCallback(
    (fn: (workouts: Workouts) => Workouts) => {
      setState((prev) => {
        const next = fn(prev.workouts);
        if (next === prev.workouts) return prev;
        const months = changedWorkoutMonths(prev.workouts, next);
        if (!months.size) return prev;
        months.forEach((m) => dirty.current.workoutMonths.add(m));
        const derived = applyTrainingDerived(prev.days, next);
        const days = applyTrend(derived, prev.settings.targets.ewmaAlpha, todayISO());
        changedMonths(prev.days, days).forEach((m) => dirty.current.months.add(m));
        writer.schedule();
        return { ...prev, workouts: next, days };
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
          days = applyTrend(prev.days, nextSettings.targets.ewmaAlpha, todayISO());
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

    const addWorkout: HealthActions['addWorkout'] = (w) => {
      const full: Workout = { ...w, id: w.id ?? uid('w') } as Workout;
      const stamped = compact({ ...full, load: workoutLoad(full) });
      mutateWorkouts((ws) => ({ ...ws, [stamped.id]: stamped }));
      return stamped;
    };

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
      updateTargets: (patch: Partial<Targets>) =>
        mutateSettings((s) => {
          const targets = { ...s.targets, ...patch };
          // A calorie change starts the 14-day freeze on coarse intake advice,
          // so the coach cannot chase a target it just moved.
          if (patch.kcal !== undefined && patch.kcal !== s.targets.kcal) targets.lastKcalChangeAt = todayISO();
          return { ...s, targets };
        }),
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
        if (!parsed.ok) return { ok: false, recordsImported: 0, workoutsImported: 0, settingsImported: false, chatImported: false, errors: parsed.errors };
        const fileSettings = parsed.settings;
        const fileChat = parsed.chat;
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
        if (parsed.workouts.length || mode === 'replace') {
          mutateWorkouts((ws) => {
            if (mode === 'replace') {
              const next: Workouts = {};
              for (const w of parsed.workouts) next[w.id] = w;
              return next;
            }
            const next: Workouts = { ...ws };
            for (const w of parsed.workouts) next[w.id] = { ...(next[w.id] ?? {}), ...w, id: w.id };
            return next;
          });
        }
        if (mode === 'replace') {
          // R4-6: replace really replaces. Without a settings block the file
          // resets settings to defaults — keeping the local API key / proxy and
          // the onboarded flag (the user is clearly past onboarding) — and
          // without a chat block the coach history is cleared.
          mutateSettings((cur) => withLocalSecrets(fileSettings ?? { ...mergeSettings(null), onboarded: cur.onboarded }, cur));
          mutateChat((cur) => (fileChat ? fileChat : cur.length ? [] : cur));
        } else {
          if (fileSettings) mutateSettings((cur) => withLocalSecrets(fileSettings, cur));
          if (fileChat?.length) mutateChat((cur) => mergeChatById(cur, fileChat));
        }
        return {
          ok: true,
          recordsImported: parsed.days.length,
          workoutsImported: parsed.workouts.length,
          settingsImported: !!fileSettings,
          chatImported: !!fileChat,
          errors: parsed.errors,
        };
      },
      exportJSON: () => {
        const s = stateRef.current;
        mutateSettings((st) => ({ ...st, lastExportAt: Date.now() }));
        return buildExportJSON(s.settings, s.days, s.chat, s.workouts);
      },
      exportCSV: () => buildCSV(sortRecords(stateRef.current.days)),
      exportWorkoutsCSV: () => buildWorkoutsCSV(sortWorkouts(stateRef.current.workouts)),

      // -- training ---------------------------------------------------------
      addWorkout,
      updateWorkout: (id, patch) =>
        mutateWorkouts((ws) => {
          const cur = ws[id];
          if (!cur) return ws;
          const merged = { ...cur, ...patch, id } as Workout;
          return { ...ws, [id]: compact({ ...merged, load: workoutLoad(merged) }) };
        }),
      removeWorkout: (id) =>
        mutateWorkouts((ws) => {
          if (!ws[id]) return ws;
          const next = { ...ws };
          delete next[id];
          return next;
        }),
      finishWorkout: (id, done) =>
        mutateWorkouts((ws) => {
          const cur = ws[id];
          if (!cur) return ws;
          const merged: Workout = {
            ...cur,
            id,
            durationMin: Math.max(0, Math.round(done.durationMin)),
            srpe: done.srpe ?? cur.srpe,
          };
          // Stamp the load now so history never shifts when the engine's load
          // model is retuned later.
          return { ...ws, [id]: compact({ ...merged, load: workoutLoad(merged) }) };
        }),
      importWorkouts: (items): WorkoutImportResult => {
        const existing = Object.values(stateRef.current.workouts);
        const errors: string[] = [];
        const accepted: Workout[] = [];
        const pool = [...existing];
        for (const raw of items) {
          if (!raw || typeof raw.d !== 'string' || typeof raw.start !== 'string') {
            errors.push('A session was skipped: missing date or start time.');
            continue;
          }
          const w: Workout = { ...raw, id: raw.id || uid('w') };
          if (findDuplicateWorkout(w, pool)) continue;
          const stamped = compact({ ...w, load: workoutLoad(w) });
          accepted.push(stamped);
          pool.push(stamped);
        }
        if (accepted.length) {
          mutateWorkouts((ws) => {
            const next: Workouts = { ...ws };
            for (const w of accepted) next[w.id] = w;
            return next;
          });
        }
        return { added: accepted.length, skipped: items.length - accepted.length - errors.length, errors };
      },
      updateTraining: (patch: Partial<TrainingSettings>) =>
        mutateSettings((s) => ({ ...s, training: { ...s.training, ...patch } })),

      // -- stress -----------------------------------------------------------
      saveCheckIn: (d, values) =>
        mutateDays((days) => {
          const cur = days[d] ?? { d };
          const next = compact({ ...cur, ...values, d });
          return { ...days, [d]: next };
        }),
      recordInsightsShown: (d, ids) =>
        mutateSettings((s) => {
          const history = s.insightHistory ?? {};
          const existing = history[d];
          if (existing && existing.length === ids.length && existing.every((v, i) => v === ids[i])) return s;
          // Keep 14 days; the decaying-priority rule never looks further back.
          const next: Record<ISODate, string[]> = { ...history, [d]: ids };
          const keep = Object.keys(next).sort().slice(-14);
          const trimmed: Record<ISODate, string[]> = {};
          for (const k of keep) trimmed[k] = next[k];
          return { ...s, insightHistory: trimmed };
        }),
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
        // The writer is left alone: a pending timer is harmless (persist()
        // no-ops when nothing is dirty) and the flush listeners stay attached.
        clearAllStorage();
        dirty.current = freshDirty();
        healPending.current = false;
        const fresh = initialState();
        indexRef.current = fresh.index;
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
  }, [mutateDays, mutateWorkouts, mutateSettings, mutateChat, writer]);

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

/** All workouts oldest first (memoised on the workouts map identity). */
export function useWorkouts(): Workout[] {
  const { state } = useHealth();
  return useMemo(() => sortWorkouts(state.workouts), [state.workouts]);
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

export { sortRecords, sortWorkouts };
