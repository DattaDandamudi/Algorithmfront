/**
 * Toll-Free Verification payload builder. Pure: the wizard's compliance step previews exactly
 * what `/api/onboarding/submit-verification` sends, because both call these functions.
 */
import { helpReply } from "@/lib/telephony/consent";
import type { AccountRow } from "@/lib/db/types";
import { env } from "@/lib/env";
import { asObject, parseOnboardingMeta } from "./state";
import { formatUsPhone, type ComplianceData, type ComplianceInput, type OptInType } from "./schemas";

export type TfvAccount = Pick<
  AccountRow,
  | "id"
  | "legal_name"
  | "dba"
  | "website"
  | "address_line1"
  | "city"
  | "state"
  | "zip"
  | "ein"
  | "is_sole_prop"
  | "trade"
  | "business_phone"
  | "alert_phone"
  | "alert_email"
  | "plan"
  | "emergency_service"
  | "ai_profile"
>;

export type TfvPayload = {
  businessName: string;
  businessWebsite: string;
  notificationEmail: string;
  useCaseCategories: string[];
  useCaseSummary: string;
  productionMessageSample: string;
  optInImageUrls: string[];
  optInType: OptInType;
  optInConfirmationMessage: string;
  helpMessageSample: string;
  messageVolume: string;
  tollfreePhoneNumberSid: string;
  businessStreetAddress: string;
  businessCity: string;
  businessStateProvinceRegion: string;
  businessPostalCode: string;
  businessCountry: "US";
  businessContactFirstName: string;
  businessContactLastName: string;
  businessContactEmail: string;
  businessContactPhone: string;
  businessRegistrationNumber: string;
  businessRegistrationAuthority: "EIN";
  businessRegistrationCountry: "US";
  businessType: "PRIVATE_PROFIT";
  businessRegistrationPhoneNumber: string;
  doingBusinessAs?: string;
  additionalInformation: string;
  externalReferenceId: string;
};

const TRADE_LABEL: Record<string, string> = { hvac: "HVAC", plumbing: "plumbing", electrical: "electrical", other: "home-service" };

export function businessDisplayName(a: Pick<TfvAccount, "dba" | "legal_name">): string {
  return (a.dba || a.legal_name || "").trim();
}

/** Twilio's accepted `messageVolume` buckets. */
export const MESSAGE_VOLUME_BUCKETS = ["10", "100", "1,000", "10,000", "100,000", "250,000", "500,000", "750,000", "1,000,000", "5,000,000", "10,000,000+"] as const;

export function toMessageVolumeBucket(monthly: number): string {
  const thresholds: Array<[number, string]> = [
    [10, "10"],
    [100, "100"],
    [1_000, "1,000"],
    [10_000, "10,000"],
    [100_000, "100,000"],
    [250_000, "250,000"],
    [500_000, "500,000"],
    [750_000, "750,000"],
    [1_000_000, "1,000,000"],
    [5_000_000, "5,000,000"],
  ];
  for (const [limit, label] of thresholds) if (monthly <= limit) return label;
  return "10,000,000+";
}

/** Three realistic messages the account will actually send (first text-back, qualification, confirmation). */
export function generateSampleMessages(a: Pick<TfvAccount, "dba" | "legal_name" | "trade" | "emergency_service">): [string, string, string] {
  const name = businessDisplayName(a) || "our team";
  const trade = TRADE_LABEL[a.trade ?? "other"] ?? "home-service";
  const thing = a.trade === "hvac" ? "heating or cooling" : a.trade === "plumbing" ? "plumbing" : a.trade === "electrical" ? "electrical" : "home";
  return [
    `Hi, this is the automated assistant for ${name}. Sorry we missed your call - what's going on with your ${thing}? Reply STOP to opt out.`,
    `Thanks! To get the right ${trade} tech out, what's the service address or ZIP, and is this an emergency, today, this week, or flexible?`,
    `Thanks - got it. ${name} will call you shortly. Reply STOP to opt out.`,
  ];
}

export function defaultUseCaseSummary(a: Pick<TfvAccount, "dba" | "legal_name" | "trade" | "city" | "state">): string {
  const name = businessDisplayName(a) || "The business";
  const trade = TRADE_LABEL[a.trade ?? "other"] ?? "home-service";
  const article = trade === "HVAC" || trade === "electrical" ? "an" : "a";
  const where = [a.city, a.state].filter(Boolean).join(", ");
  return (
    `${name} is ${article} ${trade} contractor${where ? ` in ${where}` : ""}. When a customer calls the business and the call is not answered, ` +
    `the number sends a customer-care text back to that caller to acknowledge the missed call, ask what service they need, confirm the service ` +
    `address, urgency and a preferred appointment window, and confirm the appointment request. Conversations are one-to-one, customer-initiated, ` +
    `and used only for scheduling and service follow-up. No marketing or promotional content is sent.`
  );
}

export function defaultOptInDescription(optInType: OptInType, a: Pick<TfvAccount, "dba" | "legal_name" | "website">): string {
  const name = businessDisplayName(a) || "the business";
  if (optInType === "WEB_FORM") {
    return (
      `Customers initiate contact by submitting a service-request form on ${a.website || "the business website"} that includes an SMS disclosure ` +
      `("By submitting you agree to receive text messages from ${name} about your request. Msg & data rates may apply. Reply STOP to opt out."). ` +
      `Customers may also opt in verbally by calling the business phone number; missed callers receive a text back regarding their own call. ` +
      `The first text identifies the business, states that it is an automated assistant and includes "Reply STOP to opt out".`
    );
  }
  return (
    `Customers opt in verbally by calling ${name}'s published business phone number. When the call is not answered, the caller receives a single text back ` +
    `about their own call. Every first message identifies the business, states that it is an automated assistant and includes "Reply STOP to opt out"; STOP is honored immediately and HELP returns ` +
    `contact information. Terms and the opt-in flow are published at ${env.appUrl()}/sms-terms.`
  );
}

