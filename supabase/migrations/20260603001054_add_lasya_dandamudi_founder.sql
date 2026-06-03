/*
  # Add Lasya Dandamudi as the first founder

  1. Changes
    - Insert `Lasya Dandamudi` into the `contributors` table as a founder
    - Sort order is set to 0 so she appears first in the Founders section
    - Skipped if a contributor with the same name already exists

  2. Security
    - No policy changes; existing public-read RLS continues to apply
*/

INSERT INTO contributors (name, role, category, bio, location, sort_order)
SELECT
  'Lasya Dandamudi',
  'Founder',
  'founders',
  'Founding voice of Algoritm — set the vision, the standard, and the relentless attention to detail behind every interaction.',
  '',
  0
WHERE NOT EXISTS (
  SELECT 1 FROM contributors WHERE name = 'Lasya Dandamudi'
);
