/*
  # Update Nikhil Mattapalli role

  1. Changes
    - Update `contributors` row for Nikhil Mattapalli
      - Set `role` to `AI/ML Engineering`

  2. Notes
    - This is a non-destructive UPDATE; no data is removed.
    - `avatar_url` left unchanged here; it must be set to a publicly hosted image URL
      once the user provides one (the picture cannot be embedded from a local file).
*/

UPDATE contributors
SET role = 'AI/ML Engineering'
WHERE name = 'Nikhil Mattapalli';
