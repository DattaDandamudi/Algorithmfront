import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

let singleton: Anthropic | null = null;

/** Anthropic client for agent runs: longer timeout than the SMS engine, retries on 429/5xx. */
export function agentClient(): Anthropic {
  if (!singleton) {
    singleton = new Anthropic({ apiKey: env.required("ANTHROPIC_API_KEY"), timeout: 180_000, maxRetries: 2 });
  }
  return singleton;
}
