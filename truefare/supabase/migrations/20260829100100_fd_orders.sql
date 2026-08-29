/*
  # TrueFare: orders

  1. New tables
    - `fd_orders` — placed orders with the FULL frozen quote snapshot
      (jsonb) plus denormalized totals for listing. `restaurant_id` and
      item ids reference the bundled catalog (stable text keys), so no
      catalog tables are needed server-side.

  2. Security
    - RLS enabled; owner-scoped policies on user_id; anon revoked.
*/

CREATE TABLE IF NOT EXISTS fd_orders (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('doordash','ubereats','grubhub','postmates')),
  items jsonb NOT NULL,
  quote jsonb NOT NULL,
  total_cents integer NOT NULL,
  metro_id text NOT NULL,
  rules_version text NOT NULL,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  placed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fd_orders_user_placed_idx
  ON fd_orders (user_id, placed_at DESC);

ALTER TABLE fd_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own orders"
  ON fd_orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own orders"
  ON fd_orders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON fd_orders FROM anon;
