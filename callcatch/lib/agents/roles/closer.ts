import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/db/client";
import type { AgentDefinition } from "@/lib/agents/core/types";
import { CALL_SCRIPT_V1 } from "@/lib/agents/prompts/sales";
import { bookingUrl, COMPANY_CONTEXT, COMPLIANCE_RULES, demoNumber, founderName } from "./_shared";

const SYSTEM = `${COMPANY_CONTEXT}

ROLE: Closer. You move replied/demo-booked/trial prospects to paying customers and annual plans.
Demo flow (12 min): call their line while they watch, let it ring, show the text; show the owner alert; walk the inbox; quote $79/$149; offer the 20-minute done-for-you setup; ask for the annual (2 months free) when they say yes.
Trial nudges are tied to verification: day 0 (alerts + voicemail work now), verified (text-back is live: try it), day 10 (annual offer + setup waiver), trial end - 2 days. Never nudge more than every 3 days.
Win/loss: after each outcome, remember 'winloss' with the objection and what worked.
Founder: ${founderName()}, demo line ${demoNumber()}, booking ${bookingUrl()}.

${COMPLIANCE_RULES}`;

export const definition: AgentDefinition = {
  role: "closer",
  title: "Closer",
  mission: "Convert replies and trials into paying, annual customers with timely, specific follow-ups.",
  kpi: "reply->demo >= 40%, trial->paid >= 35%, annual share >= 20%",
  cadence: "weekdays 15:00 and 21:00 UTC",
  effort: "medium",
  maxIterations: 12,
  budgetUsdPerRun: 1,
  systemPrompt: () => SYSTEM,
  task: () => `Work the pipeline: list_pipeline; for each prospect decide the next touch (pre-demo brief for demo_booked with a scheduled call today, post-demo follow-up, trial nudge by verification state) and propose_task send_outreach_email (force_reply=true) / schedule_call / update_prospect. Draft a 5-line pre-demo brief into log_note for any demo in the next 24h. Report the pipeline by stage and the actions proposed.`,
  tools: () => [
    betaZodTool({
      name: "list_pipeline",
      description: "Prospects in replied/demo_booked/trial with linked account status, number verification, last touches.",
      inputSchema: z.object({}),
      run: async () => {
        const db = createAdminSupabase();
        const { data } = await db.from("prospects").select("id, business_name, trade, state, email, phone, status, owner_name, account_id, last_touch_at, next_touch_at, notes").in("status", ["replied", "demo_booked", "trial"]).order("next_touch_at", { ascending: true }).limit(60);
        const out: string[] = [];
        for (const p of data ?? []) {
          let acct = "";
          if (p.account_id) {
            const { data: a } = await db.from("accounts").select("status, plan, created_at").eq("id", p.account_id).maybeSingle();
            const { data: n } = await db.from("numbers").select("verification_status, verified_at, verification_submitted_at").eq("account_id", p.account_id).eq("purpose", "customer").maybeSingle();
            const { data: s } = await db.from("subscriptions").select("status, interval, trial_end, paid_now").eq("account_id", p.account_id).maybeSingle();
            acct = ` | account ${a?.status ?? "?"} ${a?.plan ?? ""} since ${a?.created_at?.slice(0, 10) ?? "?"} | number ${n?.verification_status ?? "none"} | sub ${s?.status ?? "none"} ${s?.interval ?? ""} trial_end ${s?.trial_end?.slice(0, 10) ?? "-"}`;
          }
          const { data: touches } = await db.from("outreach").select("channel, step, status, sent_at, scheduled_for, reply_excerpt").eq("prospect_id", p.id).order("created_at", { ascending: false }).limit(4);
          out.push(`${p.id} | ${p.business_name} (${p.trade}, ${p.state}) | ${p.status} | owner ${p.owner_name ?? "-"} | email ${p.email ?? "-"} | last ${p.last_touch_at?.slice(0, 10) ?? "-"} next ${p.next_touch_at?.slice(0, 10) ?? "-"}${acct} | touches ${JSON.stringify(touches ?? []).slice(0, 300)}`);
        }
        return out.join("\n") || "(pipeline empty)";
      },
    }),
    betaZodTool({ name: "get_call_script", description: "The founder's 90-second call script and objection handling.", inputSchema: z.object({}), run: async () => CALL_SCRIPT_V1 }),
  ],
};
