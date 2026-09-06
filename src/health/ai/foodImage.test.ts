import { describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_AI, DEFAULT_PROFILE } from '../data/defaults';
import type { AISettings } from '../data/types';
import { FOOD_SCHEMA, buildFoodSystemPrompt } from './food';
import {
  PHOTO_CONFIDENCE_CAP,
  PHOTO_RULES,
  buildFoodImageSystemPrompt,
  buildImageUserContent,
  capPhotoConfidence,
  dataUrlToBase64,
  estimateFoodFromEncodedImage,
  estimateFoodFromImage,
  fitWithin,
  type EncodedImage,
} from './foodImage';

const AI_ON: AISettings = { ...DEFAULT_AI, provider: 'anthropic-direct', apiKey: 'sk-test', model: 'claude-test' };
const IMG: EncodedImage = { data: 'AAAA', media_type: 'image/jpeg', width: 640, height: 480 };

function mockClient(create: (...args: unknown[]) => unknown) {
  const fn = vi.fn(create);
  return { client: { messages: { create: fn } } as unknown as Anthropic, create: fn };
}

function textResponse(json: unknown, stop_reason = 'end_turn', stop_details: unknown = null) {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-test',
    stop_reason,
    stop_details,
    content: [{ type: 'text', text: typeof json === 'string' ? json : JSON.stringify(json), citations: null }],
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

const PLATE = {
  items: [
    { name: 'chicken biryani', grams: 350, kcal: 620, protein_g: 32, fat_g: 22, carbs_g: 72, fiber_g: 3, confidence: 0.9, assumptions: 'restaurant plate', tags: ['poultry', 'grain', 'restaurant'] },
    { name: 'raita', grams: 80, kcal: 60, protein_g: 3, fat_g: 3, carbs_g: 5, fiber_g: 0.5, confidence: 0.4, assumptions: 'estimated from photo, small bowl', tags: ['dairy'] },
  ],
  clarify: null,
};

describe('prompt and message shape', () => {
  it('reuses the §9 text prompt and appends the photo rules with the confidence cap', () => {
    const p = buildFoodImageSystemPrompt(DEFAULT_PROFILE);
    expect(p.startsWith(buildFoodSystemPrompt(DEFAULT_PROFILE))).toBe(true);
    expect(p).toContain(PHOTO_RULES);
    expect(p).toMatch(/no depth cue/);
    expect(p).toContain(`Never report confidence above ${PHOTO_CONFIDENCE_CAP}`);
  });

  it('puts the base64 image block first, then the hint as text', () => {
    const content = buildImageUserContent(IMG, ' home-cooked, about 300 g ');
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } });
    expect(content[1]).toEqual({ type: 'text', text: 'Photo of what I am about to eat. Hint: home-cooked, about 300 g' });
    const noHint = buildImageUserContent(IMG);
    expect(noHint[1]).toMatchObject({ type: 'text' });
    expect((noHint[1] as { text: string }).text).not.toContain('Hint');
  });
});

describe('capPhotoConfidence', () => {
  it('caps every item at the photo ceiling and stamps the caveat once', () => {
    const out = capPhotoConfidence(PLATE);
    expect(out.items[0].confidence).toBe(PHOTO_CONFIDENCE_CAP);
    expect(out.items[0].assumptions).toBe('estimated from photo; restaurant plate');
    expect(out.items[1].confidence).toBe(0.4);
    expect(out.items[1].assumptions).toBe('estimated from photo, small bowl');
    expect(capPhotoConfidence({ items: [{ ...PLATE.items[0], assumptions: '' }] }).items[0].assumptions).toBe('estimated from photo');
  });
});

