/*
  # TrueFare: profiles

  1. New tables
    - `fd_profiles` — one row per auth user: display name, metro, dietary
      prefs and memberships (jsonb arrays of ids used by the pricing rules).

  2. Security
    - RLS enabled; owner-scoped policies (`auth.uid() = id`) for
      authenticated users only; anon access revoked. Follows the hardened
      pattern established by the parent project's RLS cleanup migration.
*/

CREATE TABLE IF NOT EXISTS fd_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  metro_id text NOT NULL DEFAULT 'sf',
  dietary jsonb NOT NULL DEFAULT '[]'::jsonb,
  memberships jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fd_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON fd_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON fd_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON fd_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete own profile"
  ON fd_profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

REVOKE ALL ON fd_profiles FROM anon;
