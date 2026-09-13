/**
 * Demo line number helpers. Pure functions (no Twilio import) so they are safe
 * in Client Components and the OG image route.
 */

export const DEMO_NUMBER_FALLBACK = "+18885550101";

export type DemoNumber = {
  /** E.164, e.g. +18885550101 */
  e164: string;
  /** "(888) 555-0101" */
  formatted: string;
  /** "tel:+18885550101" */
  tel: string;
  /** false when NEXT_PUBLIC_DEMO_NUMBER is unset and we're showing the placeholder */
  configured: boolean;
};

export function formatUsPhone(e164: string): string {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

function normalize(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** Reads NEXT_PUBLIC_DEMO_NUMBER (inlined at build time on the client). */
export function getDemoNumber(): DemoNumber {
  const configuredE164 = normalize(process.env.NEXT_PUBLIC_DEMO_NUMBER);
  const e164 = configuredE164 ?? DEMO_NUMBER_FALLBACK;
  return {
    e164,
    formatted: formatUsPhone(e164),
    tel: `tel:${e164}`,
    configured: configuredE164 !== null,
  };
}
