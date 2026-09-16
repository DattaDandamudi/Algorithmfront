/** One-click unsubscribe for outreach (CAN-SPAM / RFC 8058). GET and POST both work; idempotent. */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/db/client";

export const runtime = "nodejs";

async function unsubscribe(prospectId: string): Promise<boolean> {
  if (!z.string().uuid().safeParse(prospectId).success) return false;
  const db = createAdminSupabase();
  const { data } = await db.from("prospects").update({ status: "do_not_contact", disqualify_reason: "unsubscribed", next_touch_at: null }).eq("id", prospectId).select("id").maybeSingle();
  if (data) {
    await db.from("outreach").update({ status: "skipped" }).eq("prospect_id", prospectId).in("status", ["draft", "approved", "scheduled"]);
    return true;
  }
  return false;
}

function page(ok: boolean): Response {
  const body = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title><body style="font:16px/1.5 -apple-system,Segoe UI,sans-serif;max-width:520px;margin:64px auto;padding:0 20px;color:#0b1f3a"><h1 style="font-size:22px">${ok ? "You're unsubscribed." : "Link not recognized"}</h1><p>${ok ? "You won't receive any more emails from CallCatch. Sorry for the interruption, and thank you." : "This unsubscribe link is incomplete. Email support@callcatch.co and we'll remove you right away."}</p></body>`;
  return new Response(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/u/[prospectId]">) {
  const { prospectId } = await ctx.params;
  return page(await unsubscribe(prospectId));
}

export async function POST(_req: NextRequest, ctx: RouteContext<"/u/[prospectId]">) {
  const { prospectId } = await ctx.params;
  const ok = await unsubscribe(prospectId);
  return Response.json({ ok });
}
