"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getAppContext } from "@/components/dashboard/context";
import { pauseAi, resumeAi, sendCustomerMessage } from "@/lib/telephony/outbound";
import { track } from "@/lib/events";

export type InboxActionState = { ok?: string; error?: string } | null;

const uuid = z.string().uuid();
const replySchema = z.object({
  conversationId: uuid,
  body: z.string().trim().min(1, "Type a message first.").max(1000, "Keep it under 1,000 characters (about 7 SMS segments)."),
});
const statusSchema = z.object({
  conversationId: uuid,
  status: z.enum(["open", "qualified", "booked", "lost", "closed"]),
  lostReason: z.string().trim().max(200).optional(),
});

/** Every inbox mutation must run as the real owner/staff user, never through an admin "view as". */
async function ownerContext() {
  const ctx = await getAppContext();
  if (ctx.impersonating) throw new Error("Read-only while viewing as an admin.");
  return ctx;
}

async function assertConversation(ctx: Awaited<ReturnType<typeof ownerContext>>, conversationId: string) {
  const { data } = await ctx.db.from("conversations").select("id, account_id, contact_id").eq("id", conversationId).eq("account_id", ctx.account.id).maybeSingle();
  if (!data) throw new Error("Conversation not found.");
  return data;
}

function fail(err: unknown): InboxActionState {
  // redirect() thrown by getAppContext (signed out / onboarding / billing) must reach Next, not the form.
  unstable_rethrow(err);
  return { error: err instanceof Error ? err.message : "Something went wrong. Please try again." };
}

const REASONS: Record<string, string> = {
  opted_out: "This customer opted out of texts (STOP). You can still call them.",
  sms_disabled: "Texting is off until your number passes carrier verification. Call them instead.",
  number_missing: "No SMS-enabled number on this account yet.",
  account_inactive: "Your account is paused — resume it under Billing to send texts.",
  conversation_not_found: "Conversation not found.",
  empty_body: "Type a message first.",
};

/** Owner reply from the inbox. Sending as the business pauses the AI on this thread (contract). */
export async function replyAction(_prev: InboxActionState, formData: FormData): Promise<InboxActionState> {
  try {
    const ctx = await ownerContext();
    const parsed = replySchema.safeParse({ conversationId: formData.get("conversationId"), body: formData.get("body") });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid reply." };
    await assertConversation(ctx, parsed.data.conversationId);

    const result = await sendCustomerMessage({
      accountId: ctx.account.id,
      conversationId: parsed.data.conversationId,
      body: parsed.data.body,
      author: "owner",
    });
    if (!result.ok) return { error: REASONS[result.reason ?? ""] ?? `Could not send (${result.reason ?? "unknown"}).` };

    // Any owner message takes the thread over from the AI (spec §4.4).
    await pauseAi(parsed.data.conversationId, ctx.user.id);
    await track("owner_replied", { conversation_id: parsed.data.conversationId, queued: result.queued ?? false }, { accountId: ctx.account.id, userId: ctx.user.id });

    revalidatePath(`/inbox/${parsed.data.conversationId}`);
    revalidatePath("/inbox");
    return { ok: result.queued ? "Queued — it goes out when quiet hours end." : "Sent." };
  } catch (err) {
    return fail(err);
  }
}

export async function pauseAiAction(formData: FormData): Promise<void> {
  const ctx = await ownerContext();
  const conversationId = uuid.parse(formData.get("conversationId"));
  await assertConversation(ctx, conversationId);
  await pauseAi(conversationId, ctx.user.id);
  revalidatePath(`/inbox/${conversationId}`);
  revalidatePath("/inbox");
}

export async function resumeAiAction(formData: FormData): Promise<void> {
  const ctx = await ownerContext();
  const conversationId = uuid.parse(formData.get("conversationId"));
  await assertConversation(ctx, conversationId);
  await resumeAi(conversationId);
  revalidatePath(`/inbox/${conversationId}`);
  revalidatePath("/inbox");
}

/** Marks the conversation and its lead (if any) qualified / booked / lost / open. */
export async function setConversationStatusAction(_prev: InboxActionState, formData: FormData): Promise<InboxActionState> {
  try {
    const ctx = await ownerContext();
    const parsed = statusSchema.safeParse({
      conversationId: formData.get("conversationId"),
      status: formData.get("status"),
      lostReason: formData.get("lostReason") || undefined,
    });
    if (!parsed.success) return { error: "Invalid status." };
    const { conversationId, status, lostReason } = parsed.data;
    const conv = await assertConversation(ctx, conversationId);

    const { error } = await ctx.db.from("conversations").update({ status }).eq("id", conversationId).eq("account_id", ctx.account.id);
    if (error) return { error: error.message };

    if (status === "qualified" || status === "booked" || status === "lost" || status === "open") {
      const leadStatus = status === "open" ? "new" : status;
      const patch: { status: string; booked_at?: string | null; lost_reason?: string | null } = { status: leadStatus };
      if (status === "booked") patch.booked_at = new Date().toISOString();
      if (status === "lost") patch.lost_reason = lostReason ?? null;
      const { data: lead } = await ctx.db
        .from("leads")
        .select("id")
        .eq("account_id", ctx.account.id)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lead) {
        await ctx.db.from("leads").update(patch).eq("id", lead.id).eq("account_id", ctx.account.id);
      } else if (status !== "open") {
        // No lead extracted yet (e.g. the owner booked over the phone) — create one so the report counts it.
        const { data: contact } = await ctx.db.from("contacts").select("id, phone, name, address").eq("id", conv.contact_id).maybeSingle();
        if (contact) {
          await ctx.db.from("leads").insert({
            account_id: ctx.account.id,
            conversation_id: conversationId,
            contact_id: contact.id,
            source: "manual",
            phone: contact.phone,
            name: contact.name,
            address: contact.address,
            ...patch,
          });
        }
      }
      if (status === "booked") await track("lead_booked", { conversation_id: conversationId, via: "inbox" }, { accountId: ctx.account.id, userId: ctx.user.id });
    }

    revalidatePath(`/inbox/${conversationId}`);
    revalidatePath("/inbox");
    revalidatePath("/leads");
    revalidatePath("/dashboard");
    return { ok: `Marked ${status}.` };
  } catch (err) {
    return fail(err);
  }
}
