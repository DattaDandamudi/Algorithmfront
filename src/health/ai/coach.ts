/**
 * Claude coach — SPEC §4 (Coach screen) and §8 (system prompt structure).
 *
 * Responsibilities:
 *   - buildSystemPrompt: the §8 prompt, PROFILE rendered from the real
 *     profile/targets/bloodwork (never hard-coded numbers). Stable across
 *     turns so it can be prompt-cached.
 *   - buildTurnContext: DERIVED + LAST_30_DAYS + TODAY as compact JSON —
 *     the engine has already computed readiness, HRV SWC, trend weight,
 *     expenditure and macros, so the model cites numbers instead of
 *     recomputing them (§8 "Always cite the user's ACTUAL numbers").
 *   - buildMessages: prior turns as plain text (no stale context blocks),
 *     the new user turn = context + QUESTION, with the medical cue when
 *     isMedicalAsk() fires.
 *   - askCoach: streaming call with server-side refusal fallbacks, mapped
 *     errors, and refusal handling.
 *   - postProcessReply: doctor cue + bold action + length check (§8 OUTPUT).
 *
 * Nothing here touches React or storage; the Coach screen wires it up.
 */
import Anthropic from '@anthropic-ai/sdk';
import type {
  AISettings,
  BloodMarker,
  ChatMessage,
  CoachContext,
  Profile,
  Targets,
  TrainingSplit,
} from '../data/types';
import { lbToKg, round } from '../lib/format';
import { checkLength, ensureBoldAction, ensureDoctorCue, isMedicalAsk } from './guardrails';

// ---------------------------------------------------------------------------
// System prompt (§8)
// ---------------------------------------------------------------------------

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** 'middle-eastern' → 'Middle Eastern'. */
function cuisineLabel(c: string): string {
  return c.split(/[-_\s]+/).map(cap).join(' ');
}

/** "4-day upper/lower split" from the weekly split table. */
export function describeSplit(split: TrainingSplit): string {
  const days = ([0, 1, 2, 3, 4, 5, 6] as const).map((w) => split[w]).filter((s) => s && s !== 'rest');
  if (days.length === 0) return 'no structured training split';
  const kinds = Array.from(new Set(days));
  return `${days.length}-day ${kinds.join('/')} split`;
}

function describePhase(phase: Profile['goalPhase']): string {
  switch (phase) {
    case 'fat-loss':
      return 'moderate-deficit fat-loss phase';
    case 'muscle-gain':
      return 'lean muscle-gain phase';
    default:
      return 'maintenance phase';
  }
}

/** 8000 → '8k', 8500 → '8,500'. */
function fmtSteps(n: number): string {
  return n % 1000 === 0 ? `${n / 1000}k` : n.toLocaleString('en-US');
}

/** "Vitamin D (25-OH) 19 ng/mL (low), … Zinc (low-normal)" — value-less markers render status only. */
export function describeBloodwork(markers: BloodMarker[]): string {
  if (!markers.length) return 'none on file';
  return markers
    .map((m) => {
      const hasValue = Number.isFinite(m.value) && (m.value !== 0 || m.unit);
      const value = hasValue ? ` ${m.value}${m.unit ? ` ${m.unit}` : ''}` : '';
      const retest = m.retestOn ? `, retest ${m.retestOn}` : '';
      return `${m.label}${value} (${m.status}${retest})`;
    })
    .join(', ');
}

function toneLine(tone: AISettings['tone']): string {
  return tone === 'direct'
    ? 'TONE: Direct — terse, no pleasantries or hedging. Lead with the verdict, cite the numbers, give the action. Aim for ≤80 words.'
    : 'TONE: Conversational — warm and encouraging. One short sentence of context, then the verdict and the action.';
}

/**
 * The §8 prompt. PROFILE is rendered from live settings; RULES, GUARDRAILS and
 * OUTPUT are verbatim from the spec. Keep this deterministic (no dates/IDs) so
 * the cache_control breakpoint on it actually hits.
 */
