
-- ============================================================
-- 1. Fix call_logs: add user_id, tighten policies
-- ============================================================

-- Add user_id column for ownership tracking
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Allow anonymous insert to call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "Allow anonymous read access to call_logs" ON public.call_logs;

-- New policies: only authenticated users can interact with their own call logs
CREATE POLICY "select_own_call_logs" ON public.call_logs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "insert_own_call_logs" ON public.call_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_call_logs" ON public.call_logs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_call_logs" ON public.call_logs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Revoke anon access entirely
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.call_logs FROM anon;

-- ============================================================
-- 2. Fix contributors: restrict write ops to service_role only
-- ============================================================

-- Drop overly permissive write policies
DROP POLICY IF EXISTS "Authenticated users can add contributors" ON public.contributors;
DROP POLICY IF EXISTS "Authenticated users can update contributors" ON public.contributors;
DROP POLICY IF EXISTS "Authenticated users can remove contributors" ON public.contributors;

-- Revoke write from authenticated (only service_role/migrations can modify)
REVOKE INSERT, UPDATE, DELETE ON public.contributors FROM authenticated;

-- Keep read access (needed for landing page)
-- The existing "Anyone can read contributors" SELECT policy is fine

-- ============================================================
-- 3. Fix storage: remove broad SELECT policy that allows listing
-- ============================================================

DROP POLICY IF EXISTS "Public read contributor avatars" ON storage.objects;

-- Public buckets serve files by URL without needing a SELECT policy.
-- No replacement needed — direct URL access still works for public buckets.

-- ============================================================
-- 4. Revoke anon SELECT from tables that should not be public
-- ============================================================

-- settings has no user_id but should only be readable by authenticated
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.settings FROM anon;

-- user_preferences is already user-scoped, just revoke anon
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.user_preferences FROM anon;

-- waitlist_signups: anon can INSERT (join waitlist) but should not read
REVOKE SELECT, UPDATE, DELETE ON public.waitlist_signups FROM anon;

-- ============================================================
-- 5. Restrict reference tables to authenticated only
-- ============================================================

-- languages, personas, llm_models, voice_models are reference data
-- needed by authenticated users in the studio, not by anonymous visitors

-- Drop existing broad policies and recreate for authenticated only
DROP POLICY IF EXISTS "Anyone can read languages" ON public.languages;
CREATE POLICY "authenticated_read_languages" ON public.languages FOR SELECT
  TO authenticated USING (true);
REVOKE SELECT ON public.languages FROM anon;

DROP POLICY IF EXISTS "Anyone can read personas" ON public.personas;
CREATE POLICY "authenticated_read_personas" ON public.personas FOR SELECT
  TO authenticated USING (true);
REVOKE SELECT ON public.personas FROM anon;

DROP POLICY IF EXISTS "Anyone can read llm_models" ON public.llm_models;
CREATE POLICY "authenticated_read_llm_models" ON public.llm_models FOR SELECT
  TO authenticated USING (true);
REVOKE SELECT ON public.llm_models FROM anon;

DROP POLICY IF EXISTS "Anyone can read voice_models" ON public.voice_models;
CREATE POLICY "authenticated_read_voice_models" ON public.voice_models FOR SELECT
  TO authenticated USING (true);
REVOKE SELECT ON public.voice_models FROM anon;

-- ============================================================
-- 6. Fix settings: scope policies to actual ownership
--    (settings table uses a single-row pattern without user_id,
--     so add user_id for proper multi-tenant scoping)
-- ============================================================

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Drop existing policies that only check auth.uid() IS NOT NULL
DROP POLICY IF EXISTS "Authenticated users can read settings" ON public.settings;
DROP POLICY IF EXISTS "Authenticated users can insert settings" ON public.settings;
DROP POLICY IF EXISTS "Authenticated users can update settings" ON public.settings;

-- Create proper ownership-scoped policies
CREATE POLICY "select_own_settings" ON public.settings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "insert_own_settings" ON public.settings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_settings" ON public.settings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_settings" ON public.settings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 7. Fix waitlist_signups: restrict read to service_role only
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can view waitlist" ON public.waitlist_signups;
REVOKE SELECT ON public.waitlist_signups FROM authenticated;

-- ============================================================
-- 8. Restrict contributors SELECT to authenticated only
--    (landing page will still work via service_role or
--     we keep anon read since it's public content)
-- ============================================================

-- Actually contributors ARE public content shown on landing page.
-- The "Anyone can read contributors" policy with anon is intentional.
-- But to address the GraphQL schema issue, we can't revoke anon SELECT
-- without breaking the landing page. This is an acceptable trade-off
-- for public content. No change needed here.

-- ============================================================
-- 9. landing_testimonials and public_metrics are public by design
--    These are intentionally visible to anonymous visitors.
--    No change needed — the schema visibility is expected.
-- ============================================================
