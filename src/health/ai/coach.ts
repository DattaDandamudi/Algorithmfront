/**
 * Claude coach — SPEC §4 (Coach screen) and §8 (system prompt structure).
 *
 * Responsibilities:
 *   - buildSystemPrompt: the §8 prompt, PROFILE rendered from the real
 *     profile/targets/bloodwork (never hard-coded numbers). Stable across
 *     turns so it can be prompt-cached.
 *   - buildTurnContext: DERIVED + LAST_30_DAYS + TODAY as compact JSON —
 *     the engine has already computed readiness, HRV SWC, trend weight,
 *     expenditure, macros and the v3 training / stress / energy / impact
 *     blocks, so the model cites numbers instead of recomputing them (§8
 *     "Always cite the user's ACTUAL numbers"). The v3 blocks are projected
 *     down to what a ≤120-word reply can quote, never dumped.
 *   - buildMessages: prior turns as plain text (no stale context blocks),
 *     the new user turn = context + QUESTION, with the medical cue when
 *     isMedicalAsk() fires.
 *   - askCoach: streaming call with server-side refusal fallbacks, mapped
 *     errors, and refusal handling.
 *   - postProcessReply: doctor cue + bold action + length check (§8 OUTPUT).
 *
 * Nothing here touches React or storage; the Coach screen wires it up.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type {
  AISettings,
  BloodMarker,
  Changepoint,
  ChatMessage,
  CoachContext,
  EnergyContext,
  ImpactContext,
  Profile,
  StressContext,
  Targets,
  TrainingContext,
  TrainingSplit,
} from '../data/types';
import { lbToKg, round } from '../lib/format';
import { checkLength, ensureBoldAction, ensureDoctorCue, isMedicalAsk, wordCount } from './guardrails';

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
      const unit = m.unit === '%' ? '%' : m.unit ? ` ${m.unit}` : '';
      const value = hasValue ? ` ${m.value}${unit}` : '';
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
 * What each DERIVED key means and its unit. Static text: it lives in the system
 * block (not the per-turn context) so the cached prefix stays identical across
 * turns and long enough to be cacheable at all (R5-13, see askCoach).
 */
const DERIVED_LEGEND = [
  'DERIVED legend (units: lb, ms, bpm, hours, minutes, g, kcal, HH:MM; missing/null fields are omitted — say so, never guess):',
  '- readiness: score 0–100, band green/yellow/red/neutral, source whoop|hrv|none, training = the verdict to ground advice in.',
  '- hrv: today and baseline7 in ms; swcLower–swcUpper is the smallest-worthwhile-change band (inside = normal for this user);',
  '  band balanced/low/high/insufficient; delta = today vs baseline with pct and good.',
  '- rhr: today in bpm with baseline, delta and pct. sleep: hours vs need, debtMin, bedtimeSdMin (consistency), lastBedtime.',
  '- steps: today vs baseline and goalMin–goalMax. weight: latest scale reading, trend (smoothed), weeklyRateLb and weeklyRatePct',
  '  vs targetLbPerWk with inBand below/in/above, weighInsThisWeek.',
  '- expenditure: tdee reverse-calculated from intake and trend, valid only with 5+ weigh-ins (reason says why not);',
  '  suggestedKcal/suggestedDelta = the weekly check.',
  '- nutrition: totals, targets and remaining in g/kcal; fatBelowFloor; carbsRange for today\'s dayType; mealsLogged/mealsLeft;',
  '  proteinPerMealNeeded; lateEating; hydrationCups; caffeineAfterCutoff.',
  '- tobacco: today, avg7, avg30, streakDays, hrvSmokeFree vs hrvSmoking (ms). frequency: 7-day food counters.',
  '- adherence: 30-day protein/kcal/weigh-in hit counts and the logging streak.',
  '- training: session = today\'s split slot; planned = suggested exercises (sets, reps range, loadKg, mode progress/hold/reduce);',
  '  load = {today, acute7 = 7-day load, chronic28 = 28-day base, acwr + acwrBand, wowPct = week-on-week acute change,',
  '  form = fitness − fatigue with formBand, monotony, weekly, source, tauIsPrior}. ACWR is DESCRIPTIVE only, never a causal injury',
  '  predictor — lead on absolute acute load and wowPct. setsByMuscle = hard sets this week; belowMev/aboveMrv rate them against',
  '  ADVISORY landmarks, never a cap. recovering = muscles still inside the 48–72 h window ({m, pct, h since}). Also prs7d,',
  '  plateaus, deload {recommended, reasons}, lastSession, vo2max {value, lo, hi}, loggedToday.',
  '- stress: osi = overnight strain index 0–100 with osiLo/osiHi; deviating of available = overnight signals outside this user\'s own',
  '  range — that count is the headline, not osi; outliers list the deviating ones with value and z. checkIn = Hooper items 1–7',
  '  (1 = best) with total 4–28, band, nDays, worseRun (3 in a row = the back-off cue), missingToday. resilience = 0–100 score with',
  '  band and the load/recovery EWMAs. illness = a conjunctive DATA FLAG with its reasons; it is never a diagnosis. calibrating/nRef',
  '  = how much reference history exists.',
  '- energy: PREDICTED alertness 0–100 from a two-process model plus caffeine — a forecast, not a measurement. now, atWake,',
  '  trough {at, value} = the afternoon dip, bedtimeReadyAt, caffeineMg still active, curve = [HH:MM, value] every ~3 h, drivers,',
  '  confidence.',
  '- impact: N-of-1 ASSOCIATIONS, already Benjamini–Hochberg-corrected (only surviving effects are sent). Each carries `label` —',
  '  the association sentence with its 95% interval, phrased for you to reuse — plus nNo (comparison days) and an optional confound.',
  '  pending = behaviours without enough yes/no days to report. shifts = confirmed level changes with prob and before/after means.',
];

