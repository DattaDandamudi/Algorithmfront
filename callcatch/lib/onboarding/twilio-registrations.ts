/**
 * 10DLC **sole-proprietor** brand + campaign registration (ISV flow) for accounts without an EIN.
 *
 * The Trust Hub sequence below follows Twilio's "Sole Proprietor onboarding via the API" guide:
 *   1. Sole-proprietor Customer Profile (policy SOLE_PROP_CUSTOMER_PROFILE_POLICY)
 *      └ EndUser `sole_proprietor_information` (brand_name, vertical, mobile_phone_number)
 *      └ Address + SupportingDocument `customer_profile_address`
 *      └ assign our ISV primary profile (TWILIO_ISV_PROFILE_SID) → submit (status pending-review)
 *   2. Sole-proprietor A2P Trust Product (policy SOLE_PROP_TRUST_PRODUCT_POLICY)
 *      └ EndUser `sole_proprietor_trust_bundle_information`? — Twilio's sole-prop trust product
 *        only needs the customer profile assigned; kept as a no-op with the profile assignment.
 *      └ assign the customer profile → submit
 *   3. Brand registration `brandType: SOLE_PROPRIETOR` (Twilio texts an OTP to `mobile_phone_number`;
 *      the owner must reply — brand status stays PENDING until then)
 *   4. Messaging Service + `usAppToPerson` campaign (`usAppToPersonUsecase: SOLE_PROPRIETOR`), number attached.
 *
 * Policy SIDs are Twilio-global constants; they are overridable via env in case Twilio rotates them.
 * Every uncertain call shape is isolated here and guarded: nothing runs unless
 * `TWILIO_ISV_PROFILE_SID` is set, and failures surface as a thrown Error with the step name.
 */
import { twilioClient } from "@/lib/telephony/client";
import { env } from "@/lib/env";
import type { AccountRow, NumberRow } from "@/lib/db/types";
import type { ComplianceData } from "./schemas";

/** Twilio Trust Hub policy SIDs (documented in the ISV sole-prop guide). Override via env if Twilio changes them. */
const POLICY = {
  soleProprietorCustomerProfile: () => env.get("TWILIO_POLICY_SOLE_PROP_CUSTOMER_PROFILE", "RN670d5d2e282a6130ae063b234b6d8e58")!,
  soleProprietorTrustProduct: () => env.get("TWILIO_POLICY_SOLE_PROP_TRUST_PRODUCT", "RN806dd6cd175f314e1f96a9727ee271f4")!,
};

const TRADE_VERTICAL: Record<string, string> = { hvac: "CONSTRUCTION", plumbing: "CONSTRUCTION", electrical: "CONSTRUCTION", other: "PROFESSIONAL" };

export type SoleProprietorRegistration = {
  customerProfileSid: string;
  trustProductSid: string;
  brandRegistrationSid: string;
  messagingServiceSid: string;
  campaignSid: string;
  brandStatus: string;
  campaignStatus: string;
};

export type SoleProprietorInput = {
  account: AccountRow;
  number: NumberRow;
  compliance: ComplianceData;
  /** The owner's verified mobile — Twilio sends the brand OTP here. */
  mobilePhone: string;
  contactEmail: string;
};

export function soleProprietorRegistrationAvailable(): { ok: true } | { ok: false; reason: string } {
  if (!env.get("TWILIO_ISV_PROFILE_SID")) return { ok: false, reason: "TWILIO_ISV_PROFILE_SID is not configured (ISV primary business profile)" };
  if (!env.get("TWILIO_ACCOUNT_SID") || !env.get("TWILIO_AUTH_TOKEN")) return { ok: false, reason: "Twilio credentials missing" };
  return { ok: true };
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`sole-prop registration failed at ${name}: ${message}`);
  }
}

/**
 * Runs the whole sequence. Pass `existing` (brand/campaign sids already stored on the numbers row) to
 * resume idempotently: steps whose SID is known are skipped.
 */
