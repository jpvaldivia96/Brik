-- ═══════════════════════════════════════════════════════════════════════════════
-- BILLING INFO TABLE + PAYMENT PROOFS STORAGE
-- Stores billing details per site (1 record per obra)
-- Bucket for payment proof uploads (comprobantes)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Billing Info Table
CREATE TABLE IF NOT EXISTS billing_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,        -- Nombre / Razón Social
  tax_id TEXT NOT NULL,               -- NIT / CI
  billing_email TEXT NOT NULL,        -- Email de facturación
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(site_id)                     -- Solo 1 registro por obra
);

-- RLS
ALTER TABLE billing_info ENABLE ROW LEVEL SECURITY;

-- Owners and supervisors can read billing info for their sites
CREATE POLICY "billing_info_select"
  ON billing_info FOR SELECT
  USING (site_id IN (
    SELECT site_id FROM site_memberships 
    WHERE user_id = auth.uid() AND role IN ('owner', 'supervisor')
  ));

-- Owners and supervisors can insert billing info
CREATE POLICY "billing_info_insert"
  ON billing_info FOR INSERT
  WITH CHECK (site_id IN (
    SELECT site_id FROM site_memberships 
    WHERE user_id = auth.uid() AND role IN ('owner', 'supervisor')
  ));

-- Owners and supervisors can update billing info
CREATE POLICY "billing_info_update"
  ON billing_info FOR UPDATE
  USING (site_id IN (
    SELECT site_id FROM site_memberships 
    WHERE user_id = auth.uid() AND role IN ('owner', 'supervisor')
  ));

-- 2. Payment Proofs Storage Bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for payment-proofs bucket
CREATE POLICY "payment_proofs_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'payment-proofs' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "payment_proofs_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'payment-proofs');
