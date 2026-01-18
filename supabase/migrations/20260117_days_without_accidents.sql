-- Days Without Accidents Helper Function
-- Used to calculate days since last accident

CREATE OR REPLACE FUNCTION get_days_without_accidents(
  target_site_id UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  last_accident_date DATE;
  days_count INT;
BEGIN
  -- Find the most recent accident from alert_logs
  SELECT MAX(DATE(created_at)) INTO last_accident_date
  FROM alert_logs
  WHERE site_id = target_site_id
  AND alert_type = 'accident_reported';

  IF last_accident_date IS NULL THEN
    -- No accidents recorded, count from site creation or 1 year ago
    SELECT LEAST(
      CURRENT_DATE - DATE(created_at),
      365
    ) INTO days_count
    FROM sites
    WHERE id = target_site_id;
  ELSE
    days_count := CURRENT_DATE - last_accident_date;
  END IF;

  RETURN COALESCE(days_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION get_days_without_accidents TO authenticated;
