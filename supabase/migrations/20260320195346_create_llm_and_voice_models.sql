/*
  # Create LLM models and Voice models tables

  1. New Tables
    - `llm_models`
      - `id` (uuid, primary key)
      - `name` (text, not null) - display name (e.g., "GPT-4o")
      - `provider` (text, not null) - provider name (e.g., "OpenAI")
      - `model_id` (text, not null) - API model identifier
      - `description` (text) - short description
      - `created_at` (timestamptz, default now())
    - `voice_models`
      - `id` (uuid, primary key)
      - `name` (text, not null) - display name (e.g., "Alloy")
      - `provider` (text, not null) - provider name (e.g., "ElevenLabs")
      - `model_id` (text, not null) - API model identifier
      - `description` (text) - short description
      - `created_at` (timestamptz, default now())

  2. Security
    - Enable RLS on both tables
    - Add read-only policies for anon and authenticated users (public reference data)

  3. Seed Data
    - LLM models: GPT-4o, GPT-4o Mini, Claude 3.5 Sonnet, Gemini 1.5 Pro, Llama 3.1 70B
    - Voice models: Alloy (OpenAI), Nova (OpenAI), Rachel (ElevenLabs), Aria (ElevenLabs), Journey (Google)
*/

CREATE TABLE IF NOT EXISTS llm_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider text NOT NULL,
  model_id text NOT NULL,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS voice_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider text NOT NULL,
  model_id text NOT NULL,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE llm_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read llm_models"
  ON llm_models
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can read voice_models"
  ON voice_models
  FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO llm_models (name, provider, model_id, description) VALUES
  ('GPT-4o', 'OpenAI', 'gpt-4o', 'Most capable, best for complex tasks'),
  ('GPT-4o Mini', 'OpenAI', 'gpt-4o-mini', 'Fast and cost-efficient'),
  ('Claude 3.5 Sonnet', 'Anthropic', 'claude-3-5-sonnet-20241022', 'Strong reasoning and safety'),
  ('Gemini 1.5 Pro', 'Google', 'gemini-1.5-pro', 'Large context window'),
  ('Llama 3.1 70B', 'Meta', 'llama-3.1-70b', 'Open-source, self-hostable');

INSERT INTO voice_models (name, provider, model_id, description) VALUES
  ('Alloy', 'OpenAI', 'alloy', 'Balanced and versatile'),
  ('Nova', 'OpenAI', 'nova', 'Warm and expressive'),
  ('Rachel', 'ElevenLabs', 'rachel', 'Natural American English'),
  ('Aria', 'ElevenLabs', 'aria', 'Expressive and dynamic'),
  ('Journey', 'Google', 'journey', 'Smooth and professional');
