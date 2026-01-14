-- =====================================================
-- BRIK Platform Admin System
-- Admin Panel for Super Users
-- =====================================================

-- Platform admins table - users who can access /brik-control
CREATE TABLE IF NOT EXISTS platform_admins (
  email TEXT PRIMARY KEY,
  name TEXT,
  can_manage_subscriptions BOOLEAN DEFAULT true,
  can_view_all_data BOOLEAN DEFAULT true,
  can_extend_trials BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT
);

-- Insert the primary admin
INSERT INTO platform_admins (email, name, created_by)
VALUES ('juanpablovaldc@gmail.com', 'Juan Pablo Valdivia', 'system')
ON CONFLICT (email) DO NOTHING;

-- Payment history table
CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  method TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'stripe', 'mercadopago', 'qr'
  proof_url TEXT, -- URL to uploaded payment proof
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'confirmed', 'rejected'
  confirmed_by TEXT, -- Admin email who confirmed
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_history_site ON payment_history(site_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_status ON payment_history(status);

-- Add extra fields to subscriptions if they don't exist
DO $$ 
BEGIN
  -- Trial days added (for extending trials)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'trial_days_added') THEN
    ALTER TABLE subscriptions ADD COLUMN trial_days_added INTEGER DEFAULT 0;
  END IF;
  
  -- Payment method
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'payment_method') THEN
    ALTER TABLE subscriptions ADD COLUMN payment_method TEXT DEFAULT 'manual';
  END IF;
  
  -- Last payment date
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'last_payment_at') THEN
    ALTER TABLE subscriptions ADD COLUMN last_payment_at TIMESTAMPTZ;
  END IF;
  
  -- Admin notes
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'admin_notes') THEN
    ALTER TABLE subscriptions ADD COLUMN admin_notes TEXT;
  END IF;
END $$;

-- =====================================================
-- RLS Policies for platform_admins
-- =====================================================
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- Admins can view admin list
CREATE POLICY "Admins can view admin list"
  ON platform_admins
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      WHERE pa.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- =====================================================
-- RLS Policies for payment_history
-- =====================================================
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

-- Admins can view all payment history
CREATE POLICY "Admins can view all payments"
  ON payment_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      WHERE pa.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Admins can insert/update payments
CREATE POLICY "Admins can manage payments"
  ON payment_history
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      WHERE pa.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- =====================================================
-- Function: Check if user is platform admin
-- =====================================================
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM platform_admins pa
    WHERE pa.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Function: Get admin dashboard stats
