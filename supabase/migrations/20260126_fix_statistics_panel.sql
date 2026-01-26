-- Fix Statistics Panel - Improved Analytics Functions
-- Migration: 20260126_fix_statistics_panel.sql
-- Purpose: Fix static/incorrect data in statistics panel

-- ============================================================================
-- 1. CONTRATISTAS ACTIVOS (Sin límite)
-- Returns actual count of active contractors, not limited to 10
-- ============================================================================
CREATE OR REPLACE FUNCTION get_active_contractors_count(
  target_site_id UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  contractor_count INT;
BEGIN
  SELECT COUNT(DISTINCT COALESCE(contractor_snapshot, 'Sin Empresa'))
  INTO contractor_count
  FROM access_logs
  WHERE site_id = target_site_id
  AND entry_at >= (CURRENT_DATE - INTERVAL '7 days')
  AND voided_at IS NULL;
  
  RETURN COALESCE(contractor_count, 0);
END;
$$;

-- ============================================================================
-- 2. DÍAS SIN ACCIDENTES (Mejorado)
-- Calculates from first site entry if no accidents recorded
-- ============================================================================
CREATE OR REPLACE FUNCTION get_days_without_accidents_v2(
  target_site_id UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  last_accident_date DATE;
  first_entry_date DATE;
  days_count INT;
BEGIN
  -- Find the most recent accident from alert_logs
  SELECT MAX(DATE(created_at)) INTO last_accident_date
  FROM alert_logs
  WHERE site_id = target_site_id
  AND alert_type = 'accident_reported';

  IF last_accident_date IS NOT NULL THEN
    -- Has accidents, count from last one
    days_count := CURRENT_DATE - last_accident_date;
  ELSE
    -- No accidents: calculate from first entry to site
    SELECT MIN(DATE(entry_at)) INTO first_entry_date
    FROM access_logs
    WHERE site_id = target_site_id
    AND voided_at IS NULL;
    
    IF first_entry_date IS NOT NULL THEN
      days_count := CURRENT_DATE - first_entry_date;
    ELSE
      -- No entries at all, return 0
      days_count := 0;
    END IF;
  END IF;

  RETURN COALESCE(days_count, 0);
END;
$$;

-- ============================================================================
-- 3. ALERTAS INTELIGENTES (Día anterior vs Promedio)
-- Compares yesterday's data against 30-day average per contractor
-- ============================================================================
CREATE OR REPLACE FUNCTION get_smart_anomalies(
  target_site_id UUID
)
RETURNS TABLE (
  anomaly_type TEXT,
  description TEXT,
  severity TEXT,
  affected_entity TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  yesterday DATE := CURRENT_DATE - 1;
BEGIN
  RETURN QUERY
  -- Anomaly 1: Contractor with significantly fewer workers yesterday vs their average
  WITH contractor_avg AS (
    SELECT
      COALESCE(contractor_snapshot, 'Sin Contratista') as contractor,
      ROUND(AVG(daily_count)::NUMERIC, 1) as avg_daily,
      COUNT(DISTINCT work_date) as days_active
    FROM (
      SELECT 
        contractor_snapshot,
        DATE(entry_at) as work_date,
        COUNT(DISTINCT person_id) as daily_count
      FROM access_logs
      WHERE site_id = target_site_id
      AND entry_at >= (CURRENT_DATE - 30 * INTERVAL '1 day')
      AND entry_at < CURRENT_DATE -- Exclude today (incomplete)
      AND voided_at IS NULL
      GROUP BY contractor_snapshot, DATE(entry_at)
    ) daily_stats
    GROUP BY contractor_snapshot
    HAVING COUNT(DISTINCT work_date) >= 5 -- At least 5 workdays
  ),
  yesterday_count AS (
    SELECT
      COALESCE(contractor_snapshot, 'Sin Contratista') as contractor,
      COUNT(DISTINCT person_id) as yesterday_workers
    FROM access_logs
    WHERE site_id = target_site_id
    AND DATE(entry_at) = yesterday
    AND voided_at IS NULL
    GROUP BY contractor_snapshot
  )
  SELECT
    'contractor_below_avg'::TEXT,
    FORMAT('%s: %s trabajadores ayer (promedio: %s)',
      ca.contractor,
      COALESCE(yc.yesterday_workers, 0),
      ca.avg_daily
    ),
    CASE
      WHEN COALESCE(yc.yesterday_workers, 0)::NUMERIC / NULLIF(ca.avg_daily, 0) < 0.3 THEN 'high'
      WHEN COALESCE(yc.yesterday_workers, 0)::NUMERIC / NULLIF(ca.avg_daily, 0) < 0.6 THEN 'medium'
      ELSE 'low'
    END,
    ca.contractor
  FROM contractor_avg ca
  LEFT JOIN yesterday_count yc ON ca.contractor = yc.contractor
  WHERE COALESCE(yc.yesterday_workers, 0)::NUMERIC / NULLIF(ca.avg_daily, 0) < 0.6 -- Below 60% of average
  
  UNION ALL
  
  -- Anomaly 2: Worker marked as daily was absent yesterday
  SELECT
    'daily_worker_absent'::TEXT,
    FORMAT('%s no vino ayer (trabaja ~%s días/semana)',
      name_snapshot,
      ROUND(days_worked::NUMERIC / 4, 1)
    ),
    'low'::TEXT,
    name_snapshot
  FROM (
    SELECT
      name_snapshot,
      COUNT(DISTINCT DATE(entry_at)) as days_worked,
      MAX(DATE(entry_at)) as last_seen
    FROM access_logs
    WHERE site_id = target_site_id
    AND entry_at >= (CURRENT_DATE - 30 * INTERVAL '1 day')
    AND voided_at IS NULL
    GROUP BY person_id, name_snapshot
    HAVING 
      COUNT(DISTINCT DATE(entry_at)) >= 20 -- Comes most days (20+ of 30)
      AND MAX(DATE(entry_at)) < yesterday -- Didn't come yesterday
  ) frequent_workers
  LIMIT 3;
END;
$$;

-- ============================================================================
-- 4. RANKING PUNTUALIDAD SEMANAL
-- Ranks workers by how many times they arrived early THIS week
-- Based on arrival order each day (1st, 2nd, 3rd...) weighted by earliness
-- ============================================================================
CREATE OR REPLACE FUNCTION get_weekly_punctuality_ranking(
  target_site_id UUID,
  early_cutoff TIME DEFAULT '08:00'
)
RETURNS TABLE (
  person_id UUID,
  full_name TEXT,
  contractor TEXT,
  early_arrivals INT,
  total_days INT,
  avg_arrival_time TIME,
  punctuality_score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  week_start DATE := DATE_TRUNC('week', CURRENT_DATE)::DATE;
BEGIN
  RETURN QUERY
  WITH daily_arrivals AS (
    SELECT
      al.person_id,
      al.name_snapshot,
      COALESCE(al.contractor_snapshot, 'Sin Contratista') as contractor,
      DATE(al.entry_at) as work_date,
      MIN(al.entry_at::TIME) as first_entry_time,
      ROW_NUMBER() OVER (PARTITION BY DATE(al.entry_at) ORDER BY MIN(al.entry_at)) as arrival_rank
    FROM access_logs al
    WHERE al.site_id = target_site_id
    AND DATE(al.entry_at) >= week_start
    AND al.voided_at IS NULL
    GROUP BY al.person_id, al.name_snapshot, al.contractor_snapshot, DATE(al.entry_at)
  )
  SELECT
    da.person_id,
    da.name_snapshot as full_name,
    da.contractor,
    COUNT(*) FILTER (WHERE da.first_entry_time <= early_cutoff)::INT as early_arrivals,
    COUNT(DISTINCT da.work_date)::INT as total_days,
    AVG(da.first_entry_time)::TIME as avg_arrival_time,
    -- Score: early arrivals * 10 + bonus for being in top 10 arrivals each day
    (COUNT(*) FILTER (WHERE da.first_entry_time <= early_cutoff) * 10 +
     COUNT(*) FILTER (WHERE da.arrival_rank <= 10) * 2)::NUMERIC as punctuality_score
  FROM daily_arrivals da
  GROUP BY da.person_id, da.name_snapshot, da.contractor
  HAVING COUNT(DISTINCT da.work_date) >= 1 -- At least 1 day this week
  ORDER BY punctuality_score DESC, early_arrivals DESC
  LIMIT 10;
END;
$$;

-- ============================================================================
-- 5. ACTUALIZAR HALL OF FAME (Reducir mínimos)
-- Reduce minimum entries from 10 to 3 for more responsive data
-- ============================================================================

-- Most Punctual Worker (Reduced minimum)
CREATE OR REPLACE FUNCTION get_most_punctual_worker(
  target_site_id UUID
)
RETURNS TABLE (
  person_id UUID,
  full_name TEXT,
  contractor TEXT,
  avg_entry_time TIME,
  photo_url TEXT,
  punctuality_pct NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    al.person_id,
    al.name_snapshot as full_name,
    COALESCE(al.contractor_snapshot, 'Sin Contratista') as contractor,
    AVG(CAST(al.entry_at AS TIME)) as avg_entry_time,
    p.photo_url,
    ROUND(
      (COUNT(*) FILTER (WHERE CAST(al.entry_at AS TIME) <= '08:00')::NUMERIC / COUNT(*)) * 100,
      1
    ) as punctuality_pct
  FROM access_logs al
  LEFT JOIN people p ON al.person_id = p.id
  WHERE al.site_id = target_site_id
  AND al.entry_at >= (CURRENT_DATE - 30 * INTERVAL '1 day')
  AND al.voided_at IS NULL
  GROUP BY al.person_id, al.name_snapshot, al.contractor_snapshot, p.photo_url
  HAVING COUNT(*) >= 3 -- Reduced from 10 to 3
  ORDER BY punctuality_pct DESC
  LIMIT 1;
END;
$$;

-- Most Consistent Worker (no change needed, already works with any count)

-- ============================================================================
-- 6. GRANT PERMISSIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION get_active_contractors_count TO authenticated;
GRANT EXECUTE ON FUNCTION get_days_without_accidents_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION get_smart_anomalies TO authenticated;
GRANT EXECUTE ON FUNCTION get_weekly_punctuality_ranking TO authenticated;
