/**
 * Lead intake shared by the Resend inbound-email, per-account webhook and Meta leadgen
 * routes (contract: BUILD_CONTRACTS "Lead intake → AI").
 *
 * Pro plan: instant SMS engage from the account's own number (when sms_enabled), else an
 * email reply + owner alert. Starter: owner alert only. Idempotent on (account, external_ref).
 */
import { createAdminSupabase } from "@/lib/db/client";
import type { AccountRow, ConsentSource, Json, LeadRow } from "@/lib/db/types";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import { track } from "@/lib/events";
import { can } from "@/lib/plans";
import { businessNameOf, leadFormFirstMessage, profileFromAccount, TRADES } from "@/lib/ai/prompts";
import { DuplicateLeadError, ensureLead, patchLead } from "@/lib/leads/store";
import { prettyPhone, renderAlertEmail, sendOwnerAlert } from "@/lib/telephony/alerts";
import { normalizePhone } from "@/lib/telephony/client";
import { findOrCreateContact } from "@/lib/telephony/consent";
import { sendCustomerMessage } from "@/lib/telephony/outbound";
import { ZERO_USAGE } from "@/lib/ai/cost";

export type LeadIntakeInput = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  message?: string | null;
  address?: string | null;
  zip?: string | null;
  /** Conversation/lead source (conversations.source CHECK): lead_form = Meta/Zapier/webhook, web_form = website form/email. */
  source: "lead_form" | "web_form";
  /** Where it came from, for the owner and the raw record: "meta", "zapier", "webhook", "email". */
  channel: string;
  externalRef?: string | null;
  raw?: Record<string, Json | undefined>;
  consent: { source: ConsentSource; evidence: Record<string, Json | undefined> };
};

export type LeadIntakeResult =
  | { ok: true; leadId: string | null; conversationId: string | null; engaged: "sms" | "sms_queued" | "email" | "none"; duplicate: boolean }
  | { ok: false; reason: string };

