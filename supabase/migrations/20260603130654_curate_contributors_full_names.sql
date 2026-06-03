/*
  # Curate Contributors Roster and Update to Full Names

  Removes fictional placeholder personas and updates real contributors to
  their full display names.

  1. Removed contributors (placeholder personas):
    - Aarav Mehta, Priya Nair, Anjali Reddy, Diego Ramirez,
      Mohammed Al-Said, Wei Chen, Maya Okafor, Sofia Garcia,
      Yuki Tanaka, Chloe Dubois, Kenji Watanabe, Lucas Bernard

  2. Renamed contributors to full names:
    - Lasya Dandamudi (already full)
    - Emmanith -> Emmanith Bussa
    - Kusuma -> Kusuma Bayya
    - Sai Nikhil -> Sai Nikhil Dunuka
    - Surya Teja -> Surya Teja Koritala
    - Pranathi -> Pranathi Guntaka
    - Khadar Basha -> Khadar Basha Shaik
    - Rohith Sesha Sai -> Rohith Sesha Sai Maddina
    - Neha -> Neha Anuganti
    - Naresh -> Sai Naresh Pakki
    - Eesha -> Eesha Venkat Pasupuleti
    - Raghuram -> Raghu Ram Ravi
    - Thushara Priya (kept as-is)
    - Harshita Puli (kept as-is)

  3. Notes
    - Only the explicitly approved 33 contributors remain.
    - Data deletions are intentional and user-requested.
*/

-- Remove placeholder/fictional personas
DELETE FROM contributors
WHERE name IN (
  'Aarav Mehta',
  'Priya Nair',
  'Anjali Reddy',
  'Diego Ramirez',
  'Mohammed Al-Said',
  'Wei Chen',
  'Maya Okafor',
  'Sofia García',
  'Yuki Tanaka',
  'Chloé Dubois',
  'Kenji Watanabe',
  'Lucas Bernard'
);

-- Update to full names
UPDATE contributors SET name = 'Emmanith Bussa' WHERE name = 'Emmanith';
UPDATE contributors SET name = 'Kusuma Bayya' WHERE name = 'Kusuma';
UPDATE contributors SET name = 'Sai Nikhil Dunuka' WHERE name = 'Sai Nikhil';
UPDATE contributors SET name = 'Surya Teja Koritala' WHERE name = 'Surya Teja';
UPDATE contributors SET name = 'Pranathi Guntaka' WHERE name = 'Pranathi';
UPDATE contributors SET name = 'Khadar Basha Shaik' WHERE name = 'Khadar Basha';
UPDATE contributors SET name = 'Rohith Sesha Sai Maddina' WHERE name = 'Rohith Sesha Sai';
UPDATE contributors SET name = 'Neha Anuganti' WHERE name = 'Neha';
UPDATE contributors SET name = 'Sai Naresh Pakki' WHERE name = 'Naresh';
UPDATE contributors SET name = 'Eesha Venkat Pasupuleti' WHERE name = 'Eesha';
UPDATE contributors SET name = 'Raghu Ram Ravi' WHERE name = 'Raghuram';
