/**
 * Fast-model structured extraction: after every AI turn, pull the lead fields out of the
 * thread and fill the `leads` row (never overwriting values the owner already set).
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createAdminSupabase, type Db } from "@/lib/db/client";
import type { MessageRow } from "@/lib/db/types";
import { env } from "@/lib/env";
import { anthropic } from "@/lib/ai/client";
import { usageFromResponse, type TurnUsage } from "@/lib/ai/cost";
import { ensureLead, patchLead, type LeadPatch } from "@/lib/leads/store";
import type { ConversationContext } from "@/lib/telephony/outbound";

const ExtractionSchema = z.object({
  name: z.string().nullable().describe("Customer's name if they gave it"),
  address: z.string().nullable().describe("Street address if given (include city/state if present)"),
  zip: z.string().nullable().describe("5-digit US ZIP if given or derivable from the address"),
  issue: z.string().nullable().describe("One-line description of the problem or request, in the customer's words"),
  urgency: z.enum(["emergency", "today", "this_week", "flexible"]).nullable(),
  preferred_window: z.string().nullable().describe("Preferred day/time window, e.g. 'Today after 3pm'"),
  wants_human: z.boolean().describe("True if the customer asked to talk to a person or is frustrated"),
  confidence: z.number().min(0).max(1),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

const SYSTEM =
  "You extract structured lead details from an SMS thread between a home-service contractor's assistant (assistant) and a customer (customer). " +
  "Only report facts the customer stated; never guess. Use null for anything not stated. Keep `issue` under 30 words.";

export function transcriptFor(messages: MessageRow[]): string {
  return messages
    .filter((m) => m.status !== "failed")
    .map((m) => `${m.direction === "in" ? "customer" : m.author === "owner" ? "owner" : "assistant"}: ${m.body}`)
    .join("\n");
}

export async function extractLeadFields(messages: MessageRow[]): Promise<{ data: Extraction | null; usage: TurnUsage | null }> {
  const model = env.models().fast;
  const transcript = transcriptFor(messages);
  if (!transcript.trim()) return { data: null, usage: null };
  try {
    const response = await anthropic().messages.parse({
      model,
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: "user", content: `Thread:\n${transcript}` }],
      output_config: { format: zodOutputFormat(ExtractionSchema) },
    });
    const usage = usageFromResponse(model, response.usage);
    if (response.stop_reason === "refusal" || !response.parsed_output) return { data: null, usage };
    return { data: response.parsed_output, usage };
  } catch (err) {
    console.error("[ai/extract] failed", err instanceof Error ? err.message : err);
    return { data: null, usage: null };
  }
}

/**
 * Runs extraction for a conversation and applies it to the lead. Adds the extraction's
 * token cost to `messageId` (the AI reply of this turn) so per-message cost stays complete.
 */
export async function extractAndUpdateLead(
  ctx: ConversationContext,
  messages: MessageRow[],
  messageId: string | null,
  db: Db = createAdminSupabase()
): Promise<{ wantsHuman: boolean }> {
  const { data, usage } = await extractLeadFields(messages);
  if (usage && messageId) {
    const row = await db.from("messages").select("tokens_in, tokens_out, cost_usd").eq("id", messageId).maybeSingle();
    if (row.data) {
      await db
        .from("messages")
        .update({
          tokens_in: row.data.tokens_in + usage.tokensIn,
          tokens_out: row.data.tokens_out + usage.tokensOut,
          cost_usd: Math.round((Number(row.data.cost_usd) + usage.costUsd) * 1_000_000) / 1_000_000,
        })
        .eq("id", messageId);
    }
  }
  if (!data || data.confidence < 0.3) return { wantsHuman: false };
  const hasAnything = data.name || data.address || data.zip || data.issue || data.urgency || data.preferred_window;
  if (!hasAnything) return { wantsHuman: data.wants_human };
  const lead = await ensureLead(db, {
    accountId: ctx.account.id,
    conversationId: ctx.conversation.id,
    contactId: ctx.contact.id,
    phone: ctx.contact.phone,
    source: ctx.conversation.source,
    name: data.name,
    raw: { extracted_by: env.models().fast, confidence: data.confidence },
  });
  const patch: LeadPatch = {
    name: data.name,
    address: data.address,
    zip: data.zip,
    issue: data.issue,
    urgency: data.urgency,
    preferred_window: data.preferred_window,
  };
  const updated = await patchLead(db, lead, patch);
  if (updated.name && !ctx.contact.name) await db.from("contacts").update({ name: updated.name }).eq("id", ctx.contact.id);
  if (updated.address && !ctx.contact.address) await db.from("contacts").update({ address: updated.address }).eq("id", ctx.contact.id);
  return { wantsHuman: data.wants_human };
}
