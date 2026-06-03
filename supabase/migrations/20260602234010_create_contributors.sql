/*
  # Algoritm Contributors

  1. New Tables
    - `contributors`
      - `id` (uuid, primary key)
      - `name` (text, required)
      - `role` (text) — e.g., "Founder", "Engineering", "Design", "Linguist", "Advisor"
      - `category` (text) — high-level grouping for the page section ("founders", "engineering", "linguists")
      - `bio` (text) — short single-line bio / contribution summary
      - `avatar_url` (text) — optional image URL; falls back to gradient initial
      - `location` (text) — city / country
      - `link_url` (text) — optional external profile link
      - `sort_order` (integer) — controls listing order within a section
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `contributors`
    - Allow public SELECT (the credits page is publicly visible)
    - Restrict INSERT/UPDATE/DELETE to authenticated users only (admin editing later)

  3. Notes
    - The page falls back to a hard-coded list if this table is empty
*/

CREATE TABLE IF NOT EXISTS contributors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text DEFAULT '',
  category text DEFAULT 'team',
  bio text DEFAULT '',
  avatar_url text DEFAULT '',
  location text DEFAULT '',
  link_url text DEFAULT '',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE contributors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read contributors"
  ON contributors
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can add contributors"
  ON contributors
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update contributors"
  ON contributors
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can remove contributors"
  ON contributors
  FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS contributors_sort_idx
  ON contributors (category, sort_order, name);

INSERT INTO contributors (name, role, category, bio, location, sort_order)
VALUES
  ('Aarav Mehta', 'Founder & CEO', 'founders', 'Built Algoritm to give every restaurant a multilingual voice — no matter how small.', 'San Francisco, USA', 1),
  ('Priya Nair', 'Founder & CTO', 'founders', 'Architected the real-time speech pipeline running under 400ms across 80+ languages.', 'Bangalore, India', 2),
  ('Diego Ramirez', 'Founding Engineer', 'engineering', 'Owns the telephony and call-routing layer — every ring lands on Algoritm first.', 'Mexico City, Mexico', 1),
  ('Wei Chen', 'ML Engineer', 'engineering', 'Trains and tunes the on-the-fly translation models that keep guests in their own tongue.', 'Singapore', 2),
  ('Maya Okafor', 'Product Designer', 'engineering', 'Crafted the studio, the orb, and every moment of motion you feel on the page.', 'Lagos, Nigeria', 3),
  ('Yuki Tanaka', 'Voice Engineer', 'engineering', 'Designed the studio voices — warm, calm, and unmistakably hospitable.', 'Tokyo, Japan', 4),
  ('Lucas Bernard', 'Backend Engineer', 'engineering', 'Built the menu ingestion service that reads PDFs, photos, and POS exports alike.', 'Paris, France', 5),
  ('Anjali Reddy', 'Linguist Lead', 'linguists', 'Curates dialects and idioms across South Asian languages so accents always land right.', 'Hyderabad, India', 1),
  ('Mohammed Al-Said', 'Arabic Linguist', 'linguists', 'Tunes Algoritm''s Arabic speech models for Gulf, Levantine, and Maghrebi dialects.', 'Dubai, UAE', 2),
  ('Sofia García', 'Spanish Linguist', 'linguists', 'Brings Castilian and Latin American Spanish to life with regional precision.', 'Madrid, Spain', 3),
  ('Chloé Dubois', 'Hospitality Advisor', 'linguists', 'Twenty years on the floor of Michelin kitchens — keeps Algoritm grounded in real service.', 'Lyon, France', 4),
  ('Kenji Watanabe', 'Investor & Advisor', 'linguists', 'Backed Algoritm at day one and opens doors across Asia''s hospitality giants.', 'Tokyo, Japan', 5)
ON CONFLICT DO NOTHING;
