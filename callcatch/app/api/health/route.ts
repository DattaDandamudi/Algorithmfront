/**
 * GET /api/health — uptime probe. Checks Supabase with a cheap head query and reports whether
 * the paid vendors are configured (no paid API is called). 200 when Supabase answers, else 503.
 */
import { createAdminSupabase } from "@/lib/db/client";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function checkSupabase(): Promise<boolean> {
  try {
    const db = createAdminSupabase();
    const r = await db.from("accounts").select("id", { count: "exact", head: true }).limit(1);
    return !r.error;
  } catch {
    return false;
  }
}

export async function GET() {
  const supabase = await checkSupabase();
  const checks = {
    supabase,
    stripe: Boolean(env.get("STRIPE_SECRET_KEY") && env.get("STRIPE_WEBHOOK_SECRET")),
    twilio: Boolean(env.get("TWILIO_ACCOUNT_SID") && env.get("TWILIO_AUTH_TOKEN") && env.get("TWILIO_NOTIFICATION_NUMBER")),
    anthropic: Boolean(env.get("ANTHROPIC_API_KEY")),
    deepgram: Boolean(env.get("DEEPGRAM_API_KEY")),
    resend: Boolean(env.get("RESEND_API_KEY")),
    cron: Boolean(env.get("CRON_SECRET")),
  };
  const ok = supabase;
  return Response.json(
    { ok, checks, models: env.models(), version: env.get("VERCEL_GIT_COMMIT_SHA", "dev"), time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
