import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionForApi, isAdminEmail } from "@/lib/auth/session";
import { AGENT_ROLES, runAgent } from "@/lib/agents/core";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({ role: z.enum(AGENT_ROLES), input: z.record(z.string(), z.unknown()).default({}), autonomy: z.enum(["draft_only", "approval_required", "autonomous"]).optional() });

export async function POST(request: NextRequest) {
  const session = await getSessionForApi();
  if (!session.ok || !isAdminEmail(session.user.email)) return Response.json({ ok: false, error: "admin only" }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ ok: false, error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  const r = await runAgent(parsed.data.role, { trigger: "manual", input: parsed.data.input, autonomy: parsed.data.autonomy });
  return Response.json({ ok: r.status !== "failed", ...r });
}
