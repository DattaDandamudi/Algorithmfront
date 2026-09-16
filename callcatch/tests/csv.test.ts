import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTrade, normalizeUsPhone, parseCsv, parseProspectsCsv, toCsv } from "../lib/agents/pipelines/csv";

test("parseCsv handles quotes, commas and CRLF", () => {
  const rows = parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n');
  assert.deepEqual(rows, [["a", "b"], ["x, y", 'he said "hi"']]);
});

test("parseProspectsCsv maps aliases and normalizes", () => {
  const { rows, skipped } = parseProspectsCsv("Name,Category,Phone Number,Website,City,State,Reviews\nAcme Air,Air Conditioning Contractor,(512) 555-0100,acmeair.com,Austin,tx,120\n,Plumbing,512-555-0101,,Austin,TX,3\n");
  assert.equal(skipped, 1);
  assert.equal(rows[0].business_name, "Acme Air");
  assert.equal(rows[0].trade, "hvac");
  assert.equal(rows[0].phone, "+15125550100");
  assert.equal(rows[0].website, "https://acmeair.com");
  assert.equal(rows[0].state, "TX");
  assert.equal(rows[0].review_count, 120);
});

test("normalizers", () => {
  assert.equal(normalizeTrade("Plumbing Contractor"), "plumbing");
  assert.equal(normalizeTrade("Electrical"), "electrical");
  assert.equal(normalizeUsPhone("1-800-555-0199"), "+18005550199");
  assert.equal(normalizeUsPhone("12345"), null);
  assert.ok(toCsv([{ a: 'x,"y"', b: 1 }]).includes('"x,""y"""'));
});
