/**
 * foodImage.ts — photo logging (SPEC §2 "Photo (secondary; depth/portion caveat)").
 *
 * Sends a downsized JPEG of the plate to Claude with the same §9 food prompt
 * and JSON schema as the text path (`buildFoodSystemPrompt` / `FOOD_SCHEMA`
 * from ./food) plus one rule: a photo has no depth cue, unknown plate size and
 * hidden oil/ghee, so the portion is a guess. Every item's confidence is
 * capped at `PHOTO_CONFIDENCE_CAP` so the sheet shows the ± range and makes
 * the user confirm the grams before saving (spec: "every AI estimate is
 * editable before save"; Cal AI's own concession).
 *
 * Requires an AI client — there is no offline photo fallback; we never fake
 * an estimate. DOM work (canvas resize → base64) is isolated in
 * `encodeImageFile`; the prompt, message and response handling are pure and
 * unit-tested with a mock client (`estimateFoodFromEncodedImage`).
 *
 * Image block typing confirmed against @anthropic-ai/sdk 0.124
 * `ImageBlockParam { type:'image', source: Base64ImageSource }` with
 * `Base64ImageSource { type:'base64', media_type, data }`.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { AISettings, FoodEstimate, Profile } from '../data/types';
import { resolveModel } from './client';
import { FOOD_SCHEMA, buildFoodSystemPrompt, normaliseFoodJSON } from './food';

/** Longest side after resize — plenty for dish recognition, keeps the request well under a megabyte. */
export const MAX_IMAGE_EDGE_PX = 1280;
export const JPEG_QUALITY = 0.85;
/** Photo caveat: a photo can never earn the §9 "High" band (≥0.8); 0.6 sits in Med with the range shown. */
export const PHOTO_CONFIDENCE_CAP = 0.6;
/** Mirrors food.ts — logging must take seconds; vision + a short JSON needs no deep reasoning. */
const EFFORT: Anthropic.OutputConfig['effort'] = 'low';
const MAX_TOKENS = 2048;

export type ImageMediaType = Anthropic.Base64ImageSource['media_type'];

export interface EncodedImage {
  /** Raw base64 (no data: prefix, no newlines). */
  data: string;
  media_type: ImageMediaType;
  width?: number;
  height?: number;
}

/** Appended to the §9 prompt for photo input. */
export const PHOTO_RULES = `PHOTO INPUT: the food is shown in a photo, not described. Identify each distinct food you can see.
Portion size from a photo is uncertain — there is no depth cue, the plate size is unknown and oil, ghee or sauce can be hidden — so:
- Estimate grams from a typical restaurant serving of that dish and start "assumptions" with "estimated from photo".
- Never report confidence above ${PHOTO_CONFIDENCE_CAP}.
- If the user adds a text hint (dish name, weight, home-cooked), trust it over the image.
- If no food is visible, return an empty items array and ask ONE clarify question.`;

export function buildFoodImageSystemPrompt(profile: Profile): string {
  return `${buildFoodSystemPrompt(profile)}\n\n${PHOTO_RULES}`;
}

/** The user turn: image block first, then the text (hint or default ask). */
export function buildImageUserContent(image: EncodedImage, hint?: string): Anthropic.ContentBlockParam[] {
  const h = hint?.trim();
  return [
    { type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } },
    { type: 'text', text: h ? `Photo of what I am about to eat. Hint: ${h}` : 'Photo of what I am about to eat. Estimate each food and its portion in grams.' },
  ];
}

/** Cap confidence at the photo ceiling and make sure the caveat is in the assumptions. */
export function capPhotoConfidence<T extends Pick<FoodEstimate, 'items'>>(est: T): T {
  return {
    ...est,
    items: est.items.map((it) => ({
      ...it,
      confidence: Math.min(PHOTO_CONFIDENCE_CAP, Math.max(0, Number.isFinite(it.confidence) ? it.confidence : 0)),
      assumptions: /photo/i.test(it.assumptions) ? it.assumptions : it.assumptions ? `estimated from photo; ${it.assumptions}` : 'estimated from photo',
    })),
  };
}

