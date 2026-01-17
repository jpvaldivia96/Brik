-- Phase 8: New Roles & Analytics
-- Run this in Supabase SQL Editor

-- 1. Update site_memberships role constraint
ALTER TABLE site_memberships
DROP CONSTRAINT IF EXISTS site_memberships_role_check;

ALTER TABLE site_memberships
ADD CONSTRAINT site_memberships_role_check
CHECK (role IN ('owner', 'admin', 'supervisor', 'guard', 'observer'));

-- 2. Update RLS Policies for Observer
-- Observers should be able to view most things but edit nothing

-- Ensure observers can view site memberships
CREATE POLICY "Observers can view site memberships" ON site_memberships
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM site_memberships
    WHERE site_id = site_memberships.site_id
    AND user_id = auth.uid()
    AND role = 'observer'
  )
);

-- 3. Analytics Functions (RPCs)
-- Efficiently aggregate data on the server side

-- Function: Get Daily Attendance Stats (Last X days)
CREATE OR REPLACE FUNCTION get_daily_attendance_stats(
  target_site_id UUID,
  days_lookback INT DEFAULT 30
)
RETURNS TABLE (
  date TEXT,
  count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char(entry_at, 'YYYY-MM-DD') as date,
    COUNT(DISTINCT person_id) as count
  FROM access_logs
  WHERE site_id = target_site_id
  AND entry_at >= (CURRENT_DATE - days_lookback * INTERVAL '1 day')
  AND voided_at IS NULL
  GROUP BY 1
  ORDER BY 1 ASC;
END;
$$;

-- Function: Get Contractor Distribution
CREATE OR REPLACE FUNCTION get_contractor_distribution(
  target_site_id UUID
)
RETURNS TABLE (
  name TEXT,
  value BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(contractor_snapshot, 'Sin Empresa') as name,
    COUNT(DISTINCT person_id) as value
  FROM access_logs
  WHERE site_id = target_site_id
  AND entry_at >= (CURRENT_DATE - INTERVAL '7 days') -- Active in last 7 days
  AND voided_at IS NULL
  GROUP BY 1
  ORDER BY 2 DESC
  LIMIT 10; -- Top 10 contractors
END;
$$;

-- Function: Get Weekly Comparison (This Week vs Last Week)
CREATE OR REPLACE FUNCTION get_weekly_comparison(
  target_site_id UUID
)
RETURNS TABLE (
  period TEXT,
  count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  this_week_start TIMESTAMPTZ := date_trunc('week', CURRENT_DATE);
  last_week_start TIMESTAMPTZ := this_week_start - INTERVAL '1 week';
BEGIN
  RETURN QUERY
  SELECT 'Esta Semana'::TEXT, COUNT(DISTINCT person_id)
  FROM access_logs
  WHERE site_id = target_site_id
  AND entry_at >= this_week_start
  AND voided_at IS NULL
  UNION ALL
  SELECT 'Semana Pasada'::TEXT, COUNT(DISTINCT person_id)
  FROM access_logs
  WHERE site_id = target_site_id
  AND entry_at >= last_week_start
  AND entry_at < this_week_start
  AND voided_at IS NULL;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_daily_attendance_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_contractor_distribution TO authenticated;
GRANT EXECUTE ON FUNCTION get_weekly_comparison TO authenticated;
