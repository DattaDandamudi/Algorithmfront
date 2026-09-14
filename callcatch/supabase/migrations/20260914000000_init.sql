-- =============================================================================
-- CallCatch — initial schema
-- Source of truth: docs/PRODUCT_SPEC.md §4.1 and docs/BUILD_CONTRACTS.md.
-- Conventions:
--   * enums are text + CHECK constraints
--   * every account-scoped table has account_id -> accounts(id) on delete cascade
--   * created_at defaults to now(); updated_at is maintained by a trigger
--   * RLS on every table; membership resolved through public.is_account_member()
--   * the service role bypasses RLS (server routes, webhooks, crons)
-- The file is idempotent enough to be re-run in the SQL editor (drop/if-not-exists guards).
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Helper: updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Helper: referral code generator (URL-safe alphabet, no 0/O/1/l/i)
-- Uses gen_random_uuid() (pg_strong_random) so it is portable to local Postgres.
-- -----------------------------------------------------------------------------
create or replace function public.generate_referral_code(len integer default 8)
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  bytes bytea;
  code text := '';
  i integer;
begin
  if len is null or len < 4 or len > 32 then
    raise exception 'generate_referral_code: len must be between 4 and 32';
  end if;
  for i in 0..len - 1 loop
    if i % 16 = 0 then
      bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    end if;
    code := code || substr(alphabet, (get_byte(bytes, i % 16) % length(alphabet)) + 1, 1);
  end loop;
  return code;
end;
$$;

-- =============================================================================
-- TABLES
-- =============================================================================

-- accounts -------------------------------------------------------------------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  legal_name text,
  dba text,
  website text,
  address_line1 text,
  city text,
  state char(2),
  zip text,
  ein text,
  is_sole_prop boolean not null default false,
  trade text check (trade in ('hvac', 'plumbing', 'electrical', 'other')),
  timezone text,
  business_phone text,
  service_area jsonb not null default '{}'::jsonb,
  hours jsonb not null default '{}'::jsonb,
  emergency_service boolean not null default false,
  on_call_phone text,
  booking_url text,
  tone text,
  ai_profile jsonb not null default '{}'::jsonb,
  avg_ticket_usd numeric not null default 450,
  quiet_start time not null default '08:00',
  quiet_end time not null default '21:00',
  alert_phone text,
  alert_phone_verified boolean not null default false,
  alert_email text,
  status text not null default 'onboarding'
    check (status in ('onboarding', 'pending_verification', 'live', 'paused', 'cancelled')),
  stripe_customer_id text unique,
  plan text check (plan in ('starter', 'pro')),
  referral_code text not null unique,
  referred_by_account_id uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists accounts_owner_user_id_idx on public.accounts (owner_user_id);
create index if not exists accounts_status_idx on public.accounts (status);

-- account_members --------------------------------------------------------------
create table if not exists public.account_members (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, user_id)
);
create index if not exists account_members_user_id_idx on public.account_members (user_id);

-- numbers ----------------------------------------------------------------------
create table if not exists public.numbers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  phone_number text not null unique,
  twilio_sid text,
  type text not null default 'tollfree' check (type in ('tollfree', 'local')),
  purpose text not null default 'customer' check (purpose in ('customer', 'notification', 'demo')),
  voice_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  verification_status text not null default 'not_submitted'
    check (verification_status in ('not_submitted', 'pending', 'in_review', 'verified', 'rejected')),
  verification_sid text,
  verification_submitted_at timestamptz,
  verified_at timestamptz,
  rejection_reason text,
  tendlc_brand_sid text,
  tendlc_campaign_sid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint numbers_phone_number_e164 check (phone_number ~ '^\+[1-9][0-9]{6,14}$')
);
create index if not exists numbers_account_id_idx on public.numbers (account_id);
create index if not exists numbers_verification_status_idx on public.numbers (verification_status);