/** Pure request/response half — testable with a mock client. */
export async function estimateFoodFromEncodedImage(image: EncodedImage, ai: AISettings, profile: Profile, client: Anthropic, hint?: string): Promise<FoodEstimate> {
  const res = await client.messages.create({
    model: resolveModel(ai),
    max_tokens: MAX_TOKENS,
    system: buildFoodImageSystemPrompt(profile),
    messages: [{ role: 'user', content: buildImageUserContent(image, hint) }],
    output_config: { format: { type: 'json_schema', schema: FOOD_SCHEMA }, effort: EFFORT },
  });
  if (res.stop_reason === 'refusal') {
    const why = res.stop_details?.explanation ? `: ${res.stop_details.explanation}` : '.';
    throw new Error(`Claude declined to estimate from this photo${why}`);
  }
  if (res.stop_reason === 'max_tokens') {
    throw new Error('The photo estimate was cut off (max_tokens) — try a photo of a single plate.');
  }
  const block = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!block) throw new Error('Claude returned no text for the photo estimate.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(block.text);
  } catch {
    throw new Error('Claude returned invalid JSON for the photo estimate.');
  }
  return { ...capPhotoConfidence(normaliseFoodJSON(parsed)), source: 'claude' };
}

/**
 * Estimate food from a photo file: resize/encode in the browser, then ask
 * Claude. `deps.encode` exists so tests can skip the canvas.
 */
export async function estimateFoodFromImage(
  file: File,
  ai: AISettings,
  profile: Profile,
  client: Anthropic,
  hint?: string,
  deps: { encode?: (file: File) => Promise<EncodedImage> } = {},
): Promise<FoodEstimate> {
  const encode = deps.encode ?? encodeImageFile;
  const image = await encode(file);
  return estimateFoodFromEncodedImage(image, ai, profile, client, hint);
}

// ---------------------------------------------------------------------------
// Encoding (DOM) — kept below the pure code so the rest stays testable in node
// ---------------------------------------------------------------------------

/** Target size keeping aspect, never upscaling, never below 1 px. */
export function fitWithin(width: number, height: number, maxEdge = MAX_IMAGE_EDGE_PX): { width: number; height: number } {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Strip a data: URL down to its base64 payload. */
export function dataUrlToBase64(url: string): string {
  const i = url.indexOf(',');
  return i >= 0 ? url.slice(i + 1) : '';
}

type Decoded = ImageBitmap | HTMLImageElement;

const dims = (src: Decoded) => ('naturalWidth' in src ? { w: src.naturalWidth, h: src.naturalHeight } : { w: src.width, h: src.height });

const UNREADABLE = "Couldn't read that photo — try a JPEG or PNG.";

/** Decode to something drawImage accepts; `from-image` honours EXIF rotation (phones). */
async function decodeImage(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to <img> (older Safari, unsupported codec) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(UNREADABLE));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Downscale to ≤ MAX_IMAGE_EDGE_PX on the longest side and re-encode as JPEG
 * (quality 0.85) so a 12 MP phone photo becomes a few hundred KB of base64.
 */
export async function encodeImageFile(file: File, maxEdge = MAX_IMAGE_EDGE_PX, quality = JPEG_QUALITY): Promise<EncodedImage> {
  if (!file || !file.type.startsWith('image/')) throw new Error('That file is not an image — take or pick a photo.');
  const source = await decodeImage(file);
  try {
    const { w, h } = dims(source);
    if (!(w > 0 && h > 0)) throw new Error(UNREADABLE);
    const { width, height } = fitWithin(w, h, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not prepare the photo (no canvas support in this browser).');
    ctx.drawImage(source, 0, 0, width, height);
    const data = dataUrlToBase64(canvas.toDataURL('image/jpeg', quality));
    if (!data) throw new Error('Could not encode the photo.');
    return { data, media_type: 'image/jpeg', width, height };
  } finally {
    if ('close' in source) source.close();
  }
}
