/**
 * Log — SPEC §2 "logging must take seconds". Section order (top → bottom):
 *  1. pinned natural-language AI bar (sticky header) → editable EstimateSheet
 *  2. fast paths: Repeat yesterday → Recents → Favorites → Barcode → Photo
 *  3. today's meals grouped by time + running totals vs targets
 *  4. weight   5. tobacco   6. bedtime   7. caffeine + water
 *
 * This file owns state and every store write; the pieces under ./log are
 * presentational. Numbers come from the store through the engine context
 * (`buildCoachContext`), memoised per minute (`useNow()`) and per data change
 * — never rebuilt on a keystroke. Nothing is written until the user taps
 * Save / +1 / a food card (§2 "every AI estimate is editable before save").
 *
 * Two "days" (R7-1):
 *  - `today`   the calendar date — weight, tobacco, water and caffeine live here.
 *  - `mealDay` the eating day (`eatingDayOf`): before 04:00 it is the previous
 *    date, matching the engine's late-eating rule and `mealClockMinutes`, so a
 *    00:20 supper is charged to the day it ended. Everything meal-related
 *    (list, header totals, add/edit/delete, "Repeat yesterday") uses it; the
 *    Today screen and the engine keep their calendar-day context unchanged.
 *
 * One EstimateSheet serves five flows so "edit" looks like "log":
 *  - 'ai'      text bar result (N items, clarify row, source note)
 *  - 'portion' a favourite / recent with a grams stepper
 *  - 'barcode' a packaged food from Open Food Facts (ai/barcode.ts)
 *  - 'photo'   Claude's read of a photo (ai/foodImage.ts) with a mandatory grams confirm
 *  - 'edit'    an existing entry (plus Delete)
 * Barcode and Photo first open their own secondary sheet (code / camera);
 * the result closes it and opens the EstimateSheet (nested sheets are not
 * supported, so it is a hand-off, not a stack). The sheet captures the day it
 * was opened for (`date`), so a save after midnight still lands there (R7-2).
 *
 * Deep links: `useNav().logSection` scrolls the matching section into view,
 * focuses its field ('meal' → the AI bar, 'weight' → the weight input) and
 * flashes a ring, then is consumed so the next visit starts at the top.
 */
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AISettings, FoodEstimate, FoodEstimateItem, FoodItem, HHMM, ISODate, Meal, MealSource } from '../data/types';
import { useHealth, useNow, useRecords } from '../data/store';
import { buildCoachContext, mealOccasions } from '../engine';
import { createClient, type AnthropicClient } from '../ai/client';
import { isAIConfigured } from '../ai/config';
import { estimateFood } from '../ai/food';
import { estimateFoodFromImage } from '../ai/foodImage';
import { foodItemToEstimate, itemToMeal } from '../ai/foodLocal';
import { addDays, formatClock, formatDateShort, nowHHMM, parseISODate, toISODate } from '../lib/dates';
import { fmt, fmtWeight } from '../lib/format';
import { toast } from '../ui';
import { useNav, type LogSection } from '../nav';
import AIBar from './log/AIBar';
import { CLIENT_LOAD_FALLBACK, describeClientError, photoAINote, type AIStatus } from './log/aiStatus';
import BarcodeSheet from './log/BarcodeSheet';
import BedtimeCard from './log/BedtimeCard';
import EstimateSheet from './log/EstimateSheet';
import FastPaths from './log/FastPaths';
import HydrationCard from './log/HydrationCard';
import MealsList from './log/MealsList';
import PhotoSheet from './log/PhotoSheet';
import TobaccoCard from './log/TobaccoCard';
import WeightCard from './log/WeightCard';
import {
  BARCODE_NOTE,
  ESTIMATE_MEAL_SRC,
  PHOTO_NOTE,
  appendClarification,
  appendNote,
  bedtimeRecordDate,
  eatingDayCaption,
  eatingDayOf,
  estimateNote,
  estimateOrigin,
  foodItemFromEstimate,
  isAfterCutoff,
  mealToEstimateItem,
  tobaccoStamp,
  withoutOne,
} from './log/logUtils';

// ---------------------------------------------------------------------------
// Sheet state
// ---------------------------------------------------------------------------

type SheetKind = 'ai' | 'portion' | 'edit' | 'barcode' | 'photo';
/** The secondary (code / camera) sheets that precede the estimate sheet. */
type Secondary = 'barcode' | 'photo' | null;

