-- =====================================================
-- BRIK Pro Subscription System
-- Phase 1: Database Schema for Monetization
-- =====================================================

-- Plans enum
CREATE TYPE plan_type AS ENUM ('free', 'starter', 'pro', 'enterprise');
CREATE TYPE subscription_status AS ENUM ('active', 'trial', 'past_due', 'cancelled', 'paused');

-- Subscriptions table - one per site
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  
  -- Plan details
  plan plan_type NOT NULL DEFAULT 'free',
  status subscription_status NOT NULL DEFAULT 'active',
  
  -- Limits based on plan
  monthly_limit INTEGER NOT NULL DEFAULT 100, -- Number of access_logs allowed per month
  
  -- Usage tracking (reset monthly)
  current_month_usage INTEGER NOT NULL DEFAULT 0,
  usage_reset_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', now()) + interval '1 month',
  
  -- Trial info
  trial_ends_at TIMESTAMPTZ, -- NULL if not trial, or date when trial ends
  
  -- Billing
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(site_id)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_site ON subscriptions(site_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- =====================================================
-- Function: Get plan limits
-- =====================================================
CREATE OR REPLACE FUNCTION get_plan_limit(p plan_type)
RETURNS INTEGER AS $$
BEGIN
  CASE p
    WHEN 'free' THEN RETURN 100;
    WHEN 'starter' THEN RETURN 500;
    WHEN 'pro' THEN RETURN 2000;
    WHEN 'enterprise' THEN RETURN 999999; -- Effectively unlimited
    ELSE RETURN 100;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- Trigger: Increment usage on new access_log
-- =====================================================
CREATE OR REPLACE FUNCTION increment_subscription_usage()
RETURNS TRIGGER AS $$
BEGIN
  -- Increment the current month usage for this site's subscription
  UPDATE subscriptions
  SET 
    current_month_usage = current_month_usage + 1,
    updated_at = now()
  WHERE site_id = NEW.site_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists, then create
DROP TRIGGER IF EXISTS on_access_log_insert_usage ON access_logs;
CREATE TRIGGER on_access_log_insert_usage
AFTER INSERT ON access_logs
FOR EACH ROW EXECUTE FUNCTION increment_subscription_usage();

-- =====================================================
-- Trigger: Reset usage monthly
-- =====================================================
CREATE OR REPLACE FUNCTION reset_monthly_usage()
RETURNS TRIGGER AS $$
BEGIN
  -- If we've passed the reset date, reset usage
  IF NEW.current_month_usage > 0 AND now() >= NEW.usage_reset_at THEN
    NEW.current_month_usage := 0;
    NEW.usage_reset_at := date_trunc('month', now()) + interval '1 month';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_subscription_check_reset ON subscriptions;
CREATE TRIGGER on_subscription_check_reset
BEFORE UPDATE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION reset_monthly_usage();

-- =====================================================
-- Function: Check if site can add more entries
-- =====================================================
CREATE OR REPLACE FUNCTION can_site_add_entry(p_site_id UUID)
RETURNS JSONB AS $$
DECLARE
  sub RECORD;
BEGIN
  -- Get subscription for this site
  SELECT * INTO sub FROM subscriptions WHERE site_id = p_site_id;
  
  -- If no subscription, allow (new site, will create free tier)
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'plan', 'free',
      'usage', 0,
      'limit', 100,
      'percentage', 0
    );
  END IF;
  
  -- Check if we need to reset (new month)
  IF now() >= sub.usage_reset_at THEN
    UPDATE subscriptions 
    SET current_month_usage = 0, 
        usage_reset_at = date_trunc('month', now()) + interval '1 month'
    WHERE id = sub.id;
    sub.current_month_usage := 0;
  END IF;
  
  -- Check trial status
  IF sub.status = 'trial' AND sub.trial_ends_at IS NOT NULL AND now() > sub.trial_ends_at THEN
    -- Trial expired, downgrade to free
    UPDATE subscriptions SET plan = 'free', status = 'active', monthly_limit = 100 WHERE id = sub.id;
    sub.plan := 'free';
    sub.monthly_limit := 100;
  END IF;
  
  -- Calculate usage percentage
  DECLARE
    usage_pct INTEGER := ROUND((sub.current_month_usage::NUMERIC / sub.monthly_limit) * 100);
  BEGIN
    RETURN jsonb_build_object(
      'allowed', sub.current_month_usage < sub.monthly_limit,
      'plan', sub.plan,
      'usage', sub.current_month_usage,
      'limit', sub.monthly_limit,
      'percentage', usage_pct,
      'status', sub.status,
      'trial_ends_at', sub.trial_ends_at
    );
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Trigger: Auto-create subscription for new sites
-- =====================================================
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_site_create_subscription ON sites;
CREATE TRIGGER on_site_create_subscription
AFTER INSERT ON sites
FOR EACH ROW EXECUTE FUNCTION create_subscription_for_site();

-- =====================================================
-- Create subscriptions for existing sites (migration)
-- =====================================================
INSERT INTO subscriptions (site_id, plan, status, monthly_limit)
SELECT id, 'free', 'active', 100
FROM sites
WHERE id NOT IN (SELECT site_id FROM subscriptions)
ON CONFLICT (site_id) DO NOTHING;

-- =====================================================
-- RLS Policies
-- =====================================================
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own site's subscription
CREATE POLICY "Users can view own subscription"
  ON subscriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM site_memberships
      WHERE site_memberships.site_id = subscriptions.site_id
        AND site_memberships.user_id = auth.uid()
    )
  );

-- Only supervisors can update subscription
CREATE POLICY "Supervisors can update subscription"
  ON subscriptions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM site_memberships
      WHERE site_memberships.site_id = subscriptions.site_id
        AND site_memberships.user_id = auth.uid()
        AND site_memberships.role = 'supervisor'
    )
  );
