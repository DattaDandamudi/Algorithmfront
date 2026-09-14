/**
 * Lead row helpers shared by the AI engine (tool calls), the extraction pass and intake.
 * A conversation has at most one lead; a contact may have several over time.
 */
import type { Db } from "@/lib/db/client";
import type { Json, LeadRow, LeadStatus, LeadUrgency } from "@/lib/db/types";
import { track } from "@/lib/events";

export type LeadPatch = {
  name?: string | null;
  address?: string | null;
  zip?: string | null;
  issue?: string | null;
  urgency?: LeadUrgency | null;
  preferred_window?: string | null;
};

const URGENCIES: LeadUrgency[] = ["emergency", "today", "this_week", "flexible"];

export function asUrgency(value: unknown): LeadUrgency | null {
  return typeof value === "string" && (URGENCIES as string[]).includes(value) ? (value as LeadUrgency) : null;
}

function clean(v: string | null | undefined, max = 240): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

export function cleanZip(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /\b(\d{5})(?:-\d{4})?\b/.exec(v);
  return m ? m[1] : null;
}

export async function findLeadForConversation(db: Db, conversationId: string): Promise<LeadRow | null> {
  const r = await db
    .from("leads")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return r.data ?? null;
}

export type EnsureLeadInput = {
  accountId: string;
  conversationId: string | null;
  contactId: string;
  phone: string;
  source: string;
  name?: string | null;
  raw?: Record<string, Json | undefined>;
  /**
   * Upstream id (Meta leadgen_id, Zapier id, webhook id). Written on the INSERT so the
   * `(account_id, external_ref)` unique index is the idempotency barrier for redeliveries.
   */
  externalRef?: string | null;
};

/** Postgres SQLSTATE for unique_violation. */
const UNIQUE_VIOLATION = "23505";

/** Thrown by `ensureLead` when a lead with the same `(account_id, external_ref)` already exists. */
export class DuplicateLeadError extends Error {
  constructor(public readonly lead: LeadRow) {
    super(`duplicate lead for external_ref ${lead.external_ref ?? ""}`);
    this.name = "DuplicateLeadError";
  }
}

/**
 * Returns the lead attached to the conversation, or attaches the contact's latest open
 * lead (created without a conversation, e.g. a web form) or inserts a new one.
 * Tracks `first_lead` for the account on the very first lead. With `externalRef`, a concurrent
 * redelivery loses the unique-index race and gets `DuplicateLeadError` carrying the winner.
 */
export async function ensureLead(db: Db, input: EnsureLeadInput): Promise<LeadRow> {
  if (input.conversationId) {
    const existing = await findLeadForConversation(db, input.conversationId);
    if (existing) return existing;
    const orphan = await db
      .from("leads")
      .select("*")
      .eq("account_id", input.accountId)
      .eq("contact_id", input.contactId)
      .is("conversation_id", null)
      .in("status", ["new", "qualified"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (orphan.data) {
      const attached = await db
        .from("leads")
        .update({ conversation_id: input.conversationId })
        .eq("id", orphan.data.id)
        .select("*")
        .single();
      if (attached.data) return attached.data;
    }
  }
  const inserted = await db
    .from("leads")
    .insert({
      account_id: input.accountId,
      conversation_id: input.conversationId,
      contact_id: input.contactId,
      phone: input.phone,
      source: input.source,
      name: clean(input.name, 120),
      status: "new",
      raw: input.raw ?? {},
      external_ref: input.externalRef ?? null,
    })
    .select("*")
    .single();
  if (inserted.error?.code === UNIQUE_VIOLATION && input.externalRef) {
    const existing = await db
      .from("leads")
      .select("*")
      .eq("account_id", input.accountId)
      .eq("external_ref", input.externalRef)
      .maybeSingle();
    if (existing.data) throw new DuplicateLeadError(existing.data);
  }
  if (inserted.error || !inserted.data) throw new Error(`leads insert failed: ${inserted.error?.message ?? "unknown"}`);

  const prior = await db.from("leads").select("id", { count: "exact", head: true }).eq("account_id", input.accountId);
  if ((prior.count ?? 0) <= 1) await track("first_lead", { lead_id: inserted.data.id, source: input.source }, { accountId: input.accountId });
  return inserted.data;
}

/**
 * Fills lead fields. By default only empty fields are written (extraction must not clobber
 * what the owner typed); pass `overwrite: true` for explicit tool calls from the model.
 */
export async function patchLead(db: Db, lead: LeadRow, patch: LeadPatch, opts: { overwrite?: boolean } = {}): Promise<LeadRow> {
  const update: LeadPatch = {};
  const consider = (key: keyof LeadPatch, value: string | null) => {
    if (value === null || value === undefined) return;
    const current = lead[key];
    if (opts.overwrite || !current) {
      if (current !== value) (update as Record<string, string | null>)[key] = value;
    }
  };
  consider("name", clean(patch.name, 120));
  consider("address", clean(patch.address, 240));
  consider("zip", cleanZip(patch.zip) ?? (patch.address ? cleanZip(patch.address) : null));
  consider("issue", clean(patch.issue, 400));
  consider("urgency", asUrgency(patch.urgency));
  consider("preferred_window", clean(patch.preferred_window, 120));
  if (Object.keys(update).length === 0) return lead;
  const r = await db.from("leads").update(update).eq("id", lead.id).select("*").single();
  if (r.error || !r.data) {
    console.error("[leads] patch failed", r.error?.message);
    return lead;
  }
  return r.data;
}

export async function setLeadStatus(
  db: Db,
  lead: LeadRow,
  status: LeadStatus,
  extra: { est_value_usd?: number | null; lost_reason?: string | null } = {}
): Promise<LeadRow> {
  const update: { status: LeadStatus; booked_at?: string | null; est_value_usd?: number | null; lost_reason?: string | null } = { status };
  if (status === "booked") {
    update.booked_at = new Date().toISOString();
    if (extra.est_value_usd !== undefined) update.est_value_usd = extra.est_value_usd;
  }
  if (status === "lost" && extra.lost_reason !== undefined) update.lost_reason = extra.lost_reason;
  const r = await db.from("leads").update(update).eq("id", lead.id).select("*").single();
  if (r.error || !r.data) return lead;
  if (status === "booked") {
    const prior = await db.from("leads").select("id", { count: "exact", head: true }).eq("account_id", lead.account_id).eq("status", "booked");
    if ((prior.count ?? 0) <= 1) await track("first_booked", { lead_id: lead.id }, { accountId: lead.account_id });
  }
  return r.data;
}
