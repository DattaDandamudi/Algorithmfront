import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionForApi } from "@/lib/auth/session";
import { readAttribution } from "@/lib/meta/attribution";
import { checkoutInputSchema, createCheckoutSession } from "@/lib/billing/checkout";
import { REFERRAL_COOKIE } from "@/lib/billing/referrals";

export const runtime = "nodejs";

/**
 * POST /api/stripe/checkout
 * Body: { plan, interval, path, setupFee?, ref?, eventId? } → { id, url }
 * JSON alternative to the /billing/checkout Server Function (used by client-side buttons).
 */
export async function POST(request: NextRequest) {
  const session = await getSessionForApi();
  if (!session.ok) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!session.account) return Response.json({ error: "no_account" }, { status: 409 });
  if (!session.user.email) return Response.json({ error: "no_email" }, { status: 422 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = checkoutInputSchema.extend({ eventId: z.uuid().optional() }).safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400 });

  const store = await cookies();
  const attribution = readAttribution(store);
  const cookieRef = store.get(REFERRAL_COOKIE)?.value;
  const ref = parsed.data.ref ?? (cookieRef && /^[a-z0-9]{4,32}$/i.test(cookieRef) ? cookieRef : undefined);

  try {
    const result = await createCheckoutSession({
      accountId: session.account.id,
      userEmail: session.user.email,
      plan: parsed.data.plan,
      interval: parsed.data.interval,
      path: parsed.data.path,
      setupFee: parsed.data.setupFee,
      ref,
      attribution: { fbc: attribution.fbc, fbp: attribution.fbp, utm_source: attribution.utm_source, utm_medium: attribution.utm_medium, utm_campaign: attribution.utm_campaign },
      eventId: parsed.data.eventId ?? randomUUID(),
    });
    return Response.json(result);
  } catch (err) {
    console.error("[api/stripe/checkout] failed", err);
    return Response.json({ error: "checkout_failed" }, { status: 500 });
  }
}
