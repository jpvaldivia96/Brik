-- Fix for get_most_punctual_worker - Lower minimum entries requirement
-- Run this in Supabase SQL Editor to replace the function

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
  HAVING COUNT(*) >= 5  -- Changed from 10 to 5
  ORDER BY punctuality_pct DESC
  LIMIT 1;
END;
$$;
