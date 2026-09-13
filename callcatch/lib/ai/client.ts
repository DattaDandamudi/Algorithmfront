import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

let singleton: Anthropic | null = null;

/** Anthropic client singleton (server-only). Short timeout: SMS turns must feel instant. */
export function anthropic(): Anthropic {
  if (!singleton) {
    singleton = new Anthropic({
      apiKey: env.required("ANTHROPIC_API_KEY"),
      timeout: 25_000, // ms
      maxRetries: 1,
    });
  }
  return singleton;
}

/**
 * Request tuning per model family. Adaptive thinking + `output_config.effort` exist on the
 * 4.6+ generation (Opus 5 / Sonnet 5 / Opus 4.x / Sonnet 4.6); Haiku 4.5 and older models
 * reject both, so we omit them there. Model ids come from env.models() only.
 */
export function supportsAdaptiveThinking(model: string): boolean {
  const m = model.toLowerCase();
  if (m.includes("haiku")) return false;
  if (/(opus|sonnet)-4-5/.test(m)) return false;
  return true;
}

export function chatRequestTuning(model: string): {
  thinking?: Anthropic.ThinkingConfigParam;
  output_config?: Anthropic.OutputConfig;
} {
  if (!supportsAdaptiveThinking(model)) return {};
  return { thinking: { type: "adaptive" }, output_config: { effort: "low" } };
}

/** True for the refusal stop reason (safety classifier declined) — always send the safe template. */
export function isRefusal(message: Pick<Anthropic.Message, "stop_reason">): boolean {
  return message.stop_reason === "refusal";
}
