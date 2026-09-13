/**
 * POST /api/demo/sms — inbound SMS webhook for the demo number (alternative to routing the
 * demo number through /api/twilio/sms/inbound, which also handles purpose='demo').
 */
import { after, type NextRequest } from "next/server";
import { twiml, validateTwilioRequest } from "@/lib/telephony/client";
import { findDemoNumber } from "@/lib/telephony/demo";
import { handleInboundSms } from "@/lib/telephony/inboundSms";
import { emptyResponse } from "@/lib/telephony/twiml";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const params = await validateTwilioRequest(request);
  if (!params) return new Response("invalid signature", { status: 403 });
  const number = await findDemoNumber();
  if (!number) {
    console.error("[demo/sms] demo number row missing");
    return twiml(emptyResponse());
  }
  try {
    const outcome = await handleInboundSms(params, number);
    if (outcome.followUp) {
      const run = outcome.followUp;
      after(async () => {
        try {
          await run();
        } catch (err) {
          console.error("[demo/sms] ai turn failed", err instanceof Error ? err.message : err);
        }
      });
    }
    return twiml(outcome.twiml);
  } catch (err) {
    console.error("[demo/sms] failed", err instanceof Error ? err.message : err);
    return twiml(emptyResponse());
  }
}
