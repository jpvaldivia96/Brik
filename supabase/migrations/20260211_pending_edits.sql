-- ========================================
-- PENDING EDITS: Cola de aprobación para ediciones de guardias
-- Los guardias proponen cambios, Owner/Supervisor aprueba
-- ========================================

CREATE TABLE IF NOT EXISTS pending_edits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE NOT NULL,
  person_id UUID REFERENCES people(id) ON DELETE CASCADE NOT NULL,
  requested_by UUID NOT NULL,
  -- Qué cambió
  field_name TEXT NOT NULL,        -- 'full_name', 'photo_url', 'phone', etc.
  table_name TEXT NOT NULL,        -- 'people' o 'workers_profile'
  old_value TEXT,                  -- valor anterior (NULL si es primera vez)
  new_value TEXT NOT NULL,         -- valor propuesto
  -- Estado
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,                -- nota opcional del revisor
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para consultas frecuentes (pendientes por sitio)
CREATE INDEX IF NOT EXISTS idx_pending_edits_site_status 
  ON pending_edits(site_id, status);

-- Índice para buscar pendientes de una persona específica
CREATE INDEX IF NOT EXISTS idx_pending_edits_person 
  ON pending_edits(person_id, status);

-- RLS
ALTER TABLE pending_edits ENABLE ROW LEVEL SECURITY;

-- Guardias pueden insertar solicitudes en su sitio
CREATE POLICY "Guards can insert pending edits" ON pending_edits
  FOR INSERT WITH CHECK (
    site_id IN (
      SELECT site_id FROM site_memberships 
      WHERE user_id = auth.uid()
    )
  );

-- Usuarios pueden ver solicitudes de su sitio
CREATE POLICY "Members can view pending edits" ON pending_edits
  FOR SELECT USING (
    site_id IN (
      SELECT site_id FROM site_memberships 
      WHERE user_id = auth.uid()
    )
  );

-- Supervisores/owners pueden actualizar (aprobar/rechazar)
CREATE POLICY "Supervisors can update pending edits" ON pending_edits
  FOR UPDATE USING (
    site_id IN (
      SELECT site_id FROM site_memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('supervisor', 'owner', 'admin')
    )
  );