export function defaultMonthlyVolume(a: Pick<TfvAccount, "plan">): number {
  return a.plan === "pro" ? 1500 : 500;
}

/** Contact name defaults from the signed-in user's full name (Google) or their email. */
export function splitName(fullName: string | null | undefined, email: string): { first: string; last: string } {
  const clean = (fullName ?? "").trim();
  if (clean) {
    const [first, ...rest] = clean.split(/\s+/);
    return { first, last: rest.join(" ") || first };
  }
  const local = email.split("@")[0] ?? "Owner";
  return { first: local, last: "Owner" };
}

/** The compliance form's defaults, merged with anything the owner already edited (from ai_profile.compliance). */
export function defaultCompliance(a: TfvAccount, user: { email: string; fullName: string | null }): ComplianceInput {
  const saved = parseOnboardingMeta(a.ai_profile).compliance;
  const samples = generateSampleMessages(a);
  const optInType: OptInType = saved?.opt_in_type ?? (a.plan === "pro" ? "WEB_FORM" : "VERBAL");
  const { first, last } = splitName(user.fullName, user.email);
  const savedSamples = saved?.sample_messages;
  return {
    contact_first_name: saved?.contact_first_name || first,
    contact_last_name: saved?.contact_last_name || last,
    use_case_summary: saved?.use_case_summary || defaultUseCaseSummary(a),
    sample_messages: [savedSamples?.[0] || samples[0], savedSamples?.[1] || samples[1], savedSamples?.[2] || samples[2]],
    opt_in_type: optInType,
    opt_in_description: saved?.opt_in_description || defaultOptInDescription(optInType, a),
    monthly_volume: saved?.monthly_volume ?? defaultMonthlyVolume(a),
  };
}

export type BuildTfvInput = {
  account: TfvAccount;
  compliance: ComplianceData;
  /** Twilio IncomingPhoneNumber SID (PN…) of the toll-free number. */
  tollfreePhoneNumberSid: string;
  contactEmail: string;
  /** Where Twilio emails the verification outcome (ours, not the customer's). */
  notificationEmail: string;
};

/** Builds the exact `tollfreeVerifications.create` body. Throws when a required field is missing. */
export function buildTollFreeVerificationPayload(input: BuildTfvInput): TfvPayload {
  const { account: a, compliance: c } = input;
  const missing: string[] = [];
  if (!a.legal_name) missing.push("legal name");
  if (!a.website) missing.push("website");
  if (!a.address_line1 || !a.city || !a.state || !a.zip) missing.push("business address");
  if (!a.ein) missing.push("EIN");
  if (!a.business_phone) missing.push("business phone");
  if (missing.length) throw new Error(`Toll-free verification needs: ${missing.join(", ")}`);

  const appUrl = env.appUrl();
  const name = a.legal_name!.trim();
  const dba = (a.dba ?? "").trim();
  const contactPhone = a.alert_phone || a.business_phone!;
  const profile = asObject(a.ai_profile);
  const services = Array.isArray(profile.services) ? profile.services.filter((s): s is string => typeof s === "string").slice(0, 8) : [];

  return {
    businessName: name,
    businessWebsite: a.website!,
    notificationEmail: input.notificationEmail,
    useCaseCategories: ["CUSTOMER_CARE"],
    useCaseSummary: c.use_case_summary,
    productionMessageSample: c.sample_messages.join("\n\n"),
    optInImageUrls: [`${appUrl}/sms-terms`],
    optInType: c.opt_in_type,
    optInConfirmationMessage: c.sample_messages[0],
    helpMessageSample: helpReply(name),
    messageVolume: toMessageVolumeBucket(c.monthly_volume),
    tollfreePhoneNumberSid: input.tollfreePhoneNumberSid,
    businessStreetAddress: a.address_line1!,
    businessCity: a.city!,
    businessStateProvinceRegion: a.state!,
    businessPostalCode: a.zip!,
    businessCountry: "US",
    businessContactFirstName: c.contact_first_name,
    businessContactLastName: c.contact_last_name,
    businessContactEmail: input.contactEmail,
    businessContactPhone: contactPhone,
    businessRegistrationNumber: a.ein!.replace(/\D/g, ""),
    businessRegistrationAuthority: "EIN",
    businessRegistrationCountry: "US",
    businessType: "PRIVATE_PROFIT",
    businessRegistrationPhoneNumber: a.business_phone!,
    ...(dba && dba.toLowerCase() !== name.toLowerCase() ? { doingBusinessAs: dba } : {}),
    additionalInformation:
      `Submitted by CallCatch (ISV) on behalf of ${dba || name}. The number is used exclusively by this one business for missed-call text-back ` +
      `and appointment scheduling with its own customers${services.length ? ` (services: ${services.join(", ")})` : ""}. ` +
      `Business line: ${formatUsPhone(a.business_phone)}. Opt-in flow, privacy policy and SMS terms: ${appUrl}/sms-terms, ${appUrl}/privacy, ${appUrl}/terms.`,
    externalReferenceId: a.id,
  };
}
