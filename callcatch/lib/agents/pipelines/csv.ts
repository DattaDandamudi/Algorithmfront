/** RFC 4180 CSV parsing/serialization (no dependency) + the prospect import contract. */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.length > 0)) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.length > 0)) rows.push(row);
  return rows;
}

export function toCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  if (rows.length === 0) return (columns ?? []).join(",") + "\n";
  const cols = columns ?? Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

export const PROSPECT_TRADES = ["hvac", "plumbing", "electrical", "roofing", "other"] as const;
export type ProspectTradeInput = (typeof PROSPECT_TRADES)[number];

export type ProspectImportRow = {
  business_name: string;
  trade: ProspectTradeInput;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  rating: number | null;
  review_count: number | null;
  source: string;
  external_ref: string | null;
  owner_name: string | null;
};

const HEADER_ALIASES: Record<string, keyof ProspectImportRow> = {
  business_name: "business_name", name: "business_name", company: "business_name", business: "business_name",
  trade: "trade", category: "trade", license_type: "trade",
  phone: "phone", phone_number: "phone", telephone: "phone",
  email: "email", website: "website", url: "website", site: "website",
  address: "address", street: "address", address1: "address",
  city: "city", state: "state", zip: "zip", zipcode: "zip", postal_code: "zip",
  rating: "rating", review_count: "review_count", reviews: "review_count",
  source: "source", external_ref: "external_ref", license_number: "external_ref", owner_name: "owner_name", owner: "owner_name",
};

export function normalizeTrade(raw: string | null | undefined): ProspectTradeInput {
  const t = (raw ?? "").toLowerCase();
  if (/hvac|air cond|heating|cooling|mechanical|refrigeration/.test(t)) return "hvac";
  if (/plumb/.test(t)) return "plumbing";
  if (/electric/.test(t)) return "electrical";
  if (/roof/.test(t)) return "roofing";
  return "other";
}

export function normalizeUsPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function normalizeWebsite(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!u.hostname.includes(".")) return null;
    return `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return null;
  }
}

/** Parses a CSV with any of the aliased headers into import rows; skips rows without a business name. */
export function parseProspectsCsv(text: string, defaults: Partial<ProspectImportRow> = {}): { rows: ProspectImportRow[]; skipped: number } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], skipped: 0 };
  const headers = table[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase().replace(/\s+/g, "_")] ?? null);
  const rows: ProspectImportRow[] = [];
  let skipped = 0;
  for (const line of table.slice(1)) {
    const rec: Partial<Record<keyof ProspectImportRow, string>> = {};
    line.forEach((v, i) => {
      const key = headers[i];
      if (key) rec[key] = v.trim();
    });
    const name = rec.business_name?.trim();
    if (!name) {
      skipped++;
      continue;
    }
    rows.push({
      business_name: name,
      trade: normalizeTrade(rec.trade ?? (defaults.trade as string | undefined)),
      phone: normalizeUsPhone(rec.phone) ?? defaults.phone ?? null,
      email: rec.email?.toLowerCase() || defaults.email || null,
      website: normalizeWebsite(rec.website) ?? defaults.website ?? null,
      address: rec.address || defaults.address || null,
      city: rec.city || defaults.city || null,
      state: (rec.state || defaults.state || "").toUpperCase().slice(0, 2) || null,
      zip: rec.zip?.slice(0, 10) || defaults.zip || null,
      rating: rec.rating && !Number.isNaN(Number(rec.rating)) ? Number(rec.rating) : (defaults.rating ?? null),
      review_count: rec.review_count && !Number.isNaN(Number(rec.review_count)) ? Math.round(Number(rec.review_count)) : (defaults.review_count ?? null),
      source: rec.source || defaults.source || "csv",
      external_ref: rec.external_ref || defaults.external_ref || null,
      owner_name: rec.owner_name || defaults.owner_name || null,
    });
  }
  return { rows, skipped };
}
