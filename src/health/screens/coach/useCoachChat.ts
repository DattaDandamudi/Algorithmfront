/**
 * useCoachChat — the Coach screen's send flow (task item 5; SPEC §4 / §8).
 *
 * One turn, in order (the pure pieces live in ./turn.ts):
 *   1. append the user bubble (actions.appendChat);
 *   2. detectEmergency → a 'guardrail' reply and STOP — no model call (§8);
 *   3. buildCoachContext fresh at send time — with the day records AND the
 *      workouts, so the training, load, stress and energy blocks are populated
 *      (check-ins ride on the day records) — so the model sees what was logged
 *      a second ago. The memoised per-minute `ctx` returned below feeds only
 *      the transcript's intro line, never the prompt;
 *   4. with a client: system = buildSystemPrompt, messages = buildMessages
 *      (history BEFORE this turn), a `streaming: true` placeholder, askCoach
 *      with deltas batched through DeltaBuffer, then postProcessReply →
 *      'claude'. On failure the placeholder becomes the readable 'error' and
 *      the offline answer follows as its own 'offline' bubble, so the user
 *      still gets guidance;
 *   5. without a client: answerOffline after OFFLINE_DELAY_MS → 'offline'.
 *
 * In-flight requests live in a module-level map keyed by placeholder id: the
 * shell unmounts the screen on every tab switch, and a reply should neither be
 * aborted by that nor lose its Stop handle. Any `streaming: true` message that
 * is NOT in the map (a reload mid-stream) is finalised on mount.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { AppSettings, ChatMessage, CoachContext, CoachTone, DailyRecord, ISODate, Workout } from '../../data/types';
import { useHealth, useNow, useRecords, useWorkouts } from '../../data/store';
import { buildCoachContext } from '../../engine';
import { createClient } from '../../ai/client';
import { isAIConfigured, resolveModel } from '../../ai/config';
import { askCoach, buildMessages, buildSystemPrompt, postProcessReply, toCoachError } from '../../ai/coach';
import { answerOffline } from '../../ai/offlineCoach';
import { parseISODate, toISODate } from '../../lib/dates';
import { DeltaBuffer, OFFLINE_DELAY_MS, abortPatch, errorText, makeMessage, orphanPatch, planTurn } from './turn';

const inFlight = new Map<string, AbortController>();

export interface CoachChat {
  chat: ChatMessage[];
  settings: AppSettings;
  /** Per-minute snapshot for display (intro line); the prompt builds its own at send time. */
  ctx: CoachContext;
  today: ISODate;
  /** A reply is streaming (or the offline pause is running). */
  busy: boolean;
  aiConfigured: boolean;
  /** Returns false when the text was empty or a turn is already in flight. */
  send(text: string): boolean;
  stop(): void;
  clear(): void;
  setTone(tone: CoachTone): void;
}

interface Latest {
  chat: ChatMessage[];
  settings: AppSettings;
  records: DailyRecord[];
  workouts: Workout[];
}

