/*
  # Correct Contributor Roles

  Updates the `role` (and `category` where applicable) for contributors
  to match the canonical team roster.

  1. Role corrections
    - Emmanith: now "Data Engineer" (moved to data section)
    - Rohith Sesha Sai: now "Full Stack Developer" (moved to engineering)
    - Pranathi: now "Data analyst" (moved to data)
    - Surya Teja: now "Machine learning engineer"
    - Eesha: now "Data Analyst"
    - Naresh: now "AI Data Engineer"
    - Kusuma: now "Software Developer"
    - Sai Nikhil: now "AI/ML Engineer"
    - Thushara Priya: now "Data analyst"
    - Neha: now "Full stack Engineer" (moved to engineering)
    - Khadar Basha: now "Data Analyst" (moved to data)
    - Raghuram: now "Data engineer"
    - Harshita Puli: now "Data Engineer"
    - Sai Narmada: now "SAP consultant"

  2. Notes
    - Only updates existing rows; no inserts or deletes.
    - Categories are realigned where the new role no longer fits the
      previous section (e.g. Software Developer -> engineering).
*/

UPDATE contributors SET role = 'Data Engineer', category = 'data' WHERE name = 'Emmanith';
UPDATE contributors SET role = 'Full Stack Developer', category = 'engineering' WHERE name = 'Rohith Sesha Sai';
UPDATE contributors SET role = 'Data analyst', category = 'data' WHERE name = 'Pranathi';
UPDATE contributors SET role = 'Machine learning engineer', category = 'engineering' WHERE name = 'Surya Teja';
UPDATE contributors SET role = 'Data Analyst', category = 'data' WHERE name = 'Eesha';
UPDATE contributors SET role = 'AI Data Engineer', category = 'data' WHERE name = 'Naresh';
UPDATE contributors SET role = 'Software Developer', category = 'engineering' WHERE name = 'Kusuma';
UPDATE contributors SET role = 'AI/ML Engineer', category = 'engineering' WHERE name = 'Sai Nikhil';
UPDATE contributors SET role = 'Data analyst', category = 'data' WHERE name = 'Thushara Priya';
UPDATE contributors SET role = 'Full stack Engineer', category = 'engineering' WHERE name = 'Neha';
UPDATE contributors SET role = 'Data Analyst', category = 'data' WHERE name = 'Khadar Basha';
UPDATE contributors SET role = 'Data engineer', category = 'data' WHERE name = 'Raghuram';
UPDATE contributors SET role = 'Data Engineer', category = 'data' WHERE name = 'Harshita Puli';
UPDATE contributors SET role = 'SAP consultant', category = 'data' WHERE name = 'Sai Narmada';
