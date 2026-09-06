import type Anthropic from '@anthropic-ai/sdk';
import type { AISettings, FoodEstimate, FoodEstimateItem, FoodItem, FoodTag, Profile } from '../data/types';
import { resolveModel } from './client';
import { toCoachError, type CoachErrorKind } from './coach';
import { parseFoodText } from './foodLocal';

/**
 * §9 AI food search — Claude path with structured outputs.
 *
 * The response is constrained by `output_config.format` (JSON schema; SDK
 * 0.124 `OutputConfig` = { format?: JSONOutputFormat, effort? }), so the model
 * cannot return prose or drift from the {items, clarify} shape. We still parse
 * and clamp defensively: a refusal or max_tokens stop may not honour the schema.
 *
 * This module never constructs a client — the caller (Log screen) passes one
 * built by ai/client.ts — and never touches the network in tests: pass a mock.
 * On any failure `estimateFood` degrades to the deterministic local parser so
 * logging always completes (spec §2: logging must take seconds).
 */

export const FOOD_TAGS: FoodTag[] = [
  'red-meat', 'poultry', 'fish', 'seafood', 'egg', 'dairy', 'veg', 'grain', 'legume',
  'home', 'restaurant', 'caffeine', 'alcohol', 'sweet',
];

/**
 * Structured-outputs schema for FoodEstimate (minus `source`, which we add).
 * Rules the API enforces: every object carries `additionalProperties: false`
 * and a `required` list; no numeric min/max (we clamp client-side instead);
 * nullable via anyOf. `tags` is optional in the app type but required here
 * (possibly empty) so the grammar has no optional branches.
 */
export const FOOD_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description: 'One entry per distinct food in the description.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short dish name, e.g. "chicken tikka".' },
          grams: { type: 'number', description: 'Portion weight in grams. Use the stated weight when given.' },
          kcal: { type: 'number' },
          protein_g: { type: 'number' },
          fat_g: { type: 'number' },
          carbs_g: { type: 'number' },
          fiber_g: { type: 'number' },
          confidence: { type: 'number', description: '0–1. 0.9 stated grams of a known dish; 0.75 counted units; 0.6 assumed portion; ≤0.45 uncertain dish.' },
          assumptions: { type: 'string', description: 'Short, e.g. "assumed 1 medium roti, 40 g; restaurant-style, moderate oil".' },
          tags: { type: 'array', items: { type: 'string', enum: FOOD_TAGS }, description: 'Dietary tags; may be empty.' },
        },
        required: ['name', 'grams', 'kcal', 'protein_g', 'fat_g', 'carbs_g', 'fiber_g', 'confidence', 'assumptions', 'tags'],
        additionalProperties: false,
      },
    },
    clarify: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'null, or ONE short question — only when the portion is truly ambiguous.',
    },
  },
  required: ['items', 'clarify'],
  additionalProperties: false,
} as const;

/** Spec §9 prompt, verbatim. */
export const FOOD_PROMPT_BASE = `Estimate macros for the described food. Use cuisine-specific priors for Indian & Middle
Eastern restaurant dishes (tandoori/tikka = yogurt-marinated, moderate added oil;
biryani = ghee + rice; shawarma = fatty meat + garlic sauce; roti/naan carb-dense).
Assume restaurant portions unless grams are given. Return ONLY JSON:
{
  "items":[{"name","grams","kcal","protein_g","fat_g","carbs_g","fiber_g",
            "confidence":0-1,"assumptions":"..."}],
  "clarify": null | "one short question ONLY if portion is truly ambiguous"
}
Ask at most ONE clarifying question, only when portion materially changes the estimate.`;

const CUISINE_LABELS: Record<string, string> = {
  indian: 'Indian',
  'middle-eastern': 'Middle Eastern',
  western: 'Western',
  generic: 'mixed',
};

function cuisineLabel(c: string): string {
  const k = c.trim().toLowerCase();
  return CUISINE_LABELS[k] ?? (k ? k.charAt(0).toUpperCase() + k.slice(1) : '');
}

/** §9 text + the user's cuisine priors and the grams-honouring / one-question rules. */
export function buildFoodSystemPrompt(profile: Profile): string {
  const cuisines = (profile.cuisines ?? []).map(cuisineLabel).filter(Boolean);
  const priors = cuisines.length
    ? `The user mostly eats ${cuisines.join(' and ')} food — default to those cuisines' preparations and restaurant portion sizes when a dish name is ambiguous.`
    : 'No cuisine preference is set — use typical restaurant preparations.';
  const notes = profile.foodNotes?.trim() ? `\nUser food notes: ${profile.foodNotes.trim()}` : '';
  return `${FOOD_PROMPT_BASE}

CUISINE PRIORS: ${priors}${notes}

RULES:
- When the user states grams (or ml), honour them exactly for that item — never override a stated quantity.
- When the user counts units ("2 rotis", "half a naan"), use a realistic unit weight and say so in assumptions.
- Assume restaurant portions unless the user says home-cooked or gives a weight.
- Split the description into one item per distinct food; keep names short.
- confidence: 0.9 for stated grams of a known dish, 0.75 for counted units, 0.6 for an assumed portion, 0.45 or lower when the dish itself is uncertain.
- tags: choose from ${FOOD_TAGS.join(', ')} (restaurant for takeaway dishes, home for home basics, caffeine for coffee/tea/cola).
- Ask at most ONE clarifying question, in "clarify", and only when the portion materially changes the estimate; otherwise "clarify" must be null.
- Output must be valid JSON matching the schema — no prose.`;
}

