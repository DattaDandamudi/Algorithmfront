/** Sends outreach rows that were deferred to the prospect's send window (status scheduled, due now). */
import { createAdminSupabase } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import { executeTask } from "./tasks";

export async function dispatchScheduledOutreach(limit = 40): Promise<{ sent: number; failed: number; skipped: number }> {
  const db = createAdminSupabase();
  const now = new Date().toISOString();
  const { data: due } = await db.from("outreach").select("id, prospect_id, step, subject, body, channel").eq("status", "scheduled").eq("channel", "email").lte("scheduled_for", now).order("scheduled_for").limit(limit);
  const counts = { sent: 0, failed: 0, skipped: 0 };
  for (const row of due ?? []) {
    const { data: prospect } = await db.from("prospects").select("email, status").eq("id", row.prospect_id).maybeSingle();
    if (!prospect?.email || ["do_not_contact", "customer", "disqualified", "replied"].includes(prospect.status)) {
      await db.from("outreach").update({ status: "skipped" }).eq("id", row.id);
      counts.skipped++;
      continue;
    }
    const payload = { prospect_id: row.prospect_id, to: prospect.email, subject: row.subject ?? "", body_text: row.body, step: row.step, outreach_id: row.id, defer_if_outside_window: true };
    // The original task was already approved when the row was scheduled; the dispatch task is pre-approved.
    const { data: task } = await db
      .from("agent_tasks")
      .insert({ role: "outreach", kind: "send_outreach_email", title: `Scheduled step ${row.step}: ${row.subject ?? ""}`.slice(0, 200), payload: payload as Json, status: "approved", requires_approval: false, risk: "medium", rationale: "dispatch of a founder-approved scheduled send" })
      .select("*")
      .single();
    if (!task) {
      counts.failed++;
      continue;
    }
    const r = await executeTask(task);
    if (r.status === "executed") counts.sent++;
    else counts.failed++;
  }
  return counts;
}
