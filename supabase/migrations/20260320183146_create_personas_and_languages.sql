/*
  # Create personas and languages tables

  1. New Tables
    - `personas`
      - `id` (uuid, primary key)
      - `name` (text, not null) - display name for the persona
      - `system_prompt` (text, not null) - the full system prompt text
      - `created_at` (timestamptz, default now())
    - `languages`
      - `id` (uuid, primary key)
      - `name` (text, not null) - language display name
      - `created_at` (timestamptz, default now())

  2. Security
    - Enable RLS on both tables
    - Add read-only policies for authenticated and anonymous users (public reference data)

  3. Seed Data
    - One persona: "E-commerce Support - Roopa"
    - Seven languages: Telugu, English, Hindi, Tamil, Kannada, Malayalam, Bengali
*/

CREATE TABLE IF NOT EXISTS personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  system_prompt text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS languages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE languages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read personas"
  ON personas
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can read languages"
  ON languages
  FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO personas (name, system_prompt) VALUES (
  'E-commerce Support - Roopa',
  E'You are Roopa, a customer support agent at QuickKart, an e-commerce platform for electronics and home appliances.\n\nYou handle order tracking, returns, refunds, and product inquiries.\n\nBe warm and solution-oriented. Acknowledge frustration before solving problems.\n\nKeep responses under 3 sentences.\n\nFor refunds, explain the 5-7 business day timeline. For replacements, confirm the delivery address before proceeding.\n\nIf a customer is angry, apologize sincerely and offer a concrete next step. Never argue or make excuses.\n\nWhen a customer asks about an order, ask for their order ID if they haven''t provided one. Accept any order ID they give and simulate looking it up - create a realistic status like "out for delivery", "shipped", or "processing" based on the conversation flow.'
);

INSERT INTO languages (name) VALUES
  ('Telugu'),
  ('English'),
  ('Hindi'),
  ('Tamil'),
  ('Kannada'),
  ('Malayalam'),
  ('Bengali');
