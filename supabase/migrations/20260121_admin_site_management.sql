-- Add 'suspended' status to subscription_status enum
-- This allows platform admins to pause site subscriptions

-- Note: In PostgreSQL, we can only add values to enums, not remove them
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'suspended';

-- Function for platform admin to suspend a site's subscription
CREATE OR REPLACE FUNCTION suspend_site_subscription(p_site_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE subscriptions
  SET status = 'suspended', updated_at = now()
  WHERE site_id = p_site_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for platform admin to reactivate a site's subscription  
CREATE OR REPLACE FUNCTION reactivate_site_subscription(p_site_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE subscriptions
  SET status = 'active', updated_at = now()
  WHERE site_id = p_site_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for platform admin to delete a site completely
-- This cascades to all related data (access_logs, people, etc)
CREATE OR REPLACE FUNCTION delete_site_completely(p_site_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM sites WHERE id = p_site_id;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
