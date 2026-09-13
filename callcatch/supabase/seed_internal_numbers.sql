-- Registers CallCatch's OWN numbers (notification line + public demo line) under an internal account.
-- Run once after the migration, replacing the three placeholders. The internal account is any account you own
-- (sign up with the founder email first, then paste its id here). Both numbers must be toll-free-verified in Twilio.
--
--   :internal_account_id  -> uuid of the founder's account (select id from public.accounts where owner_user_id = ...)
--   :notification_number  -> E.164, must equal TWILIO_NOTIFICATION_NUMBER
--   :demo_number          -> E.164, must equal TWILIO_DEMO_NUMBER and NEXT_PUBLIC_DEMO_NUMBER

insert into public.numbers (account_id, phone_number, twilio_sid, type, purpose, voice_enabled, sms_enabled, verification_status, verified_at)
values
  ('00000000-0000-0000-0000-000000000000', '+18885550100', 'PN_NOTIFICATION_SID', 'tollfree', 'notification', true, true, 'verified', now()),
  ('00000000-0000-0000-0000-000000000000', '+18885550101', 'PN_DEMO_SID',         'tollfree', 'demo',         true, true, 'verified', now())
on conflict (phone_number) do update
  set purpose = excluded.purpose,
      sms_enabled = excluded.sms_enabled,
      verification_status = excluded.verification_status,
      verified_at = excluded.verified_at;
