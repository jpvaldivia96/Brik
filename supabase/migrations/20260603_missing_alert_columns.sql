-- Add missing columns to workers_profile for alerts that reference them
-- These columns are checked by alertTriggers.ts but never existed

-- For inspector_visit alert (checkInspectorVisit)
ALTER TABLE workers_profile ADD COLUMN IF NOT EXISTS is_inspector BOOLEAN DEFAULT false;

-- For dependent_entry/exit alerts (checkDependentAlerts)
ALTER TABLE workers_profile ADD COLUMN IF NOT EXISTS is_dependent BOOLEAN DEFAULT false;

-- For birthday alert (checkBirthdays in check-scheduled-alerts)
ALTER TABLE workers_profile ADD COLUMN IF NOT EXISTS birthday DATE;
