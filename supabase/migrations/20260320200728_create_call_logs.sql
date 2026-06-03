/*
  # Create call_logs table for dashboard analytics

  1. New Tables
    - `call_logs`
      - `id` (uuid, primary key)
      - `caller_name` (text) - name of the caller
      - `language` (text) - language used in the call
      - `persona` (text) - persona/agent used
      - `llm_model` (text) - LLM model used
      - `duration_seconds` (integer) - call duration in seconds
      - `status` (text) - call status: completed, dropped, failed
      - `sentiment` (text) - call sentiment: positive, neutral, negative
      - `message_count` (integer) - number of messages exchanged
      - `created_at` (timestamptz) - when the call occurred

  2. Security
    - Enable RLS on `call_logs` table
    - Add read policy for anonymous access (demo data, no auth required yet)
*/

CREATE TABLE IF NOT EXISTS call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_name text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT '',
  persona text NOT NULL DEFAULT '',
  llm_model text NOT NULL DEFAULT '',
  duration_seconds integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  sentiment text NOT NULL DEFAULT 'neutral',
  message_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read access to call_logs"
  ON call_logs
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous insert to call_logs"
  ON call_logs
  FOR INSERT
  TO anon
  WITH CHECK (true);
