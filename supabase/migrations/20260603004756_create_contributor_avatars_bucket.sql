/*
  # Create contributor-avatars storage bucket

  1. New Storage
    - Public bucket `contributor-avatars` for hosting team member photos.

  2. Security
    - Public SELECT so the avatars can be served on the landing page.
    - INSERT / UPDATE / DELETE limited to authenticated users so only
      signed-in editors can upload or replace photos.

  3. Notes
    - Files are stored at the path of each editor's choice (e.g. `nikhil.jpeg`).
    - The `public` flag exposes objects via the public URL endpoint
      `<SUPABASE_URL>/storage/v1/object/public/contributor-avatars/<path>`.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('contributor-avatars', 'contributor-avatars', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read contributor avatars'
  ) THEN
    CREATE POLICY "Public read contributor avatars"
      ON storage.objects
      FOR SELECT
      TO public
      USING (bucket_id = 'contributor-avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated insert contributor avatars'
  ) THEN
    CREATE POLICY "Authenticated insert contributor avatars"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'contributor-avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated update contributor avatars'
  ) THEN
    CREATE POLICY "Authenticated update contributor avatars"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (bucket_id = 'contributor-avatars')
      WITH CHECK (bucket_id = 'contributor-avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated delete contributor avatars'
  ) THEN
    CREATE POLICY "Authenticated delete contributor avatars"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (bucket_id = 'contributor-avatars');
  END IF;
END $$;
