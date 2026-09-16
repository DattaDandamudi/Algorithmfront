/**
 * Line-type intelligence (Twilio Lookup v2) — mandatory before any call: mobiles get DNC-scrubbed,
 * manual-dial-only treatment; landline/fixed VoIP are plain B2B calls. $0.008/lookup.
 */
import { twilioClient } from "@/lib/telephony/client";
import { env } from "@/lib/env";

export type PhoneType = "landline" | "mobile" | "voip" | "unknown";

export function mapLineType(raw: string | null | undefined): PhoneType {
  const t = (raw ?? "").toLowerCase();
  if (t === "landline") return "landline";
  if (t === "mobile") return "mobile";
  if (t.includes("voip")) return "voip";
  return "unknown";
}

export async function lookupPhoneType(e164: string): Promise<{ type: PhoneType; carrier: string | null; raw: string | null }> {
  if (!env.bool("TWILIO_LOOKUP_ENABLED", false)) return { type: "unknown", carrier: null, raw: null };
  const res = await twilioClient().lookups.v2.phoneNumbers(e164).fetch({ fields: "line_type_intelligence" });
  const lti = (res.lineTypeIntelligence ?? null) as { type?: string; carrier_name?: string } | null;
  return { type: mapLineType(lti?.type), carrier: lti?.carrier_name ?? null, raw: lti?.type ?? null };
}
