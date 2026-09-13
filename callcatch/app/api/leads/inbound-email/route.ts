/**
 * POST /api/leads/inbound-email — Resend inbound webhook (`email.received`).
 *
 * Verified with Svix (`svix-id`, `svix-timestamp`, `svix-signature` + RESEND_WEBHOOK_SECRET).
 * The event only carries envelope data; the body is fetched with `resend.emails.receiving.get`.
 * Routing: any recipient address matching `lead_sources.inbound_email` (acct-<code>@LEADS_INBOUND_DOMAIN).
 * Heavy work (fetch body, parse, createLeadAndEngage) runs in `after()`.
 */
import { after, type NextRequest } from "next/server";
import { Resend } from "resend";
import { Webhook } from "svix";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/db/client";
import { env } from "@/lib/env";
import { createLeadAndEngage } from "@/lib/leads/intake";
import { parseLeadEmail } from "@/lib/leads/parseEmail";

export const runtime = "nodejs";
export const maxDuration = 60;

const eventSchema = z.object({
  type: z.string(),
  created_at: z.string().optional(),
  data: z
    .object({
      email_id: z.string().min(1),
      from: z.string().optional(),
      to: z.array(z.string()).optional(),
      cc: z.array(z.string()).nullable().optional(),
      subject: z.string().nullable().optional(),
      message_id: z.string().nullable().optional(),
      received_for: z.array(z.string()).optional(),
    })
    .passthrough(),
});

function addressOf(raw: string): string {
  const m = /<([^>]+)>/.exec(raw);
  return (m ? m[1] : raw).trim().toLowerCase();
}

async function processInboundEmail(event: z.infer<typeof eventSchema>): Promise<void> {
  const db = createAdminSupabase();
  const recipients = [...(event.data.to ?? []), ...(event.data.cc ?? []), ...(event.data.received_for ?? [])].map(addressOf);
  if (recipients.length === 0) return;
  const source = await db.from("lead_sources").select("*").in("inbound_email", recipients).eq("enabled", true).limit(1).maybeSingle();
  if (!source.data) {
    console.warn("[leads/inbound-email] no lead source for recipients", recipients);
    return;
  }

  const resend = new Resend(env.required("RESEND_API_KEY"));
  const full = await resend.emails.receiving.get(event.data.email_id);
  if (full.error || !full.data) {
    console.error("[leads/inbound-email] fetch body failed", full.error?.message);
    return;
  }
  const parsed = parseLeadEmail({ subject: full.data.subject ?? event.data.subject ?? null, text: full.data.text, html: full.data.html, from: full.data.from ?? event.data.from ?? null });
  const isMeta = parsed.kind === "meta_lead_email";
  const result = await createLeadAndEngage(source.data.account_id, {
    name: parsed.name,
    phone: parsed.phone,
    email: parsed.email,
    message: parsed.message,
    address: parsed.address,
    zip: parsed.zip,
    source: isMeta ? "lead_form" : "web_form",
    channel: isMeta ? "meta_email" : "email",
    externalRef: parsed.externalRef ? `email:${parsed.externalRef}` : `email:${full.data.message_id || event.data.email_id}`,
    raw: { email_id: event.data.email_id, subject: full.data.subject, from: full.data.from, fields: parsed.fields },
    consent: {
      source: isMeta ? "lead_form" : "web_form",
      evidence: { type: "inbound_email", email_id: event.data.email_id, from: full.data.from, subject: full.data.subject, received_at: new Date().toISOString() },
    },
  });
  console.info("[leads/inbound-email]", { emailId: event.data.email_id, accountId: source.data.account_id, ...result });
}

export async function POST(request: NextRequest) {
  const secret = env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) return Response.json({ ok: false, error: "RESEND_WEBHOOK_SECRET not configured" }, { status: 503 });
  const raw = await request.text();
  const headers = {
    "svix-id": request.headers.get("svix-id") ?? "",
    "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
    "svix-signature": request.headers.get("svix-signature") ?? "",
  };
  try {
    new Webhook(secret).verify(raw, headers);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const parsed = eventSchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "unexpected payload" }, { status: 400 });
  if (parsed.data.type !== "email.received") return Response.json({ ok: true, ignored: parsed.data.type });

  const event = parsed.data;
  after(async () => {
    try {
      await processInboundEmail(event);
    } catch (err) {
      console.error("[leads/inbound-email] failed", { emailId: event.data.email_id, err: err instanceof Error ? err.message : err });
    }
  });
  return Response.json({ ok: true, accepted: true });
}
