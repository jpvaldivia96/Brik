-- Add night permit columns to workers_profile table
ALTER TABLE workers_profile 
ADD COLUMN IF NOT EXISTS night_permit_permanent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS night_permit_until TIMESTAMPTZ DEFAULT NULL;

-- Comment for clarity
COMMENT ON COLUMN workers_profile.night_permit_permanent IS 'If true, this worker is exempt from max hours alerts permanently';
COMMENT ON COLUMN workers_profile.night_permit_until IS 'If set, worker is exempt from alerts until this timestamp';
