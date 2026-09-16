import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, TASK_POLICY } from "../lib/agents/core/policy";
import { TASK_KINDS, type Autonomy } from "../lib/agents/core/types";

const LEVELS: Autonomy[] = ["draft_only", "approval_required", "autonomous"];

test("every task kind has a policy rule", () => {
  for (const k of TASK_KINDS) assert.ok(TASK_POLICY[k], k);
});

test("create_ad and apply_credit always need a human", () => {
  for (const level of LEVELS) {
    assert.equal(decide("create_ad", level, {}).requiresApproval, true);
    assert.equal(decide("apply_credit", level, {}).requiresApproval, true);
  }
});

test("draft executes at every level; outreach only when autonomous", () => {
  for (const level of LEVELS) assert.equal(decide("draft", level, {}).requiresApproval, false);
  assert.equal(decide("send_outreach_email", "approval_required", {}).requiresApproval, true);
  assert.equal(decide("send_outreach_email", "autonomous", {}).requiresApproval, false);
});

test("ad budget changes above the cap need approval even when autonomous", () => {
  process.env.AGENT_MAX_ADS_CHANGE_USD = "50";
  assert.equal(decide("update_ad_budget", "autonomous", { current_daily_budget_usd: 30, new_daily_budget_usd: 60 }).requiresApproval, false);
  assert.equal(decide("update_ad_budget", "autonomous", { current_daily_budget_usd: 30, new_daily_budget_usd: 120 }).requiresApproval, true);
});
