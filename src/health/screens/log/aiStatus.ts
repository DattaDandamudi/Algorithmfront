/**
 * Lazy AI client status for the Log screen (review R7-3).
 *
 * The Anthropic SDK is the largest dependency and is imported lazily
 * (`ai/client.ts createClient`). Until that import resolves the Log has no
 * client, and before this module the screen quietly fell back to the local
 * parser and told a user who HAD configured a key to "connect an AI key". The
 * status below is what the AI bar and the photo sheet render instead, and
 * `describeClientError` turns a rejected import into a sentence a person can
 * act on. Pure: no React, no clock.
 */

/**
 *  - 'none'    no key / proxy configured — the local parser is the design, so
 *              the copy may suggest adding a key.
 *  - 'loading' a key exists and the SDK chunk is still downloading: Estimate
 *              and Photo show "Loading AI…" rather than quietly going local.
 *  - 'slow'    still loading after the Log's AI_LOAD_WAIT_MS: text estimates
 *              are allowed again (the local parser answers, and says so).
 *  - 'ready'   the client exists.
 *  - 'error'   the import or constructor failed; the reason is shown and the
 *              local parser answers — never "connect an AI key".
 */
export type AIStatus = 'none' | 'loading' | 'slow' | 'ready' | 'error';

/** Button label while the SDK is loading (Estimate and Take a photo). */
export const AI_LOADING_LABEL = 'Loading AI…';

export const CLIENT_LOAD_FALLBACK = 'the AI client could not be created';

/** The line under the AI bar for each client state. */
export function aiBarCaption(status: AIStatus, error: string | null): string {
  switch (status) {
    case 'none':
      return 'Offline parser · add an AI key in Settings for better accuracy on restaurant dishes.';
    case 'loading':
      return 'Loading the AI module — a moment.';
    case 'slow':
      return 'The AI module is still loading — the local parser answers meanwhile.';
    case 'error':
      return `AI unavailable — ${error ?? CLIENT_LOAD_FALLBACK}. Using the local parser.`;
    default:
      return 'Claude estimates macros with Indian / Middle Eastern priors — you edit before saving.';
  }
}

/**
 * The photo sheet's note while a configured key has no usable client, or null
 * when it can shoot. Photos have no local fallback, so 'slow' still waits.
 */
export function photoAINote(status: AIStatus, error: string | null): string | null {
  if (status === 'loading' || status === 'slow') return 'Loading the AI module — a moment, or type it instead.';
  if (status === 'error') return `AI unavailable — ${error ?? CLIENT_LOAD_FALLBACK}. Photo estimates need it; type the meal instead.`;
  return null;
}

/**
 * Readable reason for a `createClient` rejection. The SDK is a lazily imported
 * chunk, so the usual failure is the browser's "Failed to fetch dynamically
 * imported module" (offline, blocked, or a stale deploy) — say what to do
 * about it rather than echo the URL.
 */
export function describeClientError(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : '';
  if (!msg) return CLIENT_LOAD_FALLBACK;
  if (/dynamically imported module|Failed to fetch|Importing a module script failed|Loading chunk/i.test(msg)) {
    return 'the AI module could not be downloaded — check your connection and reload';
  }
  return msg;
}
