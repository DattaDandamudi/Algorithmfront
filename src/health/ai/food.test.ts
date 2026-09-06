import { describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_AI, DEFAULT_FAVORITES, DEFAULT_PROFILE } from '../data/defaults';
import type { AISettings } from '../data/types';
import {
  AI_UNAVAILABLE_NOTE,
  FOOD_PROMPT_BASE,
  FOOD_SCHEMA,
  FOOD_TAGS,
  buildFoodSystemPrompt,
  estimateFood,
  estimateFoodWithClaude,
  normaliseFoodJSON,
} from './food';

const AI_ON: AISettings = { ...DEFAULT_AI, provider: 'anthropic-direct', apiKey: 'sk-test', model: 'claude-test' };

/** Minimal mock of the SDK surface food.ts touches. Never hits the network. */
function mockClient(create: (...args: unknown[]) => unknown) {
  const fn = vi.fn(create);
  return { client: { messages: { create: fn } } as unknown as Anthropic, create: fn };
}

function textResponse(json: unknown, stop_reason = 'end_turn') {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-test',
    stop_reason,
    stop_details: null,
    content: [{ type: 'text', text: typeof json === 'string' ? json : JSON.stringify(json), citations: null }],
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

const GOOD = {
  items: [
    { name: 'chicken tikka', grams: 200, kcal: 330, protein_g: 50, fat_g: 12, carbs_g: 6, fiber_g: 1, confidence: 0.9, assumptions: '200 g as stated', tags: ['poultry', 'restaurant'] },
    { name: 'roti', grams: 40, kcal: 120, protein_g: 3.6, fat_g: 2.4, carbs_g: 21, fiber_g: 2.4, confidence: 0.75, assumptions: 'assumed 1 medium roti, 40 g', tags: ['grain'] },
  ],
  clarify: null,
};

describe('FOOD_SCHEMA', () => {
  it('is a strict object schema with every field required and additionalProperties:false', () => {
    expect(FOOD_SCHEMA.type).toBe('object');
    expect(FOOD_SCHEMA.additionalProperties).toBe(false);
    expect([...FOOD_SCHEMA.required]).toEqual(['items', 'clarify']);
    const item = FOOD_SCHEMA.properties.items.items;
    expect(item.type).toBe('object');
    expect(item.additionalProperties).toBe(false);
    expect([...item.required]).toEqual(['name', 'grams', 'kcal', 'protein_g', 'fat_g', 'carbs_g', 'fiber_g', 'confidence', 'assumptions', 'tags']);
    expect(Object.keys(item.properties).sort()).toEqual([...item.required].sort());
    expect(item.properties.tags.items.enum).toEqual(FOOD_TAGS);
    expect(FOOD_SCHEMA.properties.clarify.anyOf.map((a) => a.type)).toEqual(['string', 'null']);
  });

  it('avoids unsupported numeric constraints (clamped client-side instead)', () => {
    const s = JSON.stringify(FOOD_SCHEMA);
    expect(s).not.toMatch(/"minimum"|"maximum"|"minLength"|"maxLength"/);
  });
});

describe('buildFoodSystemPrompt', () => {
  it('contains the §9 text verbatim plus cuisine priors, notes and the one-question rule', () => {
    const p = buildFoodSystemPrompt(DEFAULT_PROFILE);
    expect(p.startsWith(FOOD_PROMPT_BASE)).toBe(true);
    expect(p).toContain('tandoori/tikka = yogurt-marinated, moderate added oil');
    expect(p).toContain('Indian and Middle Eastern');
    expect(p).toContain(DEFAULT_PROFILE.foodNotes);
    expect(p).toContain('honour them exactly');
    expect(p).toMatch(/at most ONE clarifying question/);
  });

  it('degrades gracefully without cuisines or notes', () => {
    const p = buildFoodSystemPrompt({ ...DEFAULT_PROFILE, cuisines: [], foodNotes: '' });
    expect(p).toContain('No cuisine preference is set');
    expect(p).not.toContain('User food notes');
  });
});

describe('normaliseFoodJSON', () => {
  it('clamps numbers, confidence and unknown tags', () => {
    const out = normaliseFoodJSON({
      items: [{ name: ' Dal ', grams: -5, kcal: '110', protein_g: NaN, fat_g: 4, carbs_g: 13, fiber_g: 4, confidence: 1.7, assumptions: 3, tags: ['legume', 'bogus', 7] }],
      clarify: '   ',
    });
    expect(out.items[0]).toEqual({ name: 'Dal', grams: 0, kcal: 110, protein_g: 0, fat_g: 4, carbs_g: 13, fiber_g: 4, confidence: 1, assumptions: '', tags: ['legume'] });
    expect(out.clarify).toBeNull();
    expect(normaliseFoodJSON({ items: [], clarify: 'How big?' }).clarify).toBe('How big?');
  });

  it('throws on a missing items array', () => {
    expect(() => normaliseFoodJSON({ foo: 1 })).toThrow(/items/);
    expect(() => normaliseFoodJSON(null)).toThrow();
  });
});

describe('estimateFoodWithClaude', () => {
  it('sends the structured-output request and round-trips the JSON text block', async () => {
    const { client, create } = mockClient(async () => textResponse(GOOD));
    const est = await estimateFoodWithClaude('200 g chicken tikka and one roti', AI_ON, DEFAULT_PROFILE, client);
    expect(est.source).toBe('claude');
    expect(est.items).toHaveLength(2);
    expect(est.items[0]).toMatchObject({ name: 'chicken tikka', grams: 200, kcal: 330, confidence: 0.9 });
    expect(est.clarify).toBeNull();

    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0][0] as Record<string, unknown>;
    expect(params.model).toBe('claude-test');
    expect(params.max_tokens).toBe(2048);
    expect(params.messages).toEqual([{ role: 'user', content: '200 g chicken tikka and one roti' }]);
    expect(typeof params.system).toBe('string');
    expect(params.output_config).toEqual({ format: { type: 'json_schema', schema: FOOD_SCHEMA }, effort: 'low' });
  });

  it('skips non-text blocks and throws readable errors on refusal / truncation / bad JSON', async () => {
    const thinkingFirst = { ...textResponse(GOOD), content: [{ type: 'thinking', thinking: '…', signature: 'x' }, ...textResponse(GOOD).content] };
    const ok = await estimateFoodWithClaude('x', AI_ON, DEFAULT_PROFILE, mockClient(async () => thinkingFirst).client);
    expect(ok.items).toHaveLength(2);

    const refused = { ...textResponse('{}', 'refusal'), stop_details: { type: 'refusal', category: 'bio', explanation: 'nope' } };
    await expect(estimateFoodWithClaude('x', AI_ON, DEFAULT_PROFILE, mockClient(async () => refused).client)).rejects.toThrow(/declined.*nope/);
    await expect(estimateFoodWithClaude('x', AI_ON, DEFAULT_PROFILE, mockClient(async () => textResponse('{"items":[', 'max_tokens')).client)).rejects.toThrow(/max_tokens/);
    await expect(estimateFoodWithClaude('x', AI_ON, DEFAULT_PROFILE, mockClient(async () => textResponse('not json')).client)).rejects.toThrow(/invalid JSON/);
    await expect(estimateFoodWithClaude('x', AI_ON, DEFAULT_PROFILE, mockClient(async () => ({ ...textResponse(GOOD), content: [] })).client)).rejects.toThrow(/no text/);
  });
});

