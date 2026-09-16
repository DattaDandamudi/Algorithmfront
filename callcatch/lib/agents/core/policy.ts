/**
 * Action policy: which proposed tasks may execute without a human, at which autonomy level,
 * with which daily caps. This is the safety boundary of the Company OS — keep it boring and explicit.
 */
import { env } from "@/lib/env";
import type { Autonomy, TaskKind } from "./types";

export type Risk = "low" | "medium" | "high";

type PolicyRule = {
  risk: Risk;
  /** Lowest autonomy level at which this kind executes without approval; "never" = always needs a human. */
  autoAt: Autonomy | "never";
  description: string;
  /** Optional per-day cap on executions (env var name holding the number). */
  dailyCapEnv?: string;
};

const ORDER: Record<Autonomy, number> = { draft_only: 0, approval_required: 1, autonomous: 2 };

export const TASK_POLICY: Record<TaskKind, PolicyRule> = {
  send_outreach_email: { risk: "medium", autoAt: "autonomous", description: "Cold/warm email to a prospect (CAN-SPAM footer enforced)", dailyCapEnv: "AGENT_MAX_EMAILS_PER_DAY" },
  schedule_call: { risk: "low", autoAt: "approval_required", description: "Put a call on the founder's call list" },
  update_prospect: { risk: "low", autoAt: "approval_required", description: "Update prospect fields/status/next touch" },
  update_ad_budget: { risk: "high", autoAt: "autonomous", description: "Change an ad set daily budget within AGENT_MAX_ADS_CHANGE_USD" },
  pause_ad: { risk: "medium", autoAt: "autonomous", description: "Pause an underperforming ad/ad set" },
  create_ad: { risk: "high", autoAt: "never", description: "Create a new ad/ad set (always human-approved)" },
  publish_content: { risk: "medium", autoAt: "autonomous", description: "Publish a landing/blog page from a draft" },
  reply_support_email: { risk: "medium", autoAt: "autonomous", description: "Send a support reply to a customer" },
  apply_credit: { risk: "high", autoAt: "never", description: "Apply a Stripe credit/refund" },
  flag_account: { risk: "low", autoAt: "approval_required", description: "Flag an account for the founder (churn risk, compliance)" },
  notify_founder: { risk: "low", autoAt: "approval_required", description: "Email/SMS the founder a summary or ask" },
  draft: { risk: "low", autoAt: "draft_only", description: "Store a draft artifact for review (never executes anything)" },
};

export function currentAutonomy(): Autonomy {
  const v = (env.get("AGENT_AUTONOMY", "approval_required") ?? "approval_required").toLowerCase();
  return v === "autonomous" || v === "draft_only" ? v : "approval_required";
}

export type Decision = { requiresApproval: boolean; risk: Risk; reason: string };

/** Decide whether a task of `kind` may execute now without a human. Pure except for env reads. */
export function decide(kind: TaskKind, autonomy: Autonomy, payload: Record<string, unknown>): Decision {
  const rule = TASK_POLICY[kind];
  if (!rule) return { requiresApproval: true, risk: "high", reason: "unknown kind" };
  if (rule.autoAt === "never") return { requiresApproval: true, risk: rule.risk, reason: "policy: always human-approved" };
  if (ORDER[autonomy] < ORDER[rule.autoAt]) {
    return { requiresApproval: true, risk: rule.risk, reason: `autonomy ${autonomy} < required ${rule.autoAt}` };
  }
  if (kind === "update_ad_budget") {
    const delta = Math.abs(Number(payload.delta_usd ?? payload.new_daily_budget_usd ?? 0) - Number(payload.current_daily_budget_usd ?? 0));
    const cap = Number(env.get("AGENT_MAX_ADS_CHANGE_USD", "50"));
    if (!Number.isFinite(delta) || delta > cap) return { requiresApproval: true, risk: "high", reason: `budget change ${delta} > cap ${cap}` };
  }
  return { requiresApproval: false, risk: rule.risk, reason: "policy: auto" };
}

export function dailyCapFor(kind: TaskKind): number | null {
  const rule = TASK_POLICY[kind];
  if (!rule.dailyCapEnv) return null;
  const n = Number(env.get(rule.dailyCapEnv, "0"));
  return Number.isFinite(n) && n > 0 ? n : null;
}
