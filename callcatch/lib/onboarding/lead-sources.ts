/**
 * Per-account lead intake sources (module c consumes them):
 *  - `resend_inbox`: `acct-<random>@LEADS_INBOUND_DOMAIN`. The local part is a random token — it must
 *    never be derived from `accounts.referral_code`, which is public (referral links, weekly emails);
 *    the inbound-email route routes solely on this address, so it is the credential.
 *  - `webhook` / `zapier`: a random `webhook_secret` checked via `X-CallCatch-Secret`.
 * Server-only.
 */
import { randomBytes } from "node:crypto";
import type { Db } from "@/lib/db/client";
import type { TablesInsert } from "@/lib/db/types";
import { env } from "@/lib/env";
import { shortCode } from "@/lib/utils";

export function leadsInboundDomain(): string {
  return env.get("LEADS_INBOUND_DOMAIN", "leads.callcatch.co")!;
}

/** Fresh random inbound address, e.g. `acct-k7mq2xr9vt@leads.callcatch.co`. */
export function newInboundAddress(): string {
  return `acct-${shortCode(10)}@${leadsInboundDomain()}`;
}

export function newWebhookSecret(): string {
  return `ccs_${randomBytes(24).toString("hex")}`;
}

/** Creates the default inbox + webhook sources for an account if missing (idempotent). */
export async function ensureLeadSources(db: Db, accountId: string): Promise<void> {
  const { data: existing } = await db.from("lead_sources").select("type").eq("account_id", accountId);
  const have = new Set((existing ?? []).map((r) => r.type));
  const rows: TablesInsert<"lead_sources">[] = [];
  if (!have.has("resend_inbox")) rows.push({ account_id: accountId, type: "resend_inbox", inbound_email: newInboundAddress(), enabled: true });
  if (!have.has("webhook")) rows.push({ account_id: accountId, type: "webhook", webhook_secret: newWebhookSecret(), enabled: true });
  if (rows.length === 0) return;
  const { error } = await db.from("lead_sources").insert(rows);
  if (error) console.error("[lead-sources] insert failed", { accountId, message: error.message });
}