function cleanText(v: string | null | undefined, max: number): string | null {
  if (!v) return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

async function sendLeadEmailReply(account: AccountRow, email: string, lead: { name: string | null; issue: string | null }): Promise<boolean> {
  const name = businessNameOf(account);
  const trade = TRADES[profileFromAccount(account).trade];
  const first = lead.name ? lead.name.split(/\s+/)[0] : null;
  const { html, text } = renderAlertEmail({
    title: `${first ? `Hi ${first}, ` : ""}${name} got your request`,
    intro: `Thanks for reaching out${lead.issue ? ` about "${lead.issue.slice(0, 120)}"` : ""}. The owner will call you shortly to go over the details and get you scheduled.`,
    rows: [
      { label: "Business", value: name },
      { label: "Phone", value: account.business_phone ? prettyPhone(account.business_phone) : "—" },
      { label: "Hours", value: profileFromAccount(account).hours },
    ],
    footnote: `If this is a ${trade.label} emergency (gas smell, sparks, smoke, flooding), call 911 or your utility first.`,
  });
  try {
    await sendEmail({ to: email, subject: `${name}: we got your request`, html, text, replyTo: account.alert_email ?? undefined, tags: [{ name: "kind", value: "lead_reply" }] });
    return true;
  } catch (err) {
    console.error("[intake] lead email reply failed", err instanceof Error ? err.message : err);
    return false;
  }
}

async function alertOwnerNewLead(account: AccountRow, lead: LeadRow | null, input: LeadIntakeInput, engaged: string): Promise<void> {
  const who = lead?.name ?? input.name ?? input.email ?? "New lead";
  const phone = lead?.phone ?? (input.phone ? normalizePhone(input.phone) : null);
  const issue = lead?.issue ?? cleanText(input.message, 160);
  const engagedLine =
    engaged === "sms" ? "We texted them from your number." : engaged === "sms_queued" ? "We'll text them when your texting window opens." : engaged === "email" ? "We emailed them a confirmation." : "Reply from your phone to lock it in.";
  const sms = [`CallCatch: new ${input.channel} lead — ${who}${phone ? ` ${prettyPhone(phone)}` : ""}.`, issue ? issue.slice(0, 120) : null, engagedLine, `${env.appUrl()}/leads`]
    .filter(Boolean)
    .join(" ");
  const email = renderAlertEmail({
    title: `New lead: ${who}`,
    intro: engagedLine,
    rows: [
      { label: "Source", value: input.channel },
      { label: "Phone", value: phone ? prettyPhone(phone) : "—" },
      { label: "Email", value: input.email ?? "—" },
      { label: "Message", value: issue ?? "—" },
      { label: "Address", value: lead?.address ?? input.address ?? lead?.zip ?? input.zip ?? "—" },
    ],
    ctaUrl: `${env.appUrl()}/leads`,
    ctaLabel: "Open leads",
  });
  await sendOwnerAlert({ account, kind: "lead", sms: sms.slice(0, 320), email: { subject: `New lead: ${who}`, ...email }, leadId: lead?.id ?? null });
}

export async function createLeadAndEngage(accountId: string, input: LeadIntakeInput): Promise<LeadIntakeResult> {
  const db = createAdminSupabase();
  const accountRes = await db.from("accounts").select("*").eq("id", accountId).maybeSingle();
  const account = accountRes.data;
  if (!account) return { ok: false, reason: "account_not_found" };
  if (account.status === "cancelled") return { ok: false, reason: "account_cancelled" };

  const phone = normalizePhone(input.phone);
  const email = input.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) ? input.email.trim().toLowerCase() : null;
  const name = cleanText(input.name, 120);
  const message = cleanText(input.message, 600);
  const externalRef = cleanText(input.externalRef, 200);
  if (!phone && !email) return { ok: false, reason: "no_contact_info" };

  if (externalRef) {
    const dup = await db.from("leads").select("id, conversation_id").eq("account_id", accountId).eq("external_ref", externalRef).maybeSingle();
    if (dup.data) return { ok: true, leadId: dup.data.id, conversationId: dup.data.conversation_id, engaged: "none", duplicate: true };
  }

  const raw: Record<string, Json | undefined> = {
    ...(input.raw ?? {}),
    channel: input.channel,
    received_at: new Date().toISOString(),
    email,
    name,
    message,
  };

  // Email-only leads: no contact row is possible (contacts.phone is required) — owner alert only.
  if (!phone) {
    await track("lead_received", { channel: input.channel, has_phone: false }, { accountId });
    let engaged: "email" | "none" = "none";
    if (email && account.status === "live" && can(account, "web_form_leads")) {
      engaged = (await sendLeadEmailReply(account, email, { name, issue: message })) ? "email" : "none";
    }
    await alertOwnerNewLead(account, null, { ...input, email }, engaged);
    return { ok: true, leadId: null, conversationId: null, engaged, duplicate: false };
  }

  const contact = await findOrCreateContact(db, {
    accountId,
    phone,
    consentSource: input.consent.source,
    consentEvidence: input.consent.evidence,
    name,
    email,
    address: cleanText(input.address, 240),
  });

  // external_ref goes in with the INSERT: the (account_id, external_ref) unique index is the
  // idempotency barrier, so two concurrent deliveries of the same lead can only create one row,
  // one conversation and one first text (the pre-check above is just the fast path).
  let lead: LeadRow;
  try {
    lead = await ensureLead(db, {
      accountId,
      conversationId: null,
      contactId: contact.id,
      phone,
      source: input.source,
      name,
      raw,
      externalRef,
    });
  } catch (err) {
    if (err instanceof DuplicateLeadError) {
      return { ok: true, leadId: err.lead.id, conversationId: err.lead.conversation_id, engaged: "none", duplicate: true };
    }
    throw err;
  }
  lead = await patchLead(db, lead, { name, issue: message, address: cleanText(input.address, 240), zip: input.zip ?? input.address ?? null }, { overwrite: true });
  await track("lead_received", { channel: input.channel, lead_id: lead.id, has_phone: true }, { accountId });

  let engaged: "sms" | "sms_queued" | "email" | "none" = "none";
  let conversationId: string | null = null;

  if (account.status === "live" && can(account, "web_form_leads") && !contact.opted_out) {
    const number = await db
      .from("numbers")
      .select("*")
      .eq("account_id", accountId)
      .eq("purpose", "customer")
      .eq("sms_enabled", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (number.data) {
      const conv = await db
        .from("conversations")
        .insert({ account_id: accountId, contact_id: contact.id, number_id: number.data.id, channel: "sms", source: input.source, status: "open" })
        .select("*")
        .single();
      if (conv.data) {
        conversationId = conv.data.id;
        await db.from("leads").update({ conversation_id: conv.data.id }).eq("id", lead.id);
        const profile = profileFromAccount(account);
        const body = leadFormFirstMessage(profile, { name: lead.name, issue: lead.issue, zip: lead.zip, address: lead.address });
        const sent = await sendCustomerMessage({ accountId, conversationId: conv.data.id, body, author: "ai", usage: ZERO_USAGE("template") });
        if (sent.ok) {
          engaged = sent.queued ? "sms_queued" : "sms";
          await db.from("conversations").update({ turn_count: 1 }).eq("id", conv.data.id);
          const prior = await db.from("events").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("name", "first_textback");
          if ((prior.count ?? 0) === 0) await track("first_textback", { conversation_id: conv.data.id, source: input.source }, { accountId });
        } else {
          console.warn("[intake] sms engage failed", { accountId, reason: sent.reason });
        }
      }
    }
    if (engaged === "none" && email) {
      engaged = (await sendLeadEmailReply(account, email, { name: lead.name, issue: lead.issue })) ? "email" : "none";
    }
  }

  await alertOwnerNewLead(account, lead, { ...input, email }, engaged);
  return { ok: true, leadId: lead.id, conversationId, engaged, duplicate: false };
}
