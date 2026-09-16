import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleOutreachEmail } from "../lib/agents/integrations/email-outreach";

test("outreach email carries CAN-SPAM footer, unsubscribe link and one-click headers", () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://callcatch.co";
  process.env.OUTREACH_POSTAL_ADDRESS = "123 Main St, Austin, TX 78701";
  const m = assembleOutreachEmail({ prospectId: "11111111-1111-4111-8111-111111111111", to: "a@b.com", subject: "hi", bodyText: "Hello\n\nSecond paragraph" });
  assert.ok(m.text.includes("https://callcatch.co/u/11111111-1111-4111-8111-111111111111"));
  assert.ok(m.text.includes("123 Main St"));
  assert.ok(m.html.includes("<p"));
  assert.equal(m.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});
