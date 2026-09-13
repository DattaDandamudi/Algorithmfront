/** Marketing-site constants shared by pages, legal text and the footer. */

export const SITE_NAME = "CallCatch";
export const COMPANY_LEGAL_NAME = "CallCatch LLC";
export const LEGAL_LAST_UPDATED = "September 14, 2026";
export const LEGAL_LAST_UPDATED_ISO = "2026-09-14";

export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@callcatch.co";
export const PRIVACY_EMAIL = process.env.NEXT_PUBLIC_PRIVACY_EMAIL ?? "privacy@callcatch.co";
export const LEGAL_ADDRESS = process.env.NEXT_PUBLIC_LEGAL_ADDRESS ?? "Mailing address provided on request via support@callcatch.co";

export const TRIAL_HREF = "/signup?plan=starter&interval=month&path=trial";
export const PRO_TRIAL_HREF = "/signup?plan=pro&interval=month&path=trial";
export const LOGIN_HREF = "/login";

export const QUIET_HOURS_LABEL = "8:00 AM – 9:00 PM local time";

export const NAV_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/demo", label: "Demo" },
];

export const LEGAL_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/sms-terms", label: "SMS Terms" },
  { href: "/refund", label: "Refund Policy" },
  { href: "/data-deletion", label: "Data Deletion" },
];

export const TRADE_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/for/hvac", label: "CallCatch for HVAC" },
  { href: "/for/plumbing", label: "CallCatch for Plumbing" },
  { href: "/for/electrical", label: "CallCatch for Electrical" },
];

export const SUBPROCESSORS: ReadonlyArray<{ name: string; purpose: string; location: string }> = [
  { name: "Supabase", purpose: "Database, authentication and file storage", location: "United States" },
  { name: "Stripe", purpose: "Payments, subscriptions and invoices", location: "United States" },
  { name: "Twilio", purpose: "Phone numbers, voice calls, call recording and SMS delivery", location: "United States" },
  { name: "Anthropic", purpose: "AI language model that drafts text replies and summarizes voicemails", location: "United States" },
  { name: "Deepgram", purpose: "Voicemail speech-to-text transcription", location: "United States" },
  { name: "Resend", purpose: "Transactional email (alerts, weekly reports, receipts)", location: "United States" },
  { name: "Vercel", purpose: "Web hosting, serverless functions and edge network", location: "United States" },
  { name: "Meta Platforms", purpose: "Advertising measurement (Pixel and Conversions API) for our own marketing site only", location: "United States" },
];
