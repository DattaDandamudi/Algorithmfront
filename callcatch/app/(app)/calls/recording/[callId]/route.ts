/**
 * GET /calls/recording/[callId] — streams a voicemail recording for the <audio> player.
 * The Twilio recording URL needs Basic auth (account SID + auth token), which must never reach
 * the browser, so this session-guarded handler fetches it server-side and proxies the bytes.
 */
import { type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSessionForApi, isAdminEmail } from "@/lib/auth/session";
import { createAdminSupabase, createServerSupabase } from "@/lib/db/client";
import { ADMIN_VIEW_COOKIE } from "@/components/dashboard/context";
import { env } from "@/lib/env";

const uuid = z.string().uuid();

export async function GET(_request: NextRequest, ctx: RouteContext<"/calls/recording/[callId]">) {
  const { callId } = await ctx.params;
  if (!uuid.safeParse(callId).success) return new Response("Not found", { status: 404 });

  const session = await getSessionForApi();
  if (!session.ok) return new Response("Unauthorized", { status: 401 });
  if (!session.account) return new Response("No account", { status: 403 });

  let accountId = session.account.id;
  let db = await createServerSupabase();
  const viewAs = (await cookies()).get(ADMIN_VIEW_COOKIE)?.value;
  if (viewAs && isAdminEmail(session.user.email) && uuid.safeParse(viewAs).success) {
    accountId = viewAs;
    db = createAdminSupabase();
  }

  const { data: call } = await db.from("calls").select("id, recording_url").eq("id", callId).eq("account_id", accountId).maybeSingle();
  if (!call?.recording_url) return new Response("Not found", { status: 404 });

  let target: URL;
  try {
    target = new URL(call.recording_url);
  } catch {
    return new Response("Bad recording URL", { status: 502 });
  }
  // Only ever fetch Twilio-hosted recordings with our credentials.
  if (target.protocol !== "https:" || !/\.twilio\.com$/.test(target.hostname)) return new Response("Forbidden", { status: 403 });
  if (!/\.(mp3|wav)$/i.test(target.pathname)) target.pathname = `${target.pathname}.mp3`;

  const auth = Buffer.from(`${env.required("TWILIO_ACCOUNT_SID")}:${env.required("TWILIO_AUTH_TOKEN")}`).toString("base64");
  const range = _request.headers.get("range");
  const upstream = await fetch(target, {
    headers: { Authorization: `Basic ${auth}`, ...(range ? { Range: range } : {}) },
    cache: "no-store",
  });
  if (!upstream.ok || !upstream.body) return new Response("Recording unavailable", { status: upstream.status === 404 ? 404 : 502 });

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") ?? "audio/mpeg");
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("Content-Disposition", `inline; filename="voicemail-${callId}.mp3"`);
  for (const h of ["content-length", "content-range", "accept-ranges"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
