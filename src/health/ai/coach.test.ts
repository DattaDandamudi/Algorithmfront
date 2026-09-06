/**
 * Prompt-building tests for the Claude coach. Nothing here touches the
 * network: askCoach is exercised against a duck-typed stub client.
 */
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../data/types';
import { DEFAULT_AI, DEFAULT_PROFILE, DEFAULT_TARGETS } from '../data/defaults';
import {
  CoachError,
  MEDICAL_SUFFIX,
  REFUSAL_TEXT,
  TRUNCATED_TEXT,
  askCoach,
  buildMessages,
  buildSystemPrompt,
  buildTurnContext,
  compactJson,
  describeSplit,
  postProcessReply,
  toCoachError,
} from './coach';
import { emptyContext, fullContext } from './coachContext.fixture';
import { wordCount } from './guardrails';

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt(DEFAULT_PROFILE, DEFAULT_TARGETS, DEFAULT_AI);

  it('names the app and denies being a doctor', () => {
    expect(prompt.startsWith('You are Pulse Coach, an in-app performance coach. You are NOT a doctor.')).toBe(true);
    expect(buildSystemPrompt(DEFAULT_PROFILE, DEFAULT_TARGETS, { ...DEFAULT_AI, appName: 'Zed' })).toContain('You are Zed Coach');
  });

  it('renders the PROFILE block from the real profile and targets', () => {
    for (const s of [
      'age 26, male, 172 lb / 78 kg, beginner lifter, 4-day upper/lower split',
      'moderate-deficit fat-loss phase',
      '1950 kcal, 180 g protein, 60–65 g fat',
      'carbs 150–175 g lift / 70–100 g rest, 30 g fiber, 8k–10k steps, bed 23:00',
      'Vitamin D (25-OH) 19 ng/mL (low)',
      'Ferritin 23 ng/mL (low)',
      'Omega-3 index 3% (low)',
      'Zinc (low-normal)',
      'Testosterone (total) 382 ng/dL (low-normal)',
      'Lead (blood) 4.3 µg/dL (elevated)',
      'daily tobacco (quitting)',
      'Food prefs: Indian/Middle Eastern restaurant food.',
      '2. LAST_30_DAYS (compact JSON array of daily records).',
      '3. TODAY (partial log so far).',
    ]) {
      expect(prompt).toContain(s);
    }
  });

  it('is not hard-coded — a different profile changes the numbers', () => {
    const p = buildSystemPrompt(
      { ...DEFAULT_PROFILE, age: 40, weightLb: 200, trainingLevel: 'advanced', goalPhase: 'muscle-gain', bloodwork: [], tobaccoQuitting: false, tobaccoBaselinePerDay: undefined },
      { ...DEFAULT_TARGETS, kcal: 2600, protein: 200, fatFloor: 70, fatTarget: 80 },
      DEFAULT_AI,
    );
    expect(p).toContain('age 40, male, 200 lb / 91 kg, advanced lifter');
    expect(p).toContain('lean muscle-gain phase');
    expect(p).toContain('2600 kcal, 200 g protein, 70–80 g fat');
    expect(p).toContain('Bloodwork: none on file');
    expect(p).toContain('no tobacco');
    expect(p).toContain('Respect the 70 g fat floor');
    expect(p).not.toContain('172 lb');
    expect(p).not.toContain('1950');
  });

  it('carries the §8 RULES, GUARDRAILS and OUTPUT verbatim', () => {
    for (const s of [
      'RULES:\n- ≤120 words. One clear, specific action.',
      '- Always cite the user\'s ACTUAL numbers ("your HRV is 42 ms, 8 below baseline").',
      '- Second person, supportive but direct. Cause → effect → one action.',
      '- Protein-first for nutrition. Respect the 60 g fat floor and carb day-type.',
      '- Ground training advice in WHOOP recovery band + HRV SWC.',
      'GUARDRAILS:\n- No diagnosis, no prescription, no interpreting labs as disease.',
      '"confirm dosing and any changes with your doctor."',
      'If input suggests a medical emergency or acute symptoms, stop advising and tell the user',
      '- Never fabricate numbers; if a datapoint is missing, say so.',
      '- Wellness/informational only; not a substitute for professional medical advice.',
      'OUTPUT: plain text, ≤120 words, ending with the single action in **bold**.',
    ]) {
      expect(prompt).toContain(s);
    }
  });

  it('switches the tone line', () => {
    expect(prompt).toContain('TONE: Conversational');
    const direct = buildSystemPrompt(DEFAULT_PROFILE, DEFAULT_TARGETS, { ...DEFAULT_AI, tone: 'direct' });
    expect(direct).toContain('TONE: Direct');
    expect(direct).not.toContain('TONE: Conversational');
  });

  it('is deterministic (cacheable)', () => {
    expect(buildSystemPrompt(DEFAULT_PROFILE, DEFAULT_TARGETS, DEFAULT_AI)).toBe(prompt);
    expect(prompt).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('describes splits from the weekday table', () => {
    expect(describeSplit(DEFAULT_PROFILE.split)).toBe('4-day upper/lower split');
    expect(describeSplit({ 0: 'rest', 1: 'push', 2: 'pull', 3: 'legs', 4: 'rest', 5: 'push', 6: 'pull' })).toBe('5-day push/pull/legs split');
    expect(describeSplit({ 0: 'rest', 1: 'rest', 2: 'rest', 3: 'rest', 4: 'rest', 5: 'rest', 6: 'rest' })).toBe('no structured training split');
  });
});

