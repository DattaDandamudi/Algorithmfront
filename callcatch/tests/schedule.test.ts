import { test } from "node:test";
import assert from "node:assert/strict";
import { dueRoles } from "../lib/agents/core/schedule";

test("orchestrator runs at 12 UTC every day; board only Mondays", () => {
  const mon = new Date("2026-09-14T12:10:00Z");
  const tue = new Date("2026-09-15T12:10:00Z");
  assert.ok(dueRoles(mon).includes("orchestrator"));
  assert.ok(dueRoles(mon).includes("board"));
  assert.ok(dueRoles(tue).includes("orchestrator"));
  assert.ok(!dueRoles(tue).includes("board"));
});

test("outreach never runs on weekends", () => {
  const sat = new Date("2026-09-19T14:05:00Z");
  assert.ok(!dueRoles(sat).includes("outreach"));
});
