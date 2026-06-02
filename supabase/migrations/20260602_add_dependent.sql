-- Add is_dependent column to workers_profile
ALTER TABLE workers_profile
  ADD COLUMN IF NOT EXISTS is_dependent BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_workers_dependent
  ON workers_profile(is_dependent) WHERE is_dependent = true;

COMMENT ON COLUMN workers_profile.is_dependent IS
  'Si true, genera alertas de entrada y salida automáticas (asalariado de seguimiento)';