/**
 * The §8 prompt. PROFILE is rendered from live settings; RULES, GUARDRAILS and
 * OUTPUT are verbatim from the spec. Keep this deterministic (no dates/IDs) so
 * the cache_control breakpoint on it can hit.
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
    '   expenditure, macros remaining, tobacco, adherence, plus the training, stress, energy and impact blocks).',
    '   Cite these; do not recompute them.',
    '',
    ...DERIVED_LEGEND,
    '',
    toneLine(ai.tone),
    '',
    'RULES:',
    '- ≤120 words. One clear, specific action.',
    '- Always cite the user\'s ACTUAL numbers ("your HRV is 42 ms, 8 below baseline").',
    '- Second person, supportive but direct. Cause → effect → one action.',
    `- Protein-first for nutrition. Respect the ${targets.fatFloor} g fat floor and carb day-type.`,
    '- Ground training advice in WHOOP recovery band + HRV SWC.',
    '- Stress signals and behaviour-impact effects are ASSOCIATIONS, not causes. Report them with their interval and the day counts',
    '  ("on the 9 days you drank, next-day HRV averaged 6.2 ms lower, 95% CI 2.8–9.6"), never "alcohol lowered your HRV"; name the',
    '  confound when one is given. A deviating overnight signal describes the night, it does not explain it. The illness flag is a',
    '  data pattern, never a diagnosis: name the signals behind it, never a condition, and send persistent symptoms to a doctor.',
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

// ---------------------------------------------------------------------------
// v3 blocks — compact projections
// ---------------------------------------------------------------------------

/**
 * The v3 engine blocks are far too big to send whole (`weeklySets` alone is one
 * object per muscle, `forecast` a point per waking hour), and the model needs
 * the *shape* of each, not the raw series. These projections keep every number
 * a reply may cite, cap every list, and drop what the copy never quotes
 * (per-exercise `reason` strings, landmark triples, the full curve). Empty
 * lists are omitted rather than sent as `[]`: the legend already says a missing
 * field means "no data", so an absent key costs nothing and a present one is
 * always worth reading. Together they add ≈ 550 tokens to a turn.
 */
const MAX_PLANNED = 5;
const MAX_MUSCLES = 4;
const MAX_EFFECTS = 4;
const MAX_LIST = 3;
/** Every third forecast point (~3 h): the shape of the day, not the curve. */
const ENERGY_STRIDE = 3;
/** Below this, a muscle is still inside its 48–72 h recovery window and worth naming. */
const RECOVERING_PCT = 90;