describe('buildTurnContext', () => {
  const ctx = fullContext();
  const out = buildTurnContext(ctx);
  const [derivedLine, last30Line, todayLine] = out.split('\n');

  it('has the three labelled blocks in order', () => {
    expect(out.split('\n')).toHaveLength(3);
    expect(derivedLine.startsWith('DERIVED (already computed for you; cite these numbers')).toBe(true);
    expect(last30Line.startsWith('LAST_30_DAYS: [')).toBe(true);
    expect(todayLine.startsWith('TODAY: {')).toBe(true);
  });

  it('serialises compact JSON with no whitespace and no nulls', () => {
    for (const line of [derivedLine, last30Line, todayLine]) {
      const json = line.slice(line.search(/[[{]/));
      expect(() => JSON.parse(json)).not.toThrow();
      expect(json).not.toMatch(/":\s/);
      expect(json).not.toMatch(/,\s"/);
      expect(json).not.toContain('null');
    }
  });

  it('carries the derived numbers the coach must cite', () => {
    for (const s of [
      '"readiness":{"score":71,"band":"green","source":"whoop"',
      '"hrv":{"today":54,"baseline7":52,"lnMean7":3.95,"swcLower":48,"swcUpper":56,"band":"balanced","cv7":6.2',
      '"rhr":{"today":52,"baseline":54,"delta":-2',
      '"sleep":{"hours":7.4,"need":7.9,"debtMin":30,"bedtimeSdMin":38',
      '"weight":{"latest":171.8,"trend":171.9,"weeklyRateLb":-1.1,"weeklyRatePct":-0.64,"targetLbPerWk":[0.86,1.72],"inBand":"in","weighInsThisWeek":6}',
      '"expenditure":{"tdee":2480,"valid":true,"reason":"ok","suggestedKcal":1950,"suggestedDelta":0}',
      '"remaining":{"kc":820,"p":82,"f":27,"c":65,"fi":16}',
      '"tobacco":{"today":2,"avg7":3.1,"avg30":3.6,"streakDays":0,"hrvSmokeFree":56,"hrvSmoking":50}',
      '"frequency":{"redMeatServings7d":3,"fishServings7d":1',
      '"adherence":{"loggingStreak":12',
      '"dayType":"lift","session":"lower"',
    ]) {
      expect(derivedLine).toContain(s);
    }
    expect(derivedLine).not.toContain('bloodwork');
    expect(derivedLine).not.toContain('last30');
  });

  it('includes the 30-day records and today with meals', () => {
    expect(last30Line).toContain('{"d":"2026-08-06","w":173.4,"wt":173.5');
    expect(last30Line).toContain('"mealCount":4');
    expect(todayLine).toContain('"d":"2026-09-04"');
    expect(todayLine).toContain('"meals":[{"id":"m1","t":"08:30","n":"eggs and roti"');
  });

  it('handles an empty context without nulls', () => {
    const e = buildTurnContext(emptyContext());
    expect(e).not.toContain('null');
    expect(e).toContain('\nLAST_30_DAYS: []');
    expect(e).toContain('\nTODAY: {}');
    expect(e).toContain('"weighInsThisWeek":0');
    expect(e).toContain('"today":0');
  });

  it('compactJson drops nulls, keeps zeros/false, rounds floats', () => {
    expect(compactJson({ a: null, b: undefined, c: 0, d: false, e: 1.23456, f: [null, 1, { g: null }], h: NaN })).toEqual({
      c: 0,
      d: false,
      e: 1.23,
      f: [1, {}],
    });
  });
});

function msg(i: number, role: ChatMessage['role'], text: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id: `m${i}`, role, text, ts: 1_700_000_000_000 + i, ...extra };
}

function history(n: number): ChatMessage[] {
  return Array.from({ length: n }, (_, i) => msg(i, i % 2 === 0 ? 'user' : 'assistant', `turn ${i}`));
}

describe('buildMessages', () => {
  const ctx = fullContext();

  it('caps prior history at 8 messages by default and appends the new user turn', () => {
    const out = buildMessages(history(20), 'Should I train today?', ctx);
    expect(out).toHaveLength(9);
    expect(out[0].role).toBe('user');
    expect(out[0].content).toBe('turn 12');
    expect(out[7]).toEqual({ role: 'assistant', content: 'turn 19' });
    const last = out[8];
    expect(last.role).toBe('user');
    expect(String(last.content).startsWith('DERIVED (already computed')).toBe(true);
    expect(String(last.content)).toContain('\n\nQUESTION: Should I train today?');
    expect(String(last.content).endsWith('QUESTION: Should I train today?')).toBe(true);
  });

  it('replays prior turns as plain text without context blocks', () => {
    const out = buildMessages(history(4), 'What should I eat now?', ctx);
    for (const m of out.slice(0, -1)) {
      expect(typeof m.content).toBe('string');
      expect(m.content).not.toContain('DERIVED');
    }
  });

  it('honours maxTurns and always starts on a user turn', () => {
    const out = buildMessages(history(20), 'hi', ctx, { maxTurns: 3 });
    // slice(-3) → [assistant 17, user 18, assistant 19]; the leading assistant is dropped
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(out[0].content).toBe('turn 18');
    expect(buildMessages(history(6), 'hi', ctx, { maxTurns: 0 })).toHaveLength(1);
  });

  it('skips error bubbles, empty and still-streaming messages', () => {
    const h = [
      msg(0, 'user', 'q1'),
      msg(1, 'assistant', 'Check your API key', { source: 'error' }),
      msg(2, 'assistant', '   '),
      msg(3, 'assistant', 'partial', { streaming: true }),
      msg(4, 'assistant', 'real answer', { source: 'claude' }),
    ];
    const out = buildMessages(h, 'next', ctx);
    expect(out.map((m) => m.content)).toEqual(['q1', 'real answer', expect.stringContaining('QUESTION: next')]);
  });

  it('adds the medical suffix for lab/medication/symptom questions only', () => {
    const med = buildMessages([], 'Are my vitamin D / ferritin / omega-3 habits on track?', ctx);
    expect(String(med[0].content).endsWith(MEDICAL_SUFFIX)).toBe(true);
    const plain = buildMessages([], 'Should I train today?', ctx);
    expect(String(plain[0].content)).not.toContain(MEDICAL_SUFFIX);
  });
});

describe('postProcessReply', () => {
  it('adds the doctor cue for medical asks and bolds the action', () => {
    const r = postProcessReply('Your ferritin is 23. Add red meat twice this week.', 'is my ferritin ok?');
    expect(r.text).toBe('Your ferritin is 23. Add red meat twice this week. **Confirm dosing and any changes with your doctor.**');
    expect(r.words).toBe(wordCount(r.text));
    expect(r.over).toBe(false);
  });

  it('leaves a compliant reply untouched apart from trimming', () => {
    const r = postProcessReply('  Readiness 71%. **Progress your lower-body loads today.**  ', 'Should I train today?');
    expect(r.text).toBe('Readiness 71%. **Progress your lower-body loads today.**');
    expect(r.text).not.toContain('doctor');
  });

  it('reports over-length replies without truncating', () => {
    const long = Array.from({ length: 130 }, (_, i) => `w${i}`).join(' ');
    const r = postProcessReply(long, 'hi');
    expect(r.over).toBe(true);
    expect(r.words).toBe(130);
    expect(r.text.endsWith('**')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// askCoach against a stub client (no network)
// ---------------------------------------------------------------------------

interface StubFinal {
  content: Array<{ type: string; text?: string }>;
  stop_reason: string | null;
  model: string;
  usage: { iterations: Array<{ type: string }> | null };
}

function stubClient(final: StubFinal, deltas: string[] = [], throwErr?: unknown) {
  const calls: unknown[] = [];
  const client = {
    beta: {
      messages: {
        stream(params: unknown) {
          calls.push(params);
          if (throwErr) throw throwErr;
          const stream = {
            on(event: string, cb: (delta: string, snapshot: string) => void) {
              if (event === 'text') {
                let snap = '';
                for (const d of deltas) {
                  snap += d;
                  cb(d, snap);
                }
              }
              return stream;
            },
            finalMessage: async () => final,
          };
          return stream;
        },
      },
    },
  };
  return { client: client as unknown as Anthropic, calls };
}

const baseFinal = (over: Partial<StubFinal> = {}): StubFinal => ({
  content: [{ type: 'text', text: 'Readiness 71%. **Progress your loads today.**' }],
  stop_reason: 'end_turn',
  model: 'claude-opus-5',
  usage: { iterations: null },
  ...over,
});

describe('askCoach', () => {
  const messages = buildMessages([], 'Should I train today?', fullContext());

  it('sends the documented request shape', async () => {
    const { client, calls } = stubClient(baseFinal());
    await askCoach({ client, model: 'claude-opus-5', system: 'SYS', messages });
    const p = calls[0] as Record<string, unknown>;
    expect(p.model).toBe('claude-opus-5');
    expect(p.max_tokens).toBe(4096);
    expect(p.system).toEqual([{ type: 'text', text: 'SYS', cache_control: { type: 'ephemeral' } }]);
    expect(p.messages).toBe(messages);
    expect(p.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(p.fallbacks).toBe('default');
    expect(p.output_config).toEqual({ effort: 'medium' });
    expect(p).not.toHaveProperty('thinking');
    expect(p).not.toHaveProperty('temperature');
  });

  it('streams deltas and returns the final text', async () => {
    const { client } = stubClient(baseFinal(), ['Readiness 71%. ', '**Progress your loads today.**']);
    const seen: string[] = [];
    const r = await askCoach({ client, model: 'claude-opus-5', system: 'SYS', messages, onDelta: (d) => seen.push(d) });
    expect(seen.join('')).toBe('Readiness 71%. **Progress your loads today.**');
    expect(r).toEqual({
      text: 'Readiness 71%. **Progress your loads today.**',
      refused: false,
      truncated: false,
      stopReason: 'end_turn',
      servedBy: 'claude-opus-5',
      fallbackRan: false,
    });
  });

  it('returns a friendly message on refusal', async () => {
    const { client } = stubClient(baseFinal({ content: [], stop_reason: 'refusal' }));
    const r = await askCoach({ client, model: 'claude-opus-5', system: 'SYS', messages });
    expect(r.refused).toBe(true);
    expect(r.stopReason).toBe('refusal');
    expect(r.text).toBe(REFUSAL_TEXT);
  });

  it('reports the serving model when a server-side fallback ran', async () => {
    const { client } = stubClient(baseFinal({ model: 'claude-opus-4-8', usage: { iterations: [{ type: 'message' }, { type: 'fallback_message' }] } }));
    const r = await askCoach({ client, model: 'claude-opus-5', system: 'SYS', messages });
    expect(r.fallbackRan).toBe(true);
    expect(r.servedBy).toBe('claude-opus-4-8');
  });

  it('maps SDK errors to user-readable CoachErrors', async () => {
    const auth = new Anthropic.AuthenticationError(401, undefined, 'invalid x-api-key', new Headers());
    const { client } = stubClient(baseFinal(), [], auth);
    await expect(askCoach({ client, model: 'claude-opus-5', system: 'SYS', messages })).rejects.toMatchObject({
      name: 'CoachError',
      kind: 'auth',
      message: expect.stringContaining('Check your API key'),
    });
  });
});

describe('toCoachError', () => {
  it('distinguishes retryable from non-retryable failures', () => {
    expect(toCoachError(new Anthropic.RateLimitError(429, undefined, 'slow down', new Headers()))).toMatchObject({ kind: 'rate_limit' });
    expect(toCoachError(new Anthropic.APIConnectionError({ message: 'fetch failed' }))).toMatchObject({
      kind: 'network',
      message: expect.stringContaining('Network/proxy issue'),
    });
    expect(toCoachError(new Anthropic.BadRequestError(400, undefined, 'fallbacks not supported', new Headers()))).toMatchObject({
      kind: 'bad_request',
      message: 'Request rejected (400): fallbacks not supported',
    });
    expect(toCoachError(new Anthropic.NotFoundError(404, undefined, 'model: nope', new Headers()))).toMatchObject({ kind: 'not_found' });
    expect(toCoachError(new Anthropic.InternalServerError(529, undefined, 'overloaded', new Headers()))).toMatchObject({ kind: 'server', status: 529 });
    expect(toCoachError(new Anthropic.APIUserAbortError())).toMatchObject({ kind: 'abort' });
    expect(toCoachError(new Error('boom'))).toMatchObject({ kind: 'unknown', message: 'boom' });
    expect(toCoachError('weird')).toBeInstanceOf(CoachError);
  });
});

// ---------------------------------------------------------------------------
// Review round 5 reproductions
// ---------------------------------------------------------------------------

describe('R5-4 askCoach — truncated or empty replies are flagged, not bolded', () => {
  const messages = buildMessages([], 'Should I train today?', fullContext());

  it('stop_reason max_tokens → truncated with the cut-off text kept aside', async () => {
    const { client } = stubClient(baseFinal({ content: [{ type: 'text', text: 'Readiness 71%. Your HRV' }], stop_reason: 'max_tokens' }));
    const r = await askCoach({ client, model: 'claude-opus-5', system: 'SYS', messages });
    expect(r.truncated).toBe(true);
    expect(r.refused).toBe(false);
    expect(r.text).toBe(TRUNCATED_TEXT);
    expect(r.partialText).toBe('Readiness 71%. Your HRV');
    expect(r.stopReason).toBe('max_tokens');
  });

  it('an empty final text (thinking consumed the budget) is also truncated', async () => {
    const { client } = stubClient(baseFinal({ content: [{ type: 'thinking' }], stop_reason: 'end_turn' }));
    const r = await askCoach({ client, model: 'claude-opus-5', system: 'SYS', messages });
    expect(r.truncated).toBe(true);
    expect(r.text).toBe(TRUNCATED_TEXT);
  });

  it('postProcessReply passes TRUNCATED_TEXT through untouched — no bold fragment, no doctor cue', () => {
    const r = postProcessReply(TRUNCATED_TEXT, 'is my ferritin ok?');
    expect(r.text).toBe(TRUNCATED_TEXT);
    expect(r.text).not.toContain('**');
    expect(r.truncated).toBe(true);
    expect(postProcessReply('Readiness 71%. Hold loads.', 'hi').truncated).toBe(false);
  });

  it('TRUNCATED_TEXT tells the user to ask again', () => {
    expect(TRUNCATED_TEXT).toMatch(/cut off/i);
    expect(TRUNCATED_TEXT).toMatch(/ask again/i);
  });
});

describe('R5-10 buildMessages — guardrail bubbles are not replayed as model turns', () => {
  it('skips emergency / refusal bubbles', () => {
    const h = [
      msg(0, 'user', 'q1'),
      msg(1, 'assistant', 'This sounds like it needs urgent care', { source: 'guardrail' }),
      msg(2, 'user', 'q2'),
      msg(3, 'assistant', REFUSAL_TEXT, { source: 'guardrail' }),
      msg(4, 'user', 'q3'),
      msg(5, 'assistant', 'real answer', { source: 'claude' }),
    ];
    const out = buildMessages(h, 'next', fullContext());
    expect(out.map((m) => m.content)).toEqual(['q1', 'q2', 'q3', 'real answer', expect.stringContaining('QUESTION: next')]);
  });
});

describe('R5-13 system prompt — stable DERIVED legend pushes the prefix past the 512-token minimum', () => {
  const prompt = buildSystemPrompt(DEFAULT_PROFILE, DEFAULT_TARGETS, DEFAULT_AI);

  it('carries the legend and is long enough to cache on Opus 5 / Fable 5.1 (chars/4 ≈ tokens)', () => {
    expect(prompt).toContain('DERIVED legend');
    expect(prompt).toContain('swcLower');
    expect(prompt.length).toBeGreaterThanOrEqual(2600);
  });

  it('stays identical across turns (no dates, no per-turn numbers)', () => {
    expect(buildSystemPrompt(DEFAULT_PROFILE, DEFAULT_TARGETS, DEFAULT_AI)).toBe(prompt);
    expect(buildTurnContext(fullContext())).not.toContain('DERIVED legend');
  });
});
