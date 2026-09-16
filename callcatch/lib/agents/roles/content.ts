import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { AgentDefinition } from "@/lib/agents/core/types";
import { COMPANY_CONTEXT, COMPLIANCE_RULES } from "./_shared";

const DEFAULT_TOPICS = [
  "Why HVAC contractors miss 27-62% of inbound calls (and what each one costs)",
  "*71 vs **61*: call forwarding codes by carrier for contractors (Verizon, AT&T, T-Mobile, Google Voice)",
  "Missed-call text-back and the TCPA: what a contractor can and cannot text",
  "Toll-free verification for contractors: why it takes 3-10 days and how to pass first time",
  "Jobber vs Housecall Pro text-back vs an AI front desk: what the caller actually gets",
  "The $51 Google LSA lead you paid for and then sent to voicemail",
  "After-hours emergency calls: a script for plumbers that books the job by text",
  "How to write a 2-line voicemail greeting that makes people wait for the text",
  "Missed call math: a calculator for 2-10 truck shops",
  "Podium vs CallCatch for a two-truck HVAC company (honest comparison)",
];

const SYSTEM = `${COMPANY_CONTEXT}

ROLE: Content. You write useful, specific pages that a contractor would forward to a friend: 800-1200 words, plain language, one concrete example per section, an FAQ (4 questions, schema.org FAQPage JSON-LD block), internal links to /pricing and /demo, no filler. Cite only verified facts (with the source name inline). Use web_search to check any number you are not sure of and cite the URL.
Output as a 'publish_content' proposal: {slug, title, kind: blog|comparison|city_page, markdown, meta_description (<=155 chars)}.

${COMPLIANCE_RULES}`;

export const definition: AgentDefinition = {
  role: "content",
  title: "Content",
  mission: "Publish two pages a week that rank for contractor missed-call and text-back searches and convert to demo-line calls.",
  kpi: "pages published/week, organic demo-line calls",
  cadence: "Tue/Thu 16:00 UTC",
  effort: "medium",
  maxIterations: 10,
  webSearch: true,
  budgetUsdPerRun: 2,
  systemPrompt: () => SYSTEM,
  task: () => `Pick the next topic from get_topic_queue (skip those in memory 'published'), research 2-3 facts with web_search, write the page, propose_task publish_content, then remember 'published' (append slug + date) and 'topics' if you queued new ones. Report the slug and a one-line summary.`,
  tools: (ctx) => [
    betaZodTool({
      name: "get_topic_queue",
      description: "Topic backlog (memory 'topics' or the default list) and what was already published.",
      inputSchema: z.object({}),
      run: async () => JSON.stringify({ topics: (ctx.memory.topics as string[] | undefined) ?? DEFAULT_TOPICS, published: ctx.memory.published ?? [] }),
    }),
  ],
};