-- contacts ---------------------------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  phone text not null,
  name text,
  email text,
  address text,
  opted_out boolean not null default false,
  opted_out_at timestamptz,
  consent_source text check (consent_source in ('inbound_call', 'lead_form', 'web_form', 'inbound_sms', 'manual')),
  consent_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, phone)
);
create index if not exists contacts_account_id_phone_idx on public.contacts (account_id, phone);

-- conversations ----------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  number_id uuid references public.numbers(id) on delete set null,
  channel text not null default 'sms' check (channel in ('sms', 'email')),
  source text not null check (source in ('missed_call', 'lead_form', 'web_form', 'inbound_sms', 'manual')),
  status text not null default 'open' check (status in ('open', 'qualified', 'booked', 'lost', 'closed')),
  ai_paused boolean not null default false,
  paused_by_user_id uuid references auth.users(id) on delete set null,
  last_message_at timestamptz,
  turn_count integer not null default 0,
  counted_for_usage boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_account_id_created_at_idx
  on public.conversations (account_id, created_at desc);
create index if not exists conversations_account_id_last_message_at_idx
  on public.conversations (account_id, last_message_at desc nulls last);
create index if not exists conversations_contact_id_idx on public.conversations (contact_id);

-- messages ---------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  author text not null check (author in ('ai', 'owner', 'contact', 'system')),
  body text not null,
  twilio_sid text,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'failed', 'received')),
  error_code text,
  segments integer not null default 1,
  model text,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_usd numeric not null default 0,
  -- when a queued outbound message may be sent (quiet-hours queue); null = immediately
  send_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists messages_account_id_created_at_idx
  on public.messages (account_id, created_at desc);
create index if not exists messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at);
create index if not exists messages_twilio_sid_idx on public.messages (twilio_sid) where twilio_sid is not null;
create index if not exists messages_queued_idx
  on public.messages (send_after, created_at) where status = 'queued' and direction = 'out';

-- calls ------------------------------------------------------------------------
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  number_id uuid references public.numbers(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  twilio_call_sid text not null unique,
  from_phone text not null,
  to_phone text not null,
  forwarded_from text,
  status text not null default 'missed'
    check (status in ('missed', 'voicemail', 'answered_by_greeting', 'test')),
  recording_url text,
  recording_duration integer,
  transcript text,
  summary text,
  is_emergency boolean not null default false,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calls_account_id_created_at_idx on public.calls (account_id, created_at desc);
create index if not exists calls_contact_id_idx on public.calls (contact_id);

-- leads ------------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  source text not null default 'missed_call',
  name text,
  phone text not null,
  address text,
  zip text,
  issue text,
  urgency text check (urgency in ('emergency', 'today', 'this_week', 'flexible')),
  preferred_window text,
  status text not null default 'new' check (status in ('new', 'qualified', 'booked', 'lost')),
  est_value_usd numeric,
  booked_at timestamptz,
  lost_reason text,
  external_ref text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_account_id_created_at_idx on public.leads (account_id, created_at desc);
create index if not exists leads_account_id_status_idx on public.leads (account_id, status);
create index if not exists leads_conversation_id_idx on public.leads (conversation_id);
create index if not exists leads_contact_id_idx on public.leads (contact_id);
-- idempotent intake: the same Meta leadgen_id / form submission never creates two leads
create unique index if not exists leads_account_id_external_ref_key
  on public.leads (account_id, external_ref) where external_ref is not null;

-- alerts -----------------------------------------------------------------------
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  call_id uuid references public.calls(id) on delete set null,
  channel text not null check (channel in ('sms', 'email', 'voice')),
  sent_at timestamptz,
  twilio_sid text,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'received')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists alerts_account_id_created_at_idx on public.alerts (account_id, created_at desc);