interface SheetState {
  open: boolean;
  kind: SheetKind;
  title: string;
  /** Stable identity while open — a new array resets the sheet's draft. */
  items: FoodEstimateItem[];
  time: HHMM;
  /**
   * The eating day the sheet was opened for. Captured at open so a sheet that
   * straddles midnight (or the 04:00 rollover) still saves, edits or deletes
   * on the day the user was looking at (R7-2). Unused while closed.
   */
  date: ISODate;
  clarify: string | null;
  note: string | null;
  src: MealSource;
  /** 'ai': the description sent, so a clarification can be appended and re-estimated. */
  text?: string;
  /** 'portion': the library item to bump in Recents on save. */
  libItem?: FoodItem;
  /** 'edit': the entry being edited. */
  meal?: Meal;
  /** 'photo': the capture and hint, so a clarification can re-run with a fuller hint. */
  photo?: { file: File; hint: string };
}

const CLOSED: SheetState = { open: false, kind: 'ai', title: '', items: [], time: '12:00', date: '', clarify: null, note: null, src: 'manual' };

/** Copy for a text-bar submit the parser could not turn into food. */
const NO_FOOD_QUESTION = 'Could not find a food in that — add a dish name and an amount, e.g. "250 g biryani".';
/** Copy when Claude saw no food in the photo and asked nothing. */
const NO_FOOD_IN_PHOTO = 'No food recognised in that photo — try a closer shot of the plate, or type it.';
/** Toast when an edit/delete finds its entry already gone (the store would silently no-op). */
const ENTRY_GONE = 'That entry was already removed — nothing changed';

/** How long a deep-linked section keeps its highlight ring. */
const FLASH_MS = 1600;
/** Delay before focusing after a sheet closes (its focus-return runs first). */
const FOCUS_AFTER_SHEET_MS = 80;
/**
 * How long Estimate / Photo wait for the lazily imported SDK before the local
 * parser is offered anyway (R7-3): long enough for a normal chunk download,
 * short enough that a slow link never blocks logging.
 */
const AI_LOAD_WAIT_MS = 3000;

/** Wall-clock HH:MM at the moment of a tap — stamps should not be up to 59 s stale. */
const clockNow = (): HHMM => nowHHMM(new Date());
/** The eating day at the moment a sheet opens / a quick-add lands (pairs with `clockNow`, R7-1/R7-2). */
const mealDayNow = (): ISODate => eatingDayOf(new Date());

// ---------------------------------------------------------------------------
// Lazy AI client (R7-3)
// ---------------------------------------------------------------------------

type ClientStatus = 'none' | 'loading' | 'ready' | 'error';

/**
 * The client for one AISettings object. Keyed by the settings identity so a
 * settings change drops the old client in the same render — the old key is
 * never used with the new settings while the new client loads.
 */
interface ClientSlot {
  ai: AISettings;
  status: ClientStatus;
  client: AnthropicClient | null;
  /** Readable reason when `status === 'error'` (describeClientError). */
  error: string | null;
}

const freshSlot = (ai: AISettings): ClientSlot => ({ ai, status: isAIConfigured(ai) ? 'loading' : 'none', client: null, error: null });

/** Settings objects whose failed load was already toasted — the Log remounts on every tab visit and retries; one warning per configuration is enough. */
const loadErrorToasted = new WeakSet<AISettings>();

// ---------------------------------------------------------------------------

