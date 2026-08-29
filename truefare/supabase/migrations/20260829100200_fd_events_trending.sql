/*
  # TrueFare: behavioral events + cross-user trending

  1. New tables
    - `fd_events` — append-only behavioral signals feeding each user's
      taste profile. Users can only read/insert their own rows.

  2. Functions
    - `fd_get_trending()` — SECURITY DEFINER aggregate over the last 72h
      of ALL users' events using Hacker-News-style gravity
      (sum(weight) / (hours_since + 2)^1.8). This is the one signal a
      single client cannot compute; the definer function exposes ONLY
      (item_id, score) aggregates, never row-level data, and is granted
      to authenticated users only.

  3. Security
    - RLS enabled on fd_events with owner-scoped policies; anon revoked;
      function pins search_path per the definer-function hardening
      convention.
*/

CREATE TABLE IF NOT EXISTS fd_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  restaurant_id text NOT NULL,
  event_type text NOT NULL CHECK (
    event_type IN ('view','open','search_click','add_to_cart','compare_view','handoff','order')
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fd_events_user_created_idx
  ON fd_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS fd_events_created_idx
  ON fd_events (created_at DESC);

ALTER TABLE fd_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own events"
  ON fd_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own events"
  ON fd_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON fd_events FROM anon;

CREATE OR REPLACE FUNCTION fd_get_trending()
RETURNS TABLE (item_id text, score numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    e.item_id,
    SUM(
      CASE e.event_type
        WHEN 'order' THEN 10
        WHEN 'handoff' THEN 8
        WHEN 'add_to_cart' THEN 4
        WHEN 'compare_view' THEN 3
        WHEN 'open' THEN 2
        WHEN 'search_click' THEN 2
        ELSE 1
      END
    ) / POWER(EXTRACT(EPOCH FROM (now() - MIN(e.created_at))) / 3600 + 2, 1.8) AS score
  FROM fd_events e
  WHERE e.created_at > now() - interval '72 hours'
  GROUP BY e.item_id
  ORDER BY score DESC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION fd_get_trending() FROM anon, public;
GRANT EXECUTE ON FUNCTION fd_get_trending() TO authenticated;