export function useCoachChat(): CoachChat {
  const { state, actions } = useHealth();
  const records = useRecords();
  // Sessions ride beside the days so the training, load and energy blocks are
  // filled; the check-ins already live on DailyRecord (`qs`/`qf`/`qt`/`qo`),
  // so `records` carries the stress side.
  const workouts = useWorkouts();
  const wall = useNow();
  const today = toISODate(wall);
  const hh = wall.getHours();
  const mm = wall.getMinutes();
  // Identity changes once a minute, so the ctx memo never rebuilds on a keystroke.
  const now = useMemo(() => {
    const d = parseISODate(today);
    d.setHours(hh, mm, 0, 0);
    return d;
  }, [today, hh, mm]);
  const settings = state.settings;
  const chat = state.chat;

  const ctx = useMemo(() => buildCoachContext({ records, settings, today, now, workouts }), [records, settings, today, now, workouts]);

  // `send` reads the freshest store slices without being recreated per render.
  const latest = useRef<Latest>({ chat, settings, records, workouts });
  latest.current = { chat, settings, records, workouts };

  // Reload mid-stream leaves `streaming: true` behind with no request to finish it.
  useEffect(() => {
    for (const m of chat) {
      if (m.streaming && !inFlight.has(m.id)) actions.updateChat(m.id, orphanPatch(m));
    }
  }, [chat, actions]);

  const send = useCallback(
    (raw: string): boolean => {
      const plan = planTurn(raw);
      if (plan.kind === 'empty' || inFlight.size > 0) return false;
      const { chat: before, settings: s, records: recs, workouts: wos } = latest.current;

      actions.appendChat(makeMessage('user', plan.text));
      if (plan.kind === 'emergency') {
        actions.appendChat(makeMessage('assistant', plan.reply, { source: 'guardrail' }));
        return true;
      }

      const { profile, targets, ai } = s;
      const sendNow = new Date();
      const ctxNow = buildCoachContext({ records: recs, settings: s, today: toISODate(sendNow), now: sendNow, workouts: wos });
      const offline = () => answerOffline(plan.text, ctxNow, profile, targets, ai.tone);

      const placeholder = makeMessage('assistant', '', { streaming: true });
      const controller = new AbortController();
      inFlight.set(placeholder.id, controller);
      let settled = false;
      const finish = (patch: Partial<ChatMessage>) => {
        if (settled) return;
        settled = true;
        inFlight.delete(placeholder.id);
        actions.updateChat(placeholder.id, patch);
      };
      actions.appendChat(placeholder);

      const runOffline = () => {
        const timer = setTimeout(() => finish({ text: offline(), source: 'offline', streaming: false }), OFFLINE_DELAY_MS);
        controller.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          finish(abortPatch(''));
        });
      };
      if (!isAIConfigured(ai)) {
        runOffline();
        return true;
      }

      const buffer = new DeltaBuffer((text) => actions.updateChat(placeholder.id, { text }));
      // The SDK chunk loads on first use, so offline users never download it.
      void createClient(ai)
        .then((client) => {
          if (!client) {
            runOffline();
            return undefined;
          }
          return askCoach({
            client,
            model: resolveModel(ai),
            system: buildSystemPrompt(profile, targets, ai),
            messages: buildMessages(before, plan.text, ctxNow),
            signal: controller.signal,
            onDelta: (d) => buffer.push(d),
          });
        })
        .then((res) => {
          if (!res) return;
          buffer.cancel();
          // A safety refusal is already a complete sentence; bolding its tail would misread as advice.
          if (res.refused) {
            finish({ text: res.text, source: 'guardrail', streaming: false });
            return;
          }
          // Cut off by max_tokens (or empty): show the "ask again" line as an error, never a bolded fragment.
          if (res.truncated) {
            finish({ text: res.text, source: 'error', streaming: false });
            return;
          }
          finish({ text: postProcessReply(res.text, plan.text).text, source: 'claude', streaming: false });
        })
        .catch((e: unknown) => {
          buffer.cancel();
          const err = toCoachError(e);
          if (err.kind === 'abort') {
            finish(abortPatch(buffer.text));
            return;
          }
          finish({ text: errorText(err), source: 'error', streaming: false });
          actions.appendChat(makeMessage('assistant', offline(), { source: 'offline' }));
        });
      return true;
    },
    [actions],
  );

  const stop = useCallback(() => {
    inFlight.forEach((c) => c.abort());
  }, []);

  const clear = useCallback(() => {
    stop();
    actions.clearChat();
  }, [stop, actions]);

  const setTone = useCallback((tone: CoachTone) => actions.updateAI({ tone }), [actions]);

  return {
    chat,
    settings,
    ctx,
    today,
    busy: chat.some((m) => m.streaming === true),
    aiConfigured: isAIConfigured(settings.ai),
    send,
    stop,
    clear,
    setTone,
  };
}
