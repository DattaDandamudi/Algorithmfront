/*
# Fix RLS and GraphQL schema visibility issues

1. Security Fixes
  - Drop the always-true UPDATE policy `authenticated_update_avatar_only` on `contributors`
  - Revoke UPDATE (avatar_url) column-level grant on `contributors` from authenticated
  - Revoke SELECT from `anon` on `contributors`, `landing_testimonials`, `public_metrics`
  - Revoke SELECT from `authenticated` on `contributors`, `landing_testimonials`, `public_metrics`
  - Drop existing overly-permissive SELECT policies on these tables

2. Tables Already Secured (no change needed)
  - `call_logs` - has proper user_id-scoped RLS (users only see own rows)
  - `settings` - has proper user_id-scoped RLS
  - `user_preferences` - has proper user_id-scoped RLS
  - `languages`, `llm_models`, `personas`, `voice_models` - shared reference data
    legitimately needed by every authenticated user in the studio app

3. Important Notes
  - `contributors` data has a hardcoded fallback in CraftedBy.tsx, so revoking
    access does not break the UI.
  - `landing_testimonials` and `public_metrics` are not queried by the frontend.
  - Reference tables (languages, llm_models, personas, voice_models) remain accessible
    to authenticated users because the studio app depends on them. Their RLS policies
    already restrict to authenticated-only SELECT which is the correct behavior for
    shared lookup data.
*/

-- ============================================================
-- 1. Fix contributors: remove the always-true UPDATE policy
-- ============================================================

-- Drop the always-true UPDATE policy (the vulnerability)
DROP POLICY IF EXISTS "authenticated_update_avatar_only" ON public.contributors;

-- Revoke the column-level UPDATE grant that was given to authenticated
REVOKE UPDATE ON public.contributors FROM authenticated;

-- Revoke SELECT from both anon and authenticated
-- (CraftedBy.tsx has hardcoded fallback data)
DROP POLICY IF EXISTS "Anyone can read contributors" ON public.contributors;
DROP POLICY IF EXISTS "authenticated_read_contributors" ON public.contributors;
REVOKE SELECT ON public.contributors FROM anon;
REVOKE SELECT ON public.contributors FROM authenticated;

-- ============================================================
-- 2. Revoke all access to landing_testimonials (unused in frontend)
-- ============================================================

DROP POLICY IF EXISTS "anon_select_landing_testimonials" ON public.landing_testimonials;
DROP POLICY IF EXISTS "authenticated_select_landing_testimonials" ON public.landing_testimonials;
DROP POLICY IF EXISTS "Anyone can read landing_testimonials" ON public.landing_testimonials;
DROP POLICY IF EXISTS "select_landing_testimonials" ON public.landing_testimonials;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'landing_testimonials') THEN
    REVOKE SELECT, INSERT, UPDATE, DELETE ON public.landing_testimonials FROM anon;
    REVOKE SELECT, INSERT, UPDATE, DELETE ON public.landing_testimonials FROM authenticated;
  END IF;
END $$;

-- ============================================================
-- 3. Revoke all access to public_metrics (unused in frontend)
-- ============================================================

DROP POLICY IF EXISTS "anon_select_public_metrics" ON public.public_metrics;
DROP POLICY IF EXISTS "authenticated_select_public_metrics" ON public.public_metrics;
DROP POLICY IF EXISTS "Anyone can read public_metrics" ON public.public_metrics;
DROP POLICY IF EXISTS "select_public_metrics" ON public.public_metrics;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'public_metrics') THEN
    REVOKE SELECT, INSERT, UPDATE, DELETE ON public.public_metrics FROM anon;
    REVOKE SELECT, INSERT, UPDATE, DELETE ON public.public_metrics FROM authenticated;
  END IF;
END $$;
