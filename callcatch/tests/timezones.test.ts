import { test } from "node:test";
import assert from "node:assert/strict";
import { isSendWindow, nextSendSlot, timezoneForState } from "../lib/agents/pipelines/timezones";

test("send window is Mon-Fri 8am-6pm prospect local time", () => {
  assert.equal(timezoneForState("TX"), "America/Chicago");
  assert.equal(isSendWindow("TX", new Date("2026-09-15T15:00:00Z")), true); // 10am CDT Tuesday
  assert.equal(isSendWindow("TX", new Date("2026-09-15T04:00:00Z")), false); // 11pm CDT Monday
  assert.equal(isSendWindow("TX", new Date("2026-09-19T15:00:00Z")), false); // Saturday
});

test("nextSendSlot lands inside the window", () => {
  const slot = nextSendSlot("AZ", new Date("2026-09-19T15:00:00Z"));
  assert.ok(slot);
  assert.equal(isSendWindow("AZ", slot!), true);
});