-- =====================================================
CREATE OR REPLACE FUNCTION get_admin_dashboard_stats()
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  -- Only allow platform admins
  IF NOT is_platform_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;
  
  SELECT jsonb_build_object(
    'total_sites', (SELECT COUNT(*) FROM sites),
    'total_workers', (SELECT COUNT(*) FROM workers_profile),
    'total_visitors', (SELECT COUNT(*) FROM visitors_profile),
    'total_access_logs_this_month', (
      SELECT COUNT(*) FROM access_logs 
      WHERE created_at >= date_trunc('month', now())
    ),
    'sites_on_trial', (
      SELECT COUNT(*) FROM subscriptions 
      WHERE status = 'trial' AND trial_ends_at > now()
    ),
    'sites_on_pro', (
      SELECT COUNT(*) FROM subscriptions 
      WHERE plan = 'pro' AND status = 'active'
    ),
    'trials_expiring_soon', (
      SELECT COUNT(*) FROM subscriptions 
      WHERE status = 'trial' 
        AND trial_ends_at BETWEEN now() AND now() + interval '3 days'
    ),
    'new_sites_this_month', (
      SELECT COUNT(*) FROM sites 
      WHERE created_at >= date_trunc('month', now())
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Function: Get all sites for admin (with details)
-- =====================================================
CREATE OR REPLACE FUNCTION get_admin_sites_list()
RETURNS JSONB AS $$
BEGIN
  -- Only allow platform admins
  IF NOT is_platform_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;
  
  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'timezone', s.timezone,
        'created_at', s.created_at,
        'subscription', (
          SELECT jsonb_build_object(
            'plan', sub.plan,
            'status', sub.status,
            'monthly_limit', sub.monthly_limit,
            'current_usage', sub.current_month_usage,
            'trial_ends_at', sub.trial_ends_at,
            'trial_days_added', COALESCE(sub.trial_days_added, 0)
          )
          FROM subscriptions sub WHERE sub.site_id = s.id
        ),
        'worker_count', (SELECT COUNT(*) FROM workers_profile wp JOIN people p ON p.id = wp.person_id WHERE p.site_id = s.id),
        'visitor_count', (SELECT COUNT(*) FROM visitors_profile vp JOIN people p ON p.id = vp.person_id WHERE p.site_id = s.id),
        'access_logs_this_month', (
          SELECT COUNT(*) FROM access_logs al 
          WHERE al.site_id = s.id 
            AND al.created_at >= date_trunc('month', now())
        ),
        'supervisor_email', (
          SELECT u.email FROM auth.users u
          JOIN site_memberships sm ON sm.user_id = u.id
          WHERE sm.site_id = s.id AND sm.role = 'supervisor'
          LIMIT 1
        )
      )
    )
    FROM sites s
    ORDER BY s.created_at DESC
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Function: Update subscription (admin only)
-- =====================================================
CREATE OR REPLACE FUNCTION admin_update_subscription(
  p_site_id UUID,
  p_plan TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_trial_days_to_add INTEGER DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  sub RECORD;
BEGIN
  -- Only allow platform admins
  IF NOT is_platform_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  -- Get current subscription
  SELECT * INTO sub FROM subscriptions WHERE site_id = p_site_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subscription not found');
  END IF;
  
  -- Update fields if provided
  UPDATE subscriptions SET
    plan = COALESCE(p_plan::plan_type, plan),
    status = COALESCE(p_status::subscription_status, status),
    monthly_limit = CASE 
      WHEN p_plan = 'free' THEN 100
      WHEN p_plan = 'starter' THEN 500
      WHEN p_plan = 'pro' THEN 2000
      WHEN p_plan = 'enterprise' THEN 999999
      ELSE monthly_limit
    END,
    trial_days_added = COALESCE(trial_days_added, 0) + COALESCE(p_trial_days_to_add, 0),
    trial_ends_at = CASE 
      WHEN p_trial_days_to_add IS NOT NULL THEN 
        COALESCE(trial_ends_at, now()) + (p_trial_days_to_add || ' days')::interval
      ELSE trial_ends_at
    END,
    admin_notes = COALESCE(p_notes, admin_notes),
    updated_at = now()
  WHERE site_id = p_site_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Admin policy on subscriptions (view all)
-- =====================================================
CREATE POLICY "Admins can view all subscriptions"
  ON subscriptions
  FOR SELECT
  USING (
    is_platform_admin() OR
    EXISTS (
      SELECT 1 FROM site_memberships
      WHERE site_memberships.site_id = subscriptions.site_id
        AND site_memberships.user_id = auth.uid()
    )
  );

-- Admin policy on subscriptions (update)
CREATE POLICY "Admins can update subscriptions"
  ON subscriptions
  FOR UPDATE
  USING (is_platform_admin());

-- =====================================================
-- Admin access to all data for investigations
-- =====================================================

-- Admins can view all workers
CREATE POLICY "Admins can view all workers"
  ON workers_profile
  FOR SELECT
  USING (
    is_platform_admin() OR
    EXISTS (
      SELECT 1 FROM people p
      JOIN site_memberships sm ON sm.site_id = p.site_id
      WHERE p.id = workers_profile.person_id
        AND sm.user_id = auth.uid()
    )
  );

-- Admins can view all visitors
CREATE POLICY "Admins can view all visitors"
  ON visitors_profile
  FOR SELECT
  USING (
    is_platform_admin() OR
    EXISTS (
      SELECT 1 FROM people p
      JOIN site_memberships sm ON sm.site_id = p.site_id
      WHERE p.id = visitors_profile.person_id
        AND sm.user_id = auth.uid()
    )
  );

-- Admins can view all access logs
CREATE POLICY "Admins can view all access_logs"
  ON access_logs
  FOR SELECT
  USING (
    is_platform_admin() OR
    EXISTS (
      SELECT 1 FROM site_memberships
      WHERE site_memberships.site_id = access_logs.site_id
        AND site_memberships.user_id = auth.uid()
    )
  );

-- Admins can view all sites
CREATE POLICY "Admins can view all sites"
  ON sites
  FOR SELECT
  USING (
    is_platform_admin() OR
    EXISTS (
      SELECT 1 FROM site_memberships
      WHERE site_memberships.site_id = sites.id
        AND site_memberships.user_id = auth.uid()
    )
  );

-- Admins can view all people
CREATE POLICY "Admins can view all people"
  ON people
  FOR SELECT
  USING (
    is_platform_admin() OR
    EXISTS (
      SELECT 1 FROM site_memberships
      WHERE site_memberships.site_id = people.site_id
        AND site_memberships.user_id = auth.uid()
    )
  );

-- Admins can view all site settings
CREATE POLICY "Admins can view all site_settings"
  ON site_settings
  FOR SELECT
  USING (
    is_platform_admin() OR
    EXISTS (
      SELECT 1 FROM site_memberships
      WHERE site_memberships.site_id = site_settings.site_id
        AND site_memberships.user_id = auth.uid()
    )
  );

-- Admins can view all site memberships
CREATE POLICY "Admins can view all site_memberships"
  ON site_memberships
  FOR SELECT
  USING (
    is_platform_admin() OR
    site_memberships.user_id = auth.uid()
  );
