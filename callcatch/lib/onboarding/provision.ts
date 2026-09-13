/**
 * Buys the account's customer-facing number and wires the module-c webhooks (contract URLs).
 * Idempotent: returns the existing `numbers` row when one exists. Sole-prop accounts get a local
 * number (10DLC path); everyone else gets toll-free (TFV path).
 */
import { createAdminSupabase } from "@/lib/db/client";
import type { AccountRow, NumberRow } from "@/lib/db/types";
import { env } from "@/lib/env";
import { track } from "@/lib/events";
import { twilioClient } from "@/lib/telephony/client";
import { loadCustomerNumber } from "./account";
import { areaCodeOf } from "./state";

export type ProvisionResult = { number: NumberRow; created: boolean };

export function numberWebhookUrls(): { voiceUrl: string; statusCallback: string; smsUrl: string } {
  const base = env.appUrl();
  return {
    voiceUrl: `${base}/api/twilio/voice/inbound`,
    statusCallback: `${base}/api/twilio/voice/status`,
    smsUrl: `${base}/api/twilio/sms/inbound`,
  };
}

async function findAvailable(kind: "tollfree" | "local", areaCode: number | null): Promise<string | null> {
  const client = twilioClient();
  const country = client.availablePhoneNumbers("US");
  if (kind === "tollfree") {
    const list = await country.tollFree.list({ limit: 1, smsEnabled: true, voiceEnabled: true });
    return list[0]?.phoneNumber ?? null;
  }
  const withArea = areaCode ? await country.local.list({ limit: 1, areaCode, smsEnabled: true, voiceEnabled: true }) : [];
  if (withArea[0]?.phoneNumber) return withArea[0].phoneNumber;
  const any = await country.local.list({ limit: 1, smsEnabled: true, voiceEnabled: true });
  return any[0]?.phoneNumber ?? null;
}

export async function provisionNumber(account: AccountRow): Promise<ProvisionResult> {
  const db = createAdminSupabase();
  const existing = await loadCustomerNumber(db, account.id);
  if (existing) return { number: existing, created: false };

  const kind: "tollfree" | "local" = account.is_sole_prop ? "local" : "tollfree";
  const phoneNumber = await findAvailable(kind, areaCodeOf(account.business_phone));
  if (!phoneNumber) throw new Error(`No ${kind} numbers available right now — try again in a minute`);

  const client = twilioClient();
  const urls = numberWebhookUrls();
  const businessName = (account.dba || account.legal_name || account.id).slice(0, 48);
  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber,
    friendlyName: `CallCatch – ${businessName}`,
    voiceUrl: urls.voiceUrl,
    voiceMethod: "POST",
    statusCallback: urls.statusCallback,
    statusCallbackMethod: "POST",
    smsUrl: urls.smsUrl,
    smsMethod: "POST",
  });

  // Two concurrent clicks could both reach here; the second purchase is released.
  const raced = await loadCustomerNumber(db, account.id);
  if (raced) {
    await client.incomingPhoneNumbers(purchased.sid).remove().catch((err: unknown) => console.error("[provision] release raced number failed", err));
    return { number: raced, created: false };
  }

  const { data, error } = await db
    .from("numbers")
    .insert({
      account_id: account.id,
      phone_number: purchased.phoneNumber,
      twilio_sid: purchased.sid,
      type: kind,
      purpose: "customer",
      voice_enabled: true,
      sms_enabled: false,
      verification_status: "not_submitted",
    })
    .select("*")
    .single();
  if (error || !data) {
    await client.incomingPhoneNumbers(purchased.sid).remove().catch((err: unknown) => console.error("[provision] release failed", err));
    throw new Error(`Could not save number: ${error?.message ?? "unknown"}`);
  }

  await track("number_provisioned", { number_id: data.id, phone_number: data.phone_number, type: kind }, { accountId: account.id });
  return { number: data, created: true };
}
