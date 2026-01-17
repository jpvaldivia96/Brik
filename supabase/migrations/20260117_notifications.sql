-- Smart Push Notifications Schema
-- Run this in Supabase SQL Editor

-- 1. Notification Tokens (FCM tokens per device)
CREATE TABLE IF NOT EXISTS notification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'android',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, token)
);

-- RLS for notification_tokens
ALTER TABLE notification_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own tokens" ON notification_tokens;
CREATE POLICY "Users can manage own tokens" ON notification_tokens
  FOR ALL USING (auth.uid() = user_id);

-- 2. Alert Settings (per-site configuration)
CREATE TABLE IF NOT EXISTS alert_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  
  -- Contractor Attendance Alert
  contractor_attendance_enabled BOOLEAN DEFAULT true,
  contractor_attendance_time TIME DEFAULT '09:00',
  contractor_attendance_threshold INTEGER DEFAULT 50,
  
  -- Favorite/Blocked Entry Alert
  favorite_entry_enabled BOOLEAN DEFAULT true,
  blocked_entry_enabled BOOLEAN DEFAULT true,
  
  -- Capacity Alerts
  min_capacity_enabled BOOLEAN DEFAULT false,
  min_capacity_threshold INTEGER DEFAULT 0,
  max_capacity_enabled BOOLEAN DEFAULT false,
  max_capacity_threshold INTEGER DEFAULT 100,
  
  -- Overtime Alert
  overtime_enabled BOOLEAN DEFAULT true,
  overtime_hours INTEGER DEFAULT 12,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(site_id)
);

-- RLS for alert_settings
ALTER TABLE alert_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Site members can view alert settings" ON alert_settings;
CREATE POLICY "Site members can view alert settings" ON alert_settings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM site_memberships WHERE site_id = alert_settings.site_id AND user_id = auth.uid())
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "Supervisors can manage alert settings" ON alert_settings;
CREATE POLICY "Supervisors can manage alert settings" ON alert_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM site_memberships WHERE site_id = alert_settings.site_id AND user_id = auth.uid() AND role = 'supervisor')
    OR is_platform_admin()
  );

-- 3. Alert History (log of sent notifications)
CREATE TABLE IF NOT EXISTS alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  sent_at TIMESTAMPTZ DEFAULT now(),
  recipients INTEGER DEFAULT 0
);

-- RLS for alert_history
ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Site members can view alert history" ON alert_history;
CREATE POLICY "Site members can view alert history" ON alert_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM site_memberships WHERE site_id = alert_history.site_id AND user_id = auth.uid())
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "System can insert alerts" ON alert_history;
CREATE POLICY "System can insert alerts" ON alert_history
  FOR INSERT WITH CHECK (true);

-- 4. Auto-create alert_settings for new sites
CREATE OR REPLACE FUNCTION create_default_alert_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO alert_settings (site_id) VALUES (NEW.id)
  ON CONFLICT (site_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_site_created_alert_settings ON sites;
CREATE TRIGGER on_site_created_alert_settings
  AFTER INSERT ON sites
  FOR EACH ROW
  EXECUTE FUNCTION create_default_alert_settings();

-- 5. Create settings for existing sites
INSERT INTO alert_settings (site_id)
SELECT id FROM sites s
WHERE NOT EXISTS (SELECT 1 FROM alert_settings WHERE site_id = s.id)
ON CONFLICT (site_id) DO NOTHING;

-- 6. Add is_favorite and is_blocked columns to workers_profile if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workers_profile' AND column_name = 'is_favorite') THEN
    ALTER TABLE workers_profile ADD COLUMN is_favorite BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workers_profile' AND column_name = 'is_blocked') THEN
    ALTER TABLE workers_profile ADD COLUMN is_blocked BOOLEAN DEFAULT false;
  END IF;
END $$;

-- 7. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notification_tokens_user ON notification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_alert_settings_site ON alert_settings(site_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_site ON alert_history(site_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_sent ON alert_history(sent_at DESC);
