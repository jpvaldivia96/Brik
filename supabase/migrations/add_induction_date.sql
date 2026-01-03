-- Add compliance fields for Tasks/Compliance icons feature
-- Run this in Supabase SQL Editor

-- Add induction_date to people table (when they completed site induction)
ALTER TABLE people ADD COLUMN IF NOT EXISTS induction_date DATE;

-- Add induction_date to workers_profile table
ALTER TABLE workers_profile ADD COLUMN IF NOT EXISTS induction_date DATE;
