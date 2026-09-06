/**
 * Pure send-flow helpers for the Coach screen (task item 5; SPEC §4, §8
 * GUARDRAILS). Everything React-free lives here so the turn logic is unit-
 * testable without a store or a network:
 *
 * - planTurn:        empty → ignore; detectEmergency() → a 'guardrail' reply
 *                    and NO model call (§8 "stop advising and tell the user to
 *                    seek professional care"); otherwise an ask, flagged
 *                    `medical` when isMedicalAsk() fires so the UI can show
 *                    the escalation cue.
 * - makeMessage:     ChatMessage factory (uid + wall clock — UI code may read
 *                    the clock; only engine code may not).
 * - needsMedicalCue: an assistant reply carries the inline cue when the user
 *                    turn it answers is a lab / medication / symptom ask.
 * - abortPatch / orphanPatch / errorText: how a streaming placeholder ends
 *                    when the user taps Stop, when the app reloaded mid-stream,
 *                    or when the API failed (the offline answer then follows
 *                    as its own 'offline' bubble so guidance never disappears).
 * - DeltaBuffer:     coalesces stream deltas into one store write per FLUSH_MS
 *                    so the transcript never re-renders per token.
 * - introLine:       the empty-state one-liner, from real context numbers —
 *                    day type, readiness and today's planned session when the
 *                    training block has one.
 */
import type { ChatMessage, CoachContext } from '../../data/types';
import { MAX_WORDS, checkLength, detectEmergency, isMedicalAsk } from '../../ai/guardrails';
import { formatClock, nowHHMM } from '../../lib/dates';
import { uid } from '../../lib/format';

/** Inline escalation cue above replies to medical asks (task item 6). */
export const MEDICAL_CUE = 'General lifestyle guidance only — confirm labs, dosing and symptoms with your doctor.';
/** Offline answers are instant; a short pause keeps the "thinking" feel consistent with the streamed path. */
export const OFFLINE_DELAY_MS = 300;
/**
 * Streaming flush interval. ~12 store writes/s reads as smooth streaming while
 * keeping the whole-app re-render (the store is a single context) far below
 * per-token rates.
 */
export const FLUSH_MS = 80;
export const STOPPED_TEXT = 'Stopped before a reply arrived.';
export const INTERRUPTED_TEXT = 'This reply was interrupted — ask again.';

export type TurnPlan =
  | { kind: 'empty' }
  | { kind: 'emergency'; text: string; reply: string }
  | { kind: 'ask'; text: string; medical: boolean };

/** Decide what a submitted composer string turns into. */
export function planTurn(raw: string): TurnPlan {
  const text = (raw ?? '').trim();
  if (!text) return { kind: 'empty' };
  const em = detectEmergency(text);
  if (em.emergency) return { kind: 'emergency', text, reply: em.message };
  return { kind: 'ask', text, medical: isMedicalAsk(text) };
}

export interface MessageExtra {
  source?: ChatMessage['source'];
  streaming?: boolean;
  id?: string;
  ts?: number;
}

/** Build a ChatMessage; optional keys are only set when present so persisted JSON stays compact. */
export function makeMessage(role: ChatMessage['role'], text: string, extra: MessageExtra = {}): ChatMessage {
  const m: ChatMessage = { id: extra.id ?? uid('msg'), role, text, ts: extra.ts ?? Date.now() };
  if (extra.source) m.source = extra.source;
  if (extra.streaming) m.streaming = true;
  return m;
}

/**
 * True when `chat[index]` is a coaching reply to a medical ask. Guardrail and
 * error bubbles never get the cue (the first already escalates, the second is
 * not advice); the search walks back to the nearest user turn so the offline
 * bubble that follows an error bubble is still cued.
 */
export function needsMedicalCue(chat: ChatMessage[], index: number): boolean {
  const m = chat[index];
  if (!m || m.role !== 'assistant' || m.source === 'guardrail' || m.source === 'error') return false;
  for (let i = index - 1; i >= 0; i--) {
    if (chat[i].role === 'user') return isMedicalAsk(chat[i].text);
  }
  return false;
}

