"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { isAdminEmail, requireUser } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/db/client";
import { parseProspectsCsv } from "@/lib/agents/pipelines/csv";
import { upsertProspects } from "@/lib/agents/pipelines/ingest";

export type ProspectActionState = { ok?: string; error?: string } | null;

async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) redirect("/dashboard");
  return user;
}

export async function importCsvAction(_prev: ProspectActionState, formData: FormData): Promise<ProspectActionState> {
  try {
    await requireAdmin();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
    if (file.size > 10_000_000) return { error: "CSV larger than 10 MB — split it." };
    const source = z.enum(["csv", "license_board", "manual", "referral", "web"]).catch("csv").parse(formData.get("source"));
    const text = await file.text();
    const { rows, skipped } = parseProspectsCsv(text, { source });
    const r = await upsertProspects(rows, { source });
    revalidatePath("/admin/prospects");
    return { ok: `Parsed ${rows.length} (skipped ${skipped}). Inserted ${r.inserted}, updated ${r.updated}${r.errors.length ? `, errors: ${r.errors.join("; ")}` : ""}.` };
  } catch (err) {
    unstable_rethrow(err);
    return { error: err instanceof Error ? err.message : "Import failed." };
  }
}

export async function bulkStatusAction(_prev: ProspectActionState, formData: FormData): Promise<ProspectActionState> {
  try {
    await requireAdmin();
    const status = z.enum(["queued", "disqualified", "do_not_contact", "new"]).parse(formData.get("status"));
    const ids = formData.getAll("ids").map(String).filter((s) => z.string().uuid().safeParse(s).success);
    if (ids.length === 0) return { error: "Select at least one prospect." };
    const db = createAdminSupabase();
    const { error } = await db.from("prospects").update({ status, ...(status === "queued" ? { next_touch_at: new Date().toISOString() } : {}) }).in("id", ids).neq("status", "do_not_contact");
    if (error) return { error: error.message };
    revalidatePath("/admin/prospects");
    return { ok: `Updated ${ids.length} prospect(s) to ${status}.` };
  } catch (err) {
    unstable_rethrow(err);
    return { error: err instanceof Error ? err.message : "Update failed." };
  }
}