export async function registerSoleProprietor(
  input: SoleProprietorInput,
  existing: { brandSid?: string | null; campaignSid?: string | null } = {}
): Promise<SoleProprietorRegistration> {
  const avail = soleProprietorRegistrationAvailable();
  if (!avail.ok) throw new Error(avail.reason);

  const client = twilioClient();
  const { account, number, compliance } = input;
  const brandName = (account.dba || account.legal_name || "").trim();
  if (!brandName) throw new Error("business name is required");
  if (!account.address_line1 || !account.city || !account.state || !account.zip) throw new Error("business address is required");
  const isvProfileSid = env.required("TWILIO_ISV_PROFILE_SID");
  const statusCallback = `${env.appUrl()}/api/twilio/verification/status`;
  const notifyEmail = env.get("TWILIO_TFV_NOTIFICATION_EMAIL") ?? env.adminEmails()[0] ?? input.contactEmail;

  // ---- 3+4 resume path -------------------------------------------------------------------
  if (existing.brandSid && existing.campaignSid) {
    const brand = await step("brand fetch", () => client.messaging.v1.brandRegistrations(existing.brandSid!).fetch());
    return {
      customerProfileSid: brand.customerProfileBundleSid,
      trustProductSid: brand.a2pProfileBundleSid,
      brandRegistrationSid: brand.sid,
      messagingServiceSid: "",
      campaignSid: existing.campaignSid,
      brandStatus: brand.status,
      campaignStatus: "unknown",
    };
  }

  let brandSid = existing.brandSid ?? null;
  let customerProfileSid = "";
  let trustProductSid = "";

  if (!brandSid) {
    // ---- 1. Customer profile ---------------------------------------------------------------
    const profile = await step("customer profile create", () =>
      client.trusthub.v1.customerProfiles.create({
        friendlyName: `${brandName} (sole proprietor)`,
        email: notifyEmail,
        policySid: POLICY.soleProprietorCustomerProfile(),
        statusCallback,
      })
    );
    customerProfileSid = profile.sid;

    const endUser = await step("sole_proprietor_information end user", () =>
      client.trusthub.v1.endUsers.create({
        friendlyName: `${brandName} owner`,
        type: "sole_proprietor_information",
        attributes: {
          brand_name: brandName.slice(0, 100),
          vertical: TRADE_VERTICAL[account.trade ?? "other"] ?? "PROFESSIONAL",
          mobile_phone_number: input.mobilePhone,
        },
      })
    );

    const address = await step("address create", () =>
      client.addresses.create({
        customerName: brandName.slice(0, 64),
        street: account.address_line1!,
        city: account.city!,
        region: account.state!,
        postalCode: account.zip!,
        isoCountry: "US",
        friendlyName: `${brandName} business address`.slice(0, 64),
        autoCorrectAddress: true,
      })
    );
    const addressDoc = await step("customer_profile_address document", () =>
      client.trusthub.v1.supportingDocuments.create({
        friendlyName: `${brandName} address`,
        type: "customer_profile_address",
        attributes: { address_sids: address.sid },
      })
    );

    await step("customer profile entity assignments", async () => {
      const assignments = client.trusthub.v1.customerProfiles(customerProfileSid).customerProfilesEntityAssignments;
      await assignments.create({ objectSid: endUser.sid });
      await assignments.create({ objectSid: addressDoc.sid });
      await assignments.create({ objectSid: isvProfileSid });
    });

    await step("customer profile submit", () => client.trusthub.v1.customerProfiles(customerProfileSid).update({ status: "pending-review" }));

    // ---- 2. A2P trust product --------------------------------------------------------------
    const trust = await step("trust product create", () =>
      client.trusthub.v1.trustProducts.create({
        friendlyName: `${brandName} A2P sole proprietor`,
        email: notifyEmail,
        policySid: POLICY.soleProprietorTrustProduct(),
        statusCallback,
      })
    );
    trustProductSid = trust.sid;
    await step("trust product entity assignments", async () => {
      await client.trusthub.v1.trustProducts(trustProductSid).trustProductsEntityAssignments.create({ objectSid: customerProfileSid });
    });
    await step("trust product submit", () => client.trusthub.v1.trustProducts(trustProductSid).update({ status: "pending-review" }));

    // ---- 3. Brand ------------------------------------------------------------------------
    const brand = await step("brand registration create", () =>
      client.messaging.v1.brandRegistrations.create({
        customerProfileBundleSid: customerProfileSid,
        a2PProfileBundleSid: trustProductSid,
        brandType: "SOLE_PROPRIETOR",
      })
    );
    brandSid = brand.sid;
  } else {
    const brand = await step("brand fetch", () => client.messaging.v1.brandRegistrations(brandSid!).fetch());
    customerProfileSid = brand.customerProfileBundleSid;
    trustProductSid = brand.a2pProfileBundleSid;
  }

  // ---- 4. Messaging service + campaign -----------------------------------------------------
  const service = await step("messaging service create", () =>
    client.messaging.v1.services.create({
      friendlyName: `CallCatch – ${brandName}`.slice(0, 64),
      inboundRequestUrl: `${env.appUrl()}/api/twilio/sms/inbound`,
      inboundMethod: "POST",
      statusCallback: `${env.appUrl()}/api/twilio/sms/status`,
      useInboundWebhookOnNumber: true,
    })
  );
  await step("attach number to messaging service", async () => {
    if (!number.twilio_sid) throw new Error("number has no Twilio SID");
    await client.messaging.v1.services(service.sid).phoneNumbers.create({ phoneNumberSid: number.twilio_sid });
  });

  const campaign = await step("usAppToPerson campaign create", () =>
    client.messaging.v1.services(service.sid).usAppToPerson.create({
      brandRegistrationSid: brandSid!,
      description: compliance.use_case_summary.slice(0, 4096),
      messageFlow: compliance.opt_in_description.slice(0, 2048),
      messageSamples: compliance.sample_messages.map((s) => s.slice(0, 1024)),
      usAppToPersonUsecase: "SOLE_PROPRIETOR",
      hasEmbeddedLinks: true,
      hasEmbeddedPhone: true,
      optInKeywords: ["START"],
      optInMessage: `${brandName}: You're opted in to appointment and service texts. Msg&data rates may apply. Reply HELP for help, STOP to opt out.`,
      optOutKeywords: ["STOP"],
      optOutMessage: `${brandName}: You've been unsubscribed. No more messages will be sent. Reply START to opt back in.`,
      helpKeywords: ["HELP"],
      helpMessage: `${brandName}: For help call the business directly. Reply STOP to opt out.`,
      subscriberOptIn: true,
      ageGated: false,
      directLending: false,
      privacyPolicyUrl: `${env.appUrl()}/privacy`,
      termsAndConditionsUrl: `${env.appUrl()}/sms-terms`,
    })
  );

  const brand = await step("brand status fetch", () => client.messaging.v1.brandRegistrations(brandSid!).fetch());

  return {
    customerProfileSid,
    trustProductSid,
    brandRegistrationSid: brandSid!,
    messagingServiceSid: service.sid,
    campaignSid: campaign.sid,
    brandStatus: brand.status,
    campaignStatus: campaign.campaignStatus,
  };
}