/** Stop tapped: keep whatever streamed (it is real model text), else say nothing arrived. */
export function abortPatch(partial: string): Partial<ChatMessage> {
  const text = (partial ?? '').trim();
  return text ? { text, source: 'claude', streaming: false } : { text: STOPPED_TEXT, source: 'error', streaming: false };
}

/** A `streaming: true` message with no live request behind it (reload mid-stream). */
export function orphanPatch(m: ChatMessage): Partial<ChatMessage> {
  return m.text.trim()
    ? { streaming: false, source: m.source ?? 'claude' }
    : { text: INTERRUPTED_TEXT, source: 'error', streaming: false };
}

/** The readable failure line; the offline answer is appended as its own bubble right after. */
export function errorText(err: Pick<Error, 'message'>): string {
  const msg = (err.message ?? '').trim() || 'Something went wrong.';
  return `${msg} Showing the offline answer instead.`;
}

/** "9:41 am" for a message timestamp; empty for an invalid one. */
export function formatTime(ts: number): string {
  const d = new Date(ts);
  return Number.isFinite(d.getTime()) ? formatClock(nowHHMM(d)) : '';
}

/** Caption shown only when a reply breaks the §8 ≤120-word rule. */
export function wordHint(text: string): string | null {
  const { words, over } = checkLength(text);
  return over ? `${words} words · over the ${MAX_WORDS}-word target` : null;
}

/** How many planned exercises the intro names before it counts the rest. */
const INTRO_EXERCISES = 2;

/**
 * "Planned: Back squat, Romanian deadlift +1 more." — only when the training
 * block actually has a session planned for today; a context without one (no
 * program, rest day, or no `training` block at all) adds nothing.
 */
function plannedPhrase(ctx: CoachContext): string {
  const planned = ctx.training?.plannedExercises ?? [];
  if (planned.length === 0) return '';
  const names = planned.slice(0, INTRO_EXERCISES).map((e) => e.name);
  const rest = planned.length - names.length;
  return `Planned: ${names.join(', ')}${rest > 0 ? ` +${rest} more` : ''}.`;
}

/** Empty-state line — day type, readiness and today's planned session, from the real context, never invented. */
export function introLine(ctx: CoachContext): string {
  const day = ctx.dayType === 'lift' ? `${ctx.sessionType} day` : 'rest day';
  const r = ctx.readiness;
  const base =
    r.score === null
      ? `Today is a ${day}. No readiness signal yet — log a WHOOP recovery or HRV and I'll ground my answers in it.`
      : `Today is a ${day}. Readiness ${Math.round(r.score)}% — ${r.verdict}`;
  const planned = plannedPhrase(ctx);
  return planned ? `${base.replace(/[\s.]+$/, '')}. ${planned}` : base;
}

type Schedule = (cb: () => void) => void;

const timerSchedule: Schedule = (cb) => {
  setTimeout(cb, FLUSH_MS);
};

/**
 * Accumulates stream deltas and emits the full text at most once per
 * scheduler tick. `text` is always the complete accumulation, so an aborted
 * stream can still surface what arrived.
 */
export class DeltaBuffer {
  text = '';
  private pending = false;
  private cancelled = false;
  private readonly onFlush: (text: string) => void;
  private readonly schedule: Schedule;

  constructor(onFlush: (text: string) => void, schedule: Schedule = timerSchedule) {
    this.onFlush = onFlush;
    this.schedule = schedule;
  }

  push(delta: string): void {
    this.text += delta;
    if (this.pending || this.cancelled) return;
    this.pending = true;
    this.schedule(() => this.flush());
  }

  flush(): void {
    this.pending = false;
    if (this.cancelled) return;
    this.onFlush(this.text);
  }

  /** Stop emitting (the final message is written by the caller). */
  cancel(): void {
    this.cancelled = true;
  }
}
