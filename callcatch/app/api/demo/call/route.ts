/**
 * POST /api/demo/call — the public demo line's voice webhook (TWILIO_DEMO_NUMBER).
 * Greeting → hang up; in after(): demo text-back thread from the demo number, CAPI `Lead`.
 * Twilio params: CallSid, From, To (see /api/twilio/voice/inbound).
 */
import { after, type NextRequest } from "next/server";
import { twiml, validateTwilioRequest } from "@/lib/telephony/client";
import { demoCallTwiml, startDemoConversation } from "@/lib/telephony/demo";
import { sayAndHangup } from "@/lib/telephony/twiml";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const params = await validateTwilioRequest(request);
  if (!params) return new Response("invalid signature", { status: 403 });
  const callSid = params.CallSid ?? "";
  const from = params.From ?? "";
  if (!callSid || !from) return twiml(sayAndHangup(["Sorry, we couldn't read your number. Goodbye."]));

  after(async () => {
    try {
      const result = await startDemoConversation({ from, callSid });
      console.info("[demo/call]", { callSid, ...result });
    } catch (err) {
      console.error("[demo/call] failed", { callSid, err: err instanceof Error ? err.message : err });
    }
  });
  return twiml(demoCallTwiml());
}