export default function Log() {
  const { state, actions } = useHealth();
  const records = useRecords();
  const wall = useNow();
  const { logSection, consumeLogSection, openSettings } = useNav();

  // A Date whose identity changes once a minute so it can key the context memo.
  const today = toISODate(wall);
  const hh = wall.getHours();
  const mm = wall.getMinutes();
  const now = useMemo(() => {
    const d = parseISODate(today);
    d.setHours(hh, mm, 0, 0);
    return d;
  }, [today, hh, mm]);
  // Eating day for everything meal-related (see the header comment); equals `today` from 04:00.
  const mealDay = eatingDayOf(wall);

  const settings = state.settings;
  const profile = settings.profile;
  const ctx = useMemo(() => buildCoachContext({ records, settings, today, now }), [records, settings, today, now]);
  // Between midnight and 04:00 the meal numbers (totals, remaining, day type)
  // belong to the previous day's record, so build that day's context too.
  const mealCtx = useMemo(() => (mealDay === today ? ctx : buildCoachContext({ records, settings, today: mealDay, now })), [ctx, mealDay, records, settings, today, now]);

  const yesterday = addDays(mealDay, -1);
  // Calendar-day record: weight, tobacco, water, caffeine and the tobacco note stamps.
  const todayRecord = state.days[today];
  const yesterdayMeals = state.days[yesterday]?.meals ?? [];
  const mealDayMeals = state.days[mealDay]?.meals ?? [];
  const bedTarget = bedtimeRecordDate(now);
  const bedTargetRecord = state.days[bedTarget];

  const library = useMemo(() => [...settings.favorites, ...settings.recents], [settings.favorites, settings.recents]);
  const aiConfigured = isAIConfigured(settings.ai);

  // The SDK is loaded lazily whenever a key/proxy is configured. `slot` is the
  // last resolved load; when settings change it is stale until the effect
  // below resolves, so the derived `clientSlot` starts from a fresh 'loading'.
  const [slot, setSlot] = useState<ClientSlot>(() => freshSlot(settings.ai));
  const clientSlot = slot.ai === settings.ai ? slot : freshSlot(settings.ai);
  useEffect(() => {
    const ai = settings.ai;
    if (!isAIConfigured(ai)) return;
    let alive = true;
    createClient(ai)
      .then((c) => {
        if (alive) setSlot({ ai, status: c ? 'ready' : 'none', client: c, error: null });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const error = describeClientError(e);
        setSlot({ ai, status: 'error', client: null, error });
        if (!loadErrorToasted.has(ai)) {
          loadErrorToasted.add(ai);
          toast(`AI unavailable — ${error}. Meals still log with the local estimate.`, 'warn');
        }
      });
    return () => {
      alive = false;
    };
  }, [settings.ai]);
  const client = clientSlot.client;
  const clientStatus = clientSlot.status;
  const clientError = clientSlot.error;

  // After AI_LOAD_WAIT_MS of loading, stop blocking the buttons — the local parser answers meanwhile.
  const [slowLoad, setSlowLoad] = useState(false);
  useEffect(() => {
    if (clientStatus !== 'loading') {
      setSlowLoad(false);
      return;
    }
    const id = window.setTimeout(() => setSlowLoad(true), AI_LOAD_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [clientStatus, settings.ai]);
  const aiStatus: AIStatus = clientStatus === 'loading' && slowLoad ? 'slow' : clientStatus;
  /** Why a configured key still has no client right now — for the estimate note and toast. */
  const noClientReason = clientStatus === 'error' ? (clientError ?? CLIENT_LOAD_FALLBACK) : 'the AI module is still loading';

  // --- AI bar + sheet ---------------------------------------------------------
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(CLOSED);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const onTextChange = (t: string) => {
    setText(t);
    if (question) setQuestion(null);
  };

  const closeSheet = useCallback(() => setSheet((s) => (s.open ? { ...s, open: false } : s)), []);

  /**
   * Estimate `description` and open (or refresh) the AI sheet. `keepTime`
   * carries the sheet's initial time through a clarification round-trip so
   * the user's own time pick is not reset.
   */
  const runEstimate = useCallback(
    async (description: string, keepTime?: HHMM) => {
      setBusy(true);
      setQuestion(null);
      try {
        const est = await estimateFood(description, settings.ai, profile, library, { client });
        let origin = estimateOrigin(est);
        let fallbackReason = est.fallbackReason ?? null;
        if (origin === 'local' && aiConfigured) {
          // A key exists but no client could be used (still loading, or the SDK
          // failed to load): say so — never "connect an AI key" (R7-3).
          origin = 'ai-fallback';
          fallbackReason = noClientReason;
        }
        if (fallbackReason && alive.current) toast(`AI unavailable — ${fallbackReason}. Showing the local estimate.`, 'warn');
        if (!alive.current) return;
        if (est.items.length === 0) {
          const q = est.clarify ?? NO_FOOD_QUESTION;
          // Inside a clarification round-trip keep the sheet and ask there; otherwise ask under the bar.
          setSheet((s) => (s.open ? { ...s, clarify: q } : s));
          if (!keepTime) setQuestion(q);
          return;
        }
        setSheet((s) => ({
          open: true,
          kind: 'ai',
          title: est.items.length > 1 ? `Check ${est.items.length} items` : 'Check the estimate',
          items: est.items,
          // The AI bar's time is the real clock; the day is the eating day (a clarification keeps both).
          time: keepTime ?? clockNow(),
          date: keepTime && s.open ? s.date : mealDayNow(),
          clarify: est.clarify,
          note: estimateNote(origin),
          src: ESTIMATE_MEAL_SRC,
          text: description,
        }));
      } catch {
        if (alive.current) toast('Estimate failed — try again or type the label values', 'error');
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [settings.ai, profile, library, client, aiConfigured, noClientReason],
  );

  // --- Barcode / Photo (secondary sheets → estimate sheet) --------------------
  const [secondary, setSecondary] = useState<Secondary>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const closeSecondary = useCallback(() => {
    setSecondary(null);
    setPhotoError(null);
  }, []);

  const onBarcodeResult = (est: FoodEstimate, code: string) => {
    setSecondary(null);
    setSheet({
      open: true,
      kind: 'barcode',
      title: est.items[0]?.name ?? `Barcode ${code}`,
      items: est.items,
      time: clockNow(),
      date: mealDayNow(),
      clarify: null,
      note: BARCODE_NOTE,
      src: 'barcode',
    });
  };

  /**
   * Estimate a photo and open the sheet with a mandatory grams confirm.
   * `keepTime` marks a clarification round-trip (the sheet is already open):
   * an empty result then asks there, and errors go to a toast.
   */
  const runPhoto = useCallback(
    async (file: File, hint: string, keepTime?: HHMM) => {
      if (!client) {
        // The PhotoSheet hides the camera without a key and holds it while the
        // client loads / after a failed load (R7-3); this is the safety net.
        setPhotoError(photoAINote(aiStatus, clientError) ?? 'Add an AI key in Settings to estimate from photos.');
        return;
      }
      setPhotoBusy(true);
      setPhotoError(null);
      try {
        const est = await estimateFoodFromImage(file, settings.ai, profile, client, hint);
        if (!alive.current) return;
        if (est.items.length === 0) {
          const q = est.clarify ?? NO_FOOD_IN_PHOTO;
          if (keepTime) setSheet((s) => (s.open ? { ...s, clarify: q } : s));
          else setPhotoError(q);
          return;
        }
        setSecondary(null);
        setSheet((s) => ({
          open: true,
          kind: 'photo',
          title: est.items.length > 1 ? `Confirm ${est.items.length} items` : 'Confirm the photo estimate',
          items: est.items,
          time: keepTime ?? clockNow(),
          date: keepTime && s.open ? s.date : mealDayNow(),
          clarify: est.clarify,
          note: PHOTO_NOTE,
          src: 'photo',
          photo: { file, hint },
        }));
      } catch (e) {
        if (!alive.current) return;
        const msg = e instanceof Error && e.message ? e.message : 'Photo estimate failed — try again or type it';
        if (keepTime) toast(msg, 'error');
        else setPhotoError(msg);
      } finally {
        if (alive.current) setPhotoBusy(false);
      }
    },
    [client, aiStatus, clientError, settings.ai, profile],
  );

  const onClarify = (answer: string) => {
    if (sheet.kind === 'photo' && sheet.photo) {
      void runPhoto(sheet.photo.file, appendClarification(sheet.photo.hint, answer).trim(), sheet.time);
      return;
    }
    if (!sheet.text) return;
    void runEstimate(appendClarification(sheet.text, answer), sheet.time);
  };

  /** The store's updateMeal/removeMeal no-op silently when the entry is gone; check first so toasts mean a write happened. */
  const hasMeal = (date: ISODate, id: string) => (state.days[date]?.meals ?? []).some((m) => m.id === id);

  const onSheetSave = (items: FoodEstimateItem[], time: HHMM) => {
    const date = sheet.date;
    if (sheet.kind === 'edit' && sheet.meal) {
      const it = items[0];
      if (!it) return;
      if (!hasMeal(date, sheet.meal.id)) {
        toast(ENTRY_GONE, 'warn');
      } else {
        actions.updateMeal(date, sheet.meal.id, itemToMeal(it, time, sheet.meal.src ?? 'manual'));
        toast(`Updated ${it.name} · ${formatClock(time)}`);
      }
    } else {
      let kc = 0;
      let p = 0;
      for (const it of items) {
        actions.addMeal(date, itemToMeal(it, time, sheet.src));
        // Bump Recents so the dish is one tap away next time — the library
        // item itself for a portion save, else the matching/synthesised food.
        actions.touchRecent(sheet.kind === 'portion' && sheet.libItem ? sheet.libItem : foodItemFromEstimate(it, library));
        kc += it.kcal;
        p += it.protein_g;
      }
      const what = items.length === 1 ? items[0].name : `${items.length} items`;
      const where = date === mealDay ? '' : ` · ${formatDateShort(date)}`;
      toast(`Saved ${what} · ${fmt(kc)} kcal · ${fmt(p)} g P${where}`);
      if (sheet.kind === 'ai') setText('');
    }
    closeSheet();
  };

  const onSheetDelete = () => {
    if (sheet.kind === 'edit' && sheet.meal) {
      if (hasMeal(sheet.date, sheet.meal.id)) {
        actions.removeMeal(sheet.date, sheet.meal.id);
        toast(`Deleted ${sheet.meal.n}`);
      } else {
        toast(ENTRY_GONE, 'warn');
      }
    }
    closeSheet();
  };

  const focusBar = useCallback((delay = 0) => {
    window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      inputRef.current?.focus({ preventScroll: true });
    }, delay);
  }, []);

  // --- Fast paths -------------------------------------------------------------
  const repeatYesterday = () => {
    // "Yesterday" is the eating day before the current one: at 00:20 on 7 Sep
    // that copies 5 Sep onto 6 Sep, not 6 Sep onto 7 Sep.
    const occ = mealOccasions(yesterdayMeals).length;
    const n = actions.repeatDay(yesterday, mealDay);
    if (!n) {
      toast('Nothing logged yesterday', 'warn');
      return;
    }
    const meals = `${occ} ${occ === 1 ? 'meal' : 'meals'}`;
    toast(occ === n ? `Copied ${meals} from yesterday` : `Copied ${meals} (${n} items) from yesterday`);
  };

  const portionOf = (item: FoodItem) => (item.defaultGrams > 0 ? item.defaultGrams : 100);

  const quickAdd = (item: FoodItem, src: 'recent' | 'favorite') => {
    const est = foodItemToEstimate(item, portionOf(item));
    actions.addMeal(mealDayNow(), itemToMeal(est, clockNow(), src));
    actions.touchRecent(item);
    toast(`Added ${item.name} · ${fmt(est.kcal)} kcal · ${fmt(est.protein_g)} g P`);
  };

  const openPortion = (item: FoodItem, src: 'recent' | 'favorite') =>
    setSheet({
      open: true,
      kind: 'portion',
      title: item.name,
      items: [foodItemToEstimate(item, portionOf(item))],
      time: clockNow(),
      date: mealDayNow(),
      clarify: null,
      note: null,
      src,
      libItem: item,
    });

  const toggleFavorite = (item: FoodItem) => {
    const was = settings.favorites.some((f) => f.id === item.id);
    actions.toggleFavorite(item);
    toast(was ? `Removed ${item.name} from favorites` : `Starred ${item.name}`);
  };

  // --- Meals list -------------------------------------------------------------
  const editMeal = (m: Meal) =>
    setSheet({
      open: true,
      kind: 'edit',
      title: 'Edit entry',
      items: [mealToEstimateItem(m)],
      time: m.t,
      // The list shows `mealDay`'s meals, so that is where this entry lives.
      date: mealDay,
      clarify: null,
      note: null,
      src: m.src ?? 'manual',
      meal: m,
    });

  const deleteMeal = (m: Meal) => {
    if (!hasMeal(mealDay, m.id)) {
      toast(ENTRY_GONE, 'warn');
      return;
    }
    actions.removeMeal(mealDay, m.id);
    toast(`Deleted ${m.n}`);
  };

  // --- Weight / tobacco / bedtime / caffeine / water (calendar day) -----------
  const saveWeight = (lb: number) => {
    actions.setWeight(today, lb);
    toast(`Weight saved · ${fmtWeight(lb, profile.units)}`);
  };

  const adjustTobacco = (delta: number, stamp: boolean) => {
    if (delta === 0) return;
    actions.adjustTobacco(today, delta);
    const t = clockNow();
    if (stamp && delta > 0) actions.patchDay(today, { note: appendNote(todayRecord?.note, tobaccoStamp(t)) });
    const next = Math.max(0, (todayRecord?.tob ?? 0) + delta);
    toast(delta > 0 ? `+${delta} tobacco · ${next} today${stamp ? ` · noted ${formatClock(t)}` : ''}` : `Tobacco set to ${next} today`);
  };

  const smokeFree = () => {
    actions.adjustTobacco(today, 0);
    toast('Marked today smoke-free');
  };

  const goingToBed = () => {
    // Read the clock at the tap so the stamp and the target night agree
    // (bedtimeRecordDate: before 04:00 → previous calendar day's night).
    const at = new Date();
    const t = nowHHMM(at);
    actions.logBedtime(bedtimeRecordDate(at), t);
    toast(`Bedtime logged · ${formatClock(t)}`);
  };

  const undoBedtime = () => {
    actions.patchDay(bedTarget, { bt: undefined });
    toast('Bedtime cleared');
  };

  /** `picked` is the user's time from the card, or null for the wall clock at the tap (R1-15). */
  const logCaffeine = (picked: HHMM | null) => {
    const t = picked ?? clockNow();
    actions.logCaffeine(today, t);
    if (isAfterCutoff(t, profile.caffeineCutoff)) toast(`Caffeine at ${formatClock(t)} — after your ${formatClock(profile.caffeineCutoff)} cutoff`, 'warn');
    else toast(`Caffeine logged · ${formatClock(t)}`);
  };

  const removeCaffeine = (t: string) => {
    const next = withoutOne(todayRecord?.caf ?? [], t);
    actions.patchDay(today, { caf: next.length ? next : undefined });
  };

  const setWater = (cups: number) => actions.patchDay(today, { h2o: cups > 0 ? cups : undefined });

  // --- Deep links -------------------------------------------------------------
  const weightRef = useRef<HTMLDivElement>(null);
  const tobaccoRef = useRef<HTMLDivElement>(null);
  const bedtimeRef = useRef<HTMLDivElement>(null);
  /** Caffeine and water share one card, so both deep links land here. */
  const hydrationRef = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState<LogSection | null>(null);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!logSection) return;
    const section = logSection;
    consumeLogSection();
    // 'checkin' has no card yet: Phase 2g adds screens/log/CheckInSection.tsx, its
    // ref goes in this map and it drops out of the Exclude.
    const targets: Record<Exclude<LogSection, 'meal' | 'checkin'>, RefObject<HTMLDivElement>> = {
      weight: weightRef,
      tobacco: tobaccoRef,
      bedtime: bedtimeRef,
      caffeine: hydrationRef,
      water: hydrationRef,
    };
    // The section elements exist after this commit; wait a frame so the
    // shell's mount animation has started before measuring.
    requestAnimationFrame(() => {
      if (section === 'meal') {
        focusBar();
      } else if (section !== 'checkin') {
        const el = targets[section].current;
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (section === 'weight') {
          // "open the weight field": the Stepper's text input is the first input in the card.
          const input = el.querySelector<HTMLInputElement>('input');
          input?.focus({ preventScroll: true });
          input?.select();
        }
      }
      setFlash(section);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), FLASH_MS);
    });
  }, [logSection, consumeLogSection, focusBar]);
  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const flashCls = (...sections: LogSection[]) =>
    `rounded-2xl transition-shadow duration-300 ${flash && sections.includes(flash) ? 'ring-2 ring-hx-blue/70 ring-offset-4 ring-offset-hx-base' : ''}`;

  // --- Header numbers (protein-first, §1) — the eating day's remaining -------
  const rem = mealCtx.nutrition.remaining;
  const proteinLeft = rem.p > 0 ? `${fmt(rem.p)} g protein left` : 'Protein target hit';
  const kcalLeft = rem.kc >= 0 ? `${fmt(rem.kc)} kcal left` : `${fmt(-rem.kc)} kcal over`;

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-20 bg-hx-base/95 backdrop-blur border-b border-hx-border px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-[22px] leading-7 font-semibold text-hx-text">Log</h1>
          <p className="text-[12px] leading-4 text-hx-text2 text-right">
            {formatDateShort(mealDay)} · <span className="text-hx-text font-semibold">{proteinLeft}</span> · {kcalLeft}
          </p>
        </div>
        {mealDay !== today && (
          <p className="text-[11px] leading-4 text-hx-yellow" role="status">
            {eatingDayCaption(mealDay)}
          </p>
        )}
        <AIBar inputRef={inputRef} value={text} onChange={onTextChange} busy={busy} aiStatus={aiStatus} aiError={clientError} question={question} onSubmit={(t) => void runEstimate(t)} />
      </header>

      <section className="px-4 py-5" aria-label="Fast paths">
        <FastPaths
          yesterdayMeals={yesterdayMeals}
          recents={settings.recents.slice(0, 20)}
          favorites={settings.favorites}
          onRepeatYesterday={repeatYesterday}
          onQuickAdd={quickAdd}
          onPortion={openPortion}
          onToggleFavorite={toggleFavorite}
          onBarcode={() => setSecondary('barcode')}
          onPhoto={() => setSecondary('photo')}
        />
      </section>

      <section className="px-4 pb-5" aria-label="Today's meals">
        <MealsList meals={mealDayMeals} totals={mealCtx.nutrition.totals} targets={mealCtx.nutrition.targets} onEdit={editMeal} onDelete={deleteMeal} onLogFirst={() => focusBar()} />
      </section>

      <section ref={weightRef} className="px-4 pb-5 scroll-mt-36" aria-label="Weight">
        <div className={flashCls('weight')}>
          <WeightCard ctx={ctx} records={records} today={today} todayRecord={todayRecord} profile={profile} onSave={saveWeight} />
        </div>
      </section>

      <section ref={tobaccoRef} className="px-4 pb-5 scroll-mt-36" aria-label="Tobacco">
        <div className={flashCls('tobacco')}>
          <TobaccoCard ctx={ctx} todayRecord={todayRecord} onAdjust={adjustTobacco} onSmokeFree={smokeFree} />
        </div>
      </section>

      <section ref={bedtimeRef} className="px-4 pb-5 scroll-mt-36" aria-label="Bedtime">
        <div className={flashCls('bedtime')}>
          <BedtimeCard
            ctx={ctx}
            now={now}
            profile={profile}
            targetDate={bedTarget}
            targetRecord={bedTargetRecord}
            todayRecord={todayRecord}
            onGoingToBed={goingToBed}
            onUndo={undoBedtime}
          />
        </div>
      </section>

      <section ref={hydrationRef} className="px-4 pb-5 scroll-mt-36" aria-label="Caffeine and water">
        <div className={flashCls('caffeine', 'water')}>
          <HydrationCard
            ctx={ctx}
            todayRecord={todayRecord}
            profile={profile}
            nowHHMM={ctx.nowHHMM}
            onCaffeine={logCaffeine}
            onRemoveCaffeine={removeCaffeine}
            onWater={setWater}
          />
        </div>
      </section>

      <footer className="px-4 pt-1 pb-2 text-center">
        <p className="text-[11px] leading-4 text-hx-muted">Wellness information only — not medical advice.</p>
      </footer>

      <BarcodeSheet
        open={secondary === 'barcode'}
        onClose={closeSecondary}
        onResult={onBarcodeResult}
        onUseTextBar={() => {
          closeSecondary();
          focusBar(FOCUS_AFTER_SHEET_MS);
        }}
      />
      <PhotoSheet
        open={secondary === 'photo'}
        onClose={closeSecondary}
        aiStatus={aiStatus}
        aiError={clientError}
        busy={photoBusy}
        error={photoError}
        onPick={(file, hint) => void runPhoto(file, hint)}
        onUseTextBar={() => {
          closeSecondary();
          focusBar(FOCUS_AFTER_SHEET_MS);
        }}
        onOpenAISettings={() => {
          closeSecondary();
          openSettings('coach');
        }}
      />

      <EstimateSheet
        open={sheet.open}
        title={sheet.title}
        items={sheet.items}
        time={sheet.time}
        clarify={sheet.kind === 'ai' || sheet.kind === 'photo' ? sheet.clarify : null}
        note={sheet.note}
        busy={(busy || photoBusy) && sheet.open}
        mode={sheet.kind === 'edit' ? 'edit' : 'new'}
        requireGramsConfirm={sheet.kind === 'photo'}
        onClose={closeSheet}
        onSave={onSheetSave}
        onDelete={sheet.kind === 'edit' ? onSheetDelete : undefined}
        onClarify={sheet.kind === 'ai' || sheet.kind === 'photo' ? onClarify : undefined}
      />
    </div>
  );
}
