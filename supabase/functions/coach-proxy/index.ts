// Optional: server-side proxy for the health app's Claude coach & food AI.
//
// Deploy with `supabase functions deploy coach-proxy --no-verify-jwt` and set the
// secret `ANTHROPIC_API_KEY` (`supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`).
// Then in the app: Settings → AI → provider "Proxy", URL
//   https://<project-ref>.supabase.co/functions/v1/coach-proxy
// The browser SDK is pointed at that base URL and never sees the real key.
//
// This is a transparent pass-through for POST /v1/messages (streaming included),
// which keeps the client code identical between direct and proxy modes.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ALLOWED_ORIGIN = Deno.env.get('COACH_PROXY_ALLOWED_ORIGIN') ?? '*';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, anthropic-version, anthropic-beta, x-api-key, anthropic-dangerous-direct-browser-access, x-stainless-arch, x-stainless-lang, x-stainless-os, x-stainless-package-version, x-stainless-runtime, x-stainless-runtime-version, x-stainless-retry-count, x-stainless-timeout, x-stainless-helper-method',
  'Access-Control-Expose-Headers': 'request-id, anthropic-ratelimit-requests-remaining, retry-after',
  'Access-Control-Max-Age': '86400',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST' || !new URL(req.url).pathname.endsWith('/v1/messages')) {
    return new Response(JSON.stringify({ error: 'Only POST /v1/messages is proxied' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    });
  }

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured on the proxy' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    });
  }

  const headers = new Headers();
  headers.set('content-type', 'application/json');
  headers.set('x-api-key', key);
  headers.set('anthropic-version', req.headers.get('anthropic-version') ?? '2023-06-01');
  const beta = req.headers.get('anthropic-beta');
  if (beta) headers.set('anthropic-beta', beta);

  const upstream = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers,
    body: req.body,
    signal: req.signal,
  });

  const out = new Headers(CORS_HEADERS);
  for (const h of ['content-type', 'request-id', 'retry-after', 'cache-control']) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  // Streams (text/event-stream) pass straight through.
  return new Response(upstream.body, { status: upstream.status, headers: out });
});
