-- Inspection Notes with Workers - Schema Update
-- Add many-to-many relationship between notes and workers
-- SAFE: Only adds new objects, does not modify existing

-- ============================================================================
-- 1. CREATE inspection_note_workers TABLE (many-to-many)
-- ============================================================================
CREATE TABLE IF NOT EXISTS inspection_note_workers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  note_id UUID NOT NULL REFERENCES inspection_notes(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint to prevent duplicates
  UNIQUE(note_id, person_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_inspection_note_workers_note 
  ON inspection_note_workers(note_id);

CREATE INDEX IF NOT EXISTS idx_inspection_note_workers_person 
  ON inspection_note_workers(person_id);

-- ============================================================================
-- 2. ENABLE RLS
-- ============================================================================
ALTER TABLE inspection_note_workers ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. RLS POLICIES
-- ============================================================================

-- Policy: Users can view worker links for notes they can see
CREATE POLICY "Users can view inspection note workers for their sites"
ON inspection_note_workers
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM inspection_notes n
    JOIN site_memberships sm ON n.site_id = sm.site_id
    WHERE n.id = inspection_note_workers.note_id
    AND sm.user_id = auth.uid()
    AND sm.role IN ('inspector', 'supervisor', 'admin', 'owner')
  )
);

-- Policy: Users can insert worker links for their own notes
CREATE POLICY "Users can add workers to their notes"
ON inspection_note_workers
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM inspection_notes n
    WHERE n.id = inspection_note_workers.note_id
    AND n.inspector_user_id = auth.uid()
  )
);

-- Policy: Users can delete worker links from their own notes
CREATE POLICY "Users can remove workers from their notes"
ON inspection_note_workers
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM inspection_notes n
    WHERE n.id = inspection_note_workers.note_id
    AND (
      n.inspector_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM site_memberships sm
        WHERE sm.site_id = n.site_id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('supervisor', 'admin', 'owner')
      )
    )
  )
);

-- ============================================================================
-- 4. FUNCTION: Get notes for a specific worker
-- ============================================================================
CREATE OR REPLACE FUNCTION get_worker_inspection_notes(
  target_person_id UUID,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  note_id UUID,
  date DATE,
  content TEXT,
  inspector_user_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id as note_id,
    n.date,
    n.content,
    n.inspector_user_id,
    n.created_at
  FROM inspection_notes n
  INNER JOIN inspection_note_workers nw ON nw.note_id = n.id
  WHERE nw.person_id = target_person_id
  AND (start_date IS NULL OR n.date >= start_date)
  AND (end_date IS NULL OR n.date <= end_date)
  ORDER BY n.date DESC, n.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_worker_inspection_notes TO authenticated;

-- ============================================================================
-- DONE: inspection_note_workers table created with RLS
-- ============================================================================
