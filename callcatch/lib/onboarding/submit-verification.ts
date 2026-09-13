/**
 * Submits carrier registration for the account's number:
 *  - toll-free (has EIN): Twilio Toll-Free Verification via messaging.v1.tollfreeVerifications
 *  - sole proprietor (no EIN, local number): 10DLC sole-prop brand + campaign (twilio-registrations.ts)
 * Writes numbers.verification_* / tendlc_* and a verification_events row. Idempotent: a number
 * already pending/in_review/verified is returned as-is. Called by the Finish action and by the
 * explicit /api/onboarding/submit-verification route (re-submit after a rejection).
 */
import type { User } from "@supabase/supabase-js";
import { createAdminSupabase, type Db } from "@/lib/db/client";
import type { AccountRow, Json, NumberRow } from "@/lib/db/types";
import { env } from "@/lib/env";
import { track } from "@/lib/events";
import { twilioClient } from "@/lib/telephony/client";
import { loadCustomerNumber, userFullName } from "./account";
import { complianceSchema } from "./schemas";
import { parseOnboardingMeta } from "./state";
import { buildTollFreeVerificationPayload, defaultCompliance } from "./tfv";
import { registerSoleProprietor } from "./twilio-registrations";

export type SubmitOutcome =
  | { ok: true; already: boolean; path: "tollfree" | "sole_prop"; number: NumberRow; verificationSid: string | null }
  | { ok: false; error: string; code: "no_number" | "missing_fields" | "twilio_error" };

const ACTIVE = new Set(["pending", "in_review", "verified"]);

function resolveCompliance(account: AccountRow, user: User) {
  const merged = defaultCompliance(account, { email: user.email ?? "", fullName: userFullName(user) });
  const parsed = complianceSchema.safeParse(merged);
  return parsed.success ? parsed.data : null;
}

async function recordEvent(db: Db, number: NumberRow, status: string, payload: Record<string, Json | undefined>): Promise<void> {
  const { error } = await db.from("verification_events").insert({
    account_id: number.account_id,
    number_id: number.id,
    status,
    payload: payload as Json,
    received_at: new Date().toISOString(),
  });
  if (error) console.error("[submit-verification] verification_events insert failed", error.message);
}

export async function submitVerification(account: AccountRow, user: User): Promise<SubmitOutcome> {
  const db = createAdminSupabase();
  const number = await loadCustomerNumber(db, account.id);
  if (!number) return { ok: false, code: "no_number", error: "Provision a number first" };

  const path: "tollfree" | "sole_prop" = account.is_sole_prop || number.type === "local" ? "sole_prop" : "tollfree";
  const alreadyActive = ACTIVE.has(number.verification_status) && (path === "tollfree" ? Boolean(number.verification_sid) : Boolean(number.tendlc_campaign_sid));
  if (alreadyActive) return { ok: true, already: true, path, number, verificationSid: number.verification_sid };

  const compliance = resolveCompliance(account, user);
  if (!compliance) return { ok: false, code: "missing_fields", error: "Complete the compliance step before submitting" };
  const contactEmail = user.email ?? account.alert_email ?? "";
  const notificationEmail = env.get("TWILIO_TFV_NOTIFICATION_EMAIL") ?? env.adminEmails()[0] ?? contactEmail;
  const now = new Date().toISOString();

  if (path === "sole_prop") {
    const mobile = account.alert_phone_verified && account.alert_phone ? account.alert_phone : account.business_phone;
    if (!mobile) return { ok: false, code: "missing_fields", error: "A verified mobile number is required for the sole-proprietor path" };
    try {
      const reg = await registerSoleProprietor(
        { account, number, compliance, mobilePhone: mobile, contactEmail },
        { brandSid: number.tendlc_brand_sid, campaignSid: number.tendlc_campaign_sid }
      );
      const { data: updated } = await db
        .from("numbers")
        .update({
          tendlc_brand_sid: reg.brandRegistrationSid,
          tendlc_campaign_sid: reg.campaignSid,
          verification_status: "pending",
          verification_submitted_at: now,
          rejection_reason: null,
        })
        .eq("id", number.id)
        .select("*")
        .single();
      const fresh = updated ?? number;
      await recordEvent(db, fresh, "pending", {
        kind: "sole_prop_10dlc",
        brand_sid: reg.brandRegistrationSid,
        brand_status: reg.brandStatus,
        campaign_sid: reg.campaignSid,
        campaign_status: reg.campaignStatus,
        messaging_service_sid: reg.messagingServiceSid,
        customer_profile_sid: reg.customerProfileSid,
        trust_product_sid: reg.trustProductSid,
      });
      await track("verification_submitted", { path, number_id: number.id, brand_sid: reg.brandRegistrationSid, campaign_sid: reg.campaignSid }, { accountId: account.id, userId: user.id });
      return { ok: true, already: false, path, number: fresh, verificationSid: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[submit-verification] sole-prop failed", { accountId: account.id, message });
      await recordEvent(db, number, "submit_failed", { kind: "sole_prop_10dlc", error: message });
      return { ok: false, code: "twilio_error", error: message };
    }
  }

  if (!number.twilio_sid) return { ok: false, code: "missing_fields", error: "Number is missing its Twilio SID" };
  let payload;
  try {
    payload = buildTollFreeVerificationPayload({ account, compliance, tollfreePhoneNumberSid: number.twilio_sid, contactEmail, notificationEmail });
  } catch (err) {
    return { ok: false, code: "missing_fields", error: err instanceof Error ? err.message : "Missing business details" };
  }

  try {
    const isvProfile = env.get("TWILIO_ISV_PROFILE_SID");
    const created = await twilioClient().messaging.v1.tollfreeVerifications.create({
      ...payload,
      ...(isvProfile ? { customerProfileSid: isvProfile } : {}),
    });
    const { data: updated } = await db
      .from("numbers")
      .update({
        verification_sid: created.sid,
        verification_status: "pending",
        verification_submitted_at: now,
        rejection_reason: null,
      })
      .eq("id", number.id)
      .select("*")
      .single();
    const fresh = updated ?? number;
    await recordEvent(db, fresh, "pending", {
      kind: "tollfree_verification",
      verification_sid: created.sid,
      twilio_status: created.status,
      submitted: { ...payload, businessRegistrationNumber: "***" + payload.businessRegistrationNumber.slice(-4) },
    });
    await track("verification_submitted", { path, number_id: number.id, verification_sid: created.sid }, { accountId: account.id, userId: user.id });
    return { ok: true, already: false, path, number: fresh, verificationSid: created.sid };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[submit-verification] TFV failed", { accountId: account.id, message });
    await recordEvent(db, number, "submit_failed", { kind: "tollfree_verification", error: message });
    return { ok: false, code: "twilio_error", error: message };
  }
}

/** Whether the compliance step has enough to submit (used by the wizard's Finish gate). */
export function hasComplianceData(account: AccountRow): boolean {
  return parseOnboardingMeta(account.ai_profile).compliance !== null;
}
