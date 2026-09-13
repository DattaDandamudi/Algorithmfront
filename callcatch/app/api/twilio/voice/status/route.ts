/**
 * POST /api/twilio/voice/status — call status callbacks for inbound calls (customer numbers)
 * and for the outbound emergency calls we place (statusCallback on calls.create).
 *
 * Params: CallSid, CallStatus (queued|ringing|in-progress|completed|busy|no-answer|failed|canceled),
 *         CallDuration (seconds, completed only), From, To, Direction.
 */
import { after, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/db/client";
import { validateTwilioRequest } from "@/lib/telephony/client";

export const runtime = "nodejs";
export const maxDuration = 30;

const FINAL = new Set(["completed", "busy", "no-answer", "failed", "canceled"]);

export async function POST(request: NextRequest) {
  const params = await validateTwilioRequest(request);
  if (!params) return new Response("invalid signature", { status: 403 });
  const callSid = params.CallSid ?? "";
  const status = (params.CallStatus ?? "").toLowerCase();
  if (!callSid || !FINAL.has(status)) return new Response(null, { status: 204 });

  after(async () => {
    const db = createAdminSupabase();
    // Inbound call we recorded: a completed call that never produced a voicemail was "answered by the greeting".
    const call = await db.from("calls").select("id, status").eq("twilio_call_sid", callSid).maybeSingle();
    if (call.data) {
      if (status === "completed" && call.data.status === "missed") {
        await db.from("calls").update({ status: "answered_by_greeting" }).eq("id", call.data.id).eq("status", "missed");
      }
      return;
    }
    // Outbound owner call (alerts.channel='voice' keyed by the call sid).
    const alertStatus = status === "completed" ? "delivered" : "failed";
    await db.from("alerts").update({ status: alertStatus }).eq("twilio_sid", callSid).eq("channel", "voice");
  });
  return new Response(null, { status: 204 });
}
