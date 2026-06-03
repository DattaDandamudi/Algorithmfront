/*
  # Add order fields to call_logs

  1. Modified Tables
    - `call_logs`
      - `order_id` (text) - unique order reference identifier
      - `items` (text) - items discussed or ordered during the call
      - `price` (numeric) - order/transaction value in currency
      - `phone_number` (text) - caller's phone number

  2. Notes
    - All new columns are nullable to remain compatible with existing rows
    - No destructive changes made
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'call_logs' AND column_name = 'order_id'
  ) THEN
    ALTER TABLE call_logs ADD COLUMN order_id text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'call_logs' AND column_name = 'items'
  ) THEN
    ALTER TABLE call_logs ADD COLUMN items text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'call_logs' AND column_name = 'price'
  ) THEN
    ALTER TABLE call_logs ADD COLUMN price numeric(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'call_logs' AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE call_logs ADD COLUMN phone_number text DEFAULT '';
  END IF;
END $$;
