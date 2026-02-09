-- =====================================================
-- BRIK Pro - Fix External Inspector Role
-- This migration ensures external_inspector is in role_enum
-- =====================================================

-- The previous migration might not have worked if run inside a transaction
-- This standalone migration uses a different approach

DO $$ 
BEGIN
  -- Check if external_inspector already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t 
    JOIN pg_enum e ON t.oid = e.enumtypid 
    WHERE t.typname = 'role_enum' AND e.enumlabel = 'external_inspector'
  ) THEN
    -- Add the new enum value
    ALTER TYPE role_enum ADD VALUE IF NOT EXISTS 'external_inspector';
  END IF;
END $$;

-- Verify the enum values (this will show in logs)
DO $$
DECLARE
  enum_values TEXT;
BEGIN
  SELECT string_agg(enumlabel, ', ') INTO enum_values
  FROM pg_enum e
  JOIN pg_type t ON e.enumtypid = t.oid
  WHERE t.typname = 'role_enum';
  
  RAISE NOTICE 'Current role_enum values: %', enum_values;
END $$;
