# Outreach email sequence v1 (cold email to contractor owners)

Source of truth for the agent: `lib/agents/prompts/sales.ts`. Merge fields: `{{business_name}}`, `{{first_name}}`,
`{{city}}`, `{{review_count}}`, `{{missed_calls_estimate}}`, `{{demo_number}}`, `{{trial_url}}`, `{{booking_url}}`, `{{founder_name}}`.
Rules: plain text, < 140 words, one number the owner recognizes, the demo line, one ask. Mon–Fri 8am–6pm local. Stop on any reply.

| Step | Day | Subject variants | Goal |
|---|---|---|---|
| 1 | 0 | `the calls {{business_name}} misses` / `quick one about missed calls, {{first_name}}` | reply or a demo-line call |
| 2 | 3 | `re: the calls {{business_name}} misses` / `what the text-back actually says` | show the real first text |
| 3 | 7 | `the math for {{business_name}}` / `$79 vs one missed install` | ROI + 20-min setup call |
| 4 | 14 | `closing the loop` / `should I stop emailing, {{first_name}}?` | polite close |

## Reply handling
| Reply | Action |
|---|---|
| interested / "call me" | `schedule_call` (founder), status `demo_booked` when a time is named |
| question | one short answer, `force_reply` email |
| not now | `next_touch_at` +60 days |
| wrong person | ask for the owner's email once |
| unsubscribe / hostile | `do_not_contact` immediately |

## Deliverability warm-up (new sending domain)
Day 1–3: 10/day · Day 4–7: 20/day · Week 2: 30/day · Week 3: 45/day · Week 4+: 60/day (`AGENT_MAX_EMAILS_PER_DAY`).
SPF + DKIM + DMARC (p=none → quarantine after 30 days), one-click unsubscribe headers (sent by the executor), bounce < 2%, complaints < 0.1%.
Use a secondary domain (e.g. `callcatch.io`) for cold email so the product domain's reputation is never at risk.
