/**
 * Anthropic client factory for the in-app coach and food estimator.
 *
 * Two ways to reach Claude (SPEC §4/§5 "WHOOP connection / AI settings"):
 *
 *  1. `anthropic-direct` — the user pastes their own API key, which lives in
 *     this browser's localStorage only and is sent straight to
 *     api.anthropic.com. The SDK blocks browser use by default because a key
 *     bundled into a public web page would be visible to every visitor. That
 *     risk does not apply here: this is a single-user, bring-your-own-key
 *     personal app, the key never leaves the user's own device except to
 *     Anthropic, and nothing is shipped in the bundle. So we opt in with
 *     `dangerouslyAllowBrowser: true`.
 *
 *  2. `proxy` — the safer option. The app talks to a same-origin or
 *     CORS-enabled proxy (e.g. the Supabase Edge Function in
 *     supabase/functions/coach-proxy/) that injects the real key server-side.
 *     The SDK still requires *an* apiKey string, so we pass a placeholder that
 *     the proxy ignores/overwrites.
 *
 * Prefer the proxy whenever the app is hosted anywhere other than the user's
 * own machine. `provider: 'none'` means offline coach + local food DB only.
 */
import Anthropic from '@anthropic-ai/sdk';
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

/** Per-request timeout (ms). Coach replies are ≤120 words, so 60 s is generous even on a slow link. */
const REQUEST_TIMEOUT_MS = 60_000;
/** SDK default; retries 408/409/429/5xx and connection errors with backoff. */
const MAX_RETRIES = 2;

const nonEmpty = (s: string | undefined | null): s is string => typeof s === 'string' && s.trim().length > 0;

/**
 * True when the settings describe a usable remote provider: a direct key, or a
 * proxy URL. `provider: 'none'` (the default) is always "not configured".
 */
export function isAIConfigured(ai: AISettings): boolean {
  if (ai.provider === 'anthropic-direct') return nonEmpty(ai.apiKey);
  if (ai.provider === 'proxy') return nonEmpty(ai.proxyUrl);
  return false;
}

/**
 * Build a client for the current settings, or null when AI is not configured
 * (callers then fall back to the offline coach / local food parser).
 */
export function createClient(ai: AISettings): Anthropic | null {
  if (!isAIConfigured(ai)) return null;

  if (ai.provider === 'proxy') {
    return new Anthropic({
      apiKey: PROXY_PLACEHOLDER_KEY,
      baseURL: (ai.proxyUrl as string).trim().replace(/\/+$/, ''),
      dangerouslyAllowBrowser: true,
      maxRetries: MAX_RETRIES,
      timeout: REQUEST_TIMEOUT_MS,
    });
  }

  return new Anthropic({
    apiKey: (ai.apiKey as string).trim(),
    dangerouslyAllowBrowser: true,
    maxRetries: MAX_RETRIES,
    timeout: REQUEST_TIMEOUT_MS,
  });
}

/** The model to use: the user's pick if set, else the default. */
export function resolveModel(ai: AISettings): string {
  return nonEmpty(ai.model) ? ai.model.trim() : DEFAULT_MODEL;
}
