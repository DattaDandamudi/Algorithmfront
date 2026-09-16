/**
 * State contractor license boards = the only fully clean seed for a marketing database
 * (public records; see docs/research/prospecting-data-2026.md). Google Places output may not be stored.
 *
 * TX: TDLR "All Licenses" Socrata dataset 7358-krk7 (JSON API, includes business phone).
 * AZ: ROC posting list CSV (no phone). FL: DBPR construction-industry extracts (no phone).
 * Field names differ per source and change occasionally: every mapper accepts a field map override and
 * `inspectFields()` returns the raw keys of the first rows so the founder can fix a map without a deploy.
 */
import { normalizeTrade, normalizeUsPhone, parseCsv, type ProspectImportRow } from "@/lib/agents/pipelines/csv";

const TX_DATASET = "https://data.texas.gov/resource/7358-krk7.json";

export type TxFieldMap = {
  licenseType: string;
  licenseNumber: string;
  businessName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  owner: string;
  status: string;
};

/** Best-known TDLR column names; override via env TX_TDLR_FIELD_MAP (JSON) when the dataset changes. */
export const TX_DEFAULT_FIELDS: TxFieldMap = {
  licenseType: "license_type",
  licenseNumber: "license_number",
  businessName: "business_name",
  address: "business_address_line1",
  city: "business_city",
  state: "business_state",
  zip: "business_zip",
  phone: "business_phone",
  owner: "owner_name",
  status: "license_status",
};

/** TDLR license types that map to CallCatch trades (plumbing is licensed by TSBPE, not TDLR). */
export const TX_TRADE_LICENSE_TYPES: Record<string, string[]> = {
  hvac: ["Air Conditioning and Refrigeration Contractor", "Air Conditioning Contractor"],
  electrical: ["Electrical Contractor"],
};

