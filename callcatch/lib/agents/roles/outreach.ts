import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/db/client";
import { env } from "@/lib/env";
import type { AgentDefinition } from "@/lib/agents/core/types";
import { missedCallsEstimate, SEQUENCE_V1 } from "@/lib/agents/prompts/sales";
import { bookingUrl, COMPANY_CONTEXT, COMPLIANCE_RULES, demoNumber, founderName, prospectLine, trialUrl } from "./_shared";

const SYSTEM = `${COMPANY_CONTEXT}

ROLE: Outreach (SDR). You run the 4-step email sequence to queued prospects and handle replies. Quality over volume: the 2026 evidence says AI SDRs fail when they blast generic mail (reply rates fall below 1.3%); founder-quality, specific, short emails get 3-8% replies.
Rules for every email: plain text, under 140 words, one idea, one number the prospect will recognize (their trade, city, review count -> missed-call estimate), the demo line, one ask. No hype words, no fake urgency, no emojis. Subject under 45 chars, lowercase-natural. Use the step template as a skeleton, not verbatim.
Sequence logic: step 1 to queued prospects with an email; step n+1 only if step n was sent >= its day offset ago and there is no reply; stop the sequence on any reply (status replied) or unsubscribe. Max sends per run: ${Math.max(5, Math.floor(Number(env.get("AGENT_MAX_EMAILS_PER_DAY", "60")) / 2))}.
Replies: classify (interested / question / not_now / wrong_person / unsubscribe / hostile). interested -> propose schedule_call with a 1-line reason + update_prospect status demo_booked when they name a time; question -> draft a reply via propose_task send_outreach_email with force_reply=true; not_now -> update_prospect next_touch_at +60 days; unsubscribe/hostile -> update_prospect status do_not_contact; wrong_person -> ask for the owner's email (one short reply).
Merge fields available: business_name, first_name (owner_name first token or 'there'), city, review_count, missed_calls_estimate, demo_number=${demoNumber()}, trial_url=${trialUrl()}, booking_url=${bookingUrl()}, founder_name=${founderName()}.

${COMPLIANCE_RULES}`;

export const definition: AgentDefinition = {
  role: "outreach",
  title: "Outreach (SDR)",
  mission: "Turn queued prospects into replies and booked demos with founder-quality email sequences.",
  kpi: "reply rate >= 4%, demos booked per week, zero compliance incidents",
  cadence: "weekdays 14:00 and 20:00 UTC",
  effort: "medium",
  maxIterations: 16,
  budgetUsdPerRun: 1.5,
  systemPrompt: () => SYSTEM,
  task: (ctx) => `Run the outreach cycle (input ${JSON.stringify(ctx.input)}). (1) list_replies and handle each reply first. (2) list_due prospects; for each, decide the step (get_templates), write the personalized email, and propose_task send_outreach_email with {prospect_id, to, subject, body_text, step}. (3) remember 'subject_lines' with what you sent and, when replies exist, which subjects earned them. Report: replies handled, emails proposed/sent, prospects skipped and why.`,
  tools: () => [
    betaZodTool({
      name: "list_due",
      description: "Prospects due for a touch: queued with email (step 1) or contacted with next_touch_at <= now (next step). Includes sent steps.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(60).default(25) }),
      run: async (input) => {
        const db = createAdminSupabase();
        const now = new Date().toISOString();
        const { data } = await db
          .from("prospects")
          .select("id, business_name, trade, city, state, review_count, rating, email, phone, website, fit_score, status, owner_name, notes")
          .in("status", ["queued", "contacted"])
          .not("email", "is", null)
          .or(`next_touch_at.is.null,next_touch_at.lte.${now}`)
          .order("fit_score", { ascending: false })
          .limit(input.limit);
        const out: string[] = [];
        for (const p of data ?? []) {
          const { data: steps } = await db.from("outreach").select("step, status, sent_at, scheduled_for").eq("prospect_id", p.id).eq("channel", "email").order("step");
          const sent = (steps ?? []).map((s) => `${s.step}:${s.status}${s.sent_at ? "@" + s.sent_at.slice(0, 10) : ""}`).join(",");
          out.push(`${prospectLine(p)} | owner ${p.owner_name ?? "-"} | missed_est ${missedCallsEstimate(p.review_count)} | steps [${sent}] | notes ${JSON.stringify(p.notes).slice(0, 160)}`);
        }
        return out.join("\n") || "(none due)";
      },
    }),
    betaZodTool({
      name: "get_templates",
      description: "The 4-step sequence skeletons with goals and day offsets.",
      inputSchema: z.object({}),
      run: async () => JSON.stringify(SEQUENCE_V1),
    }),
    betaZodTool({
      name: "list_replies",
      description: "Outreach rows marked replied in the last N days with the reply excerpt and prospect context.",
      inputSchema: z.object({ days: z.number().int().min(1).max(30).default(3) }),
      run: async (input) => {
        const db = createAdminSupabase();
        const since = new Date(Date.now() - input.days * 24 * 3600_000).toISOString();
        const { data } = await db.from("outreach").select("id, prospect_id, step, subject, reply_excerpt, updated_at, prospects(business_name, email, status, owner_name, state)").eq("status", "replied").gte("updated_at", since).order("updated_at", { ascending: false }).limit(40);
        return JSON.stringify(data ?? []);
      },
    }),
  ],
};
