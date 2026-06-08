/*
# Restore public read access to contributors

The contributors table contains intentionally public data displayed on the landing page.
The previous security fix overly restricted access. This restores SELECT for anon and
authenticated while keeping all write operations (INSERT/UPDATE/DELETE) revoked.

1. Changes
  - GRANT SELECT on `contributors` to `anon` and `authenticated`
  - Create a SELECT-only RLS policy allowing public reads
  - No write access is granted (UPDATE/INSERT/DELETE remain revoked)

2. Security
  - The always-true UPDATE policy remains dropped (fixed in previous migration)
  - No write privileges are restored
  - Only read access to this intentionally public dataset is allowed
*/

-- Restore role-level SELECT privilege
GRANT SELECT ON public.contributors TO anon, authenticated;

-- Create a read-only policy
DROP POLICY IF EXISTS "public_read_contributors" ON public.contributors;
CREATE POLICY "public_read_contributors" ON public.contributors FOR SELECT
  TO anon, authenticated
  USING (true);