export function buildSystemPrompt(profile: Profile, targets: Targets, ai: AISettings): string {
  const appName = ai.appName?.trim() || 'Pulse';
  const kg = round(lbToKg(profile.weightLb), 0);
  const tobacco = profile.tobaccoQuitting
    ? 'daily tobacco (quitting)'
    : profile.tobaccoBaselinePerDay
      ? `tobacco ~${profile.tobaccoBaselinePerDay}/day`
      : 'no tobacco';
  const cuisines = profile.cuisines.length ? profile.cuisines.map(cuisineLabel).join('/') : 'no cuisine preference';
  const foodNotes = profile.foodNotes?.trim() ? ` ${profile.foodNotes.trim()}` : '';

  return [
    `You are ${appName} Coach, an in-app performance coach. You are NOT a doctor.`,
    '',
    'INPUTS (each turn):',
    `1. PROFILE (static JSON): age ${profile.age}, ${profile.sex}, ${profile.weightLb} lb / ${kg} kg, ${profile.trainingLevel} lifter, ${describeSplit(profile.split)},`,
    `   ${describePhase(profile.goalPhase)}. Targets: ${targets.kcal} kcal, ${targets.protein} g protein, ${targets.fatFloor}–${targets.fatTarget} g fat,`,
    `   carbs ${targets.carbsLift[0]}–${targets.carbsLift[1]} g lift / ${targets.carbsRest[0]}–${targets.carbsRest[1]} g rest, ${targets.fiber} g fiber, ${fmtSteps(targets.stepsMin)}–${fmtSteps(targets.stepsMax)} steps, bed ${profile.bedTarget}.`,
    `   Bloodwork: ${describeBloodwork(profile.bloodwork)},`,
    `   ${tobacco}. Food prefs: ${cuisines} restaurant food.${foodNotes}`,
    '2. LAST_30_DAYS (compact JSON array of daily records).',
    '3. TODAY (partial log so far).',
    '4. DERIVED (numbers the app already computed: readiness band, HRV baseline & SWC, trend weight & weekly rate,',
    '   expenditure, macros remaining, tobacco, adherence). Cite these; do not recompute them.',
    '',
    toneLine(ai.tone),
    '',
    'RULES:',
    '- ≤120 words. One clear, specific action.',
    '- Always cite the user\'s ACTUAL numbers ("your HRV is 42 ms, 8 below baseline").',
    '- Second person, supportive but direct. Cause → effect → one action.',
    `- Protein-first for nutrition. Respect the ${targets.fatFloor} g fat floor and carb day-type.`,
    '- Ground training advice in WHOOP recovery band + HRV SWC.',
    '',
    'GUARDRAILS:',
    '- No diagnosis, no prescription, no interpreting labs as disease. For lab/medication/symptom',
    '  questions: general lifestyle guidance + "confirm dosing and any changes with your doctor."',
    '- If input suggests a medical emergency or acute symptoms, stop advising and tell the user',
    '  to seek professional care.',
    '- Never fabricate numbers; if a datapoint is missing, say so.',
    '- Wellness/informational only; not a substitute for professional medical advice.',
    '',
    'OUTPUT: plain text, ≤120 words, ending with the single action in **bold**.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Turn context (DERIVED / LAST_30_DAYS / TODAY)
// ---------------------------------------------------------------------------

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/**
 * Deep-copy for the LLM: drop null/undefined fields, round floats to 2 dp,
 * keep 0/false (they carry meaning: "0 tobacco today").
 */
export function compactJson(value: unknown): Json | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    return Number.isInteger(value) ? value : round(value, 2);
  }
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    const arr = value.map(compactJson).filter((v): v is Json => v !== undefined);
    return arr;
  }
  if (typeof value === 'object') {
    const out: { [k: string]: Json } = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const c = compactJson(v);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return undefined;
}

