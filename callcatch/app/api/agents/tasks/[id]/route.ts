import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionForApi, isAdminEmail } from "@/lib/auth/session";
import { approveTask, rejectTask } from "@/lib/agents/core";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({ action: z.enum(["approve", "reject"]), reason: z.string().max(500).optional() });

export async function POST(request: NextRequest, ctx: RouteContext<"/api/agents/tasks/[id]">) {
  const session = await getSessionForApi();
  if (!session.ok || !isAdminEmail(session.user.email)) return Response.json({ ok: false, error: "admin only" }, { status: 403 });
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return Response.json({ ok: false, error: "bad id" }, { status: 400 });
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ ok: false, error: "invalid body" }, { status: 400 });
  if (parsed.data.action === "approve") {
    const r = await approveTask(id, session.user.id);
    return Response.json({ ok: r.status === "executed", ...r });
  }
  await rejectTask(id, session.user.id, parsed.data.reason);
  return Response.json({ ok: true, status: "rejected" });
}
