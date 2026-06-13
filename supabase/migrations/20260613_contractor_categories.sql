-- =====================================================
-- BRIK Pro - Categorías de Trabajo por Contratista
-- Ítems de trabajo heredados de contratista a trabajador
-- =====================================================

-- Categorías definidas por contratista por site
CREATE TABLE IF NOT EXISTS contractor_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  contractor_name TEXT NOT NULL,
  category_name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Unique per site+contractor+category (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contractor_categories_unique
  ON contractor_categories (site_id, UPPER(contractor_name), LOWER(category_name));

-- Asignación de categorías a trabajadores (many-to-many)
CREATE TABLE IF NOT EXISTS worker_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID REFERENCES people(id) ON DELETE CASCADE,
  category_id UUID REFERENCES contractor_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(person_id, category_id)
);

-- Snapshot column in access_logs for historical reports
ALTER TABLE access_logs ADD COLUMN IF NOT EXISTS categories_snapshot TEXT;

-- =====================================================
-- RLS Policies
-- =====================================================

ALTER TABLE contractor_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_categories ENABLE ROW LEVEL SECURITY;

-- contractor_categories: members can view, supervisors can manage
CREATE POLICY "Members can view contractor categories"
  ON contractor_categories FOR SELECT
  USING (is_member(site_id));

CREATE POLICY "Supervisors can insert contractor categories"
  ON contractor_categories FOR INSERT
  WITH CHECK (is_supervisor(site_id));

CREATE POLICY "Supervisors can update contractor categories"
  ON contractor_categories FOR UPDATE
  USING (is_supervisor(site_id));

CREATE POLICY "Supervisors can delete contractor categories"
  ON contractor_categories FOR DELETE
  USING (is_supervisor(site_id));

-- worker_categories: via person's site
CREATE POLICY "Members can view worker categories"
  ON worker_categories FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM people p
    WHERE p.id = person_id AND is_member(p.site_id)
  ));

CREATE POLICY "Supervisors can insert worker categories"
  ON worker_categories FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM people p
    WHERE p.id = person_id AND is_supervisor(p.site_id)
  ));

CREATE POLICY "Supervisors can delete worker categories"
  ON worker_categories FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM people p
    WHERE p.id = person_id AND is_supervisor(p.site_id)
  ));

-- =====================================================
-- Índices para performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_contractor_categories_site ON contractor_categories(site_id);
CREATE INDEX IF NOT EXISTS idx_contractor_categories_contractor ON contractor_categories(site_id, UPPER(contractor_name));
CREATE INDEX IF NOT EXISTS idx_worker_categories_person ON worker_categories(person_id);
CREATE INDEX IF NOT EXISTS idx_worker_categories_category ON worker_categories(category_id);

-- =====================================================
-- Comentarios
-- =====================================================

COMMENT ON TABLE contractor_categories IS 'Categorías de trabajo definidas por contratista (ej: Vidrio, Aluminio, Ventanas)';
COMMENT ON TABLE worker_categories IS 'Asignación de categorías de trabajo a trabajadores (many-to-many)';
COMMENT ON COLUMN access_logs.categories_snapshot IS 'Snapshot de categorías del trabajador al momento de entrada';
