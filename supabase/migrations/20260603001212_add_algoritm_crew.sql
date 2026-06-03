/*
  # Add the Algoritm crew

  1. Changes
    - Insert 32 contributors into a new `team` category, displayed in the
      "The crew" section of the Crafted by page
    - Each insert is guarded so re-running the migration is a no-op
    - Lasya is intentionally not duplicated here — she is already listed as a founder

  2. Security
    - No policy changes; existing public-read RLS continues to apply
*/

DO $$
DECLARE
  crew text[][] := ARRAY[
    ARRAY['Tejasree','1'],
    ARRAY['Sai Abhilash','2'],
    ARRAY['Manoj Sai','3'],
    ARRAY['Sai Mohith','4'],
    ARRAY['Mohan Ayyappa','5'],
    ARRAY['Harshavardhan','6'],
    ARRAY['Emmanith','7'],
    ARRAY['Mohith Panchumarthi','8'],
    ARRAY['Kusuma','9'],
    ARRAY['Sai Aniketh','10'],
    ARRAY['Sai Nikhil','11'],
    ARRAY['Nikhil Mattapalli','12'],
    ARRAY['Surya Teja','13'],
    ARRAY['Arjun Kumar','14'],
    ARRAY['Pranathi','15'],
    ARRAY['Khadar Basha','16'],
    ARRAY['Vishal','17'],
    ARRAY['Sai Narmada','18'],
    ARRAY['Vivekananda','19'],
    ARRAY['Naveen Reddy Veena','20'],
    ARRAY['Deepak','21'],
    ARRAY['Sai Sindhu','22'],
    ARRAY['Thushara Priya','23'],
    ARRAY['Harshita Puli','24'],
    ARRAY['Rohith Sesha Sai','25'],
    ARRAY['Neha','26'],
    ARRAY['Murali','27'],
    ARRAY['Naresh','28'],
    ARRAY['Eesha','29'],
    ARRAY['Jaswanth','30'],
    ARRAY['Raghuram','31'],
    ARRAY['Sireesha','32']
  ];
  row_data text[];
BEGIN
  FOREACH row_data SLICE 1 IN ARRAY crew LOOP
    IF NOT EXISTS (
      SELECT 1 FROM contributors WHERE name = row_data[1]
    ) THEN
      INSERT INTO contributors (name, role, category, bio, location, sort_order)
      VALUES (
        row_data[1],
        'Crew',
        'team',
        '',
        '',
        row_data[2]::int
      );
    END IF;
  END LOOP;
END $$;
