-- Add induction_date to workers_profile table
-- Run this in Supabase SQL Editor

ALTER TABLE workers_profile ADD COLUMN IF NOT EXISTS induction_date DATE;

-- Optional: You can drop the column from people if it was added there by mistake
-- ALTER TABLE people DROP COLUMN IF EXISTS induction_date;