-- subscriptions ----------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.accounts(id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_price_id text,
  plan text check (plan in ('starter', 'pro')),
  interval text check (interval in ('month', 'year')),
  status text not null default 'incomplete'
    check (status in ('trialing', 'active', 'past_due', 'paused', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid')),
  trial_end timestamptz,
  current_period_end timestamptz,
  setup_fee_paid boolean not null default false,
  paid_now boolean not null default false,
  cancel_at_period_end boolean not null default false,
  pause_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- usage_monthly ----------------------------------------------------------------
create table if not exists public.usage_monthly (
  account_id uuid not null references public.accounts(id) on delete cascade,
  period date not null check (period = date_trunc('month', period)::date),
  conversations integer not null default 0,
  sms_segments_out integer not null default 0,
  sms_segments_in integer not null default 0,
  voice_minutes numeric not null default 0,
  ai_cost_usd numeric not null default 0,
  overage_reported boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, period)
);

-- verification_events ----------------------------------------------------------
create table if not exists public.verification_events (
  id uuid primary key default gen_random_uuid(),
  number_id uuid not null references public.numbers(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  status text not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists verification_events_number_id_idx on public.verification_events (number_id);
create index if not exists verification_events_account_id_idx on public.verification_events (account_id);

-- lead_sources -----------------------------------------------------------------
create table if not exists public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  type text not null check (type in ('resend_inbox', 'webhook', 'zapier', 'meta_page')),
  inbound_email text unique,
  webhook_secret text,
  meta_page_id text,
  meta_form_ids text[],
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lead_sources_account_id_idx on public.lead_sources (account_id);
create index if not exists lead_sources_meta_page_id_idx on public.lead_sources (meta_page_id) where meta_page_id is not null;

-- events (append-only analytics log; also the CAPI source) ---------------------
create table if not exists public.events (
  id bigserial primary key,
  account_id uuid references public.accounts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists events_name_occurred_at_idx on public.events (name, occurred_at);
create index if not exists events_account_id_occurred_at_idx on public.events (account_id, occurred_at desc);

-- weekly_reports ---------------------------------------------------------------
create table if not exists public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  week_start date not null,
  stats jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, week_start)
);

-- referrals --------------------------------------------------------------------
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_account_id uuid not null references public.accounts(id) on delete cascade,
  referred_account_id uuid not null references public.accounts(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'rewarded')),
  stripe_coupon_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (referred_account_id),
  check (referrer_account_id <> referred_account_id)
);
create index if not exists referrals_referrer_account_id_idx on public.referrals (referrer_account_id);

-- admin_notes (service role only) ---------------------------------------------
create table if not exists public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  note text not null,
  author_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists admin_notes_account_id_idx on public.admin_notes (account_id);

-- =============================================================================
-- updated_at triggers on every table that has the column
-- =============================================================================
do $$
declare
  t text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'updated_at'
      and tb.table_type = 'BASE TABLE'
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;

-- =============================================================================
-- Membership helper used by every policy (SECURITY DEFINER avoids recursive RLS
-- on account_members). STABLE so the planner caches it per statement.
-- =============================================================================
create or replace function public.is_account_member(account uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.account_members m
    where m.account_id = account
      and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_account_member(uuid) from public;
grant execute on function public.is_account_member(uuid) to authenticated, service_role;

revoke all on function public.generate_referral_code(integer) from public;
grant execute on function public.generate_referral_code(integer) to service_role;

-- =============================================================================
-- Signup trigger: auth.users insert -> accounts (onboarding) + account_members (owner)
-- Optional signup metadata honored: raw_user_meta_data.referral_code (referrer's code)
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_account_id uuid;
  code text;
  attempts integer := 0;
  referrer uuid;
  ref_code text;
begin
  ref_code := nullif(trim(new.raw_user_meta_data ->> 'referral_code'), '');
  if ref_code is not null then
    select a.id into referrer
    from public.accounts a
    where a.referral_code = lower(ref_code)
    limit 1;
  end if;

  loop
    code := public.generate_referral_code(8);
    begin
      insert into public.accounts (owner_user_id, alert_email, status, referral_code, referred_by_account_id)
      values (new.id, new.email, 'onboarding', code, referrer)
      returning id into new_account_id;
      exit;
    exception
      when unique_violation then
        attempts := attempts + 1;
        if attempts >= 10 then
          raise;
        end if;
    end;
  end loop;

  insert into public.account_members (account_id, user_id, role)
  values (new_account_id, new.id, 'owner')
  on conflict (account_id, user_id) do nothing;

  if referrer is not null then
    insert into public.referrals (referrer_account_id, referred_account_id, status)
    values (referrer, new_account_id, 'pending')
    on conflict (referred_account_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.accounts            enable row level security;
alter table public.account_members     enable row level security;
alter table public.numbers             enable row level security;
alter table public.contacts            enable row level security;
alter table public.conversations       enable row level security;
alter table public.messages            enable row level security;
alter table public.calls               enable row level security;
alter table public.leads               enable row level security;
alter table public.alerts              enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.usage_monthly       enable row level security;
alter table public.verification_events enable row level security;
alter table public.lead_sources        enable row level security;
alter table public.events              enable row level security;
alter table public.weekly_reports      enable row level security;
alter table public.referrals           enable row level security;
alter table public.admin_notes         enable row level security;

-- -----------------------------------------------------------------------------
-- Writer model (enforced here, not just by convention):
--
--   * MEMBER-WRITABLE (signed-in members of the account, through the anon key + RLS):
--       contacts, conversations, messages, calls, leads  -> select / insert / update
--       leads, contacts                                   -> delete (clean-up of own data)
--       events                                            -> insert (own account, own user_id)
--     These are the tables the dashboard's inbox / leads Server Functions write with the
--     user-scoped client.
--
--   * SERVICE-ROLE ONLY (webhooks, crons, provisioning, onboarding + settings Server Functions,
--     which all check membership first and then write with the service-role client):
--       accounts, account_members, numbers, subscriptions, usage_monthly, verification_events,
--       alerts, lead_sources, weekly_reports, referrals, admin_notes, rate_limits
--     Members can SELECT their own rows on these (except admin_notes / rate_limits) but never
--     INSERT / UPDATE / DELETE them. That is what keeps accounts.plan / accounts.status /
--     alert_phone_verified / numbers.sms_enabled / usage_monthly.overage_reported /
--     subscriptions.* / lead_sources.meta_page_id out of reach of the browser: with the public
--     anon key and their own JWT a member could otherwise PATCH those columns over PostgREST.
--
--   Policies alone are not enough on hosted Supabase (ALTER DEFAULT PRIVILEGES grants ALL to
--   `authenticated` at table creation), so the grants block at the bottom of this file also
--   REVOKEs the write privileges explicitly. Keep both in sync when adding a table.
-- -----------------------------------------------------------------------------

-- accounts: members can read; rows are created by the signup trigger and written by the
-- service role only (onboarding / settings Server Functions verify membership first).
drop policy if exists "accounts_select_member" on public.accounts;
create policy "accounts_select_member" on public.accounts
  for select to authenticated
  using (public.is_account_member(id));

drop policy if exists "accounts_update_member" on public.accounts;

-- account_members: a user sees their own memberships and their teammates
drop policy if exists "account_members_select_own" on public.account_members;
create policy "account_members_select_own" on public.account_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_account_member(account_id));

-- generic member policies for account-scoped tables --------------------------
do $$
declare
  t text;
begin
  -- SELECT for every account-scoped table a member may look at.
  foreach t in array array[
    'numbers', 'contacts', 'conversations', 'messages', 'calls', 'leads', 'alerts',
    'subscriptions', 'usage_monthly', 'verification_events', 'lead_sources', 'weekly_reports'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_member', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_account_member(account_id))',
      t || '_select_member', t
    );
    -- Drop any member write policies from earlier revisions of this file (re-run safety);
    -- the writable set below re-creates the ones that should exist.
    execute format('drop policy if exists %I on public.%I', t || '_insert_member', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_member', t);
  end loop;

  -- INSERT / UPDATE only for the conversation data the dashboard writes as the user.
  foreach t in array array['contacts', 'conversations', 'messages', 'calls', 'leads']
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_account_member(account_id))',
      t || '_insert_member', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_account_member(account_id)) with check (public.is_account_member(account_id))',
      t || '_update_member', t
    );
  end loop;
end;
$$;

-- delete: only leads and contacts (members may clean up their own data)
drop policy if exists "leads_delete_member" on public.leads;
create policy "leads_delete_member" on public.leads
  for delete to authenticated
  using (public.is_account_member(account_id));

drop policy if exists "contacts_delete_member" on public.contacts;
create policy "contacts_delete_member" on public.contacts
  for delete to authenticated
  using (public.is_account_member(account_id));

-- events: members may log and read events for their own account
drop policy if exists "events_select_member" on public.events;
create policy "events_select_member" on public.events
  for select to authenticated
  using (account_id is not null and public.is_account_member(account_id));

drop policy if exists "events_insert_member" on public.events;
create policy "events_insert_member" on public.events
  for insert to authenticated
  with check (
    account_id is not null
    and public.is_account_member(account_id)
    and (user_id is null or user_id = (select auth.uid()))
  );

-- referrals: visible to both sides; written by the billing webhook (service role) only
drop policy if exists "referrals_select_member" on public.referrals;
create policy "referrals_select_member" on public.referrals
  for select to authenticated
  using (public.is_account_member(referrer_account_id) or public.is_account_member(referred_account_id));

-- admin_notes: intentionally no policies -> service role only

-- =============================================================================
-- Realtime: messages, conversations, leads (guarded for re-runs)
-- =============================================================================
alter table public.messages      replica identity full;
alter table public.conversations replica identity full;
alter table public.leads         replica identity full;

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['messages', 'conversations', 'leads'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- =============================================================================
-- Rate limits: sliding-window counters for code sends / test calls, keyed by
-- account, destination number and a global bucket. Service role only (no policies):
-- members must not be able to reset their own limiter (it used to live in
-- accounts.ai_profile, which was member-writable).
-- =============================================================================
create table if not exists public.rate_limits (
  key        text primary key,
  hits       timestamptz[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.rate_limits enable row level security;

-- Atomic "count a hit unless the window is full". Returns allowed=false with the seconds until
-- the oldest hit in the window expires. Row-locked so concurrent requests cannot both pass.
create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns table (allowed boolean, retry_after_seconds integer, hits integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cutoff timestamptz := now() - make_interval(secs => p_window_seconds);
  kept   timestamptz[];
  n      integer;
begin
  insert into public.rate_limits (key, hits) values (p_key, '{}')
  on conflict (key) do nothing;

  select coalesce(array(select h from unnest(r.hits) as h where h > cutoff order by h), '{}')
    into kept
  from public.rate_limits r
  where r.key = p_key
  for update;

  n := coalesce(array_length(kept, 1), 0);
  if n >= p_max then
    update public.rate_limits set hits = kept, updated_at = now() where key = p_key;
    return query select
      false,
      greatest(1, ceil(extract(epoch from (kept[1] + make_interval(secs => p_window_seconds) - now())))::integer),
      n;
    return;
  end if;

  kept := kept || now();
  update public.rate_limits set hits = kept, updated_at = now() where key = p_key;
  return query select true, 0, n + 1;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- =============================================================================
-- Grants. Hosted Supabase's default privileges grant ALL on new tables to anon / authenticated,
-- so the writer model above is enforced with explicit GRANT + REVOKE, not just policies.
-- =============================================================================
grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Members: read their own rows everywhere RLS allows it...
grant select on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
-- ...and write only the conversation data the dashboard edits as the user.
grant insert, update on public.contacts, public.conversations, public.messages, public.calls, public.leads to authenticated;
grant delete on public.leads, public.contacts to authenticated;
grant insert on public.events to authenticated;

-- Everything else is service-role only (explicit, so default privileges cannot re-open it).
revoke insert, update, delete on
  public.accounts, public.account_members, public.numbers, public.subscriptions, public.usage_monthly,
  public.verification_events, public.alerts, public.weekly_reports, public.lead_sources,
  public.referrals, public.admin_notes
from authenticated;
revoke update, delete on public.events from authenticated;
revoke all on public.rate_limits from authenticated, anon;
revoke all on public.admin_notes from anon;
