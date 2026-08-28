-- =============================================
-- Banco de Confianza — Cross-site trust reports
-- =============================================

-- 1) Severity enum
DO $$ BEGIN
  CREATE TYPE public.trust_severity AS ENUM ('leve', 'moderado', 'grave');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Trust reports table (platform-wide, not scoped to a single site)
CREATE TABLE IF NOT EXISTS public.trust_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identity (cross-site matching by CI)
  ci TEXT NOT NULL,
  person_name TEXT NOT NULL,
  photo_url TEXT,
  contractor_name TEXT,
  
  -- Report details
  severity trust_severity NOT NULL DEFAULT 'leve',
  reason TEXT NOT NULL,
  category TEXT,
  
  -- Source (private — not exposed to other sites in the application layer)
  reported_by_site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  reported_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_by_site_name TEXT,
  
  -- Metadata
  reported_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  resolved_at TIMESTAMPTZ,
  resolved_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3) Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_trust_reports_ci ON trust_reports(ci);
CREATE INDEX IF NOT EXISTS idx_trust_reports_active ON trust_reports(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_trust_reports_severity ON trust_reports(severity);
CREATE INDEX IF NOT EXISTS idx_trust_reports_site ON trust_reports(reported_by_site_id);

-- 4) RLS
ALTER TABLE trust_reports ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user can view active reports (source site hidden in app layer)
DROP POLICY IF EXISTS "Authenticated users can view active trust reports" ON trust_reports;
CREATE POLICY "Authenticated users can view active trust reports"
  ON trust_reports FOR SELECT
  USING (auth.role() = 'authenticated' AND is_active = true);

-- Also allow viewing own site's inactive reports (for "Mis Reportes" tab)
DROP POLICY IF EXISTS "Site reporters can view own reports" ON trust_reports;
CREATE POLICY "Site reporters can view own reports"
  ON trust_reports FOR SELECT
  USING (auth.role() = 'authenticated' AND reported_by_user_id = auth.uid());

-- Insert: any authenticated user
DROP POLICY IF EXISTS "Authenticated users can insert trust reports" ON trust_reports;
CREATE POLICY "Authenticated users can insert trust reports"
  ON trust_reports FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Update: only the user who reported can modify/resolve
DROP POLICY IF EXISTS "Reporter can update own reports" ON trust_reports;
CREATE POLICY "Reporter can update own reports"
  ON trust_reports FOR UPDATE
  USING (reported_by_user_id = auth.uid());

-- Delete: only the user who reported
DROP POLICY IF EXISTS "Reporter can delete own reports" ON trust_reports;
CREATE POLICY "Reporter can delete own reports"
  ON trust_reports FOR DELETE
  USING (reported_by_user_id = auth.uid());