function pick(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

export function txFieldMap(): TxFieldMap {
  const raw = process.env.TX_TDLR_FIELD_MAP;
  if (!raw) return TX_DEFAULT_FIELDS;
  try {
    return { ...TX_DEFAULT_FIELDS, ...(JSON.parse(raw) as Partial<TxFieldMap>) };
  } catch {
    return TX_DEFAULT_FIELDS;
  }
}

export function mapTxRows(rows: Record<string, unknown>[], fields: TxFieldMap = txFieldMap()): ProspectImportRow[] {
  const out: ProspectImportRow[] = [];
  for (const row of rows) {
    const name = pick(row, fields.businessName, "business_name", "name", "dba");
    if (!name) continue;
    const status = (pick(row, fields.status, "status") ?? "").toLowerCase();
    if (status && !/active|current/.test(status)) continue;
    out.push({
      business_name: name,
      trade: normalizeTrade(pick(row, fields.licenseType, "license_type")),
      phone: normalizeUsPhone(pick(row, fields.phone, "phone", "business_phone")),
      email: null,
      website: null,
      address: pick(row, fields.address, "address"),
      city: pick(row, fields.city, "city"),
      state: (pick(row, fields.state, "state") ?? "TX").toUpperCase().slice(0, 2),
      zip: pick(row, fields.zip, "zip"),
      rating: null,
      review_count: null,
      source: "license_board",
      external_ref: pick(row, fields.licenseNumber, "license_number") ? `TX:${pick(row, fields.licenseNumber, "license_number")}` : null,
      owner_name: pick(row, fields.owner, "owner"),
    });
  }
  return out;
}

export type TxQuery = { trade: "hvac" | "electrical"; city?: string; county?: string; limit?: number; offset?: number };

/** Fetches TDLR licenses for a trade/city. Requires outbound access to data.texas.gov (works from Vercel). */
export async function fetchTxLicenses(q: TxQuery, fields: TxFieldMap = txFieldMap()): Promise<{ rows: ProspectImportRow[]; raw: number }> {
  const types = TX_TRADE_LICENSE_TYPES[q.trade] ?? [];
  const where: string[] = [];
  if (types.length) where.push(`${fields.licenseType} in (${types.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")})`);
  if (q.city) where.push(`upper(${fields.city}) = '${q.city.toUpperCase().replace(/'/g, "''")}'`);
  const params = new URLSearchParams({ $limit: String(q.limit ?? 500), $offset: String(q.offset ?? 0) });
  if (where.length) params.set("$where", where.join(" AND "));
  const headers: Record<string, string> = {};
  if (process.env.SOCRATA_APP_TOKEN) headers["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;
  const res = await fetch(`${TX_DATASET}?${params.toString()}`, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`TDLR fetch failed: ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
  const rows = (await res.json()) as Record<string, unknown>[];
  return { rows: mapTxRows(rows, fields), raw: rows.length };
}

/** Returns the raw column names of the first rows so a field map can be fixed without a deploy. */
export async function inspectTxFields(): Promise<string[]> {
  const res = await fetch(`${TX_DATASET}?$limit=1`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`TDLR fetch failed: ${res.status}`);
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows[0] ? Object.keys(rows[0]) : [];
}

/** AZ ROC posting list (CSV). Class detail decides the trade; residential/dual classes only. */
export function mapAzRocCsv(text: string): ProspectImportRow[] {
  const table = parseCsv(text);
  if (table.length < 2) return [];
  const h = table[0].map((x) => x.trim().toLowerCase());
  const idx = (names: string[]) => {
    for (const n of names) {
      const i = h.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iName = idx(["business name", "name"]);
  const iDba = idx(["dba"]);
  const iClass = idx(["class detail", "class", "classification"]);
  const iType = idx(["class type"]);
  const iAddr = idx(["address"]);
  const iCity = idx(["city"]);
  const iZip = idx(["zip", "zip code"]);
  const iLic = idx(["license no", "license number", "license"]);
  const iStatus = idx(["status"]);
  const iQp = idx(["qualifying party"]);
  const out: ProspectImportRow[] = [];
  for (const r of table.slice(1)) {
    const name = (iDba >= 0 && r[iDba]) || (iName >= 0 ? r[iName] : "");
    if (!name) continue;
    if (iStatus >= 0 && r[iStatus] && !/active/i.test(r[iStatus])) continue;
    if (iType >= 0 && r[iType] && /commercial/i.test(r[iType]) && !/dual/i.test(r[iType])) continue;
    const trade = normalizeTrade(iClass >= 0 ? r[iClass] : "");
    if (trade === "other") continue;
    out.push({
      business_name: name.trim(),
      trade,
      phone: null,
      email: null,
      website: null,
      address: iAddr >= 0 ? r[iAddr] || null : null,
      city: iCity >= 0 ? r[iCity] || null : null,
      state: "AZ",
      zip: iZip >= 0 ? r[iZip] || null : null,
      rating: null,
      review_count: null,
      source: "license_board",
      external_ref: iLic >= 0 && r[iLic] ? `AZ:${r[iLic]}` : null,
      owner_name: iQp >= 0 ? r[iQp] || null : null,
    });
  }
  return out;
}

/** FL DBPR construction-industry extract (CSV). License prefixes: CAC=HVAC, CFC=plumbing, EC/ER=electrical. */
export function mapFlDbprCsv(text: string): ProspectImportRow[] {
  const table = parseCsv(text);
  if (table.length < 2) return [];
  const h = table[0].map((x) => x.trim().toLowerCase());
  const idx = (names: string[]) => {
    for (const n of names) {
      const i = h.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iName = idx(["dba name", "business name", "name", "licensee name"]);
  const iLic = idx(["license number", "licensenumber", "license"]);
  const iCity = idx(["city", "mailing city"]);
  const iZip = idx(["zip", "zip code", "mailing zip"]);
  const iAddr = idx(["address", "mailing address", "address line 1"]);
  const iStatus = idx(["status", "license status", "primary status"]);
  const out: ProspectImportRow[] = [];
  for (const r of table.slice(1)) {
    const name = iName >= 0 ? r[iName] : "";
    const lic = iLic >= 0 ? r[iLic] : "";
    if (!name || !lic) continue;
    if (iStatus >= 0 && r[iStatus] && !/current|active/i.test(r[iStatus])) continue;
    const prefix = lic.replace(/[^A-Z]/gi, "").slice(0, 3).toUpperCase();
    const trade = prefix.startsWith("CAC") || prefix.startsWith("CMC") ? "hvac" : prefix.startsWith("CFC") ? "plumbing" : prefix.startsWith("EC") || prefix.startsWith("ER") ? "electrical" : "other";
    if (trade === "other") continue;
    out.push({
      business_name: name.trim(),
      trade,
      phone: null,
      email: null,
      website: null,
      address: iAddr >= 0 ? r[iAddr] || null : null,
      city: iCity >= 0 ? r[iCity] || null : null,
      state: "FL",
      zip: iZip >= 0 ? r[iZip] || null : null,
      rating: null,
      review_count: null,
      source: "license_board",
      external_ref: `FL:${lic}`,
      owner_name: null,
    });
  }
  return out;
}

/** Fetches a CSV by URL (AZ posting list, FL extract) with a size cap. */
export async function fetchCsv(url: string, maxBytes = 25_000_000): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new Error(`CSV too large: ${buf.byteLength} bytes`);
  return new TextDecoder().decode(buf);
}
