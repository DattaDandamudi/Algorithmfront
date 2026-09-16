import { createAdminSupabase } from "@/lib/db/client";
import type { Json, TablesInsert } from "@/lib/db/types";
import { scoreProspect } from "./scoring";
import type { ProspectImportRow } from "./csv";

export type IngestResult = { inserted: number; updated: number; skipped: number; errors: string[] };

/**
 * Upserts import rows into prospects on the generated dedupe_key (name|phone|state).
 * Existing rows keep their status/notes; listing fields are refreshed. Batches of 200.
 */
export async function upsertProspects(rows: ProspectImportRow[], opts: { source?: string } = {}): Promise<IngestResult> {
  const db = createAdminSupabase();
  const result: IngestResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  const seen = new Set<string>();
  const payload: TablesInsert<"prospects">[] = [];
  for (const r of rows) {
    const key = `${r.business_name.toLowerCase()}|${r.phone ?? ""}|${r.state ?? ""}`;
    if (seen.has(key)) {
      result.skipped++;
      continue;
    }
    seen.add(key);
    payload.push({
      business_name: r.business_name,
      trade: r.trade,
      phone: r.phone,
      email: r.email,
      website: r.website,
      address: r.address,
      city: r.city,
      state: r.state,
      zip: r.zip,
      rating: r.rating,
      review_count: r.review_count,
      owner_name: r.owner_name,
      external_ref: r.external_ref,
      source: (opts.source ?? r.source ?? "csv") as TablesInsert<"prospects">["source"],
      fit_score: scoreProspect({ ...r, runs_meta_ads: null, uses_software: null }),
      notes: {} as Json,
    });
  }
  for (let i = 0; i < payload.length; i += 200) {
    const batch = payload.slice(i, i + 200);
    const keys = batch.map((b) => `${b.business_name.toLowerCase()}|${b.phone ?? ""}|${b.state ?? ""}`);
    const { data: existing } = await db.from("prospects").select("dedupe_key").in("dedupe_key", keys);
    const existingKeys = new Set((existing ?? []).map((e) => e.dedupe_key));
    const { error } = await db.from("prospects").upsert(batch, { onConflict: "dedupe_key", ignoreDuplicates: false });
    if (error) {
      result.errors.push(error.message);
      continue;
    }
    for (const k of keys) {
      if (existingKeys.has(k)) result.updated++;
      else result.inserted++;
    }
  }
  return result;
}
