/*
  # Algoritm Waitlist Signups

  1. New Tables
    - `waitlist_signups`
      - `id` (uuid, primary key)
      - `email` (text, required) — visitor's contact email
      - `restaurant_name` (text) — name of the restaurant
      - `country` (text) — country/region of the restaurant
      - `primary_language` (text) — primary spoken language
      - `source` (text) — section of the page that captured the signup
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `waitlist_signups`
    - Allow `anon` and `authenticated` roles to INSERT (public waitlist form)
    - Restrict SELECT to `authenticated` users only (waitlist is private)
    - No UPDATE or DELETE policies — submissions are append-only

  3. Notes
    - Email is required so we can contact applicants
    - Other columns default to empty string for flexible capture
    - `source` lets us track which CTA drove the signup (hero, footer, etc.)
*/

CREATE TABLE IF NOT EXISTS waitlist_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  restaurant_name text DEFAULT '',
  country text DEFAULT '',
  primary_language text DEFAULT '',
  source text DEFAULT 'landing',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE waitlist_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can join the waitlist"
  ON waitlist_signups
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (email IS NOT NULL AND email <> '');

CREATE POLICY "Authenticated users can view waitlist"
  ON waitlist_signups
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS waitlist_signups_created_at_idx
  ON waitlist_signups (created_at DESC);
