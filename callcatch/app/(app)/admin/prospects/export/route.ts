import type { NextRequest } from "next/server";
import { getSessionForApi, isAdminEmail } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/db/client";
import { toCsv } from "@/lib/agents/pipelines/csv";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getSessionForApi();
  if (!session.ok || !isAdminEmail(session.user.email)) return new Response("admin only", { status: 403 });
  const sp = request.nextUrl.searchParams;
  const db = createAdminSupabase();
  let q = db.from("prospects").select("business_name, trade, phone, phone_type, email, website, address, city, state, zip, rating, review_count, fit_score, status, source, owner_name, last_touch_at, next_touch_at").order("fit_score", { ascending: false }).limit(5000);
  if (sp.get("status")) q = q.eq("status", sp.get("status")!);
  if (sp.get("trade")) q = q.eq("trade", sp.get("trade")!);
  if (sp.get("state")) q = q.eq("state", sp.get("state")!.toUpperCase());
  const { data } = await q;
  return new Response(toCsv((data ?? []) as Record<string, unknown>[]), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="prospects-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
