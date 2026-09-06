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
import type Anthropic from '@anthropic-ai/sdk';
import type { AISettings } from '../data/types';
import { PROXY_PLACEHOLDER_KEY, isAIConfigured } from './config';

export { DEFAULT_MODEL, MODEL_OPTIONS, PROXY_PLACEHOLDER_KEY, isAIConfigured, resolveModel } from './config';
export type { ModelOption } from './config';

/** The SDK client type, importable without pulling the SDK into a bundle. */
export type AnthropicClient = Anthropic;

/** Per-request timeout (ms). Coach replies are ≤120 words, so 60 s is generous even on a slow link. */
const REQUEST_TIMEOUT_MS = 60_000;
/** SDK default; retries 408/409/429/5xx and connection errors with backoff. */
const MAX_RETRIES = 2;

/**
 * Build a client for the current settings, or null when AI is not configured
 * (callers then fall back to the offline coach / local food parser).
 *
 * The SDK is imported lazily here — it is the largest dependency in the app
 * and offline users (provider 'none') never need it.
 */
export async function createClient(ai: AISettings): Promise<Anthropic | null> {
  if (!isAIConfigured(ai)) return null;
  const { default: AnthropicCtor } = await import('@anthropic-ai/sdk');

  if (ai.provider === 'proxy') {
    return new AnthropicCtor({
      apiKey: PROXY_PLACEHOLDER_KEY,
      baseURL: (ai.proxyUrl as string).trim().replace(/\/+$/, ''),
      dangerouslyAllowBrowser: true,
      maxRetries: MAX_RETRIES,
      timeout: REQUEST_TIMEOUT_MS,
    });
  }

  return new AnthropicCtor({
    apiKey: (ai.apiKey as string).trim(),
    dangerouslyAllowBrowser: true,
    maxRetries: MAX_RETRIES,
    timeout: REQUEST_TIMEOUT_MS,
  });
}
