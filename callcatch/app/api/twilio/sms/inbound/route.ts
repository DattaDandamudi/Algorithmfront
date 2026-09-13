/**
 * POST /api/twilio/sms/inbound — inbound SMS on any of our numbers (customer, demo, notification).
 * STOP/HELP/START, thread lookup, message insert; the AI turn runs in `after()`.
 * Twilio param docs: lib/telephony/inboundSms.ts.
 */
import { after, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/db/client";
import { env } from "@/lib/env";
import { normalizePhone, twiml, validateTwilioRequest } from "@/lib/telephony/client";
import { findDemoNumber } from "@/lib/telephony/demo";
import { handleInboundSms } from "@/lib/telephony/inboundSms";
import { emptyResponse } from "@/lib/telephony/twiml";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const params = await validateTwilioRequest(request);
  if (!params) return new Response("invalid signature", { status: 403 });

  const to = normalizePhone(params.To);
  if (!to) return twiml(emptyResponse());
  const db = createAdminSupabase();
  let number = (await db.from("numbers").select("*").eq("phone_number", to).maybeSingle()).data ?? null;
  if (!number && to === env.get("TWILIO_DEMO_NUMBER")) number = await findDemoNumber(db);
  if (!number) {
    console.warn("[sms/inbound] unknown number", { to });
    return twiml(emptyResponse());
  }
  if (number.purpose === "notification") {
    // Replies to owner alerts (our number → our subscriber). Twilio handles STOP; nothing to route.
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
          console.error("[sms/inbound] ai turn failed", err instanceof Error ? err.message : err);
        }
      });
    }
    return twiml(outcome.twiml);
  } catch (err) {
    console.error("[sms/inbound] failed", err instanceof Error ? err.message : err);
    return twiml(emptyResponse());
  }
}
