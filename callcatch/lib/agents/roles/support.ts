import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/db/client";
import type { AgentDefinition } from "@/lib/agents/core/types";
import { COMPANY_CONTEXT, COMPLIANCE_RULES } from "./_shared";

const SYSTEM = `${COMPANY_CONTEXT}

ROLE: Support. You answer customer emails accurately, warmly and briefly, grounded in how the product works:
- Verification: toll-free verification takes 3-10 business days; alerts + voicemail transcripts work from day one; the trial clock and first charge wait for verification; we escalate to Twilio at day 5.
- Forwarding codes: Verizon *71 <number>; AT&T *61* (busy/no-answer) and **61*<number>*11#; T-Mobile **61*<number>#; Google Voice / RingCentral / Grasshopper: forwarding rules in their portals. "Test my forwarding" is in Onboarding step 5.
- Quiet hours 8am-9pm local (narrowable, not widenable); replies within 15 minutes and emergencies go out any time. STOP is honored instantly.
- Billing: Starter $79, Pro $149, annual = 10 months, $149 setup optional, 30-day money-back on the first charge (founder-approved credit via apply_credit), pause up to 2 months, cancel any time in the billing portal.
Never promise prices/ETAs for the customer's own business. Escalate legal/TCPA questions, refunds, cancellations with anger, and anything you cannot verify to the founder (flag_account + notify_founder).

${COMPLIANCE_RULES}`;

export const definition: AgentDefinition = {
  role: "support",
  title: "Support",
  mission: "Answer every customer email within 3 hours with a correct, kind, complete reply; escalate money and legal.",
  kpi: "first-response time < 3h, resolution without reopen, CSAT",
  cadence: "every 3 hours (12,15,18,21,00 UTC)",
  effort: "medium",
  maxIterations: 12,
  budgetUsdPerRun: 1,
  systemPrompt: () => SYSTEM,
  task: () => `Handle open tickets: list_tickets; for each, customer_context by email, then propose_task reply_support_email {to, subject, body_text, in_reply_to, account_id} and close_ticket. Refund/credit requests -> propose apply_credit with the amount and reason. Churn signals -> flag_account. Report tickets handled and escalations.`,
  tools: () => [
    betaZodTool({
      name: "list_tickets",
      description: "Open support tickets (stored as agent_tasks role=support kind=draft status=proposed by the inbound webhook).",
      inputSchema: z.object({ limit: z.number().int().min(1).max(30).default(15) }),
      run: async (input) => {
        const db = createAdminSupabase();
        const { data } = await db.from("agent_tasks").select("id, title, payload, created_at").eq("role", "support").eq("kind", "draft").eq("status", "proposed").order("created_at", { ascending: true }).limit(input.limit);
        return JSON.stringify(data ?? []);
      },
    }),
    betaZodTool({
      name: "customer_context",
      description: "Account, number verification, subscription and recent activity for a customer email.",
      inputSchema: z.object({ email: z.string().email() }),
      run: async (input) => {
        const db = createAdminSupabase();
        const { data: a } = await db.from("accounts").select("id, legal_name, dba, status, plan, timezone, alert_email, created_at").or(`alert_email.eq.${input.email.toLowerCase()}`).maybeSingle();
        if (!a) return "no account for that email (prospect or unknown sender)";
        const [{ data: n }, { data: s }, { count: calls }, { count: leads }] = await Promise.all([
          db.from("numbers").select("phone_number, verification_status, verification_submitted_at, verified_at, sms_enabled").eq("account_id", a.id),
          db.from("subscriptions").select("status, plan, interval, trial_end, current_period_end, paid_now").eq("account_id", a.id).maybeSingle(),
          db.from("calls").select("id", { count: "exact", head: true }).eq("account_id", a.id).gte("created_at", new Date(Date.now() - 14 * 24 * 3600_000).toISOString()),
          db.from("leads").select("id", { count: "exact", head: true }).eq("account_id", a.id).gte("created_at", new Date(Date.now() - 14 * 24 * 3600_000).toISOString()),
        ]);
        return JSON.stringify({ account: a, numbers: n, subscription: s, calls_14d: calls ?? 0, leads_14d: leads ?? 0 });
      },
    }),
    betaZodTool({
      name: "close_ticket",
      description: "Mark a ticket task handled (after proposing the reply).",
      inputSchema: z.object({ task_id: z.string().uuid(), outcome: z.string().max(300) }),
      run: async (input) => {
        const db = createAdminSupabase();
        await db.from("agent_tasks").update({ status: "executed", result: { handled: true, outcome: input.outcome }, executed_at: new Date().toISOString() }).eq("id", input.task_id).eq("status", "proposed");
        return "closed";
      },
    }),
  ],
};
