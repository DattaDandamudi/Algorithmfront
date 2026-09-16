import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/db/client";
import type { AgentDefinition } from "@/lib/agents/core/types";
import { hasAiDisclosure, hasStopDisclosure } from "@/lib/telephony/consent";
import { localTime, safeTimeZone } from "@/lib/telephony/quietHours";
import { COMPANY_CONTEXT, COMPLIANCE_RULES } from "./_shared";

const SYSTEM = `${COMPANY_CONTEXT}

ROLE: Compliance watchdog. You audit what the product actually sent against the rules we publish: first-message disclosures (business name + "automated assistant" + "Reply STOP to opt out"), no messages to opted-out contacts, quiet hours (8am-9pm local for unsolicited sends; replies within 15 minutes and emergency templates are exempt), verification SLAs (escalate at 5 business days with the Twilio template), and cold-outreach hygiene (no SMS to prospects ever, unsubscribe honored).
Output: a compliance score 0-100 (remember 'score' with the breakdown), flag_account for each account with a violation (severity high for opted-out sends, medium for quiet-hours, low for disclosure wording), and one notify_founder digest when anything is not 100.

${COMPLIANCE_RULES}`;

export const definition: AgentDefinition = {
  role: "compliance",
  title: "Compliance watchdog",
  mission: "Zero consent or quiet-hours violations, every verification escalated on time, published terms matched by behavior.",
  kpi: "compliance score = 100, SLA escalations within 1 business day",
  cadence: "daily 11:00 UTC",
  effort: "low",
  maxIterations: 10,
  budgetUsdPerRun: 0.75,
  systemPrompt: () => SYSTEM,
  task: () => `Run all four audits (audit_opt_outs, audit_quiet_hours, audit_disclosures, audit_verification_sla) for the last 24h, compute the score, propose flag_account for violations not already in memory 'flagged' (7-day window), notify_founder with a digest if score < 100 or any SLA breach, remember 'score' and 'flagged'. Report the score and violations.`,
  tools: () => [
    betaZodTool({
      name: "audit_opt_outs",
      description: "Outbound messages sent to contacts after they opted out (last N hours).",
      inputSchema: z.object({ hours: z.number().int().min(1).max(168).default(24) }),
      run: async (input) => {
        const db = createAdminSupabase();
        const since = new Date(Date.now() - input.hours * 3600_000).toISOString();
        const { data: contacts } = await db.from("contacts").select("id, account_id, opted_out_at").eq("opted_out", true).not("opted_out_at", "is", null).limit(2000);
        const violations: Record<string, unknown>[] = [];
        for (const c of contacts ?? []) {
          const { data: convs } = await db.from("conversations").select("id").eq("contact_id", c.id);
          const ids = (convs ?? []).map((x) => x.id);
          if (!ids.length) continue;
          const { data: msgs } = await db.from("messages").select("id, created_at, author, body").in("conversation_id", ids).eq("direction", "out").in("status", ["sent", "delivered"]).gt("created_at", c.opted_out_at as string).gte("created_at", since).limit(5);
          for (const m of msgs ?? []) violations.push({ account_id: c.account_id, contact_id: c.id, message_id: m.id, at: m.created_at, author: m.author });
        }
        return JSON.stringify({ opted_out_contacts: contacts?.length ?? 0, violations });
      },
    }),
    betaZodTool({
      name: "audit_quiet_hours",
      description: "AI/system outbound messages sent outside 8am-9pm account local time, excluding emergency (author system) and replies within 15 minutes of an inbound.",
      inputSchema: z.object({ hours: z.number().int().min(1).max(168).default(24) }),
      run: async (input) => {
        const db = createAdminSupabase();
        const since = new Date(Date.now() - input.hours * 3600_000).toISOString();
        const { data: msgs } = await db.from("messages").select("id, account_id, conversation_id, created_at, author, direction").eq("direction", "out").eq("author", "ai").in("status", ["sent", "delivered"]).gte("created_at", since).limit(2000);
        const violations: Record<string, unknown>[] = [];
        const tzCache = new Map<string, string>();
        for (const m of msgs ?? []) {
          let tz = tzCache.get(m.account_id);
          if (!tz) {
            const { data: a } = await db.from("accounts").select("timezone").eq("id", m.account_id).maybeSingle();
            tz = safeTimeZone(a?.timezone ?? null);
            tzCache.set(m.account_id, tz);
          }
          const { minutesOfDay } = localTime(new Date(m.created_at), tz);
          if (minutesOfDay >= 8 * 60 && minutesOfDay < 21 * 60) continue;
          const { data: prevIn } = await db.from("messages").select("created_at").eq("conversation_id", m.conversation_id).eq("direction", "in").lt("created_at", m.created_at).order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (prevIn && new Date(m.created_at).getTime() - new Date(prevIn.created_at).getTime() <= 15 * 60_000) continue;
          violations.push({ account_id: m.account_id, message_id: m.id, at: m.created_at, tz });
        }
        return JSON.stringify({ checked: msgs?.length ?? 0, violations });
      },
    }),
    betaZodTool({
      name: "audit_disclosures",
      description: "Samples first outbound messages per conversation (last N hours) and checks business name + automated-assistant + STOP disclosure.",
      inputSchema: z.object({ hours: z.number().int().min(1).max(168).default(24), sample: z.number().int().min(5).max(200).default(50) }),
      run: async (input) => {
        const db = createAdminSupabase();
        const since = new Date(Date.now() - input.hours * 3600_000).toISOString();
        const { data: convs } = await db.from("conversations").select("id, account_id").gte("created_at", since).limit(input.sample);
        const issues: Record<string, unknown>[] = [];
        for (const c of convs ?? []) {
          const { data: first } = await db.from("messages").select("id, body, author").eq("conversation_id", c.id).eq("direction", "out").order("created_at", { ascending: true }).limit(1).maybeSingle();
          if (!first) continue;
          const { data: a } = await db.from("accounts").select("dba, legal_name").eq("id", c.account_id).maybeSingle();
          const name = (a?.dba || a?.legal_name || "").toLowerCase();
          const body = first.body;
          const problems: string[] = [];
          if (!hasStopDisclosure(body)) problems.push("missing STOP");
          if (!hasAiDisclosure(body)) problems.push("missing automated-assistant");
          if (name && !body.toLowerCase().includes(name.slice(0, 12))) problems.push("missing business name");
          if (problems.length) issues.push({ account_id: c.account_id, conversation_id: c.id, message_id: first.id, problems });
        }
        return JSON.stringify({ sampled: convs?.length ?? 0, issues });
      },
    }),
    betaZodTool({
      name: "audit_verification_sla",
      description: "Numbers pending/in_review with age in business days; >= 5 business days need escalation.",
      inputSchema: z.object({}),
      run: async () => {
        const db = createAdminSupabase();
        const { data } = await db.from("numbers").select("id, account_id, phone_number, verification_status, verification_submitted_at, tendlc_campaign_sid").in("verification_status", ["pending", "in_review"]).limit(500);
        const now = new Date();
        const rows = (data ?? []).map((n) => {
          let days = 0;
          const d = n.verification_submitted_at ? new Date(n.verification_submitted_at) : now;
          for (let t = new Date(d); t < now; t.setUTCDate(t.getUTCDate() + 1)) if (t.getUTCDay() !== 0 && t.getUTCDay() !== 6) days++;
          return { ...n, business_days: days, escalate: days >= 5 };
        });
        return JSON.stringify(rows);
      },
    }),
  ],
};
