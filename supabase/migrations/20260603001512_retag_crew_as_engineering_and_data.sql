/*
  # Re-tag crew as Engineering & Design and Data Engineers

  1. Changes
    - Move the 32 contributors previously inserted under category `team` into
      the existing `engineering` category and a new `data` category (which the
      Crafted by page renders as "Data Engineers")
    - First half of the list goes to `engineering`, second half to `data`
    - Update each contributor's role label to match their new category
    - Re-number sort_order so each section displays in the original list order

  2. Security
    - No policy changes; existing public-read RLS continues to apply
*/

UPDATE contributors SET category = 'engineering', role = 'Engineering & Design', sort_order = 10 WHERE name = 'Tejasree' AND category = 'team';
UPDATE contributors SET category = 'engineering', role = 'Engineering & Design', sort_order = 11 WHERE name = 'Sai Abhilash' AND category = 'team';
UPDATE contributors SET category = 'engineering', role = 'Engineering & Design', sort_order = 12 WHERE name = 'Manoj Sai' AND category = 'team';
UPDATE contributors SET category = 'engineering', role = 'Engineering & Design', sort_order = 13 WHERE name = 'Sai Mohith' AND category = 'team';
UPDATE contributors SET category = 'engineering', role = 'Engineering & Design', sort_order = 14 WHERE name = 'Mohan Ayyappa' AND category = 'team';
UPDATE contributors SET category = 'engineering', role = 'Engineering & Design', sort_order = 15 WHERE name = 'Harshavardhan' AND category = 'team';
UPDATE contributors SET category = 'engineering', role = 'Engineering & Design', sort_order = 16 WHERE name = 'Emmanith' AND category = 'team';
UPDATE contributors SET category = 'engineering', role = 'Engineering & Design', sort_order = 17 WHERE name = 'Mohith Panchumarthi' AND category = 'team';
UPDATE contributors SET category = 'engineering', role = 'Engineering & Design', sort_order = 18 WHERE name = 'Kusuma' AND category = 'team';
UPDATE contributors SET category = 'engineering', role = 'Engineering & Design', sort_order = 19 WHERE name = 'Sai Aniketh' AND category = 'team';
UPDATE contributors SET category = 'engineering', role = 'Engineering & Design', sort_order = 20 WHERE name = 'Sai Nikhil' AND category = 'team';
UPDATE contributors SET category = 'engineering', role = 'Engineering & Design', sort_order = 21 WHERE name = 'Nikhil Mattapalli' AND category = 'team';
UPDATE contributors SET category = 'engineering', role = 'Engineering & Design', sort_order = 22 WHERE name = 'Surya Teja' AND category = 'team';
UPDATE contributors SET category = 'engineering', role = 'Engineering & Design', sort_order = 23 WHERE name = 'Arjun Kumar' AND category = 'team';
UPDATE contributors SET category = 'engineering', role = 'Engineering & Design', sort_order = 24 WHERE name = 'Pranathi' AND category = 'team';
UPDATE contributors SET category = 'engineering', role = 'Engineering & Design', sort_order = 25 WHERE name = 'Khadar Basha' AND category = 'team';

UPDATE contributors SET category = 'data', role = 'Data Engineer', sort_order = 1 WHERE name = 'Vishal' AND category = 'team';
UPDATE contributors SET category = 'data', role = 'Data Engineer', sort_order = 2 WHERE name = 'Sai Narmada' AND category = 'team';
UPDATE contributors SET category = 'data', role = 'Data Engineer', sort_order = 3 WHERE name = 'Vivekananda' AND category = 'team';
UPDATE contributors SET category = 'data', role = 'Data Engineer', sort_order = 4 WHERE name = 'Naveen Reddy Veena' AND category = 'team';
UPDATE contributors SET category = 'data', role = 'Data Engineer', sort_order = 5 WHERE name = 'Deepak' AND category = 'team';
UPDATE contributors SET category = 'data', role = 'Data Engineer', sort_order = 6 WHERE name = 'Sai Sindhu' AND category = 'team';
UPDATE contributors SET category = 'data', role = 'Data Engineer', sort_order = 7 WHERE name = 'Thushara Priya' AND category = 'team';
UPDATE contributors SET category = 'data', role = 'Data Engineer', sort_order = 8 WHERE name = 'Harshita Puli' AND category = 'team';
UPDATE contributors SET category = 'data', role = 'Data Engineer', sort_order = 9 WHERE name = 'Rohith Sesha Sai' AND category = 'team';
UPDATE contributors SET category = 'data', role = 'Data Engineer', sort_order = 10 WHERE name = 'Neha' AND category = 'team';
UPDATE contributors SET category = 'data', role = 'Data Engineer', sort_order = 11 WHERE name = 'Murali' AND category = 'team';
UPDATE contributors SET category = 'data', role = 'Data Engineer', sort_order = 12 WHERE name = 'Naresh' AND category = 'team';
UPDATE contributors SET category = 'data', role = 'Data Engineer', sort_order = 13 WHERE name = 'Eesha' AND category = 'team';
UPDATE contributors SET category = 'data', role = 'Data Engineer', sort_order = 14 WHERE name = 'Jaswanth' AND category = 'team';
UPDATE contributors SET category = 'data', role = 'Data Engineer', sort_order = 15 WHERE name = 'Raghuram' AND category = 'team';
UPDATE contributors SET category = 'data', role = 'Data Engineer', sort_order = 16 WHERE name = 'Sireesha' AND category = 'team';
