import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionForApi } from "@/lib/auth/session";
import { createPortalSession } from "@/lib/billing/manage";

export const runtime = "nodejs";

const bodySchema = z.object({ flow: z.enum(["home", "cancel", "payment_method", "update_plan"]).default("home") });

/**
 * POST /api/stripe/portal  Body: { flow? } → { url }
 * Creates a Customer Portal session that returns to /billing.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionForApi();
  if (!session.ok) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!session.account) return Response.json({ error: "no_account" }, { status: 409 });

  let json: unknown = {};
  const raw = await request.text();
  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid_input" }, { status: 400 });

  try {
    const url = await createPortalSession(session.account.id, parsed.data.flow);
    return Response.json({ url });
  } catch (err) {
    console.error("[api/stripe/portal] failed", err);
    const msg = err instanceof Error ? err.message : "portal_failed";
    return Response.json({ error: msg.startsWith("No Stripe customer") ? "no_customer" : "portal_failed" }, { status: msg.startsWith("No Stripe customer") ? 409 : 500 });
  }
}
