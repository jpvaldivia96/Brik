-- =====================================================
-- BRIK Pro - Sistema de Etiquetas para Trabajadores
-- Etiquetas libres con autocompletado
-- =====================================================

-- Tabla central de etiquetas por site (definiciones únicas)
CREATE TABLE IF NOT EXISTS worker_tags_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#9333ea',
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Índice único para evitar duplicados case-insensitive
CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_tags_definitions_unique_name 
  ON worker_tags_definitions (site_id, LOWER(name));

-- Tabla de asignación: qué trabajador tiene qué etiquetas
CREATE TABLE IF NOT EXISTS worker_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID REFERENCES people(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES worker_tags_definitions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(person_id, tag_id)
);

-- =====================================================
-- RLS Policies
-- =====================================================

ALTER TABLE worker_tags_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_tags ENABLE ROW LEVEL SECURITY;

-- Definiciones de etiquetas: todos pueden ver, solo supervisores pueden gestionar
CREATE POLICY "Members can view tags definitions"
  ON worker_tags_definitions FOR SELECT
  USING (is_member(site_id));

CREATE POLICY "Supervisors can insert tags definitions"
  ON worker_tags_definitions FOR INSERT
  WITH CHECK (is_supervisor(site_id));

CREATE POLICY "Supervisors can update tags definitions"
  ON worker_tags_definitions FOR UPDATE
  USING (is_supervisor(site_id));

CREATE POLICY "Supervisors can delete tags definitions"
  ON worker_tags_definitions FOR DELETE
  USING (is_supervisor(site_id));

-- Asignaciones de etiquetas: todos pueden ver, solo supervisores pueden gestionar
CREATE POLICY "Members can view worker tags"
  ON worker_tags FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM people p 
    WHERE p.id = person_id AND is_member(p.site_id)
  ));

CREATE POLICY "Supervisors can insert worker tags"
  ON worker_tags FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM people p 
    WHERE p.id = person_id AND is_supervisor(p.site_id)
  ));

CREATE POLICY "Supervisors can delete worker tags"
  ON worker_tags FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM people p 
    WHERE p.id = person_id AND is_supervisor(p.site_id)
  ));

-- =====================================================
-- Índices para performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_worker_tags_person ON worker_tags(person_id);
CREATE INDEX IF NOT EXISTS idx_worker_tags_tag ON worker_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_tags_definitions_site ON worker_tags_definitions(site_id);
CREATE INDEX IF NOT EXISTS idx_tags_definitions_name ON worker_tags_definitions(site_id, LOWER(name));

-- =====================================================
-- Función para buscar trabajadores por etiqueta
-- =====================================================

CREATE OR REPLACE FUNCTION search_workers_by_tags(
  p_site_id UUID,
  p_tag_ids UUID[]
)
RETURNS TABLE (person_id UUID, matching_tags INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    wt.person_id,
    COUNT(*)::INT as matching_tags
  FROM worker_tags wt
  JOIN worker_tags_definitions wtd ON wtd.id = wt.tag_id
  WHERE wtd.site_id = p_site_id
    AND wt.tag_id = ANY(p_tag_ids)
  GROUP BY wt.person_id
  HAVING COUNT(*) = array_length(p_tag_ids, 1) -- Debe tener TODAS las etiquetas
$$;

-- =====================================================
-- Comentarios
-- =====================================================

COMMENT ON TABLE worker_tags_definitions IS 'Definiciones de etiquetas por site (ej: Puntual, Experto, Líder)';
COMMENT ON TABLE worker_tags IS 'Asignación de etiquetas a trabajadores (many-to-many)';
COMMENT ON FUNCTION search_workers_by_tags IS 'Busca trabajadores que tengan TODAS las etiquetas especificadas';
