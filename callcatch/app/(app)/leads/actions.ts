"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getAppContext } from "@/components/dashboard/context";
import { track } from "@/lib/events";

export type LeadActionState = { ok?: string; error?: string } | null;

const uuid = z.string().uuid();
const valueSchema = z.object({
  leadId: uuid,
  estValue: z
    .union([z.literal(""), z.coerce.number().min(0).max(1_000_000)])
    .transform((v) => (v === "" ? null : v)),
});
const statusSchema = z.object({
  leadId: uuid,
  status: z.enum(["new", "qualified", "booked", "lost"]),
  lostReason: z.string().trim().max(200).optional(),
  estValue: z
    .union([z.literal(""), z.coerce.number().min(0).max(1_000_000)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
});

async function ownerContext() {
  const ctx = await getAppContext();
  if (ctx.impersonating) throw new Error("Read-only while viewing as an admin.");
  return ctx;
}

function fail(err: unknown): LeadActionState {
  // redirect() thrown by getAppContext (signed out / onboarding / billing) must reach Next, not the form.
  unstable_rethrow(err);
  return { error: err instanceof Error ? err.message : "Something went wrong. Please try again." };
}

/** Inline edit of the estimated job value. Empty clears it (falls back to the trade average). */
export async function updateLeadValueAction(_prev: LeadActionState, formData: FormData): Promise<LeadActionState> {
  try {
    const ctx = await ownerContext();
    const parsed = valueSchema.safeParse({ leadId: formData.get("leadId"), estValue: formData.get("estValue") ?? "" });
    if (!parsed.success) return { error: "Enter a dollar amount (or leave blank)." };
    const { error } = await ctx.db.from("leads").update({ est_value_usd: parsed.data.estValue }).eq("id", parsed.data.leadId).eq("account_id", ctx.account.id);
    if (error) return { error: error.message };
    revalidatePath("/leads");
    revalidatePath("/dashboard");
    return { ok: "Saved." };
  } catch (err) {
    return fail(err);
  }
}

/** Mark booked / lost / qualified / new; keeps the linked conversation's status in step. */
export async function setLeadStatusAction(_prev: LeadActionState, formData: FormData): Promise<LeadActionState> {
  try {
    const ctx = await ownerContext();
    const parsed = statusSchema.safeParse({
      leadId: formData.get("leadId"),
      status: formData.get("status"),
      lostReason: formData.get("lostReason") || undefined,
      estValue: formData.get("estValue") ?? undefined,
    });
    if (!parsed.success) return { error: "Invalid update." };
    const { leadId, status, lostReason, estValue } = parsed.data;

    const { data: lead } = await ctx.db.from("leads").select("id, conversation_id, status").eq("id", leadId).eq("account_id", ctx.account.id).maybeSingle();
    if (!lead) return { error: "Lead not found." };

    const patch: { status: string; booked_at?: string | null; lost_reason?: string | null; est_value_usd?: number } = { status };
    if (status === "booked") {
      patch.booked_at = new Date().toISOString();
      if (estValue !== undefined) patch.est_value_usd = estValue;
    }
    if (status === "lost") patch.lost_reason = lostReason ?? null;
    if (status === "new" || status === "qualified") {
      patch.booked_at = null;
      patch.lost_reason = null;
    }
    const { error } = await ctx.db.from("leads").update(patch).eq("id", leadId).eq("account_id", ctx.account.id);
    if (error) return { error: error.message };

    if (lead.conversation_id) {
      const convStatus = status === "new" ? "open" : status;
      await ctx.db.from("conversations").update({ status: convStatus }).eq("id", lead.conversation_id).eq("account_id", ctx.account.id);
    }
    if (status === "booked" && lead.status !== "booked") {
      const { count } = await ctx.db.from("leads").select("id", { count: "exact", head: true }).eq("account_id", ctx.account.id).eq("status", "booked");
      await track((count ?? 0) <= 1 ? "first_booked" : "lead_booked", { lead_id: leadId, via: "leads" }, { accountId: ctx.account.id, userId: ctx.user.id });
    }

    revalidatePath("/leads");
    revalidatePath("/inbox");
    revalidatePath("/dashboard");
    return { ok: status === "booked" ? "Booked — nice work." : `Marked ${status}.` };
  } catch (err) {
    return fail(err);
  }
}
