/**
 * GET /leads/export?status=&urgency=&q= — CSV of the signed-in account's leads.
 * Session-guarded (RLS client); admins viewing another account get that account's rows.
 */
import { type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSessionForApi, isAdminEmail } from "@/lib/auth/session";
import { createAdminSupabase, createServerSupabase } from "@/lib/db/client";
import { ADMIN_VIEW_COOKIE } from "@/components/dashboard/context";
import { normalizePhone } from "@/lib/telephony/client";

const querySchema = z.object({
  status: z.enum(["new", "qualified", "booked", "lost"]).optional(),
  urgency: z.enum(["emergency", "today", "this_week", "flexible"]).optional(),
  q: z.string().trim().max(80).optional(),
});

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Neutralise spreadsheet formula injection and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(request: NextRequest) {
  const session = await getSessionForApi();
  if (!session.ok) return new Response("Unauthorized", { status: 401 });
  if (!session.account) return new Response("No account", { status: 403 });

  let accountId = session.account.id;
  let db = await createServerSupabase();
  const viewAs = (await cookies()).get(ADMIN_VIEW_COOKIE)?.value;
  if (viewAs && isAdminEmail(session.user.email) && z.string().uuid().safeParse(viewAs).success) {
    accountId = viewAs;
    db = createAdminSupabase();
  }

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse({
    status: params.status && params.status !== "all" ? params.status : undefined,
    urgency: params.urgency || undefined,
    q: params.q || undefined,
  });
  if (!parsed.success) return new Response("Bad request", { status: 400 });

  let query = db.from("leads").select("*").eq("account_id", accountId).order("created_at", { ascending: false }).limit(5000);
  if (parsed.data.status) query = query.eq("status", parsed.data.status);
  if (parsed.data.urgency) query = query.eq("urgency", parsed.data.urgency);
  if (parsed.data.q) {
    const phone = normalizePhone(parsed.data.q);
    const safe = parsed.data.q.replace(/[%_,()]/g, "");
    query = phone ? query.eq("phone", phone) : query.or(`name.ilike.%${safe}%,issue.ilike.%${safe}%,address.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  if (error) return new Response("Export failed", { status: 500 });

  const header = ["received_at", "status", "name", "phone", "issue", "urgency", "address", "zip", "preferred_window", "est_value_usd", "booked_at", "lost_reason", "source", "external_ref", "lead_id", "conversation_id"];
  const lines = [header.join(",")];
  for (const l of data ?? []) {
    lines.push(
      [l.created_at, l.status, l.name, l.phone, l.issue, l.urgency, l.address, l.zip, l.preferred_window, l.est_value_usd, l.booked_at, l.lost_reason, l.source, l.external_ref, l.id, l.conversation_id]
        .map(csvCell)
        .join(",")
    );
  }
  const body = `﻿${lines.join("\r\n")}\r\n`;
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="callcatch-leads-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
