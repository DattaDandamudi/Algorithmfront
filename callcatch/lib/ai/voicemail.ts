/**
 * Voicemail summary + emergency flag with the fast model (structured output).
 * The keyword detector runs as well; either signal marks the call as an emergency.
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { env } from "@/lib/env";
import { anthropic } from "@/lib/ai/client";
import { detectEmergency } from "@/lib/ai/emergency";
import { usageFromResponse, type TurnUsage } from "@/lib/ai/cost";

const VoicemailSchema = z.object({
  summary: z.string().describe("One or two sentences, third person, for the business owner. Include any callback number."),
  is_emergency: z.boolean().describe("True for gas smell, sparks, smoke/fire, active flooding, sewage backup, CO alarm, or no heat with an infant/elderly person"),
  urgency: z.enum(["emergency", "today", "this_week", "flexible"]).nullable(),
  callback_number: z.string().nullable().describe("Phone number spoken in the message, digits only, or null"),
  caller_name: z.string().nullable(),
});

export type VoicemailSummary = z.infer<typeof VoicemailSchema> & { usage: TurnUsage | null; keyword_hit: string | null };

export async function summarizeVoicemail(transcript: string, tradeLabel: string): Promise<VoicemailSummary> {
  const keyword = detectEmergency(transcript);
  const keywordHit = keyword.isEmergency ? keyword.matched : null;
  const fallback: VoicemailSummary = {
    summary: transcript.length > 240 ? `${transcript.slice(0, 237)}…` : transcript,
    is_emergency: keyword.isEmergency,
    urgency: keyword.isEmergency ? "emergency" : null,
    callback_number: null,
    caller_name: null,
    usage: null,
    keyword_hit: keywordHit,
  };
  if (!transcript.trim()) return { ...fallback, summary: "" };
  const model = env.models().fast;
  try {
    const response = await anthropic().messages.parse({
      model,
      max_tokens: 400,
      system: `You summarize voicemails left for a ${tradeLabel} contractor. Be factual and brief; never add advice.`,
      messages: [{ role: "user", content: `Voicemail transcript:\n"""${transcript}"""` }],
      output_config: { format: zodOutputFormat(VoicemailSchema) },
    });
    const usage = usageFromResponse(model, response.usage);
    if (response.stop_reason === "refusal" || !response.parsed_output) return { ...fallback, usage };
    const out = response.parsed_output;
    return {
      ...out,
      is_emergency: out.is_emergency || keyword.isEmergency,
      urgency: out.is_emergency || keyword.isEmergency ? "emergency" : out.urgency,
      usage,
      keyword_hit: keywordHit,
    };
  } catch (err) {
    console.error("[ai/voicemail] summary failed", err instanceof Error ? err.message : err);
    return fallback;
  }
}
