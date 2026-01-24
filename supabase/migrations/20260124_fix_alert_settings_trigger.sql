-- Fix: Allow alert_settings to be created by the trigger without RLS issues
-- The problem: The trigger `create_default_alert_settings` fires AFTER INSERT on sites,
-- but at that moment the user hasn't been added to site_memberships yet.
-- The RLS policy checks for supervisor membership which doesn't exist.

-- Solution: Make the trigger function run with SECURITY DEFINER (bypasses RLS)

-- 1. Drop the existing trigger first
DROP TRIGGER IF EXISTS on_site_created_alert_settings ON sites;

-- 2. Recreate the function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION create_default_alert_settings()
RETURNS TRIGGER
SECURITY DEFINER  -- This allows the function to bypass RLS
SET search_path = public
AS $$
BEGIN
  INSERT INTO alert_settings (site_id) VALUES (NEW.id)
  ON CONFLICT (site_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Recreate the trigger
CREATE TRIGGER on_site_created_alert_settings
  AFTER INSERT ON sites
  FOR EACH ROW
  EXECUTE FUNCTION create_default_alert_settings();
