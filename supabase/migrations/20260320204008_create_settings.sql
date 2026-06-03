/*
  # Create settings table

  1. New Tables
    - `settings`
      - `id` (uuid, primary key)
      - `key` (text, unique) - setting identifier
      - `value` (text) - setting value
      - `category` (text) - grouping category (general, voice, notifications, etc.)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `settings` table
    - Add policy for authenticated users to read settings
    - Add policy for authenticated users to update settings

  3. Seed Data
    - Insert default settings for all categories
*/

CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read settings"
  ON settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update settings"
  ON settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert settings"
  ON settings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

INSERT INTO settings (key, value, category) VALUES
  ('agent_name', 'Samvaad Agent', 'general'),
  ('default_language', 'Telugu', 'general'),
  ('greeting_message', 'Hello! How can I help you today?', 'general'),
  ('max_call_duration', '600', 'general'),
  ('auto_translate', 'true', 'general'),
  ('voice_speed', '1.0', 'voice'),
  ('voice_pitch', '1.0', 'voice'),
  ('silence_timeout', '5', 'voice'),
  ('enable_noise_cancellation', 'true', 'voice'),
  ('response_delay', '0.5', 'voice'),
  ('temperature', '0.7', 'models'),
  ('max_tokens', '1024', 'models'),
  ('enable_fallback', 'true', 'models'),
  ('stream_responses', 'true', 'models'),
  ('email_notifications', 'false', 'notifications'),
  ('notification_email', '', 'notifications'),
  ('webhook_url', '', 'notifications'),
  ('notify_on_failed_calls', 'true', 'notifications'),
  ('daily_report', 'false', 'notifications')
ON CONFLICT (key) DO NOTHING;
