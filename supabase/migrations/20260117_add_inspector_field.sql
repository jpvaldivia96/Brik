-- Add is_inspector field if it doesn't exist
-- This is safe to run multiple times

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'workers_profile' 
    AND column_name = 'is_inspector'
  ) THEN
    ALTER TABLE workers_profile ADD COLUMN is_inspector BOOLEAN DEFAULT false;
  END IF;
END $$;
