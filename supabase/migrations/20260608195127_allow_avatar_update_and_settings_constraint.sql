
-- Allow authenticated users to update ONLY avatar_url on contributors
-- This supports the avatar uploader while preventing full write access
GRANT UPDATE (avatar_url) ON public.contributors TO authenticated;

CREATE POLICY "authenticated_update_avatar_only" ON public.contributors FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Add unique constraint on settings (key, user_id) for upsert
-- First drop any existing unique constraint on key alone
ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS settings_key_user_id_unique ON public.settings (key, user_id);
