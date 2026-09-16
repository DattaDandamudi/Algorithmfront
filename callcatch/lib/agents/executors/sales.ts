import { z } from "zod";
import { createAdminSupabase } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import { sendEmail } from "@/lib/email/send";
import { env } from "@/lib/env";
import { assembleOutreachEmail, EMAIL_SUPPRESSED_STATUSES } from "@/lib/agents/integrations/email-outreach";
import { isSendWindow, nextSendSlot } from "@/lib/agents/pipelines/timezones";
import type { TaskExecutor, TaskKind } from "@/lib/agents/core/types";

const SendEmail = z.object({
  prospect_id: z.string().uuid(),
  to: z.string().email(),
  subject: z.string().min(2).max(150),
  body_text: z.string().min(20).max(6000),
  body_html: z.string().max(20000).optional(),
  step: z.number().int().min(1).max(10).default(1),
  outreach_id: z.string().uuid().optional(),
  force_reply: z.boolean().optional(),
  /** When true, a send outside the prospect's 8am-6pm Mon-Fri window is scheduled for the next slot instead of refused. */
  defer_if_outside_window: z.boolean().default(true),
});

const sendOutreachEmail: TaskExecutor = async (task) => {
  const p = SendEmail.safeParse(task.payload);
  if (!p.success) return { ok: false, error: `payload: ${p.error.issues[0]?.message}` };
  const input = p.data;
  const db = createAdminSupabase();
  const { data: prospect } = await db.from("prospects").select("*").eq("id", input.prospect_id).maybeSingle();
  if (!prospect) return { ok: false, error: "prospect not found" };
  if (EMAIL_SUPPRESSED_STATUSES.has(prospect.status) || (prospect.status === "replied" && !input.force_reply)) {
    return { ok: false, error: `suppressed: prospect status ${prospect.status}` };
  }
  if (input.outreach_id) {
    const { data: existing } = await db.from("outreach").select("status, provider_id").eq("id", input.outreach_id).maybeSingle();
    if (existing?.status === "sent" && existing.provider_id) return { ok: true, result: { already_sent: true, provider_id: existing.provider_id } };
  }
  const now = new Date();
  if (!isSendWindow(prospect.state, now)) {
    if (!input.defer_if_outside_window) return { ok: false, error: "outside prospect send window (Mon-Fri 8am-6pm local)" };
    const slot = nextSendSlot(prospect.state, now) ?? new Date(now.getTime() + 3600_000 * 12);
    const row = { prospect_id: prospect.id, task_id: task.id, channel: "email", step: input.step, subject: input.subject, body: input.body_text, status: "scheduled", scheduled_for: slot.toISOString() };
    const { data } = input.outreach_id
      ? await db.from("outreach").update(row).eq("id", input.outreach_id).select("id").single()
      : await db.from("outreach").insert(row).select("id").single();
    return { ok: true, result: { scheduled: true, scheduled_for: slot.toISOString(), outreach_id: data?.id ?? null } };
  }
  const mail = assembleOutreachEmail({ prospectId: prospect.id, to: input.to, subject: input.subject, bodyText: input.body_text, bodyHtml: input.body_html });
  const from = env.get("OUTREACH_FROM_EMAIL") ?? env.get("RESEND_FROM_EMAIL", "CallCatch <hello@callcatch.co>")!;
  const replyTo = env.get("OUTREACH_REPLY_TO") ?? undefined;
  const sent = await sendEmail({ to: input.to, subject: mail.subject, text: mail.text, html: mail.html, from, replyTo, headers: mail.headers, tags: [{ name: "kind", value: "outreach" }, { name: "step", value: String(input.step) }] });
  const sentAt = now.toISOString();
  const row = { prospect_id: prospect.id, task_id: task.id, channel: "email", step: input.step, subject: input.subject, body: input.body_text, status: "sent", sent_at: sentAt, provider_id: sent.id };
  const { data: outreachRow } = input.outreach_id
    ? await db.from("outreach").update(row).eq("id", input.outreach_id).select("id").single()
    : await db.from("outreach").insert(row).select("id").single();
  const nextTouch = new Date(now.getTime() + 3 * 24 * 3600_000);
  await db
    .from("prospects")
    .update({
      status: ["new", "enriched", "queued"].includes(prospect.status) ? "contacted" : prospect.status,
      email: prospect.email ?? input.to,
      last_touch_at: sentAt,
      next_touch_at: nextTouch.toISOString(),
    })
    .eq("id", prospect.id);
  return { ok: true, result: { provider_id: sent.id, outreach_id: outreachRow?.id ?? null, sent_at: sentAt } };
};

