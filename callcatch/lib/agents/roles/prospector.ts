import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/db/client";
import type { Json, TablesUpdate } from "@/lib/db/types";
import type { AgentDefinition } from "@/lib/agents/core/types";
import { fetchCsv, fetchTxLicenses, inspectTxFields, mapAzRocCsv, mapFlDbprCsv } from "@/lib/agents/integrations/license-boards";
import { enrichWebsite } from "@/lib/agents/integrations/enrich";
import { lookupPhoneType } from "@/lib/agents/integrations/phone-type";
import { upsertProspects } from "@/lib/agents/pipelines/ingest";
import { scoreProspect } from "@/lib/agents/pipelines/scoring";
import { COMPANY_CONTEXT, COMPLIANCE_RULES, prospectLine } from "./_shared";

const SYSTEM = `${COMPANY_CONTEXT}

ROLE: Prospector. You build and maintain the outbound list of contractors most likely to buy CallCatch.
Data policy (legal): seed ONLY from state license boards (public records) or CSVs the founder imported. Never store Google Places / Yelp API output. Website enrichment stores derived flags only.
Fit rubric (0-100): trade match +30; 20-400 reviews +20; rating >= 4.0 +10 (4.5+ +12); website +10; phone +10; runs ads +10; 24/7 or emergency +5; Jobber/HCP +5; ServiceTitan -10; franchise -25.
Line type matters: mobiles are manual-dial, DNC-scrubbed only; landline/VoIP are plain B2B calls. Always look up the line type before queueing a prospect for calls.
Queue rule: a prospect is 'queued' only when fit >= 55 and it has an email or a business phone with a known line type.

${COMPLIANCE_RULES}`;

