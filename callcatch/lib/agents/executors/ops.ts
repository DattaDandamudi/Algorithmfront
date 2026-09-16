import { z } from "zod";
import { createAdminSupabase } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import { sendEmail } from "@/lib/email/send";
import { env } from "@/lib/env";
import { track } from "@/lib/events";
import { stripe } from "@/lib/billing/stripe";
import { sendSms } from "@/lib/telephony/client";
import type { TaskExecutor, TaskKind } from "@/lib/agents/core/types";

const Reply = z.object({ to: z.string().email(), subject: z.string().max(150), body_text: z.string().min(5).max(8000), in_reply_to: z.string().optional(), account_id: z.string().uuid().optional() });
const replySupportEmail: TaskExecutor = async (task) => {
  const p = Reply.safeParse(task.payload);
  if (!p.success) return { ok: false, error: `payload: ${p.error.issues[0]?.message}` };
  const esc = p.data.body_text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font:15px/1.55 -apple-system,Segoe UI,sans-serif;color:#111">${esc.split(/\n{2,}/).map((x) => `<p style="margin:0 0 14px">${x.replace(/\n/g, "<br/>")}</p>`).join("")}</div>`;
  const sent = await sendEmail({ to: p.data.to, subject: p.data.subject, text: p.data.body_text, html, headers: p.data.in_reply_to ? { "In-Reply-To": p.data.in_reply_to, References: p.data.in_reply_to } : undefined, tags: [{ name: "kind", value: "support" }] });
  if (p.data.account_id) await track("support_reply_sent", { task_id: task.id, provider_id: sent.id }, { accountId: p.data.account_id });
  return { ok: true, result: { provider_id: sent.id } };
};

const Credit = z.object({ account_id: z.string().uuid(), amount_usd: z.number().min(1).max(2000), reason: z.string().min(3).max(500) });
const applyCredit: TaskExecutor = async (task) => {
  const p = Credit.safeParse(task.payload);
  if (!p.success) return { ok: false, error: `payload: ${p.error.issues[0]?.message}` };
  const db = createAdminSupabase();
  const { data: account } = await db.from("accounts").select("id, stripe_customer_id").eq("id", p.data.account_id).maybeSingle();
  if (!account?.stripe_customer_id) return { ok: false, error: "account has no Stripe customer" };
  const tx = await stripe().customers.createBalanceTransaction(
    account.stripe_customer_id,
    { amount: -Math.round(p.data.amount_usd * 100), currency: "usd", description: `CallCatch credit: ${p.data.reason}`.slice(0, 350) },
    { idempotencyKey: `agent_credit_${task.id}` }
  );
  await track("credit_applied", { task_id: task.id, amount_usd: p.data.amount_usd, reason: p.data.reason, balance_tx: tx.id }, { accountId: account.id });
  return { ok: true, result: { balance_transaction: tx.id, amount_usd: p.data.amount_usd } };
};

const Flag = z.object({ account_id: z.string().uuid(), severity: z.enum(["low", "medium", "high"]), reason: z.string().min(3).max(1000), suggested_action: z.string().max(1000).optional() });
const flagAccount: TaskExecutor = async (task) => {
  const p = Flag.safeParse(task.payload);
  if (!p.success) return { ok: false, error: `payload: ${p.error.issues[0]?.message}` };
  const db = createAdminSupabase();
  await track("agent_flag", { severity: p.data.severity, reason: p.data.reason, suggested_action: p.data.suggested_action ?? null, role: task.role, task_id: task.id }, { accountId: p.data.account_id });
  await db.from("admin_notes").insert({ account_id: p.data.account_id, note: `[${task.role} · ${p.data.severity}] ${p.data.reason}${p.data.suggested_action ? ` — suggested: ${p.data.suggested_action}` : ""}`, author_user_id: null });
  return { ok: true, result: { flagged: p.data.account_id, severity: p.data.severity } };
};

const Notify = z.object({ subject: z.string().max(150), body_text: z.string().min(2).max(20000), channel: z.enum(["email", "sms"]).default("email") });
const notifyFounder: TaskExecutor = async (task) => {
  const p = Notify.safeParse(task.payload);
  if (!p.success) return { ok: false, error: `payload: ${p.error.issues[0]?.message}` };
  const admin = env.adminEmails()[0];
  const result: Record<string, Json> = {};
  if (p.data.channel === "sms") {
    const mobile = env.get("FOUNDER_MOBILE");
    if (!mobile) return { ok: false, error: "FOUNDER_MOBILE not set" };
    const sms = await sendSms({ to: mobile, body: `${p.data.subject}: ${p.data.body_text}`.slice(0, 1500) });
    result.sms_sid = sms.sid;
  } else {
    if (!admin) return { ok: false, error: "ADMIN_EMAILS not set" };
    const esc = p.data.body_text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const sent = await sendEmail({ to: admin, subject: `[CallCatch ${task.role}] ${p.data.subject}`, text: p.data.body_text, html: `<pre style="font:14px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap">${esc}</pre>`, tags: [{ name: "kind", value: "founder_notify" }] });
    result.provider_id = sent.id;
  }
  return { ok: true, result };
};

export const executors: Partial<Record<TaskKind, TaskExecutor>> = {
  reply_support_email: replySupportEmail,
  apply_credit: applyCredit,
  flag_account: flagAccount,
  notify_founder: notifyFounder,
};
