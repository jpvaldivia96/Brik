-- =========================================================
-- BRIK Pro - Fotos de CI (Anverso/Reverso)
-- Protocolo de seguridad: 4 pasos
-- =========================================================

-- PASO 1: Agregar columnas para fotos de CI
ALTER TABLE people 
  ADD COLUMN IF NOT EXISTS ci_front_url TEXT,
  ADD COLUMN IF NOT EXISTS ci_back_url TEXT;

-- PASO 2: Comentarios para documentación
COMMENT ON COLUMN people.ci_front_url IS 'URL foto anverso del CI (opcional)';
COMMENT ON COLUMN people.ci_back_url IS 'URL foto reverso del CI (opcional)';

-- PASO 3: Policy para que cualquier miembro pueda agregar primera foto
-- (la lógica de "solo primera vez para guardias" se maneja en frontend + verificación)

-- PASO 4: Índices para búsqueda eficiente
CREATE INDEX IF NOT EXISTS idx_people_ci_photos ON people (id) 
  WHERE ci_front_url IS NOT NULL OR ci_back_url IS NOT NULL;