const ScheduleCall = z.object({ prospect_id: z.string().uuid(), when_iso: z.string().datetime().optional(), script: z.string().max(4000), reason: z.string().max(1000) });
const scheduleCall: TaskExecutor = async (task) => {
  const p = ScheduleCall.safeParse(task.payload);
  if (!p.success) return { ok: false, error: `payload: ${p.error.issues[0]?.message}` };
  const db = createAdminSupabase();
  const { data: prospect } = await db.from("prospects").select("id, status, state").eq("id", p.data.prospect_id).maybeSingle();
  if (!prospect) return { ok: false, error: "prospect not found" };
  if (prospect.status === "do_not_contact") return { ok: false, error: "suppressed: do_not_contact" };
  const when = p.data.when_iso ? new Date(p.data.when_iso) : (nextSendSlot(prospect.state, new Date(), 0, 10) ?? new Date());
  const { data } = await db
    .from("outreach")
    .insert({ prospect_id: prospect.id, task_id: task.id, channel: "call", step: 1, subject: p.data.reason.slice(0, 200), body: p.data.script, status: "scheduled", scheduled_for: when.toISOString() })
    .select("id")
    .single();
  await db.from("prospects").update({ next_touch_at: when.toISOString() }).eq("id", prospect.id);
  return { ok: true, result: { outreach_id: data?.id ?? null, scheduled_for: when.toISOString() } };
};

const ALLOWED_STATUS = ["new", "enriched", "queued", "contacted", "replied", "demo_booked", "trial", "customer", "lost", "disqualified", "do_not_contact"] as const;
const UpdateProspect = z.object({
  prospect_id: z.string().uuid(),
  patch: z.object({
    status: z.enum(ALLOWED_STATUS).optional(),
    fit_score: z.number().int().min(0).max(100).optional(),
    next_touch_at: z.string().datetime().nullable().optional(),
    notes: z.record(z.string(), z.unknown()).optional(),
    owner_name: z.string().max(120).nullable().optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().regex(/^\+1\d{10}$/).nullable().optional(),
    phone_type: z.enum(["landline", "mobile", "voip", "unknown"]).nullable().optional(),
    uses_software: z.string().max(80).nullable().optional(),
    runs_meta_ads: z.boolean().nullable().optional(),
    disqualify_reason: z.string().max(500).nullable().optional(),
    website: z.string().url().nullable().optional(),
  }),
});
const updateProspect: TaskExecutor = async (task) => {
  const p = UpdateProspect.safeParse(task.payload);
  if (!p.success) return { ok: false, error: `payload: ${p.error.issues[0]?.message}` };
  const db = createAdminSupabase();
  const { data: current } = await db.from("prospects").select("id, status, notes").eq("id", p.data.prospect_id).maybeSingle();
  if (!current) return { ok: false, error: "prospect not found" };
  if (current.status === "do_not_contact" && p.data.patch.status && p.data.patch.status !== "do_not_contact") {
    return { ok: false, error: "cannot move a do_not_contact prospect back into the pipeline" };
  }
  const { notes, ...rest } = p.data.patch;
  const merged = notes ? ({ ...((current.notes as Record<string, unknown>) ?? {}), ...notes } as Json) : undefined;
  const { error } = await db
    .from("prospects")
    .update({ ...rest, ...(merged ? { notes: merged } : {}) })
    .eq("id", p.data.prospect_id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, result: { updated: Object.keys(p.data.patch) } };
};

export const executors: Partial<Record<TaskKind, TaskExecutor>> = {
  send_outreach_email: sendOutreachEmail,
  schedule_call: scheduleCall,
  update_prospect: updateProspect,
};
