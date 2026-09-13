/**
 * /api/meta/leadgen — Meta Lead Ads webhook (behind FEATURE_META_LEADGEN).
 *
 *  GET  hub.mode=subscribe & hub.verify_token === META_WEBHOOK_VERIFY_TOKEN → echoes hub.challenge.
 *  POST X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(META_APP_SECRET, raw body), constant-time compare.
 *       entry[].changes[] with field "leadgen" → { leadgen_id, page_id, form_id, created_time }.
 *       In after(): lead_sources by meta_page_id (+ optional meta_form_ids filter) →
 *       Graph API GET /{leadgen_id}?fields=field_data,created_time,ad_id,form_id with META_PAGE_ACCESS_TOKEN
 *       → createLeadAndEngage (idempotent on leadgen_id).
 */
import { after, type NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/db/client";
import { env } from "@/lib/env";
import { createLeadAndEngage } from "@/lib/leads/intake";
import { safeEqual } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

const GRAPH = "https://graph.facebook.com/v21.0";

const changeSchema = z.object({
  field: z.string(),
  value: z
    .object({
      leadgen_id: z.union([z.string(), z.number()]).transform(String),
      page_id: z.union([z.string(), z.number()]).transform(String).optional(),
      form_id: z.union([z.string(), z.number()]).transform(String).optional(),
      ad_id: z.union([z.string(), z.number()]).transform(String).optional().nullable(),
      created_time: z.number().optional(),
    })
    .passthrough(),
});
const bodySchema = z.object({
  object: z.string().optional(),
  entry: z.array(z.object({ id: z.union([z.string(), z.number()]).transform(String).optional(), changes: z.array(changeSchema).optional() }).passthrough()),
});

type FieldData = Array<{ name: string; values: string[] }>;

function pickField(fields: FieldData, names: string[]): string | null {
  for (const f of fields) {
    const n = f.name.toLowerCase();
    if (names.includes(n) && f.values?.[0]) return String(f.values[0]).trim();
  }
  return null;
}

async function fetchLead(leadgenId: string): Promise<{ field_data: FieldData; created_time?: string; ad_id?: string; form_id?: string } | null> {
  const token = env.get("META_PAGE_ACCESS_TOKEN");
  if (!token) {
    console.error("[meta/leadgen] META_PAGE_ACCESS_TOKEN not set");
    return null;
  }
  const url = `${GRAPH}/${encodeURIComponent(leadgenId)}?fields=field_data,created_time,ad_id,form_id&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  const json = (await res.json().catch(() => null)) as { field_data?: FieldData; created_time?: string; ad_id?: string; form_id?: string; error?: { message?: string } } | null;
  if (!res.ok || !json || !Array.isArray(json.field_data)) {
    console.error("[meta/leadgen] graph fetch failed", { leadgenId, status: res.status, error: json?.error?.message });
    return null;
  }
  return { field_data: json.field_data, created_time: json.created_time, ad_id: json.ad_id, form_id: json.form_id };
}

async function processChange(value: z.infer<typeof changeSchema>["value"], entryId: string | undefined): Promise<void> {
  const pageId = value.page_id ?? entryId;
  if (!pageId) return;
  const db = createAdminSupabase();
  const sources = await db.from("lead_sources").select("*").eq("meta_page_id", pageId).eq("type", "meta_page").eq("enabled", true);
  const source = (sources.data ?? []).find((s) => !s.meta_form_ids || s.meta_form_ids.length === 0 || (value.form_id ? s.meta_form_ids.includes(value.form_id) : true));
  if (!source) {
    console.warn("[meta/leadgen] no lead source for page", { pageId, formId: value.form_id });
    return;
  }
  const lead = await fetchLead(value.leadgen_id);
  if (!lead) return;
  const fields = lead.field_data;
  const name = pickField(fields, ["full_name", "name"]) ?? [pickField(fields, ["first_name"]), pickField(fields, ["last_name"])].filter(Boolean).join(" ") ?? null;
  const phone = pickField(fields, ["phone_number", "phone", "mobile_phone", "work_phone_number"]);
  const email = pickField(fields, ["email", "work_email"]);
  const address = pickField(fields, ["street_address", "address"]);
  const zip = pickField(fields, ["zip_code", "post_code", "postal_code", "zip"]);
  const standard = new Set(["full_name", "name", "first_name", "last_name", "phone_number", "phone", "mobile_phone", "work_phone_number", "email", "work_email", "street_address", "address", "zip_code", "post_code", "postal_code", "zip", "city", "state", "country"]);
  const custom = fields.filter((f) => !standard.has(f.name.toLowerCase()) && f.values?.[0]).map((f) => `${f.name.replace(/_/g, " ")}: ${f.values[0]}`);
  const rawFields: Record<string, string> = {};
  for (const f of fields) rawFields[f.name] = String(f.values?.[0] ?? "");

  const result = await createLeadAndEngage(source.account_id, {
    name: name || null,
    phone,
    email,
    message: custom.join("; ") || null,
    address,
    zip,
    source: "lead_form",
    channel: "meta",
    externalRef: `meta:${value.leadgen_id}`,
    raw: { leadgen_id: value.leadgen_id, page_id: pageId, form_id: value.form_id ?? lead.form_id ?? null, ad_id: value.ad_id ?? lead.ad_id ?? null, created_time: lead.created_time ?? null, fields: rawFields },
    consent: {
      source: "lead_form",
      evidence: { type: "meta_instant_form", leadgen_id: value.leadgen_id, form_id: value.form_id ?? lead.form_id ?? null, page_id: pageId, created_time: lead.created_time ?? null },
    },
  });
  console.info("[meta/leadgen]", { leadgenId: value.leadgen_id, accountId: source.account_id, ...result });
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const mode = q.get("hub.mode");
  const token = q.get("hub.verify_token");
  const challenge = q.get("hub.challenge");
  const expected = env.get("META_WEBHOOK_VERIFY_TOKEN");
  if (mode === "subscribe" && expected && token && safeEqual(token, expected) && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const appSecret = env.get("META_APP_SECRET");
  if (!appSecret) return Response.json({ ok: false, error: "META_APP_SECRET not configured" }, { status: 503 });
  const header = request.headers.get("x-hub-signature-256") ?? "";
  const expected = `sha256=${createHmac("sha256", appSecret).update(raw, "utf8").digest("hex")}`;
  if (!safeEqual(header, expected)) return new Response("invalid signature", { status: 403 });

  // Meta retries on non-2xx; when the feature is off we acknowledge and drop.
  if (!env.bool("FEATURE_META_LEADGEN", false)) return Response.json({ ok: true, skipped: "FEATURE_META_LEADGEN off" });

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: true, ignored: "unexpected payload" });

  const jobs: Array<{ value: z.infer<typeof changeSchema>["value"]; entryId: string | undefined }> = [];
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field === "leadgen") jobs.push({ value: change.value, entryId: entry.id });
    }
  }
  if (jobs.length) {
    after(async () => {
      for (const job of jobs) {
        try {
          await processChange(job.value, job.entryId);
        } catch (err) {
          console.error("[meta/leadgen] failed", { leadgenId: job.value.leadgen_id, err: err instanceof Error ? err.message : err });
        }
      }
    });
  }
  return Response.json({ ok: true, received: jobs.length });
}
