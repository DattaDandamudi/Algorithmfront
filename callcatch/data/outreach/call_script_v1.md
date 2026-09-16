# Cold call script v1 (business landlines, human-dialed)

**Open (10 s):** "Hi, this is {{founder_name}} with CallCatch, a small software company in {{founder_city}}. Is this the owner?"
**Reason (20 s):** "When your line goes to voicemail, we text the caller back in ten seconds, ask what's wrong and where, and send you a lead you can call back. $79 a month, no contract."
**Demo (30 s):** "Can I show you? Call your own number from your cell right now and don't pick up. Watch the text."
**Close (30 s):** "Want me to set it up with you? Twenty minutes, you hang up live. Tuesday 10 or Wednesday 2?"

**Objections**
- *Already have an answering service* → "Keep it. We're the net for the calls they miss and for nights."
- *Robocall worries* → "We only text people who called you first; STOP is honored instantly."
- *Price* → "One recovered $350 repair pays for a year."
- *Verification delay* → "Alerts and voicemail transcripts work day one; texting turns on when carriers verify, 3–10 business days, and you're not charged until then."
- *Send me info* → "Sure, what's the best email? I'll include the demo line so you can hear it yourself." (then step-1 email, `force_reply`)

**Voicemail (< 20 s):** "Hi, {{founder_name}} from CallCatch. We text back the calls you miss and book the job. Call {{demo_number}} and hang up when we call back to see it. My number is {{callback_number}}."

**Rules:** landline / fixed VoIP only from the list (the prospector tags line types); mobiles manual-dial after DNC scrub only; company name in the first 10 seconds; log disposition + date on every attempt (5-year TSR records); never text a prospect.