describe('estimateFoodFromEncodedImage', () => {
  it('sends the image with the schema-constrained output config and caps confidence', async () => {
    const { client, create } = mockClient(async () => textResponse(PLATE));
    const est = await estimateFoodFromEncodedImage(IMG, AI_ON, DEFAULT_PROFILE, client, 'biryani');
    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0][0] as Anthropic.MessageCreateParamsNonStreaming;
    expect(params.model).toBe('claude-test');
    expect(params.max_tokens).toBe(2048);
    expect(params.system).toBe(buildFoodImageSystemPrompt(DEFAULT_PROFILE));
    expect(params.output_config).toEqual({ format: { type: 'json_schema', schema: FOOD_SCHEMA }, effort: 'low' });
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].role).toBe('user');
    const content = params.messages[0].content as Anthropic.ContentBlockParam[];
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } });
    expect(content[1]).toMatchObject({ type: 'text', text: expect.stringContaining('biryani') });

    expect(est.source).toBe('claude');
    expect(est.items).toHaveLength(2);
    expect(est.items[0].name).toBe('chicken biryani');
    expect(est.items[0].confidence).toBe(PHOTO_CONFIDENCE_CAP);
    expect(est.items[1].confidence).toBe(0.4);
    expect(est.items.every((it) => it.confidence <= PHOTO_CONFIDENCE_CAP)).toBe(true);
    expect(est.clarify).toBeNull();
  });

  it('falls back to the default model when settings carry none', async () => {
    const { client, create } = mockClient(async () => textResponse(PLATE));
    await estimateFoodFromEncodedImage(IMG, { ...AI_ON, model: '' }, DEFAULT_PROFILE, client);
    expect((create.mock.calls[0][0] as { model: string }).model).toBe('claude-opus-5');
  });

  it('surfaces a refusal with its explanation', async () => {
    const { client } = mockClient(async () => textResponse('', 'refusal', { type: 'refusal', category: null, explanation: 'not food' }));
    await expect(estimateFoodFromEncodedImage(IMG, AI_ON, DEFAULT_PROFILE, client)).rejects.toThrow(/declined to estimate from this photo: not food/);
  });

  it('reports a max_tokens cut-off readably', async () => {
    const { client } = mockClient(async () => textResponse('{"items":[', 'max_tokens'));
    await expect(estimateFoodFromEncodedImage(IMG, AI_ON, DEFAULT_PROFILE, client)).rejects.toThrow(/cut off/);
  });

  it('rejects invalid JSON and a missing text block', async () => {
    const { client: bad } = mockClient(async () => textResponse('not json'));
    await expect(estimateFoodFromEncodedImage(IMG, AI_ON, DEFAULT_PROFILE, bad)).rejects.toThrow(/invalid JSON/);
    const { client: empty } = mockClient(async () => ({ ...textResponse(PLATE), content: [] }));
    await expect(estimateFoodFromEncodedImage(IMG, AI_ON, DEFAULT_PROFILE, empty)).rejects.toThrow(/no text/);
  });

  it('passes network errors through untouched', async () => {
    const { client } = mockClient(async () => {
      throw new Error('Connection error.');
    });
    await expect(estimateFoodFromEncodedImage(IMG, AI_ON, DEFAULT_PROFILE, client)).rejects.toThrow('Connection error.');
  });

  it('keeps an empty items array with a clarify question (nothing visible)', async () => {
    const { client } = mockClient(async () => textResponse({ items: [], clarify: 'What is on the plate?' }));
    const est = await estimateFoodFromEncodedImage(IMG, AI_ON, DEFAULT_PROFILE, client);
    expect(est.items).toEqual([]);
    expect(est.clarify).toBe('What is on the plate?');
  });
});

describe('estimateFoodFromImage', () => {
  it('encodes the file (injected) then estimates, forwarding the hint', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'plate.jpg', { type: 'image/jpeg' });
    const encode = vi.fn(async (f: File) => {
      expect(f).toBe(file);
      return IMG;
    });
    const { client, create } = mockClient(async () => textResponse(PLATE));
    const est = await estimateFoodFromImage(file, AI_ON, DEFAULT_PROFILE, client, 'lunch', { encode });
    expect(encode).toHaveBeenCalledTimes(1);
    const content = (create.mock.calls[0][0] as Anthropic.MessageCreateParamsNonStreaming).messages[0].content as Anthropic.ContentBlockParam[];
    expect(content[0]).toMatchObject({ type: 'image', source: { type: 'base64', data: 'AAAA' } });
    expect(content[1]).toMatchObject({ text: expect.stringContaining('lunch') });
    expect(est.items[0].confidence).toBe(PHOTO_CONFIDENCE_CAP);
  });

  it('propagates encoder failures without calling Claude', async () => {
    const file = new File([''], 'x.txt', { type: 'text/plain' });
    const { client, create } = mockClient(async () => textResponse(PLATE));
    await expect(estimateFoodFromImage(file, AI_ON, DEFAULT_PROFILE, client, undefined, { encode: async () => { throw new Error('not an image'); } })).rejects.toThrow('not an image');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('resize helpers (pure)', () => {
  it('fitWithin scales the longest edge to the cap, keeps aspect and never upscales', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 960, height: 1280 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1280, 1280)).toEqual({ width: 1280, height: 1280 });
    expect(fitWithin(5000, 10, 1000)).toEqual({ width: 1000, height: 2 });
    expect(fitWithin(0, 0)).toEqual({ width: 1, height: 1 });
  });

  it('dataUrlToBase64 strips the prefix', () => {
    expect(dataUrlToBase64('data:image/jpeg;base64,/9j/4AAQ')).toBe('/9j/4AAQ');
    expect(dataUrlToBase64('garbage')).toBe('');
  });
});
