/*
  # Cinematic Redesign — Public Metrics, Testimonials, User Preferences

  Adds three pieces of dynamic content used by the redesigned landing
  experience.

  1. New tables
    - `landing_testimonials`
      - `id` (uuid, primary key)
      - `quote` (text) — the testimonial body
      - `author` (text) — speaker name
      - `role` (text) — speaker role / restaurant
      - `tone` (text, default 'amber') — accent for the card
      - `sort_order` (int, default 0)
      - `is_published` (bool, default true)
      - `created_at` (timestamptz, default now())
    - `user_preferences`
      - `user_id` (uuid, primary key, references auth.users)
      - `motion_intensity` (text, default 'cinematic')
      - `theme_intensity` (text, default 'auto')
      - `language_pref` (text, default 'en')
      - `updated_at` (timestamptz, default now())
    - `public_metrics`
      - `key` (text, primary key)
      - `label` (text)
      - `value` (numeric, default 0)
      - `suffix` (text, default '')
      - `prefix` (text, default '')
      - `decimals` (int, default 0)
      - `sort_order` (int, default 0)
      - `updated_at` (timestamptz, default now())

  2. Security
    - RLS enabled on all three tables.
    - `landing_testimonials` and `public_metrics` are world-readable for
      anyone (anon + authenticated) but writable by no one through RLS
      (managed only by service role / admin).
    - `user_preferences` rows are readable + writable only by the owning
      user (auth.uid() = user_id).

  3. Seed data
    - Three published testimonials.
    - Four public metrics matching the landing tile copy.

  4. Notes
    - No destructive operations.
    - All inserts are idempotent via `ON CONFLICT DO NOTHING` guards.
*/

-- =========================================================
-- 1. landing_testimonials
-- =========================================================

CREATE TABLE IF NOT EXISTS landing_testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote text NOT NULL DEFAULT '',
  author text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  tone text NOT NULL DEFAULT 'amber',
  sort_order int NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE landing_testimonials ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'landing_testimonials'
      AND policyname = 'Anyone can read published testimonials'
  ) THEN
    CREATE POLICY "Anyone can read published testimonials"
      ON landing_testimonials FOR SELECT
      TO anon, authenticated
      USING (is_published = true);
  END IF;
END $$;

INSERT INTO landing_testimonials (quote, author, role, tone, sort_order)
SELECT * FROM (VALUES
  (
    'Algoritm picks up before our hostess can even reach the phone — and our Spanish-speaking guests finally feel at home from the very first ring.',
    'Camila Reyes',
    'GM, Casa Marisol',
    'amber',
    1
  ),
  (
    'It cut our missed-call revenue loss to zero. We used to lose three reservations a night after 9 PM. Not anymore.',
    'Anand Iyer',
    'Owner, Saffron & Sea',
    'rose',
    2
  ),
  (
    'The Mandarin and Cantonese coverage is genuinely uncanny — our regulars stopped asking for the English line.',
    'Wei Lam',
    'Operations, Lotus Imperial',
    'cyan',
    3
  )
) AS v(quote, author, role, tone, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM landing_testimonials WHERE author = v.author
);

-- =========================================================
-- 2. user_preferences
-- =========================================================

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  motion_intensity text NOT NULL DEFAULT 'cinematic',
  theme_intensity text NOT NULL DEFAULT 'auto',
  language_pref text NOT NULL DEFAULT 'en',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_preferences'
      AND policyname = 'Users can read own preferences'
  ) THEN
    CREATE POLICY "Users can read own preferences"
      ON user_preferences FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_preferences'
      AND policyname = 'Users can insert own preferences'
  ) THEN
    CREATE POLICY "Users can insert own preferences"
      ON user_preferences FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_preferences'
      AND policyname = 'Users can update own preferences'
  ) THEN
    CREATE POLICY "Users can update own preferences"
      ON user_preferences FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_preferences'
      AND policyname = 'Users can delete own preferences'
  ) THEN
    CREATE POLICY "Users can delete own preferences"
      ON user_preferences FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- =========================================================
-- 3. public_metrics
-- =========================================================

CREATE TABLE IF NOT EXISTS public_metrics (
  key text PRIMARY KEY,
  label text NOT NULL DEFAULT '',
  value numeric NOT NULL DEFAULT 0,
  suffix text NOT NULL DEFAULT '',
  prefix text NOT NULL DEFAULT '',
  decimals int NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public_metrics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'public_metrics'
      AND policyname = 'Anyone can read public metrics'
  ) THEN
    CREATE POLICY "Anyone can read public metrics"
      ON public_metrics FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

INSERT INTO public_metrics (key, label, value, suffix, sort_order)
VALUES
  ('languages', 'Languages supported', 84, '+', 1),
  ('latency', 'Avg. response time', 312, 'ms', 2),
  ('calls_day', 'Calls handled / day', 24800, '+', 3),
  ('waitlist', 'Restaurants on waitlist', 1247, '', 4)
ON CONFLICT (key) DO NOTHING;
