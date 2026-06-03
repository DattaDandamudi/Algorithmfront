/*
  # Add transcript column to call_logs

  1. Modified Tables
    - `call_logs`
      - `transcript` (jsonb) - array of {role: 'user'|'agent', content: string} objects
        representing the full conversation transcript for a call

  2. Notes
    - Column is nullable to remain compatible with existing rows
    - Stored as JSONB for flexible querying and structured access
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'call_logs' AND column_name = 'transcript'
  ) THEN
    ALTER TABLE call_logs ADD COLUMN transcript jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;
