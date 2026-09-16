/** CAN-SPAM compliant outreach email assembly + suppression rules. */
import { env } from "@/lib/env";

export type OutreachEmailInput = {
  prospectId: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
};

export function unsubscribeUrl(prospectId: string): string {
  return `${env.appUrl()}/u/${prospectId}`;
}

export function canSpamFooterText(prospectId: string): string {
  const addr = env.get("OUTREACH_POSTAL_ADDRESS", "") ?? "";
  const lines = [
    "",
    "--",
    "You're receiving this one-to-one note because your business is publicly listed as a licensed contractor. This is a commercial message from CallCatch.",
    addr ? `CallCatch · ${addr}` : "CallCatch",
    `Don't want to hear from us? Unsubscribe instantly: ${unsubscribeUrl(prospectId)}`,
  ];
  return lines.join("\n");
}

export function canSpamFooterHtml(prospectId: string): string {
  const addr = env.get("OUTREACH_POSTAL_ADDRESS", "") ?? "";
  return `<hr style="border:none;border-top:1px solid #ddd;margin:24px 0 12px"/><p style="font:12px/1.5 -apple-system,Segoe UI,sans-serif;color:#666">You're receiving this one-to-one note because your business is publicly listed as a licensed contractor. This is a commercial message from CallCatch.${addr ? ` CallCatch · ${addr}.` : ""} <a href="${unsubscribeUrl(prospectId)}">Unsubscribe instantly</a>.</p>`;
}

export function textToHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font:15px/1.55 -apple-system,Segoe UI,sans-serif;color:#111">${esc
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("")}</div>`;
}

export function assembleOutreachEmail(input: OutreachEmailInput): { subject: string; text: string; html: string; headers: Record<string, string> } {
  const text = `${input.bodyText.trim()}\n${canSpamFooterText(input.prospectId)}`;
  const html = `${input.bodyHtml ?? textToHtml(input.bodyText.trim())}${canSpamFooterHtml(input.prospectId)}`;
  return {
    subject: input.subject.slice(0, 150),
    text,
    html,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl(input.prospectId)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

/** Statuses that must never receive outbound email. */
export const EMAIL_SUPPRESSED_STATUSES = new Set(["do_not_contact", "customer", "disqualified"]);
