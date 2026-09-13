-- =============================================================================
-- CallCatch — demo seed (HVAC contractor "Summit Air Heating & Cooling", Austin TX)
--
-- Hosted Supabase does not allow inserting into auth.users from SQL, so this seed
-- attaches the demo data to an EXISTING auth user:
--   1. Sign up once through the app (/signup) or Dashboard > Authentication > Add user.
--      Prefer the email demo@callcatch.co — the seed picks that user first, otherwise
--      the oldest auth.users row.
--   2. Run this file (supabase db reset applies it automatically after migrations,
--      or paste it into the SQL editor / `psql -f supabase/seed.sql`).
-- The signup trigger already created the user's account; the seed fills it in and
-- adds realistic rows. Re-running is safe (fixed UUIDs + upserts). If no auth user
-- exists yet the block prints a NOTICE and does nothing.
-- =============================================================================

do $$
declare
  v_user_id     uuid;
  v_account_id  uuid;
  v_code        text;
  -- fixed ids so re-runs upsert instead of duplicating
  v_number_id   uuid := 'a1000000-0000-4000-8000-000000000001';
  v_contact_id  uuid := 'a2000000-0000-4000-8000-000000000001';
  v_contact2_id uuid := 'a2000000-0000-4000-8000-000000000002';
  v_conv_id     uuid := 'a3000000-0000-4000-8000-000000000001';
  v_call_id     uuid := 'a4000000-0000-4000-8000-000000000001';
  v_lead1_id    uuid := 'a5000000-0000-4000-8000-000000000001';
  v_lead2_id    uuid := 'a5000000-0000-4000-8000-000000000002';
  v_alert_id    uuid := 'a6000000-0000-4000-8000-000000000001';
  v_src1_id     uuid := 'a7000000-0000-4000-8000-000000000001';
  v_src2_id     uuid := 'a7000000-0000-4000-8000-000000000002';
  v_sub_id      uuid := 'a8000000-0000-4000-8000-000000000001';
  v_report_id   uuid := 'a9000000-0000-4000-8000-000000000001';
  v_call_sid    text := 'CA7d1f3c2b9e8a4f6d0c5b1a2e3f4d5c6b';
  v_t0          timestamptz := '2026-09-12 14:03:00-05'; -- Friday afternoon, Austin
