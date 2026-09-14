# CallCatch database (Supabase)

Everything under `supabase/` is the source of truth for the Postgres schema. The app talks to it
through `@/lib/db/client` (anon key + RLS for signed-in users, service role for webhooks/crons) and
types it with the hand-written `lib/db/types.ts`.

## What is in here

| Path | Purpose |
|---|---|
| `migrations/20260914000000_init.sql` | All tables from `docs/PRODUCT_SPEC.md` §4.1, CHECK-constraint enums, FKs (`on delete cascade`), indexes, `updated_at` triggers, the signup trigger, RLS policies, Realtime publication. Re-runnable. |
| `seed.sql` | Demo HVAC account ("Summit Air Heating & Cooling", Austin TX): 1 verified toll-free number, 2 contacts, 1 missed call with voicemail, 1 text-back conversation (4 messages), 2 leads, alert, lead sources, subscription, usage, weekly report, events. |
| `config.toml` | Minimal Supabase CLI config for `supabase start` (API 54321, DB 54322, Studio 54323). |

Schema highlights the other modules rely on:

- **Accounts are created by a trigger on `auth.users` insert** (`public.handle_new_user`): `accounts`
  (`status='onboarding'`, `owner_user_id`, `alert_email`, unique 8-char `referral_code`) plus
  `account_members(role='owner')`. If the signup metadata carries `referral_code`, the new account gets
  `referred_by_account_id` and a `referrals(status='pending')` row. App code never inserts accounts.
- **RLS** is on for every table. `public.is_account_member(account uuid)` (SECURITY DEFINER, STABLE) is
  the single membership check used by all policies, so `account_members` never recurses.
  **Writer model** (policies *and* explicit `GRANT`/`REVOKE` at the bottom of the migration — hosted
  Supabase's default privileges would otherwise grant `ALL` to `authenticated` on every new table):
  - Member-writable (user-scoped client, RLS): `contacts`, `conversations`, `messages`, `calls`, `leads`
    are `select/insert/update`; `delete` only on `leads` and `contacts`; `events` is `select` + `insert`
    for the member's own account.
  - Service-role only: `accounts`, `account_members`, `numbers`, `subscriptions`, `usage_monthly`,
    `verification_events`, `alerts`, `lead_sources`, `weekly_reports`, `referrals` are `select` for
    members and never writable by them (`referrals` is visible to either side; `admin_notes` and
    `rate_limits` have no member access at all). Onboarding and Settings Server Functions verify
    membership first and then write `accounts` / `lead_sources` with the service-role client; billing,
    verification and crons do the same for the rest. This is what stops a signed-in member from
    PATCHing `accounts.plan/status/alert_phone_verified`, `numbers.sms_enabled`,
    `usage_monthly.overage_reported` or `subscriptions.*` over PostgREST with the anon key.
- `public.rate_limits` + `public.rate_limit_hit(key, max, window_seconds)` (service role only) back the
  sliding-window limiter for alert-code sends and forwarding-test calls (`lib/onboarding/rate-limit.ts`).
- `lead_sources.inbound_email` is `acct-<random>@LEADS_INBOUND_DOMAIN` — a random token, never derived
  from the account's public `referral_code`.
- **Realtime** is enabled for `messages`, `conversations`, `leads` (with `replica identity full`).
- `messages.send_after` (extra, not in the spec table) is the quiet-hours queue timestamp for
  `status='queued'` outbound rows; `null` means send immediately.
- `leads(account_id, external_ref)` is unique where `external_ref is not null` (idempotent Meta / webhook intake).

## Applying migrations

### Hosted project (recommended: CLI)

```bash
npm i -g supabase          # or: npx supabase ...
supabase login
supabase link --project-ref <project-ref>
supabase db push           # applies supabase/migrations/* in order
```

### Hosted project (SQL editor)

Open the Dashboard > SQL editor, paste `migrations/20260914000000_init.sql`, run. The file uses
`if not exists` / `drop ... if exists` guards, so re-running it is safe. The trigger on `auth.users`
requires the editor's `postgres` role, which the SQL editor uses by default.

### Local

```bash
supabase start             # boots Postgres + Auth + Studio using config.toml
supabase db reset          # re-applies migrations, then runs seed.sql
```

Point `.env.local` at the local stack: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and the anon /
service-role keys printed by `supabase start`.

## Seeding the demo account

Hosted Supabase does not allow inserting into `auth.users` from SQL, so the seed attaches to an
existing user:

1. Create the user first: sign up in the app (`/signup`) or Dashboard > Authentication > Users > Add user.
   Use `demo@callcatch.co` if you want the seed to pick it deterministically; otherwise the oldest user is used.
2. Run `seed.sql` (SQL editor, `psql "$DATABASE_URL" -f supabase/seed.sql`, or automatically via
   `supabase db reset` locally). It prints a `NOTICE` with the account id and referral code.
   If no user exists it prints a notice and does nothing.

The seed is idempotent (fixed UUIDs + upserts); re-run it any time to restore the demo data.

## Regenerating `lib/db/types.ts`

`lib/db/types.ts` is hand-written in the exact shape of the generator output so it can be replaced at
any time:

```bash
supabase gen types typescript --project-id <project-ref> --schema public > lib/db/types.ts
# local stack:
supabase gen types typescript --local --schema public > lib/db/types.ts
```

After regenerating, re-append the convenience block at the bottom of the current file
(`Tables<>`, `TablesInsert<>`, `TablesUpdate<>`, the `*Row` aliases and the literal enum unions) — the
generator does not emit them and app code imports them. Then run `npm run typecheck`.

**Rule:** any change to `supabase/migrations/**` must ship with the matching change in
`lib/db/types.ts` in the same commit. Row nullability, defaults (which make Insert fields optional),
and FK names (`<table>_<column>_fkey`) must match the SQL exactly.

## Adding a migration

```bash
supabase migration new <name>      # creates supabase/migrations/<timestamp>_<name>.sql
supabase db push                   # or db reset locally
```

Keep the conventions: text + CHECK for enums, `account_id ... on delete cascade`, `created_at`/`updated_at`
(the `updated_at` trigger loop in the init migration only covers tables that exist when it runs, so add
`create trigger set_updated_at before update on public.<table> for each row execute function public.set_updated_at();`
for new tables), RLS enabled with member policies via `public.is_account_member(account_id)`.
