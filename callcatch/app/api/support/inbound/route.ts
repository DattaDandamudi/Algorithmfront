/**
 * Resend inbound webhook for support@ and outreach replies (Svix-signed with RESEND_WEBHOOK_SECRET).
 * A reply from a known prospect becomes an outreach row (status replied) + prospects.status replied;
 * anything else becomes a support ticket (agent_tasks role=support kind=draft) for the support agent.
 */
import type { NextRequest } from "next/server";
import { Resend } from "resend";
import { Webhook } from "svix";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

const Event = z.object({
  type: z.string(),
  data: z.object({
    email_id: z.string().optional(),
    from: z.string(),
    to: z.union([z.string(), z.array(z.string())]).optional(),
    subject: z.string().optional().nullable(),
    text: z.string().optional().nullable(),
    html: z.string().optional().nullable(),
    headers: z.union([z.record(z.string(), z.string()), z.array(z.object({ name: z.string(), value: z.string() }))]).optional(),
  }),
});

function addressOf(raw: string): string {
  const m = /<([^>]+)>/.exec(raw);
  return (m ? m[1] : raw).trim().toLowerCase();
}

function excerpt(text: string | null | undefined, html: string | null | undefined): string {
  const src = text ?? (html ?? "").replace(/<[^>]+>/g, " ");
  return src.replace(/\s+/g, " ").split(/On .{5,80}wrote:/)[0].trim().slice(0, 600);
}

export async function POST(request: NextRequest) {
  const secret = env.get("RESEND_WEBHOOK_SECRET");
  const raw = await request.text();
  if (secret) {
    try {
      new Webhook(secret).verify(raw, {
        "svix-id": request.headers.get("svix-id") ?? "",
        "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
        "svix-signature": request.headers.get("svix-signature") ?? "",
      });
    } catch {
      return Response.json({ ok: false, error: "bad signature" }, { status: 401 });
    }
  } else if (!env.bool("TWILIO_SKIP_SIGNATURE_VALIDATION")) {
    return Response.json({ ok: false, error: "RESEND_WEBHOOK_SECRET not configured" }, { status: 503 });
  }
  const parsed = Event.safeParse(JSON.parse(raw));
  if (!parsed.success) return Response.json({ ok: false, error: "unrecognized payload" }, { status: 400 });
  const data = { ...parsed.data.data };
  // Resend's email.received webhook carries metadata only; fetch the body by id.
  if (!data.text && !data.html && data.email_id && env.get("RESEND_API_KEY")) {
    const full = await new Resend(env.required("RESEND_API_KEY")).emails.receiving.get(data.email_id);
    if (full.data) {
      data.text = full.data.text ?? null;
      data.html = full.data.html ?? null;
      data.subject = data.subject ?? full.data.subject ?? null;
      data.from = data.from || full.data.from || "";
    }
  }
  const from = addressOf(data.from);
  const db = createAdminSupabase();
  const body = excerpt(data.text, data.html);

  const { data: prospect } = await db.from("prospects").select("id, status").eq("email", from).maybeSingle();
  if (prospect) {
    const { data: last } = await db.from("outreach").select("id, step").eq("prospect_id", prospect.id).eq("channel", "email").order("step", { ascending: false }).limit(1).maybeSingle();
    await db.from("outreach").insert({ prospect_id: prospect.id, channel: "email", step: (last?.step ?? 0) + 1, subject: data.subject ?? null, body: body || "(empty)", status: "replied", reply_excerpt: body || null, sent_at: new Date().toISOString(), provider_id: data.email_id ?? null });
    if (!["do_not_contact", "customer"].includes(prospect.status)) {
      await db.from("prospects").update({ status: "replied", last_touch_at: new Date().toISOString(), next_touch_at: new Date().toISOString() }).eq("id", prospect.id);
    }
    return Response.json({ ok: true, routed: "outreach_reply", prospect_id: prospect.id });
  }

  const ticket: Json = { from, subject: data.subject ?? null, body, email_id: data.email_id ?? null, received_at: new Date().toISOString() };
  const { data: task } = await db
    .from("agent_tasks")
    .insert({ role: "support", kind: "draft", title: `Ticket: ${(data.subject ?? "(no subject)").slice(0, 150)}`, payload: { ticket }, status: "proposed", requires_approval: true, risk: "low", rationale: "inbound support email" })
    .select("id")
    .single();
  return Response.json({ ok: true, routed: "support_ticket", task_id: task?.id ?? null });
}
