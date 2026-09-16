import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreProspect } from "../lib/agents/pipelines/scoring";

test("ideal owner-operator scores high; franchise scores low", () => {
  const good = scoreProspect({ business_name: "Summit Air", trade: "hvac", review_count: 140, rating: 4.7, website: "https://x.com", phone: "+15125550100", runs_meta_ads: true, uses_software: "Jobber", notes: { emergency: true } });
  assert.ok(good >= 90, String(good));
  const franchise = scoreProspect({ business_name: "One Hour Heating & Air", trade: "hvac", review_count: 2000, rating: 4.8, website: "https://x.com", phone: "+15125550100" });
  assert.ok(franchise < good - 25);
  const st = scoreProspect({ business_name: "Big Corp", trade: "hvac", review_count: 100, rating: 4.5, website: "https://x.com", phone: "+1", uses_software: "ServiceTitan" });
  assert.ok(st < good);
});
