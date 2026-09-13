/**
 * Parses lead-notification emails into a lead. Handles Meta's "New lead" notification
 * emails (Full name / Phone number / Email / custom questions as "Label: value" lines) and
 * generic website-form notifications (Name / Phone / Email / Message). Falls back to
 * scanning the body for the first phone number and email address.
 */

export type ParsedLeadEmail = {
  name: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  address: string | null;
  zip: string | null;
  kind: "meta_lead_email" | "form_email" | "unknown";
  externalRef: string | null;
  fields: Record<string, string>;
};

const NAME_KEYS = ["full name", "name", "your name", "customer name", "contact name", "first name"];
const LAST_NAME_KEYS = ["last name", "surname"];
const PHONE_KEYS = ["phone number", "phone", "mobile", "cell", "telephone", "tel", "contact number", "best phone"];
const EMAIL_KEYS = ["email", "e-mail", "email address"];
const MESSAGE_KEYS = ["message", "comments", "comment", "details", "description", "how can we help", "what do you need", "issue", "problem", "service needed", "notes", "tell us"];
const ADDRESS_KEYS = ["address", "street address", "service address", "street"];
const ZIP_KEYS = ["zip", "zip code", "postal code", "zipcode"];
const REF_KEYS = ["lead id", "leadgen id", "lead_id", "submission id", "form id", "reference"];

export function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/tr|\/li|\/h[1-6])\s*>/gi, "\n")
    .replace(/<\s*(td|th)[^>]*>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function matchKey(key: string, list: string[]): boolean {
  const k = key.toLowerCase().replace(/[*:\s_-]+/g, " ").trim();
  return list.some((l) => k === l || k.endsWith(` ${l}`) || k.startsWith(`${l} `));
}

/** "Label: value" lines, plus "Label\nvalue" pairs (Meta's plain-text layout). */
export function extractFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const lines = text.split("\n").map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const kv = /^([A-Za-z][A-Za-z0-9 ()/_'?-]{1,48})\s*[:：]\s*(.+)$/.exec(line);
    if (kv) {
      const key = kv[1].trim().toLowerCase();
      if (!fields[key]) fields[key] = kv[2].trim();
      continue;
    }
    const kOnly = /^([A-Za-z][A-Za-z0-9 ()/_'?-]{1,48})\s*[:：]?$/.exec(line);
    if (kOnly && i + 1 < lines.length && lines[i + 1] && !/[:：]\s*\S/.test(lines[i + 1])) {
      const key = kOnly[1].trim().toLowerCase();
      const known = [...NAME_KEYS, ...LAST_NAME_KEYS, ...PHONE_KEYS, ...EMAIL_KEYS, ...MESSAGE_KEYS, ...ADDRESS_KEYS, ...ZIP_KEYS, ...REF_KEYS];
      if (known.some((k) => matchKey(key, [k])) && !fields[key]) {
        fields[key] = lines[i + 1];
        i++;
      }
    }
  }
  return fields;
}

function pick(fields: Record<string, string>, keys: string[]): string | null {
  for (const [k, v] of Object.entries(fields)) {
    if (matchKey(k, keys) && v.trim()) return v.trim();
  }
  return null;
}

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function parseLeadEmail(input: { subject: string | null; text: string | null; html: string | null; from: string | null }): ParsedLeadEmail {
  const text = (input.text && input.text.trim()) || (input.html ? htmlToText(input.html) : "") || "";
  const fields = extractFields(text);
  const subject = input.subject ?? "";
  const fromLower = (input.from ?? "").toLowerCase();
  const isMeta = /facebookmail\.com|meta\.com|facebook\.com/.test(fromLower) || /new lead/i.test(subject);

  let name = pick(fields, NAME_KEYS);
  const last = pick(fields, LAST_NAME_KEYS);
  if (name && last && !name.toLowerCase().includes(last.toLowerCase())) name = `${name} ${last}`;
  let phone = pick(fields, PHONE_KEYS);
  let email = pick(fields, EMAIL_KEYS);
  const message = pick(fields, MESSAGE_KEYS);
  const address = pick(fields, ADDRESS_KEYS);
  const zip = pick(fields, ZIP_KEYS);
  const externalRef = pick(fields, REF_KEYS);

  if (!phone) phone = PHONE_RE.exec(text)?.[0] ?? null;
  if (!email) {
    const candidates = text.match(new RegExp(EMAIL_RE.source, "gi")) ?? [];
    email = candidates.find((c) => !fromLower.includes(c.toLowerCase())) ?? null;
  }
  if (!name) {
    const m = /(?:new lead(?: from)?|lead from|inquiry from|message from)\s*[:\-–]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i.exec(subject);
    if (m) name = m[1];
  }

  // Custom Meta questions (e.g. "What's wrong with your AC?") end up as extra fields; keep the
  // longest non-standard answer as the message when no message field exists.
  let fallbackMessage: string | null = null;
  if (!message) {
    for (const [k, v] of Object.entries(fields)) {
      const standard = [NAME_KEYS, LAST_NAME_KEYS, PHONE_KEYS, EMAIL_KEYS, ADDRESS_KEYS, ZIP_KEYS, REF_KEYS].some((list) => matchKey(k, list));
      if (!standard && v.length > 3 && (!fallbackMessage || v.length > fallbackMessage.length) && !/unsubscribe|http/i.test(v)) fallbackMessage = `${k}: ${v}`;
    }
  }

  const kind: ParsedLeadEmail["kind"] = isMeta ? "meta_lead_email" : Object.keys(fields).length ? "form_email" : "unknown";
  return {
    name,
    phone,
    email,
    message: message ?? fallbackMessage,
    address,
    zip,
    kind,
    externalRef,
    fields,
  };
}
