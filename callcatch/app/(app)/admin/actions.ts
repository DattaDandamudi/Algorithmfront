"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { isAdminEmail, requireUser } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/db/client";
import { ADMIN_VIEW_COOKIE } from "@/components/dashboard/context";
import { track } from "@/lib/events";

export type AdminActionState = { ok?: string; error?: string } | null;

const uuid = z.string().uuid();

/** Admin-only gate for every action in this file. */
async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) redirect("/dashboard");
  return user;
}

/**
 * "View as": sets the httpOnly `cc_admin_view` cookie and opens the customer's dashboard.
 * The cookie is only honoured for admin emails (see components/dashboard/context.ts) and all
 * write actions refuse to run while it is set. Expires after 2 hours.
 */
export async function impersonateAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const accountId = uuid.parse(formData.get("accountId"));
  const db = createAdminSupabase();
  const { data } = await db.from("accounts").select("id").eq("id", accountId).maybeSingle();
  if (!data) redirect("/admin");
  const store = await cookies();
  store.set(ADMIN_VIEW_COOKIE, accountId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 2,
  });
  await track("admin_view_as", { target_account_id: accountId }, { accountId, userId: user.id });
  redirect("/dashboard");
}

export async function addAdminNoteAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  try {
    const user = await requireAdmin();
    const parsed = z.object({ accountId: uuid, note: z.string().trim().min(2, "Write a note first.").max(4000) }).safeParse({
      accountId: formData.get("accountId"),
      note: formData.get("note"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid note." };
    const db = createAdminSupabase();
    const { error } = await db.from("admin_notes").insert({ account_id: parsed.data.accountId, note: parsed.data.note, author_user_id: user.id });
    if (error) return { error: error.message };
    revalidatePath(`/admin/accounts/${parsed.data.accountId}`);
    return { ok: "Note added." };
  } catch (err) {
    unstable_rethrow(err);
    return { error: err instanceof Error ? err.message : "Could not add the note." };
  }
}