/** `[]` → undefined so compactJson drops the key entirely. */
const some = <T,>(xs: T[]): T[] | undefined => (xs.length ? xs : undefined);

function trainingBlock(t: TrainingContext | undefined) {
  if (!t) return undefined;
  const l = t.load;
  const sets: Record<string, number> = {};
  for (const v of t.weeklySets) if (v.sets > 0) sets[v.muscle] = v.sets;
  return {
    session: t.todaySession,
    planned: some(
      t.plannedExercises.slice(0, MAX_PLANNED).map((e) => ({ name: e.name, sets: e.sets, reps: `${e.reps[0]}-${e.reps[1]}`, loadKg: e.loadKg, mode: e.mode })),
    ),
    loggedToday: t.todayWorkouts.length,
    load: {
      today: l.today,
      acute7: l.acute7,
      chronic28: l.chronic28,
      acwr: l.acwr,
      acwrBand: l.acwrBand,
      wowPct: l.weekOverWeekPct,
      form: l.form,
      formBand: l.formBand,
      monotony: l.monotony,
      weekly: l.weeklyLoad,
      source: l.source,
      tauIsPrior: l.tauIsPrior,
    },
    setsByMuscle: Object.keys(sets).length ? sets : undefined,
    belowMev: some(t.weeklySets.filter((v) => v.status === 'below-mev').map((v) => v.muscle).slice(0, MAX_MUSCLES)),
    aboveMrv: some(t.weeklySets.filter((v) => v.status === 'high').map((v) => v.muscle).slice(0, MAX_MUSCLES)),
    recovering: some(
      t.muscleReadiness
        .filter((m) => m.pct < RECOVERING_PCT)
        .sort((a, b) => a.pct - b.pct)
        .slice(0, MAX_MUSCLES)
        .map((m) => ({ m: m.muscle, pct: m.pct, h: m.hoursSince })),
    ),
    balance: t.balance,
    prs7d: some(t.prs7d.slice(0, MAX_LIST).map((p) => ({ name: p.name, kind: p.kind, value: p.value, prev: p.previous }))),
    plateaus: some(t.plateaus.slice(0, MAX_LIST).map((p) => ({ name: p.name, sessions: p.sessions, gainPct: p.gainPct }))),
    deload: t.deload.recommended ? t.deload : undefined,
    lastSession: t.lastSession
      ? { d: t.lastSession.d, kind: t.lastSession.kind, session: t.lastSession.session, min: t.lastSession.durationMin, srpe: t.lastSession.srpe, load: t.lastSession.load }
      : undefined,
    vo2max: t.vo2max && t.vo2max.value !== null ? { value: t.vo2max.value, lo: t.vo2max.lo, hi: t.vo2max.hi } : undefined,
  };
}

function stressBlock(s: StressContext | undefined) {
  if (!s) return undefined;
  const c = s.checkIn;
  const r = s.resilience;
  return {
    osi: s.osi,
    osiLo: s.osiLo,
    osiHi: s.osiHi,
    band: s.band,
    deviating: s.signalsDeviating,
    available: s.signalsAvailable,
    outliers: some(s.outliers.filter((o) => o.deviating).map((o) => ({ key: o.key, label: o.label, value: o.value, z: o.z }))),
    checkIn: { sleepQ: c.sleepQ, fatigue: c.fatigue, stress: c.stress, soreness: c.soreness, total: c.total, band: c.band, nDays: c.nDays, worseRun: c.worseRun, missingToday: c.missingToday },
    resilience: { score: r.score, band: r.band, loadEwma: r.loadEwma, recoveryEwma: r.recoveryEwma, balance: r.balance, nDays: r.nDays, alCount: r.alStyleCount },
    // Only ever sent when it is actually raised — and it is a flag, not a finding.
    illness: s.illness.flag ? { flag: true, since: s.illness.since, reasons: s.illness.reasons } : undefined,
    calibrating: s.calibrating,
    nRef: s.nRef,
  };
}

