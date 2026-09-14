/**
 * Natural-language opt-out detection for inbound customer texts.
 *
 * Two layers, deterministic first (lib/telephony/consent.ts):
 *   1. `looksLikeOptOut`     — definite phrasings ("stop texting me", "unsubscribe") -> opted out, no model.
 *   2. `mentionsOptOutTrigger` — loose phrasings ("stop", "wrong number", "remove me") -> the fast
 *      model decides whether the customer is revoking consent or just using the word ("stop by
 *      anytime", "can you text me the address?"). The model is only consulted on a trigger hit,
 *      and any model failure counts as "not an opt-out" (the exact keywords still work).
 *
 * Runs inside the inbound webhook, before any AI turn, so a revocation is recorded before the
 * assistant can send anything else.
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { env } from "@/lib/env";
import { anthropic } from "@/lib/ai/client";
import { looksLikeOptOut, mentionsOptOutTrigger } from "@/lib/telephony/consent";

const OptOutSchema = z.object({
  opt_out: z.boolean().describe("True only if the customer is asking not to receive further text messages from this business"),
  confidence: z.number().min(0).max(1),
});

const SYSTEM =
  "You classify one SMS reply from a customer to a home-service business's text assistant. " +
  "Decide whether the customer is revoking consent to be texted: asking the business to stop texting/messaging them, " +
  "saying it is the wrong number, or asking to be removed. Using the word 'stop' in another sense " +
  "(\"stop by anytime\", \"the leak stopped\", \"stop the water\") is NOT an opt-out. Asking to be called instead of texted IS an opt-out. " +
  "Be conservative: when unsure, answer false.";

export type OptOutDetection = { optOut: boolean; via: "regex" | "model" | null };

/** The check runs inside the Twilio webhook (15 s budget): cap it well below that, no retries. */
const CLASSIFIER_TIMEOUT_MS = 6_000;

/** Fast-model check used only when a loose trigger matched. Never throws. */
export async function classifyOptOutWithModel(text: string): Promise<boolean> {
  const model = env.models().fast;
  try {
    const response = await anthropic().messages.parse(
      {
        model,
        max_tokens: 200,
        system: SYSTEM,
        messages: [{ role: "user", content: `Customer reply: "${text.slice(0, 500)}"` }],
        output_config: { format: zodOutputFormat(OptOutSchema) },
      },
      { timeout: CLASSIFIER_TIMEOUT_MS, maxRetries: 0 }
    );
    if (response.stop_reason === "refusal" || !response.parsed_output) return false;
    return response.parsed_output.opt_out && response.parsed_output.confidence >= 0.6;
  } catch (err) {
    console.error("[ai/optOut] classifier failed", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Regex list first, fast model only on a loose trigger. */
export async function detectNaturalLanguageOptOut(text: string | null | undefined): Promise<OptOutDetection> {
  if (!text || !text.trim()) return { optOut: false, via: null };
  if (looksLikeOptOut(text)) return { optOut: true, via: "regex" };
  if (!mentionsOptOutTrigger(text)) return { optOut: false, via: null };
  const optOut = await classifyOptOutWithModel(text);
  return { optOut, via: optOut ? "model" : null };
}
