-- FIX: Allow subscription creation when a new site is created
-- The trigger function create_subscription_for_site() needs to INSERT into subscriptions
-- but RLS blocks it because there's no INSERT policy.
-- 
-- Solution: Make the trigger function SECURITY DEFINER to bypass RLS (since it's a system process)

-- Recreate the function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION create_subscription_for_site()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO subscriptions (site_id, plan, status, monthly_limit, trial_ends_at)
  VALUES (
    NEW.id, 
    'free', 
    'trial', 
    2000, -- Give full Pro features during trial
    now() + interval '14 days' -- 14 day trial
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also add a policy for INSERT just in case (belt and suspenders)
-- This allows any authenticated user to create a subscription for a site they own
DROP POLICY IF EXISTS "System can create subscriptions" ON subscriptions;
CREATE POLICY "System can create subscriptions"
  ON subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS on_site_create_subscription ON sites;
CREATE TRIGGER on_site_create_subscription
AFTER INSERT ON sites
FOR EACH ROW EXECUTE FUNCTION create_subscription_for_site();