function energyBlock(e: EnergyContext | undefined) {
  if (!e) return undefined;
  return {
    now: e.now,
    atWake: e.atWake,
    trough: e.trough ? { at: e.trough.hhmm, value: e.trough.value } : undefined,
    bedtimeReadyAt: e.bedtimeReadyAt,
    caffeineMg: e.caffeineActiveMg,
    curve: some(e.forecast.filter((_, i) => i % ENERGY_STRIDE === 0).map((p) => [p.hhmm, p.value] as [string, number])),
    drivers: some(e.drivers.slice(0, MAX_LIST)),
    confidence: e.confidence,
  };
}

/**
 * `label` is the engine's own association sentence (impact.ts: "on the 9 days
 * you drank, next-day HRV averaged 6.2 ms lower (95% CI 2.8–9.6)"), so sending
 * it instead of the raw delta/lo95/hi95 is both shorter and the phrasing the
 * §8 association rule asks the model to keep. `qValue` is not sent: the context
 * only ever carries Benjamini–Hochberg-confirmed effects (context.ts filters on
 * `isConfirmedEffect`), and compactJson's 2 dp would round a q of 0.004 to 0.
 */
function impactBlock(i: ImpactContext | undefined) {
  if (!i) return undefined;
  const effects = some(i.effects.slice(0, MAX_EFFECTS).map((e) => ({ label: e.label, nNo: e.nNo, confound: e.confound })));
  const pending = some(i.pending.slice(0, MAX_LIST));
  return effects || pending ? { effects, pending } : undefined;
}

