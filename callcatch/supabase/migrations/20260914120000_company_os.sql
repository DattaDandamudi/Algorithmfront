-- CallCatch Company OS: the multi-agent system that runs sales, marketing, support and operations.
-- All tables here are SERVICE-ROLE ONLY (no member policies). Admin pages read them with the
-- service-role client behind isAdminEmail(); agents write them from server code.

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  trigger text not null default 'manual' check (trigger in ('cron', 'manual', 'event', 'cli')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'needs_approval', 'skipped')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  summary text,
  model text,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_usd numeric(10, 4) not null default 0,
  iterations integer not null default 0,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_runs_role_created_idx on public.agent_runs (role, created_at desc);
create index if not exists agent_runs_status_idx on public.agent_runs (status) where status in ('queued', 'running', 'needs_approval');

create table if not exists public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.agent_runs (id) on delete set null,
  role text not null,
  kind text not null,
  title text not null,
  rationale text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'executing', 'executed', 'failed', 'expired')),
  requires_approval boolean not null default true,
  risk text not null default 'low' check (risk in ('low', 'medium', 'high')),
  estimated_cost_usd numeric(10, 2) not null default 0,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  executed_at timestamptz,
  error text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_tasks_status_created_idx on public.agent_tasks (status, created_at desc);
create index if not exists agent_tasks_run_idx on public.agent_tasks (run_id);

create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'manual' check (source in ('manual', 'csv', 'places', 'license_board', 'meta_ad_library', 'referral', 'inbound', 'web')),
  external_ref text,
  trade text not null default 'other' check (trade in ('hvac', 'plumbing', 'electrical', 'roofing', 'other')),
  business_name text not null,
  owner_name text,
  phone text,
  phone_type text check (phone_type in ('landline', 'mobile', 'voip', 'unknown')),
  email text,
  website text,
  address text,
  city text,
  state char(2),
  zip text,
  rating numeric(3, 2),
  review_count integer,
  runs_meta_ads boolean,
  uses_software text,
  employees_est integer,
  fit_score integer not null default 0 check (fit_score between 0 and 100),
  status text not null default 'new' check (status in ('new', 'enriched', 'queued', 'contacted', 'replied', 'demo_booked', 'trial', 'customer', 'lost', 'disqualified', 'do_not_contact')),
  disqualify_reason text,
  notes jsonb not null default '{}'::jsonb,
  last_touch_at timestamptz,
  next_touch_at timestamptz,
  account_id uuid references public.accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists prospects_dedupe_idx on public.prospects (lower(business_name), coalesce(phone, ''), coalesce(state, ''));
create index if not exists prospects_status_next_idx on public.prospects (status, next_touch_at);
create index if not exists prospects_fit_idx on public.prospects (fit_score desc);

create table if not exists public.outreach (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  task_id uuid references public.agent_tasks (id) on delete set null,
  channel text not null check (channel in ('email', 'call', 'dm', 'letter')),
  step integer not null default 1,
  subject text,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'scheduled', 'sent', 'delivered', 'bounced', 'replied', 'failed', 'skipped')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  provider_id text,
  reply_excerpt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists outreach_prospect_idx on public.outreach (prospect_id, step);
create index if not exists outreach_status_sched_idx on public.outreach (status, scheduled_for);

create table if not exists public.agent_memory (
  role text not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (role, key)
);

create table if not exists public.metrics_daily (
  day date primary key,
  metrics jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now()
);

-- updated_at triggers (same function as the init migration)
do $$
declare t text;
begin
  foreach t in array array['agent_runs', 'agent_tasks', 'prospects', 'outreach']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- RLS: enabled, no member policies => only the service role can read/write.
alter table public.agent_runs enable row level security;
alter table public.agent_tasks enable row level security;
alter table public.prospects enable row level security;
alter table public.outreach enable row level security;
alter table public.agent_memory enable row level security;
alter table public.metrics_daily enable row level security;

revoke all on public.agent_runs, public.agent_tasks, public.prospects, public.outreach, public.agent_memory, public.metrics_daily from anon, authenticated;
grant all on public.agent_runs, public.agent_tasks, public.prospects, public.outreach, public.agent_memory, public.metrics_daily to service_role;

comment on table public.agent_runs is 'One row per Company OS agent execution (cron/manual/event).';
comment on table public.agent_tasks is 'Actions proposed by agents; executed by lib/agents/core/executor.ts after policy/approval.';
comment on table public.prospects is 'Outbound sales pipeline (B2B business listings; public data + enrichment).';
comment on table public.outreach is 'Per-prospect outreach steps (email/call/dm) with delivery + reply tracking.';
