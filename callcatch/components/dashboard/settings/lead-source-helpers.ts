import { env } from "@/lib/env";

/** Per-account inbound lead address parsed by /api/leads/inbound-email (module c). */

/** Per-account webhook URL for Zapier / Make / website forms (module c's route). */
export function webhookUrlFor(code: string): string {
  return `${env.appUrl()}/api/leads/webhook/${code}`;
}

export const US_TIMEZONES: { id: string; label: string }[] = [
  { id: "America/New_York", label: "Eastern (New York)" },
  { id: "America/Chicago", label: "Central (Chicago)" },
  { id: "America/Denver", label: "Mountain (Denver)" },
  { id: "America/Phoenix", label: "Arizona (no DST)" },
  { id: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { id: "America/Anchorage", label: "Alaska" },
  { id: "Pacific/Honolulu", label: "Hawaii" },
  { id: "America/Detroit", label: "Eastern (Detroit)" },
  { id: "America/Indiana/Indianapolis", label: "Eastern (Indianapolis)" },
  { id: "America/Boise", label: "Mountain (Boise)" },
];