describe('estimateFood', () => {
  it('uses Claude when a client is provided and the provider is on', async () => {
    const { client, create } = mockClient(async () => textResponse(GOOD));
    const est = await estimateFood('200 g chicken tikka and one roti', AI_ON, DEFAULT_PROFILE, DEFAULT_FAVORITES, { client });
    expect(est.source).toBe('claude');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('falls back to the local parser when the client throws, and flags it', async () => {
    const { client } = mockClient(async () => {
      throw new Error('network down');
    });
    const est = await estimateFood('200 g chicken tikka and one roti', AI_ON, DEFAULT_PROFILE, DEFAULT_FAVORITES, { client });
    expect(est.source).toBe('local');
    expect(est.items).toHaveLength(2);
    expect(est.items[0].assumptions.startsWith(AI_UNAVAILABLE_NOTE)).toBe(true);
    expect(est.items[0]).toMatchObject({ grams: 200, confidence: 0.9 });
    expect(est.items[1].assumptions).not.toContain(AI_UNAVAILABLE_NOTE);
  });

  it('goes straight to the local parser when the provider is none or there is no client', async () => {
    const { client, create } = mockClient(async () => textResponse(GOOD));
    const off = await estimateFood('2 rotis', { ...AI_ON, provider: 'none' }, DEFAULT_PROFILE, [], { client });
    expect(off.source).toBe('local');
    expect(off.items[0]).toMatchObject({ name: 'Roti', grams: 80 });
    expect(create).not.toHaveBeenCalled();
    const noClient = await estimateFood('2 rotis', AI_ON, DEFAULT_PROFILE, []);
    expect(noClient.source).toBe('local');
    expect(noClient.items[0].assumptions).not.toContain(AI_UNAVAILABLE_NOTE);
  });
});
