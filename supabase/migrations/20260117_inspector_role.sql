-- Inspector Role - Database Schema
-- Phase 1: Create inspection_notes table and permissions
-- SAFE: Only adds new objects, does not modify existing

-- ============================================================================
-- 1. ADD 'inspector' TO role_enum
-- ============================================================================
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t 
                 JOIN pg_enum e ON t.oid = e.enumtypid 
                 WHERE t.typname = 'role_enum' AND e.enumlabel = 'inspector') THEN
    ALTER TYPE role_enum ADD VALUE 'inspector';
  END IF;
END $$;

-- ============================================================================
-- 2. CREATE inspection_notes TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS inspection_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  inspector_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  content TEXT NOT NULL CHECK (char_length(content) <= 10000),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_inspection_notes_site_date 
  ON inspection_notes(site_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_inspection_notes_inspector 
  ON inspection_notes(inspector_user_id);

-- Full-text search index (Spanish)
CREATE INDEX IF NOT EXISTS idx_inspection_notes_content_search 
  ON inspection_notes USING gin(to_tsvector('spanish', content));

-- ============================================================================
-- 4. ENABLE RLS
-- ============================================================================
ALTER TABLE inspection_notes ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. RLS POLICIES
-- ============================================================================

-- Policy 1: Inspectors and Supervisors can view notes from their sites
CREATE POLICY "Inspectors and Supervisors can view notes from their sites"
ON inspection_notes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM site_memberships sm
    WHERE sm.site_id = inspection_notes.site_id
    AND sm.user_id = auth.uid()
    AND sm.role IN ('inspector', 'supervisor', 'admin', 'owner')
  )
);

-- Policy 2: Inspectors and Supervisors can insert notes
CREATE POLICY "Inspectors and Supervisors can insert notes"
ON inspection_notes
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM site_memberships sm
    WHERE sm.site_id = inspection_notes.site_id
    AND sm.user_id = auth.uid()
    AND sm.role IN ('inspector', 'supervisor', 'admin', 'owner')
  )
  AND inspector_user_id = auth.uid()
);

-- Policy 3: Users can only update their own notes
CREATE POLICY "Inspectors can update their own notes"
ON inspection_notes
FOR UPDATE
USING (
  inspector_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM site_memberships sm
    WHERE sm.site_id = inspection_notes.site_id
    AND sm.user_id = auth.uid()
    AND sm.role IN ('inspector', 'supervisor', 'admin', 'owner')
  )
);

-- Policy 4: Supervisors and admins can update any note from their sites
CREATE POLICY "Supervisors can update any note from their sites"
ON inspection_notes
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM site_memberships sm
    WHERE sm.site_id = inspection_notes.site_id
    AND sm.user_id = auth.uid()
    AND sm.role IN ('supervisor', 'admin', 'owner')
  )
);

-- Policy 5: Users can delete their own notes
CREATE POLICY "Users can delete their own notes"
ON inspection_notes
FOR DELETE
USING (
  inspector_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM site_memberships sm
    WHERE sm.site_id = inspection_notes.site_id
    AND sm.user_id = auth.uid()
    AND sm.role IN ('supervisor', 'admin', 'owner')
  )
);

-- ============================================================================
-- 6. CREATE HELPER FUNCTION FOR SEARCH
-- ============================================================================
CREATE OR REPLACE FUNCTION search_inspection_notes(
  target_site_id UUID,
  search_query TEXT DEFAULT NULL,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  site_id UUID,
  inspector_user_id UUID,
  inspector_email TEXT,
  date DATE,
  content TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    insp.id,
    insp.site_id,
    insp.inspector_user_id,
    u.email as inspector_email,
    insp.date,
    insp.content,
    insp.created_at,
    insp.updated_at
  FROM inspection_notes insp
  LEFT JOIN auth.users u ON insp.inspector_user_id = u.id
  WHERE insp.site_id = target_site_id
  AND (search_query IS NULL OR to_tsvector('spanish', insp.content) @@ plainto_tsquery('spanish', search_query))
  AND (start_date IS NULL OR insp.date >= start_date)
  AND (end_date IS NULL OR insp.date <= end_date)
  ORDER BY insp.date DESC, insp.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION search_inspection_notes TO authenticated;

-- ============================================================================
-- 7. CREATE TRIGGER FOR updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_inspection_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_inspection_notes_updated_at
  BEFORE UPDATE ON inspection_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_inspection_notes_updated_at();

-- ============================================================================
-- DONE: inspection_notes table created with RLS and search capabilities
-- ============================================================================
