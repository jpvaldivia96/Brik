-- Advanced Analytics Functions - Phase 2
-- Predictive and Smart Analytics
-- SAFE: Does NOT modify existing functions

-- ============================================================================
-- 1. CLIMA VS PRODUCTIVIDAD
-- ============================================================================
CREATE OR REPLACE FUNCTION get_weather_correlation(
  target_site_id UUID,
  days_back INT DEFAULT 30
)
RETURNS TABLE (
  date DATE,
  weather_condition TEXT,
  attendance_count BIGINT,
  temperature NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(al.entry_at) as date,
    COALESCE(ws.condition, 'Unknown') as weather_condition,
    COUNT(DISTINCT al.person_id) as attendance_count,
    ws.temperature
  FROM access_logs al
  LEFT JOIN site_weather_status ws ON ws.site_id = al.site_id AND DATE(ws.updated_at) = DATE(al.entry_at)
  WHERE al.site_id = target_site_id
  AND al.entry_at >= (CURRENT_DATE - days_back * INTERVAL '1 day')
  AND al.voided_at IS NULL
  GROUP BY DATE(al.entry_at), ws.condition, ws.temperature
  ORDER BY 1 DESC;
END;
$$;

-- ============================================================================
-- 2. TASA DE ROTACIÓN (TURNOVER) MENSUAL
-- ============================================================================
CREATE OR REPLACE FUNCTION get_monthly_turnover(
  target_site_id UUID,
  months_back INT DEFAULT 6
)
RETURNS TABLE (
  month TEXT,
  new_workers BIGINT,
  inactive_workers BIGINT,
  net_change INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH monthly_stats AS (
    SELECT
      TO_CHAR(DATE_TRUNC('month', entry_at), 'YYYY-MM') as month,
      person_id,
      MIN(entry_at) as first_entry
    FROM access_logs
    WHERE site_id = target_site_id
    AND entry_at >= (DATE_TRUNC('month', CURRENT_DATE) - (months_back * INTERVAL '1 month'))
    AND voided_at IS NULL
    GROUP BY TO_CHAR(DATE_TRUNC('month', entry_at), 'YYYY-MM'), person_id
  ),
  new_per_month AS (
    SELECT
      month,
      COUNT(*) as new_count
    FROM monthly_stats ms
    WHERE NOT EXISTS (
      SELECT 1 FROM access_logs al2
      WHERE al2.person_id = ms.person_id
      AND al2.site_id = target_site_id
      AND al2.entry_at < DATE_TRUNC('month', ms.first_entry)
      AND al2.voided_at IS NULL
    )
    GROUP BY month
  ),
  all_months AS (
    SELECT DISTINCT month FROM monthly_stats
  )
  SELECT
    am.month,
    COALESCE(npm.new_count, 0) as new_workers,
    0::BIGINT as inactive_workers, -- Simplified for now
    COALESCE(npm.new_count, 0)::INTEGER as net_change
  FROM all_months am
  LEFT JOIN new_per_month npm ON am.month = npm.month
  ORDER BY am.month DESC;
END;
$$;

-- ============================================================================
-- 3. ANOMALÍAS Y ALERTAS PREDICTIVAS
-- ============================================================================
CREATE OR REPLACE FUNCTION get_anomalies(
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
  this_week_start TIMESTAMPTZ := DATE_TRUNC('week', CURRENT_DATE);
  last_week_start TIMESTAMPTZ := this_week_start - INTERVAL '1 week';
BEGIN
  RETURN QUERY
  -- Anomaly 1: Contractor with significant drop in attendance
  WITH contractor_comparison AS (
    SELECT
      COALESCE(contractor_snapshot, 'Sin Contratista') as contractor,
      COUNT(DISTINCT CASE WHEN entry_at >= this_week_start THEN person_id END) as this_week,
      COUNT(DISTINCT CASE WHEN entry_at >= last_week_start AND entry_at < this_week_start THEN person_id END) as last_week
    FROM access_logs
    WHERE site_id = target_site_id
    AND entry_at >= last_week_start
    AND voided_at IS NULL
    GROUP BY contractor_snapshot
    HAVING COUNT(DISTINCT CASE WHEN entry_at >= last_week_start AND entry_at < this_week_start THEN person_id END) >= 5
  )
  SELECT
    'contractor_drop'::TEXT,
    FORMAT('Contratista "%s" tiene %s%% menos trabajadores esta semana (%s vs %s)',
      contractor,
      ROUND((1 - (this_week::NUMERIC / NULLIF(last_week, 0))) * 100),
      this_week,
      last_week
    ),
    CASE
      WHEN this_week::NUMERIC / NULLIF(last_week, 0) < 0.5 THEN 'high'
      WHEN this_week::NUMERIC / NULLIF(last_week, 0) < 0.7 THEN 'medium'
      ELSE 'low'
    END,
    contractor
  FROM contractor_comparison
  WHERE this_week::NUMERIC / NULLIF(last_week, 0) < 0.7 -- 30% drop

  UNION ALL

  -- Anomaly 2: Increase in night entries
  SELECT
    'night_activity_spike'::TEXT,
    FORMAT('Incremento de %s%% en entradas nocturnas esta semana',
      ROUND((this_week_night::NUMERIC / NULLIF(last_week_night, 0) - 1) * 100)
    ),
    'medium'::TEXT,
    'Sistema'::TEXT
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE entry_at >= this_week_start AND CAST(entry_at AS TIME) BETWEEN '22:00' AND '23:59' OR CAST(entry_at AS TIME) BETWEEN '00:00' AND '06:00') as this_week_night,
      COUNT(*) FILTER (WHERE entry_at >= last_week_start AND entry_at < this_week_start AND CAST(entry_at AS TIME) BETWEEN '22:00' AND '23:59' OR CAST(entry_at AS TIME) BETWEEN '00:00' AND '06:00') as last_week_night
    FROM access_logs
    WHERE site_id = target_site_id
    AND entry_at >= last_week_start
    AND voided_at IS NULL
  ) night_stats
  WHERE this_week_night > last_week_night * 2 AND last_week_night > 0

  UNION ALL

  -- Anomaly 3: Worker absent after being daily
  SELECT
    'worker_absent'::TEXT,
    FORMAT('Trabajador "%s" no ha entrado en %s días (era asiduo)',
      name_snapshot,
      CURRENT_DATE - MAX(DATE(entry_at))
    ),
    'low'::TEXT,
    name_snapshot
  FROM access_logs
  WHERE site_id = target_site_id
  AND entry_at >= (CURRENT_DATE - 30 * INTERVAL '1 day')
  AND voided_at IS NULL
  GROUP BY person_id, name_snapshot
  HAVING
    COUNT(DISTINCT DATE(entry_at)) >= 15 -- Was coming frequently
    AND MAX(DATE(entry_at)) < CURRENT_DATE - 5 -- But hasn't come in 5 days
  LIMIT 3;
END;
$$;

-- ============================================================================
-- 4. PROGRESO VS TARGET (Requires site setting)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_progress_vs_target(
  target_site_id UUID,
  expected_daily_attendance INT DEFAULT 50,
  days_back INT DEFAULT 14
)
RETURNS TABLE (
  date DATE,
  actual_attendance BIGINT,
  target_attendance INT,
  variance_pct NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(entry_at) as date,
    COUNT(DISTINCT person_id) as actual_attendance,
    expected_daily_attendance as target_attendance,
    ROUND(((COUNT(DISTINCT person_id)::NUMERIC / expected_daily_attendance) - 1) * 100, 1) as variance_pct
  FROM access_logs
  WHERE site_id = target_site_id
  AND entry_at >= (CURRENT_DATE - days_back * INTERVAL '1 day')
  AND voided_at IS NULL
  GROUP BY DATE(entry_at)
  ORDER BY 1 DESC;
END;
$$;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION get_weather_correlation TO authenticated;
GRANT EXECUTE ON FUNCTION get_monthly_turnover TO authenticated;
GRANT EXECUTE ON FUNCTION get_anomalies TO authenticated;
GRANT EXECUTE ON FUNCTION get_progress_vs_target TO authenticated;
