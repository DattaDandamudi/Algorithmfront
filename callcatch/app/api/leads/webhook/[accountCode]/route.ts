/**
 * POST /api/leads/webhook/[accountCode] — generic JSON lead intake (Zapier, Make, website forms).
 *
 * `accountCode` is the account's public code (`accounts.referral_code`). Auth: header
 * `X-CallCatch-Secret` must equal an enabled `lead_sources.webhook_secret` (type webhook/zapier)
 * of that account, compared in constant time. Body: { name, phone, email?, message?, source?, external_ref? }
 * plus common Zapier/Meta aliases (full_name, phone_number, …). Responds 202 and processes in `after()`.
 */
import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/db/client";
import { createLeadAndEngage } from "@/lib/leads/intake";
import { safeEqual } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

const str = z.string().trim().max(500).optional().nullable();
const bodySchema = z
  .object({
    name: str,
    full_name: str,
    first_name: str,
    last_name: str,
    phone: str,
    phone_number: str,
    mobile: str,
    email: str,
    message: str,
    comments: str,
    notes: str,
    issue: str,
    address: str,
    street_address: str,
    zip: str,
    zip_code: str,
    postal_code: str,
    source: str,
    external_ref: str,
    lead_id: str,
    id: str,
  })
  .passthrough()
  .refine((b) => Boolean(b.phone || b.phone_number || b.mobile || b.email), { message: "phone or email is required" });

export async function POST(request: NextRequest, ctx: RouteContext<"/api/leads/webhook/[accountCode]">) {
  const { accountCode } = await ctx.params;
  const provided = request.headers.get("x-callcatch-secret");
  if (!provided || !/^[a-z0-9]{4,32}$/i.test(accountCode)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const db = createAdminSupabase();
  const account = await db.from("accounts").select("id, status").eq("referral_code", accountCode.toLowerCase()).maybeSingle();
  if (!account.data) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sources = await db
    .from("lead_sources")
    .select("id, webhook_secret, type")
    .eq("account_id", account.data.id)
    .eq("enabled", true)
    .in("type", ["webhook", "zapier"]);
  const source = (sources.data ?? []).find((s) => s.webhook_secret && safeEqual(provided, s.webhook_secret));
  if (!source) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  const b = parsed.data;

  const name = b.name || b.full_name || [b.first_name, b.last_name].filter(Boolean).join(" ") || null;
  const phone = b.phone || b.phone_number || b.mobile || null;
  const message = b.message || b.comments || b.notes || b.issue || null;
  const address = b.address || b.street_address || null;
  const zip = b.zip || b.zip_code || b.postal_code || null;
  const externalRef = b.external_ref || b.lead_id || b.id || null;
  const channel = (b.source || source.type).toLowerCase().slice(0, 40);
  const accountId = account.data.id;
  const raw: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) raw[k] = typeof v === "string" ? v.slice(0, 500) : v;
  }

  after(async () => {
    try {
      const result = await createLeadAndEngage(accountId, {
        name,
        phone,
        email: b.email ?? null,
        message,
        address,
        zip,
        source: "lead_form",
        channel,
        externalRef: externalRef ? `${channel}:${externalRef}` : null,
        raw,
        consent: {
          source: "lead_form",
          evidence: { type: "webhook", lead_source_id: source.id, channel, external_ref: externalRef, received_at: new Date().toISOString() },
        },
      });
      console.info("[leads/webhook]", { accountId, channel, ...result });
    } catch (err) {
      console.error("[leads/webhook] failed", { accountId, err: err instanceof Error ? err.message : err });
    }
  });
  return Response.json({ ok: true, accepted: true }, { status: 202 });
}