const stringify = (v: unknown): string => JSON.stringify(compactJson(v) ?? {});

/** Everything the engine derived, minus the raw records (sent separately) and bloodwork (already in the system prompt). */
function derivedBlock(ctx: CoachContext) {
  return {
    date: ctx.today,
    now: ctx.nowHHMM,
    dayType: ctx.dayType,
    session: ctx.sessionType,
    readiness: ctx.readiness,
    hrv: ctx.hrv,
    rhr: ctx.rhr,
    sleep: ctx.sleep,
    steps: ctx.steps,
    weight: ctx.weight,
    expenditure: ctx.expenditure,
    nutrition: ctx.nutrition,
    tobacco: ctx.tobacco,
    frequency: ctx.frequency,
    adherence: ctx.adherence,
  };
}

/**
 * 'DERIVED (…): {…}\nLAST_30_DAYS: […]\nTODAY: {…}' — compact JSON, no
 * whitespace, null fields dropped. Units follow the data contract (lb, ms,
 * hours, minutes, g, kcal, 'HH:MM').
 */
export function buildTurnContext(ctx: CoachContext): string {
  return [
    `DERIVED (already computed for you; cite these numbers; units: lb, ms, hours, minutes, g, kcal, HH:MM): ${stringify(derivedBlock(ctx))}`,
    `LAST_30_DAYS: ${JSON.stringify(compactJson(ctx.last30) ?? [])}`,
    `TODAY: ${stringify(ctx.todayRecord ?? {})}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export const MEDICAL_SUFFIX =
  ' [This is a lab/medication/symptom question — general lifestyle guidance only, add the doctor cue.]';

/** Default number of prior chat messages to replay (each message is one turn). */
export const DEFAULT_MAX_TURNS = 8;

/**
 * Prior turns are replayed as plain text (their original context blocks are
 * stale and would bloat the prompt); only the new user turn carries context.
 * Error bubbles and half-streamed messages are skipped, and the replay is
 * trimmed so it starts on a user turn (the API requires that).
 */
export function buildMessages(
  history: ChatMessage[],
  question: string,
  ctx: CoachContext,
  opts?: { maxTurns?: number },
): Anthropic.Beta.BetaMessageParam[] {
  const maxTurns = Math.max(0, opts?.maxTurns ?? DEFAULT_MAX_TURNS);
  const usable = history.filter(
    (m) => (m.role === 'user' || m.role === 'assistant') && m.text.trim().length > 0 && m.source !== 'error' && !m.streaming,
  );
  let prior = maxTurns > 0 ? usable.slice(-maxTurns) : [];
  while (prior.length && prior[0].role !== 'user') prior = prior.slice(1);

  const messages: Anthropic.Beta.BetaMessageParam[] = prior.map((m) => ({ role: m.role, content: m.text.trim() }));
  const q = question.trim();
  const suffix = isMedicalAsk(q) ? MEDICAL_SUFFIX : '';
  messages.push({ role: 'user', content: `${buildTurnContext(ctx)}\n\nQUESTION: ${q}${suffix}` });
  return messages;
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

export type CoachErrorKind = 'auth' | 'permission' | 'not_found' | 'rate_limit' | 'bad_request' | 'server' | 'network' | 'abort' | 'unknown';

/** A user-readable failure from askCoach. `message` is safe to show in the chat. */
export class CoachError extends Error {
  kind: CoachErrorKind;
  status?: number;
  constructor(kind: CoachErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'CoachError';
    this.kind = kind;
    this.status = status;
  }
}

/** Map SDK errors (most specific first) to something the chat can display. */
export function toCoachError(err: unknown): CoachError {
  if (err instanceof CoachError) return err;
  if (err instanceof Anthropic.APIUserAbortError) return new CoachError('abort', 'Stopped.');
  if (err instanceof Anthropic.AuthenticationError) {
    return new CoachError('auth', 'Check your API key — Anthropic rejected it (401).', err.status);
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new CoachError('permission', 'Your key does not have access to this model (403). Try another model in Settings.', err.status);
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new CoachError('not_found', 'Model not found (404). Pick another model in Settings.', err.status);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new CoachError('rate_limit', 'Rate limited (429) — wait a moment and try again.', err.status);
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new CoachError('bad_request', `Request rejected (400): ${err.message}`, err.status);
  }
  if (err instanceof Anthropic.InternalServerError) {
    return new CoachError('server', `Anthropic is having trouble (${err.status ?? '5xx'}) — try again shortly.`, err.status);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new CoachError('network', 'Network/proxy issue — check your connection or proxy URL.');
  }
  if (err instanceof Anthropic.APIError) {
    return new CoachError('unknown', `API error${err.status ? ` ${err.status}` : ''}: ${err.message}`, err.status);
  }
  if (err instanceof Error && err.name === 'AbortError') return new CoachError('abort', 'Stopped.');
  return new CoachError('unknown', err instanceof Error ? err.message : 'Something went wrong.');
}

export const REFUSAL_TEXT =
  "I can't help with that one. Ask me about training, food, sleep, recovery or tobacco and I'll work from your numbers.";

/** Coach replies are ≤120 words; 1024 tokens leaves headroom without inviting essays. */
const MAX_TOKENS = 1024;

export interface AskCoachInput {
  client: Anthropic;
  model: string;
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
}

export interface AskCoachResult {
  text: string;
  refused: boolean;
  stopReason: string | null;
  /** Model that actually produced the reply (differs from `model` when a server-side fallback ran). */
  servedBy?: string;
  /** True when the requested model declined and a fallback model answered. */
  fallbackRan?: boolean;
}

/**
 * Stream one coach turn.
 *
 * - `system` carries a cache_control breakpoint: it is identical every turn,
 *   so after the first call it is served from cache.
 * - `fallbacks: 'default'` + the 2026-07-01 beta: if the requested model's
 *   safety classifiers decline, the API re-runs on a fallback model inside
 *   the same request instead of surfacing a bare refusal.
 * - `output_config.effort: 'medium'` — a ≤120-word coaching reply does not
 *   need deep reasoning; medium keeps latency and cost down. No `thinking`
 *   or `temperature` (Opus 5 / Fable 5.1 run adaptive thinking by default
 *   and reject sampling params).
 */
export async function askCoach(input: AskCoachInput): Promise<AskCoachResult> {
  const { client, model, system, messages, onDelta, signal } = input;
  try {
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: MAX_TOKENS,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
      },
      { signal },
    );

    if (onDelta) stream.on('text', (delta) => onDelta(delta));

    const final = await stream.finalMessage();
    const text = final.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    const stopReason = final.stop_reason ?? null;
    const fallbackRan = (final.usage.iterations ?? []).some((it) => it.type === 'fallback_message');

    if (stopReason === 'refusal') {
      return { text: REFUSAL_TEXT, refused: true, stopReason, servedBy: final.model, fallbackRan };
    }
    return { text, refused: false, stopReason, servedBy: final.model, fallbackRan };
  } catch (err) {
    throw toCoachError(err);
  }
}

// ---------------------------------------------------------------------------
// Post-processing (§8 OUTPUT)
// ---------------------------------------------------------------------------

/**
 * Enforce the output contract on whatever came back: doctor cue for medical
 * asks, a single trailing **bold** action, and the ≤120-word check (reported,
 * not truncated — the UI decides how to flag `over`).
 */
export function postProcessReply(text: string, question: string): { text: string; words: number; over: boolean } {
  const medical = isMedicalAsk(question);
  const withCue = ensureDoctorCue((text ?? '').trim(), medical);
  const withBold = ensureBoldAction(withCue);
  const { words, over } = checkLength(withBold);
  return { text: withBold, words, over };
}
