/**
 * USD per million tokens, Anthropic first-party pricing (claude-api skill table, cached 2026-06-24).
 * Cache reads are billed at 10% of the input price; cache writes at 125%.
 * Unknown model ids fall back to Opus 5 rates (conservative: never under-report cost).
 */
export type ModelPrice = { input: number; output: number; cacheRead: number; cacheWrite: number };

const PRICES: Array<{ match: RegExp; price: ModelPrice }> = [
  { match: /fable-5|mythos-5/, price: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 } },
  { match: /opus-5/, price: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 } },
  { match: /opus-4-[678]/, price: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 } },
  { match: /opus-4-5/, price: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 } },
  { match: /sonnet-5/, price: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 } },
  { match: /sonnet-4-6/, price: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 } },
  { match: /sonnet-4-5/, price: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 } },
  { match: /haiku-4-5/, price: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 } },
];

const FALLBACK: ModelPrice = { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 };

export function priceFor(model: string): ModelPrice {
  const m = model.toLowerCase();
  return PRICES.find((p) => p.match.test(m))?.price ?? FALLBACK;
}

export type UsageLike = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export type TurnUsage = {
  model: string;
  tokensIn: number; // input + cache read + cache write (all input-side tokens)
  tokensOut: number;
  costUsd: number;
};

export function computeCostUsd(model: string, usage: UsageLike): number {
  const p = priceFor(model);
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const usd =
    (usage.input_tokens * p.input +
      cacheRead * p.cacheRead +
      cacheWrite * p.cacheWrite +
      usage.output_tokens * p.output) /
    1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000; // 6 decimals
}

export function usageFromResponse(model: string, usage: UsageLike): TurnUsage {
  return {
    model,
    tokensIn: usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
    tokensOut: usage.output_tokens,
    costUsd: computeCostUsd(model, usage),
  };
}

export function addUsage(a: TurnUsage, b: TurnUsage): TurnUsage {
  return {
    model: a.model,
    tokensIn: a.tokensIn + b.tokensIn,
    tokensOut: a.tokensOut + b.tokensOut,
    costUsd: Math.round((a.costUsd + b.costUsd) * 1_000_000) / 1_000_000,
  };
}

export const ZERO_USAGE = (model: string): TurnUsage => ({ model, tokensIn: 0, tokensOut: 0, costUsd: 0 });
