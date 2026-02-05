-- =====================================================
-- BRIK Pro - Rol Inspector Externo
-- Agregar nuevo valor al enum role_enum
-- =====================================================

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t 
                 JOIN pg_enum e ON t.oid = e.enumtypid 
                 WHERE t.typname = 'role_enum' AND e.enumlabel = 'external_inspector') THEN
    ALTER TYPE role_enum ADD VALUE 'external_inspector';
  END IF;
END $$;

-- =====================================================
-- Comentarios
-- =====================================================
COMMENT ON TYPE role_enum IS 'Roles de usuario: guard, supervisor, inspector, external_inspector, owner, admin';