begin
  -- 1. pick the demo owner --------------------------------------------------
  select u.id into v_user_id
  from auth.users u
  order by (lower(coalesce(u.email, '')) = 'demo@callcatch.co') desc, u.created_at asc
  limit 1;

  if v_user_id is null then
    raise notice 'seed: no auth.users row found - sign up a user first, then re-run the seed.';
    return;
  end if;

  -- 2. the account (normally created by the signup trigger) --------------------
  select m.account_id into v_account_id
  from public.account_members m
  where m.user_id = v_user_id
  order by m.created_at asc
  limit 1;

  if v_account_id is null then
    insert into public.accounts (owner_user_id, alert_email, status, referral_code)
    values (
      v_user_id,
      (select email from auth.users where id = v_user_id),
      'onboarding',
      public.generate_referral_code(8)
    )
    returning id into v_account_id;

    insert into public.account_members (account_id, user_id, role)
    values (v_account_id, v_user_id, 'owner')
    on conflict do nothing;
  end if;

  update public.accounts set
    legal_name          = 'Summit Air Heating & Cooling LLC',
    dba                 = 'Summit Air',
    website             = 'https://summitair-austin.example.com',
    address_line1       = '2200 S Lamar Blvd, Suite 140',
    city                = 'Austin',
    state               = 'TX',
    zip                 = '78704',
    ein                 = '87-1234567',
    is_sole_prop        = false,
    trade               = 'hvac',
    timezone            = 'America/Chicago',
    business_phone      = '+15125550100',
    service_area        = jsonb_build_object(
                            'center', 'Austin, TX',
                            'radius_miles', 25,
                            'zips', jsonb_build_array('78701','78702','78703','78704','78705','78722','78723','78731','78745','78748','78749','78756','78757','78758','78759')
                          ),
    hours               = jsonb_build_object(
                            'mon', jsonb_build_array('07:30','18:00'),
                            'tue', jsonb_build_array('07:30','18:00'),
                            'wed', jsonb_build_array('07:30','18:00'),
                            'thu', jsonb_build_array('07:30','18:00'),
                            'fri', jsonb_build_array('07:30','18:00'),
                            'sat', jsonb_build_array('08:00','14:00'),
                            'sun', null
                          ),
    emergency_service   = true,
    on_call_phone       = '+15125550188',
    booking_url         = 'https://calendly.com/summit-air/service-visit',
    tone                = 'friendly',
    ai_profile          = jsonb_build_object(
                            'services', jsonb_build_array(
                              'AC repair', 'AC replacement', 'Furnace repair', 'Furnace tune-up',
                              'Heat pump install', 'Duct cleaning', 'Thermostat install', 'Mini-split install'
                            ),
                            'never_say', jsonb_build_array(
                              'Do not quote an exact price', 'Do not promise a same-day slot',
                              'Do not diagnose refrigerant leaks over text', 'Do not discuss competitors'
                            ),
                            'price_ranges', jsonb_build_object(
                              'diagnostic_visit', '$89 (waived with repair)',
                              'ac_repair', '$150-$900',
                              'furnace_tune_up', '$129',
                              'system_replacement', '$6,500-$14,000'
                            ),
                            'brands', jsonb_build_array('Carrier', 'Trane', 'Lennox', 'Goodman')
                          ),
    avg_ticket_usd      = 485,
    quiet_start         = '08:00',
    quiet_end           = '21:00',
    alert_phone         = '+15125550177',
    alert_phone_verified = true,
    alert_email         = coalesce(alert_email, 'owner@summitair-austin.example.com'),
    status              = 'live',
    stripe_customer_id  = coalesce(stripe_customer_id, 'cus_demo_summitair'),
    plan                = 'pro'
  where id = v_account_id;

  select referral_code into v_code from public.accounts where id = v_account_id;

  -- 3. the customer's toll-free number (verified, SMS live) ------------------------
  insert into public.numbers (
    id, account_id, phone_number, twilio_sid, type, purpose, voice_enabled, sms_enabled,
    verification_status, verification_sid, verification_submitted_at, verified_at
  ) values (
    v_number_id, v_account_id, '+18885550199', 'PN3f9a1c7e5b2d4f6a8c0e1b3d5f7a9c2e', 'tollfree', 'customer', true, true,
    'verified', 'HH2c4e6a8b0d1f3a5c7e9b1d3f5a7c9e0b', v_t0 - interval '9 days', v_t0 - interval '2 days'
  )
  on conflict (phone_number) do update set
    account_id = excluded.account_id,
    sms_enabled = excluded.sms_enabled,
    verification_status = excluded.verification_status,
    verified_at = excluded.verified_at;

  -- 4. contacts ------------------------------------------------------------------
  insert into public.contacts (id, account_id, phone, name, email, address, consent_source, consent_evidence)
  values (
    v_contact_id, v_account_id, '+15125550142', 'Maria Delgado', null,
    '4812 Shoal Creek Blvd, Austin, TX 78756', 'inbound_call',
    jsonb_build_object('call_sid', v_call_sid, 'called_at', v_t0, 'to', '+18885550199', 'forwarded_from', '+15125550100')
  )
  on conflict (account_id, phone) do update set
    name = excluded.name, address = excluded.address, consent_source = excluded.consent_source,
    consent_evidence = excluded.consent_evidence;

  insert into public.contacts (id, account_id, phone, name, email, address, consent_source, consent_evidence)
  values (
    v_contact2_id, v_account_id, '+15125550163', 'Devon Price', 'devon.price@example.com',
    '901 Brentwood St, Austin, TX 78757', 'web_form',
    jsonb_build_object('form', 'website-contact', 'submitted_at', '2026-09-13 09:14:00-05',
                       'sms_disclosure', 'By submitting you agree to receive text messages from Summit Air.')
  )
  on conflict (account_id, phone) do update set
    name = excluded.name, email = excluded.email, address = excluded.address,
    consent_source = excluded.consent_source, consent_evidence = excluded.consent_evidence;

  -- 5. the missed call (went to the greeting, caller left a voicemail) --------------
  insert into public.calls (
    id, account_id, number_id, contact_id, twilio_call_sid, from_phone, to_phone, forwarded_from,
    status, recording_url, recording_duration, transcript, summary, is_emergency, started_at
  ) values (
    v_call_id, v_account_id, v_number_id, v_contact_id, v_call_sid, '+15125550142', '+18885550199', '+15125550100',
    'voicemail',
    'https://api.twilio.com/2010-04-01/Accounts/ACdemo/Recordings/RE5a7c9e1b3d5f7a9c2e4b6d8f0a1c3e5b',
    23,
    'Hi, this is Maria Delgado. Our AC quit blowing cold air this morning and it is already 96 out. We have a newborn at home so we really need someone today if possible. Please call me back at 512 555 0142.',
    'AC not cooling since this morning; newborn in the home; wants same-day service. Callback 512-555-0142.',
    false,
    v_t0
  )
  on conflict (twilio_call_sid) do update set
    account_id = excluded.account_id, number_id = excluded.number_id, contact_id = excluded.contact_id,
    status = excluded.status, transcript = excluded.transcript, summary = excluded.summary;

  -- 6. the text-back conversation -----------------------------------------------
  insert into public.conversations (
    id, account_id, contact_id, number_id, channel, source, status, ai_paused,
    last_message_at, turn_count, counted_for_usage
  ) values (
    v_conv_id, v_account_id, v_contact_id, v_number_id, 'sms', 'missed_call', 'qualified', false,
    v_t0 + interval '4 minutes 41 seconds', 2, true
  )
  on conflict (id) do update set
    account_id = excluded.account_id, contact_id = excluded.contact_id, number_id = excluded.number_id,
    status = excluded.status, last_message_at = excluded.last_message_at, turn_count = excluded.turn_count;

  -- messages are keyed by (conversation, twilio_sid); wipe and re-insert for a clean re-run
  delete from public.messages where conversation_id = v_conv_id;

  insert into public.messages (
    conversation_id, account_id, direction, author, body, twilio_sid, status, segments,
    model, tokens_in, tokens_out, cost_usd, created_at
  ) values
  (
    v_conv_id, v_account_id, 'out', 'ai',
    'Hi, this is Summit Air Heating & Cooling - sorry we missed your call! I''m the front-desk assistant. What''s going on with your system today? Reply STOP to opt out.',
    'SM1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d', 'delivered', 2,
    'claude-sonnet-5', 1842, 61, 0.0028, v_t0 + interval '9 seconds'
  ),
  (
    v_conv_id, v_account_id, 'in', 'contact',
    'AC stopped blowing cold air this morning. It''s 96 out and we have a newborn at home',
    'SM2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e', 'received', 1,
    null, 0, 0, 0, v_t0 + interval '2 minutes 30 seconds'
  ),
  (
    v_conv_id, v_account_id, 'out', 'ai',
    'So sorry to hear that - with a newborn in the house we''ll treat this as a priority. What''s the service address or ZIP so I can confirm you''re in our area?',
    'SM3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f', 'delivered', 1,
    'claude-sonnet-5', 1911, 44, 0.0026, v_t0 + interval '2 minutes 36 seconds'
  ),
  (
    v_conv_id, v_account_id, 'in', 'contact',
    '4812 Shoal Creek Blvd, Austin 78756. Any time after 3 works, I''ll be home',
    'SM4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a', 'received', 1,
    null, 0, 0, 0, v_t0 + interval '4 minutes 41 seconds'
  );

  -- 7. leads ---------------------------------------------------------------------
  insert into public.leads (
    id, account_id, conversation_id, contact_id, source, name, phone, address, zip, issue, urgency,
    preferred_window, status, est_value_usd, raw
  ) values (
    v_lead1_id, v_account_id, v_conv_id, v_contact_id, 'missed_call', 'Maria Delgado', '+15125550142',
    '4812 Shoal Creek Blvd, Austin, TX 78756', '78756',
    'AC not cooling - blowing warm air since this morning; newborn in the home',
    'today', 'Today after 3:00 PM', 'qualified', 485,
    jsonb_build_object('call_sid', v_call_sid, 'extracted_by', 'claude-haiku-4-5', 'confidence', 0.94)
  )
  on conflict (id) do update set
    account_id = excluded.account_id, conversation_id = excluded.conversation_id, contact_id = excluded.contact_id,
    issue = excluded.issue, urgency = excluded.urgency, status = excluded.status;

  insert into public.leads (
    id, account_id, conversation_id, contact_id, source, name, phone, address, zip, issue, urgency,
    preferred_window, status, est_value_usd, external_ref, raw
  ) values (
    v_lead2_id, v_account_id, null, v_contact2_id, 'web_form', 'Devon Price', '+15125550163',
    '901 Brentwood St, Austin, TX 78757', '78757',
    'Furnace tune-up before winter; system is about 12 years old and made a rattling noise last season',
    'flexible', 'Weekday mornings', 'new', 129, 'webform-2026-09-13-000417',
    jsonb_build_object(
      'form', 'website-contact',
      'fields', jsonb_build_object('service', 'Furnace tune-up', 'message', 'Rattling noise last winter, want it checked before it gets cold.'),
      'utm_source', 'facebook', 'utm_campaign', 'fall-tuneup-2026'
    )
  )
  on conflict (id) do update set
    account_id = excluded.account_id, contact_id = excluded.contact_id,
    issue = excluded.issue, urgency = excluded.urgency, status = excluded.status;

  -- 8. owner alert for the hot lead ----------------------------------------------
  insert into public.alerts (id, account_id, lead_id, call_id, channel, sent_at, twilio_sid, status)
  values (v_alert_id, v_account_id, v_lead1_id, v_call_id, 'sms', v_t0 + interval '4 minutes 50 seconds',
          'SM5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b', 'delivered')
  on conflict (id) do update set account_id = excluded.account_id, lead_id = excluded.lead_id, call_id = excluded.call_id;

  -- 9. lead sources (Pro): per-account inbox + generic webhook -------------------------
  insert into public.lead_sources (id, account_id, type, inbound_email, enabled)
  values (v_src1_id, v_account_id, 'resend_inbox', 'acct-' || v_code || '@leads.callcatch.co', true)
  on conflict (id) do update set account_id = excluded.account_id, inbound_email = excluded.inbound_email;

  insert into public.lead_sources (id, account_id, type, webhook_secret, enabled)
  values (v_src2_id, v_account_id, 'webhook', 'whsec_demo_' || v_code || '_rotate_me', true)
  on conflict (id) do update set account_id = excluded.account_id;

  -- 10. billing snapshot (normally written only by the Stripe webhook) -----------------
  insert into public.subscriptions (
    id, account_id, stripe_subscription_id, stripe_price_id, plan, interval, status,
    trial_end, current_period_end, setup_fee_paid, paid_now, cancel_at_period_end
  ) values (
    v_sub_id, v_account_id, 'sub_demo_summitair', 'price_demo_pro_monthly', 'pro', 'month', 'active',
    null, v_t0 + interval '26 days', true, true, false
  )
  on conflict (account_id) do update set
    plan = excluded.plan, interval = excluded.interval, status = excluded.status,
    current_period_end = excluded.current_period_end;

  insert into public.usage_monthly (account_id, period, conversations, sms_segments_out, sms_segments_in, voice_minutes, ai_cost_usd)
  values (v_account_id, '2026-09-01', 37, 112, 71, 14.5, 1.87)
  on conflict (account_id, period) do update set
    conversations = excluded.conversations, sms_segments_out = excluded.sms_segments_out,
    sms_segments_in = excluded.sms_segments_in, voice_minutes = excluded.voice_minutes,
    ai_cost_usd = excluded.ai_cost_usd;

  -- 11. last week's report ------------------------------------------------------------
  insert into public.weekly_reports (id, account_id, week_start, stats, sent_at)
  values (
    v_report_id, v_account_id, '2026-08-31',
    jsonb_build_object('missedCalls', 19, 'textedBack', 19, 'replied', 12, 'qualified', 9, 'booked', 6,
                       'avgTicketUsd', 485, 'estimatedRevenueUsd', 2910,
                       'topIssues', jsonb_build_array(
                         jsonb_build_object('issue', 'AC not cooling', 'count', 7),
                         jsonb_build_object('issue', 'Thermostat', 'count', 3),
                         jsonb_build_object('issue', 'Tune-up', 'count', 2))),
    '2026-09-07 07:04:00-05'
  )
  on conflict (account_id, week_start) do update set stats = excluded.stats, sent_at = excluded.sent_at;

  -- 12. analytics events ----------------------------------------------------------------
  insert into public.events (account_id, user_id, name, props, occurred_at)
  select v_account_id, v_user_id, e.name, e.props, e.occurred_at
  from (values
    ('verified',       jsonb_build_object('number', '+18885550199'),           v_t0 - interval '2 days'),
    ('first_textback', jsonb_build_object('conversation_id', v_conv_id),      v_t0 + interval '9 seconds'),
    ('first_lead',     jsonb_build_object('lead_id', v_lead1_id),             v_t0 + interval '4 minutes 45 seconds')
  ) as e(name, props, occurred_at)
  where not exists (
    select 1 from public.events x where x.account_id = v_account_id and x.name = e.name
  );

  raise notice 'seed: demo data attached to account % (owner user %, referral code %)', v_account_id, v_user_id, v_code;
end;
$$;
