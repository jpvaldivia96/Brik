-- Add role column to workers_profile for job title
-- Run this in Supabase SQL Editor

ALTER TABLE workers_profile 
ADD COLUMN IF NOT EXISTS role TEXT;

-- Add comment for documentation
COMMENT ON COLUMN workers_profile.role IS 'Job title/role of the worker, e.g., Electricista, Gerente, Albañil';