export const definition: AgentDefinition = {
  role: "prospector",
  title: "Prospector",
  mission: "Keep 200+ scored, enriched, contactable prospects queued per active metro from public license records.",
  kpi: "queued prospects with email or phone (target 200 per metro), enrichment coverage %",
  cadence: "weekdays 13:00 UTC",
  effort: "medium",
  maxIterations: 14,
  budgetUsdPerRun: 1.5,
  systemPrompt: () => SYSTEM,
  task: (ctx) => {
    const i = ctx.input;
    return `Run the prospecting cycle. Input: ${JSON.stringify(i)}.
Steps: (1) recall 'coverage' to see which metros/trades were pulled and how far (offset). (2) If input names a state/city/trade or coverage shows a gap, ingest: TX via fetch_tx_licenses (hvac/electrical; plumbing is TSBPE, not available here), AZ/FL via import_license_csv with the URL in memory 'sources' (ask the founder via notify_founder if missing). (3) enrich_prospect for up to 25 prospects with a website and no enrichment yet; lookup_phone_type for up to 25 with a phone and unknown type. (4) rescore, then queue_top to reach 200 queued in the target metro. (5) remember 'coverage' and 'learnings' (what data quality issues you saw). Finish with counts.`;
  },
  tools: (ctx) => [
    betaZodTool({
      name: "fetch_tx_licenses",
      description: "Pull Texas TDLR licenses (public record) for a trade and city and upsert them as prospects. Returns counts.",
      inputSchema: z.object({ trade: z.enum(["hvac", "electrical"]), city: z.string().min(2).max(60).optional(), limit: z.number().int().min(10).max(1000).default(300), offset: z.number().int().min(0).default(0) }),
      run: async (input) => {
        const { rows, raw } = await fetchTxLicenses(input);
        const r = await upsertProspects(rows, { source: "license_board" });
        ctx.notes.push(`TX ${input.trade} ${input.city ?? "all"}: raw ${raw}, kept ${rows.length}, inserted ${r.inserted}, updated ${r.updated}`);
        return JSON.stringify({ raw, kept: rows.length, ...r });
      },
    }),
    betaZodTool({
      name: "inspect_tx_fields",
      description: "Returns the raw column names of the TDLR dataset (use when fetch_tx_licenses returns 0 kept rows).",
      inputSchema: z.object({}),
      run: async () => JSON.stringify(await inspectTxFields()),
    }),
    betaZodTool({
      name: "import_license_csv",
      description: "Download a state license-board CSV (AZ ROC posting list or FL DBPR extract) and upsert prospects.",
      inputSchema: z.object({ url: z.string().url(), state: z.enum(["AZ", "FL"]) }),
      run: async (input) => {
        const text = await fetchCsv(input.url);
        const rows = input.state === "AZ" ? mapAzRocCsv(text) : mapFlDbprCsv(text);
        const r = await upsertProspects(rows, { source: "license_board" });
        return JSON.stringify({ kept: rows.length, ...r });
      },
    }),
    betaZodTool({
      name: "list_prospects",
      description: "List prospects by status/state/trade with fit ordering (max 100).",
      inputSchema: z.object({ status: z.string().optional(), state: z.string().length(2).optional(), trade: z.string().optional(), city: z.string().optional(), needs: z.enum(["enrichment", "phone_type", "any"]).default("any"), limit: z.number().int().min(1).max(100).default(50) }),
      run: async (input) => {
        const db = createAdminSupabase();
        let q = db.from("prospects").select("id, business_name, trade, city, state, review_count, rating, email, phone, phone_type, website, fit_score, status, notes").order("fit_score", { ascending: false }).limit(input.limit);
        if (input.status) q = q.eq("status", input.status);
        if (input.state) q = q.eq("state", input.state.toUpperCase());
        if (input.trade) q = q.eq("trade", input.trade);
        if (input.city) q = q.ilike("city", input.city);
        if (input.needs === "phone_type") q = q.not("phone", "is", null).is("phone_type", null);
        if (input.needs === "enrichment") q = q.not("website", "is", null);
        const { data } = await q;
        const rows = (data ?? []).filter((p) => input.needs !== "enrichment" || !(p.notes as Record<string, unknown> | null)?.enriched_at);
        return rows.map(prospectLine).join("\n") || "(none)";
      },
    }),
    betaZodTool({
      name: "enrich_prospect",
      description: "Fetch the prospect's website once and store derived flags (software, 24/7, emergency, contact email).",
      inputSchema: z.object({ prospect_id: z.string().uuid() }),
      run: async (input) => {
        const db = createAdminSupabase();
        const { data: p } = await db.from("prospects").select("id, website, email, notes").eq("id", input.prospect_id).maybeSingle();
        if (!p?.website) return "no website";
        const e = await enrichWebsite(p.website);
        const notes = { ...((p.notes as Record<string, unknown>) ?? {}), enriched_at: new Date().toISOString(), title: e.title, open_24_7: e.open_24_7, emergency: e.emergency, financing: e.financing, online_booking: e.online_booking, years_hint: e.years_hint, enrich_error: e.error ?? null };
        const patch: TablesUpdate<"prospects"> = { notes: notes as Json, uses_software: e.uses_software };
        if (!p.email && e.emails[0]) patch.email = e.emails[0];
        await db.from("prospects").update(patch).eq("id", p.id);
        return JSON.stringify({ ok: e.ok, uses_software: e.uses_software, emails: e.emails, open_24_7: e.open_24_7, emergency: e.emergency, error: e.error ?? null });
      },
    }),
    betaZodTool({
      name: "lookup_phone_type",
      description: "Classify the prospect's phone (landline / mobile / voip) via Twilio Lookup; stores phone_type.",
      inputSchema: z.object({ prospect_id: z.string().uuid() }),
      run: async (input) => {
        const db = createAdminSupabase();
        const { data: p } = await db.from("prospects").select("id, phone").eq("id", input.prospect_id).maybeSingle();
        if (!p?.phone) return "no phone";
        const r = await lookupPhoneType(p.phone);
        await db.from("prospects").update({ phone_type: r.type }).eq("id", p.id);
        return JSON.stringify(r);
      },
    }),
    betaZodTool({
      name: "rescore",
      description: "Recompute fit_score for prospects in status new/enriched (max 500).",
      inputSchema: z.object({ state: z.string().length(2).optional(), limit: z.number().int().min(1).max(500).default(300) }),
      run: async (input) => {
        const db = createAdminSupabase();
        let q = db.from("prospects").select("*").in("status", ["new", "enriched"]).limit(input.limit);
        if (input.state) q = q.eq("state", input.state.toUpperCase());
        const { data } = await q;
        let n = 0;
        for (const p of data ?? []) {
          const fit = scoreProspect({ ...p, notes: p.notes as Record<string, unknown> });
          const enriched = Boolean((p.notes as Record<string, unknown> | null)?.enriched_at);
          await db.from("prospects").update({ fit_score: fit, status: enriched && p.status === "new" ? "enriched" : p.status }).eq("id", p.id);
          n++;
        }
        return `rescored ${n}`;
      },
    }),
    betaZodTool({
      name: "queue_top",
      description: "Move the best contactable prospects (fit >= min_fit, email or typed phone, status new/enriched) to 'queued'.",
      inputSchema: z.object({ state: z.string().length(2).optional(), min_fit: z.number().int().min(0).max(100).default(55), limit: z.number().int().min(1).max(300).default(100) }),
      run: async (input) => {
        const db = createAdminSupabase();
        let q = db.from("prospects").select("id, email, phone, phone_type, fit_score").in("status", ["new", "enriched"]).gte("fit_score", input.min_fit).order("fit_score", { ascending: false }).limit(input.limit * 3);
        if (input.state) q = q.eq("state", input.state.toUpperCase());
        const { data } = await q;
        const ids = (data ?? []).filter((p) => p.email || (p.phone && p.phone_type && p.phone_type !== "unknown")).slice(0, input.limit).map((p) => p.id);
        if (ids.length) await db.from("prospects").update({ status: "queued", next_touch_at: new Date().toISOString() }).in("id", ids);
        return `queued ${ids.length}`;
      },
    }),
  ],
};
