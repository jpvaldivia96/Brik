-- Advanced Analytics Functions - Phase 1
-- Creates new RPC functions for advanced visualizations
-- SAFE: Does NOT modify existing functions

-- ============================================================================
-- 1. HEATMAP DE HORAS PICO
-- ============================================================================
CREATE OR REPLACE FUNCTION get_hourly_heatmap(
  target_site_id UUID,
  days_back INT DEFAULT 14
)
RETURNS TABLE (
  hour INT,
  day_of_week INT,
  entry_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(HOUR FROM entry_at)::INT as hour,
    EXTRACT(DOW FROM entry_at)::INT as day_of_week,
    COUNT(*)::BIGINT as entry_count
  FROM access_logs
  WHERE site_id = target_site_id
  AND entry_at >= (CURRENT_DATE - days_back * INTERVAL '1 day')
  AND voided_at IS NULL
  GROUP BY 1, 2
  ORDER BY 2, 1;
END;
$$;

-- ============================================================================
-- 2. TIEMPO PROMEDIO DE PERMANENCIA POR CONTRATISTA
-- ============================================================================
CREATE OR REPLACE FUNCTION get_avg_hours_by_contractor(
  target_site_id UUID,
  days_back INT DEFAULT 30
)
RETURNS TABLE (
  contractor TEXT,
  avg_hours NUMERIC,
  total_entries BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(contractor_snapshot, 'Sin Contratista') as contractor,
    ROUND(AVG(
      CASE 
        WHEN exit_at IS NOT NULL THEN 
          EXTRACT(EPOCH FROM (exit_at - entry_at)) / 3600
        ELSE 
          NULL
      END
    )::NUMERIC, 1) as avg_hours,
    COUNT(*)::BIGINT as total_entries
  FROM access_logs
  WHERE site_id = target_site_id
  AND entry_at >= (CURRENT_DATE - days_back * INTERVAL '1 day')
  AND voided_at IS NULL
  AND exit_at IS NOT NULL -- Only completed sessions
  GROUP BY 1
  HAVING COUNT(*) >= 5 -- At least 5 entries
  ORDER BY 2 DESC NULLS LAST
  LIMIT 15;
END;
$$;

-- ============================================================================
-- 3. PUNTUALIDAD SCORE (LEADERBOARD)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_punctuality_leaderboard(
  target_site_id UUID,
  cutoff_time TIME DEFAULT '08:00',
  days_back INT DEFAULT 30
)
RETURNS TABLE (
  person_id UUID,
  full_name TEXT,
  contractor TEXT,
  on_time_count BIGINT,
  total_count BIGINT,
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
    COUNT(*) FILTER (WHERE CAST(al.entry_at AS TIME) <= cutoff_time) as on_time_count,
    COUNT(*) as total_count,
    ROUND(
      (COUNT(*) FILTER (WHERE CAST(al.entry_at AS TIME) <= cutoff_time)::NUMERIC / COUNT(*)) * 100,
      1
    ) as punctuality_pct
  FROM access_logs al
  WHERE al.site_id = target_site_id
  AND al.entry_at >= (CURRENT_DATE - days_back * INTERVAL '1 day')
  AND al.voided_at IS NULL
  GROUP BY al.person_id, al.name_snapshot, al.contractor_snapshot
  HAVING COUNT(*) >= 5 -- At least 5 entries
  ORDER BY punctuality_pct DESC
  LIMIT 10;
END;
$$;

-- ============================================================================
-- 4. TRABAJADORES TOP (HALL OF FAME)
-- ============================================================================

-- Most Punctual Worker
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
  HAVING COUNT(*) >= 10
  ORDER BY punctuality_pct DESC
  LIMIT 1;
END;
$$;

-- Most Consistent Worker
CREATE OR REPLACE FUNCTION get_most_consistent_worker(
  target_site_id UUID
)
RETURNS TABLE (
  person_id UUID,
  full_name TEXT,
  contractor TEXT,
  days_worked BIGINT,
  photo_url TEXT
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
    COUNT(DISTINCT DATE(al.entry_at)) as days_worked,
    p.photo_url
  FROM access_logs al
  LEFT JOIN people p ON al.person_id = p.id
  WHERE al.site_id = target_site_id
  AND al.entry_at >= (CURRENT_DATE - 30 * INTERVAL '1 day')
  AND al.voided_at IS NULL
  GROUP BY al.person_id, al.name_snapshot, al.contractor_snapshot, p.photo_url
  ORDER BY days_worked DESC
  LIMIT 1;
END;
$$;

-- Veteran Worker (Oldest Induction)
CREATE OR REPLACE FUNCTION get_veteran_worker(
  target_site_id UUID
)
RETURNS TABLE (
  person_id UUID,
  full_name TEXT,
  contractor TEXT,
  induction_date DATE,
  days_since_induction INT,
  photo_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as person_id,
    p.full_name,
    COALESCE(wp.role, 'Trabajador') as contractor,
    wp.induction_date,
    (CURRENT_DATE - wp.induction_date)::INT as days_since_induction,
    p.photo_url
  FROM people p
  LEFT JOIN workers_profile wp ON p.id = wp.person_id
  WHERE p.site_id = target_site_id
  AND p.type = 'worker'
  AND wp.induction_date IS NOT NULL
  ORDER BY wp.induction_date ASC
  LIMIT 1;
END;
$$;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION get_hourly_heatmap TO authenticated;
GRANT EXECUTE ON FUNCTION get_avg_hours_by_contractor TO authenticated;
GRANT EXECUTE ON FUNCTION get_punctuality_leaderboard TO authenticated;
GRANT EXECUTE ON FUNCTION get_most_punctual_worker TO authenticated;
GRANT EXECUTE ON FUNCTION get_most_consistent_worker TO authenticated;
GRANT EXECUTE ON FUNCTION get_veteran_worker TO authenticated;
