/**
 * POST /api/twilio/voice/test-outbound — TwiML for the outbound "Test my forwarding" call
 * that module b places from TWILIO_NOTIFICATION_NUMBER to the customer's business line.
 *
 * If the owner picks up, they hear an instruction to let the next call ring through. If the
 * carrier forwards the ringing call to the customer's CallCatch number, the forwarded leg hits
 * /api/twilio/voice/inbound with From = notification number and is recorded as a `test` call;
 * this leg then just plays into that bridge and hangs up.
 */
import type { NextRequest } from "next/server";
import { twiml, validateTwilioRequest } from "@/lib/telephony/client";
import { sayAndHangup } from "@/lib/telephony/twiml";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const params = await validateTwilioRequest(request);
  if (!params) return new Response("invalid signature", { status: 403 });
  // AnsweredBy is only present when machine detection is enabled on the outbound call.
  const answeredBy = params.AnsweredBy ?? "";
  const line =
    answeredBy.startsWith("machine")
      ? "This is a CallCatch forwarding test. Goodbye."
      : "This is a CallCatch forwarding test. If you picked up, please hang up and let the next test call ring through so it forwards to CallCatch. Goodbye.";
  return twiml(sayAndHangup([line]));
}
