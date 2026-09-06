/**
 * AI settings helpers with NO dependency on @anthropic-ai/sdk.
 *
 * Screens import these to render provider state, model pickers and captions;
 * keeping them here means the ~50 kB (gzip) SDK chunk is only downloaded when
 * a client is actually created (see client.ts), never for offline users.
 */
import type { AISettings } from '../data/types';

/** Default coach/food model. Opus 5 is the current all-round default; Sonnet 5 is the faster option. */
export const DEFAULT_MODEL = 'claude-opus-5';

export interface ModelOption {
  id: string;
  label: string;
}

export const MODEL_OPTIONS: ReadonlyArray<ModelOption> = [
  { id: 'claude-opus-5', label: 'Claude Opus 5 (default)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (faster)' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1 (most capable)' },
];

/** Placeholder credential sent in proxy mode; the proxy replaces it with the real key. */
export const PROXY_PLACEHOLDER_KEY = 'via-proxy';

export const nonEmpty = (s: string | undefined | null): s is string => typeof s === 'string' && s.trim().length > 0;

/**
 * True when the settings describe a usable remote provider: a direct key, or a
 * proxy URL. `provider: 'none'` (the default) is always "not configured".
 */
export function isAIConfigured(ai: AISettings): boolean {
  if (ai.provider === 'anthropic-direct') return nonEmpty(ai.apiKey);
  if (ai.provider === 'proxy') return nonEmpty(ai.proxyUrl);
  return false;
}

/** The model to use: the user's pick if set, else the default. */
export function resolveModel(ai: AISettings): string {
  return nonEmpty(ai.model) ? ai.model.trim() : DEFAULT_MODEL;
}
