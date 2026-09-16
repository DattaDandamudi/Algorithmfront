import { test } from "node:test";
import assert from "node:assert/strict";
import { mapAzRocCsv, mapFlDbprCsv, mapTxRows } from "../lib/agents/integrations/license-boards";

test("TX rows map to prospects and skip inactive licenses", () => {
  const rows = mapTxRows([
    { license_type: "Air Conditioning Contractor", license_number: "TACLA1", business_name: "Cool Co", business_city: "Houston", business_state: "TX", business_zip: "77002", business_phone: "713-555-0100", owner_name: "Ana Ruiz", license_status: "Active" },
    { license_type: "Electrical Contractor", license_number: "E2", business_name: "Old Sparks", business_city: "Dallas", business_state: "TX", license_status: "Expired" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].trade, "hvac");
  assert.equal(rows[0].phone, "+17135550100");
  assert.equal(rows[0].external_ref, "TX:TACLA1");
});

test("AZ posting list keeps residential HVAC/plumbing/electrical only", () => {
  const csv = "License No,Business Name,DBA,Class,Class Detail,Class Type,Address,City,State,Zip,Qualifying Party,Status\n1,ACME LLC,Acme Cooling,R-39,Air Conditioning and Refrigeration,Residential,1 Main,Phoenix,AZ,85001,J Doe,Active\n2,Big Build,,B-1,General Commercial Contractor,Commercial,2 Main,Tempe,AZ,85281,K Lee,Active\n";
  const rows = mapAzRocCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].business_name, "Acme Cooling");
  assert.equal(rows[0].trade, "hvac");
});

test("FL extract maps license prefixes", () => {
  const csv = "License Number,DBA Name,City,Zip,Status\nCAC1819999,Sun Air Inc,Tampa,33602,Current\nCFC1429999,Bay Plumbing,Tampa,33603,Current\nCGC123,Some Builder,Tampa,33604,Current\n";
  const rows = mapFlDbprCsv(csv);
  assert.deepEqual(rows.map((r) => r.trade), ["hvac", "plumbing"]);
});