// ---------------------------------------------------------------------------
// Response validation
// ---------------------------------------------------------------------------

const TAG_SET = new Set<string>(FOOD_TAGS);

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback;
}

function toItem(raw: unknown): FoodEstimateItem {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const tags = Array.isArray(r.tags) ? (r.tags.filter((t): t is FoodTag => typeof t === 'string' && TAG_SET.has(t))) : [];
  return {
    name: str(r.name, 'Unnamed item') || 'Unnamed item',
    grams: num(r.grams),
    kcal: num(r.kcal),
    protein_g: num(r.protein_g),
    fat_g: num(r.fat_g),
    carbs_g: num(r.carbs_g),
    fiber_g: num(r.fiber_g),
    confidence: Math.min(1, num(r.confidence, 0.5)),
    assumptions: str(r.assumptions),
    tags,
  };
}

/** Coerce parsed JSON into a FoodEstimate: non-negative numbers, confidence 0–1, known tags, clarify string|null. */
export function normaliseFoodJSON(raw: unknown): Omit<FoodEstimate, 'source'> {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { items?: unknown }).items)) {
    throw new Error('Food estimate JSON is missing an "items" array.');
  }
  const r = raw as { items: unknown[]; clarify?: unknown };
  const clarify = typeof r.clarify === 'string' && r.clarify.trim() ? r.clarify.trim() : null;
  return { items: r.items.map(toItem), clarify };
}

// ---------------------------------------------------------------------------
// Claude call
// ---------------------------------------------------------------------------

export async function estimateFoodWithClaude(
  text: string,
  ai: AISettings,
  profile: Profile,
  client: Anthropic,
): Promise<FoodEstimate> {
  const res = await client.messages.create({
    // resolveModel, not ai.model: a blank stored model must fall back to the default, not send model: '' (R5-11).
    model: resolveModel(ai),
    max_tokens: 2048,
    system: buildFoodSystemPrompt(profile),
    messages: [{ role: 'user', content: text }],
    output_config: { format: { type: 'json_schema', schema: FOOD_SCHEMA }, effort: 'low' },
  });
  if (res.stop_reason === 'refusal') {
    const why = res.stop_details?.explanation ? `: ${res.stop_details.explanation}` : '.';
    throw new Error(`Claude declined to estimate this food${why}`);
  }
  if (res.stop_reason === 'max_tokens') {
    throw new Error('The food estimate was cut off (max_tokens). Try a shorter description.');
  }
  const block = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!block) throw new Error('Claude returned no text for the food estimate.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(block.text);
  } catch {
    throw new Error('Claude returned invalid JSON for the food estimate.');
  }
  return { ...normaliseFoodJSON(parsed), source: 'claude' };
}

/** Prefix of the first item's assumptions when Claude failed and the local parser answered (logUtils keys off it). */
export const AI_UNAVAILABLE_NOTE = 'AI unavailable — local estimate';

/** FoodEstimate plus, when Claude failed, the readable reason (additive — screens typed as FoodEstimate still work). */
export interface FoodEstimateResult extends FoodEstimate {
  /** User-readable failure ("Check your API key — Anthropic rejected it (401).") — same mapping as the coach (R5-12). */
  fallbackReason?: string;
  fallbackKind?: CoachErrorKind;
}

/**
 * Estimate food from free text. Uses Claude when a client is supplied and the
 * provider is not 'none'; on any error (auth, unknown model, network, refusal,
 * bad JSON) falls back to the deterministic local parser and flags it in the
 * first item's assumptions as "AI unavailable — local estimate (<reason>)",
 * with the reason also on `fallbackReason` so the Log screen can surface a
 * misconfigured key or model instead of a silent local answer (R5-12).
 */
export async function estimateFood(
  text: string,
  ai: AISettings,
  profile: Profile,
  extra: FoodItem[],
  deps: { client?: Anthropic | null } = {},
): Promise<FoodEstimateResult> {
  const client = deps.client ?? null;
  if (client && ai.provider !== 'none') {
    try {
      return await estimateFoodWithClaude(text, ai, profile, client);
    } catch (err) {
      const why = toCoachError(err);
      const note = `${AI_UNAVAILABLE_NOTE} (${why.message})`;
      const local: FoodEstimateResult = { ...parseFoodText(text, { extra }), fallbackReason: why.message, fallbackKind: why.kind };
      if (local.items.length) {
        const first = local.items[0];
        local.items[0] = { ...first, assumptions: first.assumptions ? `${note}; ${first.assumptions}` : note };
      }
      return local;
    }
  }
  return parseFoodText(text, { extra });
}