function shiftsBlock(cps: Changepoint[] | undefined) {
  return some((cps ?? []).slice(0, MAX_LIST).map((c) => ({ d: c.d, label: c.label, prob: c.prob, before: c.meanBefore, after: c.meanAfter })));
}

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
    training: trainingBlock(ctx.training),
    stress: stressBlock(ctx.stress),
    energy: energyBlock(ctx.energy),
    impact: impactBlock(ctx.impact),
    shifts: shiftsBlock(ctx.changepoints),
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
 * Error bubbles, guardrail bubbles (the emergency / refusal copy is ours, not
 * the model's — R5-10) and half-streamed messages are skipped, and the replay
 * is trimmed so it starts on a user turn (the API requires that).
 */
export function buildMessages(
  history: ChatMessage[],
  question: string,
  ctx: CoachContext,
  opts?: { maxTurns?: number },
): Anthropic.Beta.BetaMessageParam[] {
  const maxTurns = Math.max(0, opts?.maxTurns ?? DEFAULT_MAX_TURNS);
  const usable = history.filter(
    (m) =>
      (m.role === 'user' || m.role === 'assistant') && m.text.trim().length > 0 && m.source !== 'error' && m.source !== 'guardrail' && !m.streaming,
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

/** The SDK prefixes messages with the HTTP status ("400 …"); we already show it. */
const stripStatus = (m: string) => m.replace(/^\d{3}\s+/, '');

/**
 * Map SDK errors to something the chat can display.
 *
 * Duck-typed on `status` / message rather than `instanceof`, so this module
 * never has to import the SDK at runtime (it is loaded lazily by client.ts)
 * and the mapping survives minification. SDK APIError subclasses carry the
 * HTTP status; APIUserAbortError has no status and the message "Request was
 * aborted."; APIConnectionError has no status either.
 */
export function toCoachError(err: unknown): CoachError {
  if (err instanceof CoachError) return err;
  const e = (err && typeof err === 'object' ? err : {}) as { status?: unknown; message?: unknown; name?: unknown };
  const status = typeof e.status === 'number' ? e.status : undefined;
  const message = typeof e.message === 'string' ? e.message : '';
  const isSdkError = err instanceof Error && ('status' in e || 'requestID' in (e as object) || 'headers' in (e as object));

  if (e.name === 'AbortError' || /\brequest was aborted\b/i.test(message)) return new CoachError('abort', 'Stopped.');
  if (status === 401) return new CoachError('auth', 'Check your API key — Anthropic rejected it (401).', status);
  if (status === 403) return new CoachError('permission', 'Your key does not have access to this model (403). Try another model in Settings.', status);
  if (status === 404) return new CoachError('not_found', 'Model not found (404). Pick another model in Settings.', status);
  if (status === 429) return new CoachError('rate_limit', 'Rate limited (429) — wait a moment and try again.', status);
  if (status === 400) return new CoachError('bad_request', `Request rejected (400): ${stripStatus(message)}`, status);
  if (status !== undefined && status >= 500) return new CoachError('server', `Anthropic is having trouble (${status}) — try again shortly.`, status);
  if (isSdkError && status === undefined) return new CoachError('network', 'Network/proxy issue — check your connection or proxy URL.');
  if (status !== undefined) return new CoachError('unknown', `API error ${status}: ${message}`, status);
  if (err instanceof TypeError && /fetch|network/i.test(message)) return new CoachError('network', 'Network/proxy issue — check your connection or proxy URL.');
  return new CoachError('unknown', err instanceof Error ? err.message : 'Something went wrong.');
}

export const REFUSAL_TEXT =
  "I can't help with that one. Ask me about training, food, sleep, recovery or tobacco and I'll work from your numbers.";

/** Shown instead of a cut-off fragment (R5-4); postProcessReply passes it through untouched. */
export const TRUNCATED_TEXT = 'That reply was cut off before it reached the action — ask again.';

/**
 * A ≤120-word reply is ~200 tokens, but on Opus 5 / Fable 5.1 adaptive thinking
 * is on by default and its tokens count against max_tokens, so 1024 could be
 * spent before any text arrived (R5-4). 4096 leaves room for thinking at
 * effort 'medium'; a max_tokens stop is still surfaced as `truncated`.
 */
const MAX_TOKENS = 4096;

export interface AskCoachInput {
  client: Anthropic;
  model: string;
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
}

export interface AskCoachResult {
  /** The reply, or REFUSAL_TEXT / TRUNCATED_TEXT when `refused` / `truncated`. */
  text: string;
  refused: boolean;
  /** stop_reason 'max_tokens', or no text at all (thinking used the budget) — show TRUNCATED_TEXT, do not post-process (R5-4). */
  truncated?: boolean;
  /** Whatever text did arrive before the cut-off (may be empty). */
  partialText?: string;
  stopReason: string | null;
  /** Model that actually produced the reply (differs from `model` when a server-side fallback ran). */
  servedBy?: string;
  /** True when the requested model declined and a fallback model answered. */
  fallbackRan?: boolean;
}

/**
 * Stream one coach turn.
 *
 * - `system` carries a cache_control breakpoint. It is identical every turn,
 *   but caching only kicks in above a model-specific minimum prefix — 512
 *   tokens on Opus 5 / Fable 5.1, 1024 on Sonnet 5 (shorter prefixes are
 *   silently not cached). With the DERIVED legend the default prompt is
 *   ~3.3k chars ≈ 800 tokens: expect cache hits on Opus 5 / Fable 5.1 and
 *   none on Sonnet 5 unless the profile/notes push it past 1024. Verify with
 *   `usage.cache_read_input_tokens` rather than assuming (R5-13).
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
    if (stopReason === 'max_tokens' || !text) {
      return { text: TRUNCATED_TEXT, refused: false, truncated: true, partialText: text, stopReason, servedBy: final.model, fallbackRan };
    }
    return { text, refused: false, truncated: false, stopReason, servedBy: final.model, fallbackRan };
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
 * not truncated — the UI decides how to flag `over`). TRUNCATED_TEXT is a
 * status line, not advice: it is returned as-is with `truncated: true` so the
 * caller can render it as an error bubble instead of bolding a fragment (R5-4).
 */
export function postProcessReply(text: string, question: string): { text: string; words: number; over: boolean; truncated: boolean } {
  const raw = (text ?? '').trim();
  if (raw === TRUNCATED_TEXT) return { text: TRUNCATED_TEXT, words: wordCount(TRUNCATED_TEXT), over: false, truncated: true };
  const medical = isMedicalAsk(question);
  const withCue = ensureDoctorCue(raw, medical);
  const withBold = ensureBoldAction(withCue);
  const { words, over } = checkLength(withBold);
  return { text: withBold, words, over, truncated: false };
}
