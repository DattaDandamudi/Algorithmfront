import { redirect } from "next/navigation";

/**
 * Onboarding gate. Every page owned by the dashboard module calls this first: accounts that
 * have not finished the wizard are sent back to /onboarding (the wizard and /billing/** are
 * other modules' pages and are not gated).
 */
export function ensureOnboarded(account: { status: string }): void {
  if (account.status === "onboarding") redirect("/onboarding");
}
