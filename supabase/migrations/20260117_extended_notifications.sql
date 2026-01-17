-- Extended Smart Notifications - Database Schema
-- Run this in Supabase SQL Editor

-- 1. User Notification Preferences (personal settings per user per site)
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  
  -- Original 6 alerts
  contractor_attendance BOOLEAN DEFAULT true,
  favorite_entry BOOLEAN DEFAULT true,
  blocked_entry BOOLEAN DEFAULT true,
  min_capacity BOOLEAN DEFAULT false,
  max_capacity BOOLEAN DEFAULT false,
  overtime BOOLEAN DEFAULT true,
  
  -- New 25 alerts
  unusual_rotation BOOLEAN DEFAULT true,
  mass_entry BOOLEAN DEFAULT true,
  night_activity BOOLEAN DEFAULT true,
  first_entry BOOLEAN DEFAULT false,
  exit_without_entry BOOLEAN DEFAULT true,
  low_weekly_attendance BOOLEAN DEFAULT true,
  attendance_record BOOLEAN DEFAULT false,
  contractor_inactive BOOLEAN DEFAULT true,
  exponential_growth BOOLEAN DEFAULT true,
  accident_reported BOOLEAN DEFAULT true,
  safety_milestone BOOLEAN DEFAULT false,
  weather_alert BOOLEAN DEFAULT true,
  attendance_prediction BOOLEAN DEFAULT false,
  birthday BOOLEAN DEFAULT false,
  worker_of_month BOOLEAN DEFAULT false,
  meeting_reminder BOOLEAN DEFAULT true,
  announcement BOOLEAN DEFAULT true,
  inspector_visit BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, site_id)
);

-- RLS for user_notification_preferences
ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own preferences" ON user_notification_preferences;
CREATE POLICY "Users can manage own preferences" ON user_notification_preferences
  FOR ALL USING (auth.uid() = user_id);

-- 2. Scheduled Meetings
CREATE TABLE IF NOT EXISTS scheduled_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  notified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for scheduled_meetings
ALTER TABLE scheduled_meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Site members can view meetings" ON scheduled_meetings;
CREATE POLICY "Site members can view meetings" ON scheduled_meetings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM site_memberships WHERE site_id = scheduled_meetings.site_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Supervisors can manage meetings" ON scheduled_meetings;
CREATE POLICY "Supervisors can manage meetings" ON scheduled_meetings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM site_memberships WHERE site_id = scheduled_meetings.site_id AND user_id = auth.uid() AND role = 'supervisor')
  );

-- 3. Announcements
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  priority TEXT DEFAULT 'normal', -- normal, high, urgent
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for announcements
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Site members can view announcements" ON announcements;
CREATE POLICY "Site members can view announcements" ON announcements
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM site_memberships WHERE site_id = announcements.site_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Supervisors can manage announcements" ON announcements;
CREATE POLICY "Supervisors can manage announcements" ON announcements
  FOR ALL USING (
    EXISTS (SELECT 1 FROM site_memberships WHERE site_id = announcements.site_id AND user_id = auth.uid() AND role = 'supervisor')
  );

-- 4. Add new fields to workers_profile
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workers_profile' AND column_name = 'birthday') THEN
    ALTER TABLE workers_profile ADD COLUMN birthday DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workers_profile' AND column_name = 'is_inspector') THEN
    ALTER TABLE workers_profile ADD COLUMN is_inspector BOOLEAN DEFAULT false;
  END IF;
END $$;

-- 5. Extend alert_settings with new alert types (site-wide enable/disable)
DO $$
BEGIN
  -- Add columns for new alert types if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alert_settings' AND column_name = 'unusual_rotation_enabled') THEN
    ALTER TABLE alert_settings 
      ADD COLUMN unusual_rotation_enabled BOOLEAN DEFAULT true,
      ADD COLUMN unusual_rotation_threshold INTEGER DEFAULT 3,
      ADD COLUMN mass_entry_enabled BOOLEAN DEFAULT true,
      ADD COLUMN mass_entry_threshold INTEGER DEFAULT 20,
      ADD COLUMN mass_entry_minutes INTEGER DEFAULT 15,
      ADD COLUMN night_activity_enabled BOOLEAN DEFAULT true,
      ADD COLUMN night_activity_start TIME DEFAULT '22:00',
      ADD COLUMN night_activity_end TIME DEFAULT '06:00',
      ADD COLUMN first_entry_enabled BOOLEAN DEFAULT false,
      ADD COLUMN exit_without_entry_enabled BOOLEAN DEFAULT true,
      ADD COLUMN low_weekly_attendance_enabled BOOLEAN DEFAULT true,
      ADD COLUMN low_weekly_attendance_threshold INTEGER DEFAULT 70,
      ADD COLUMN low_weekly_attendance_days INTEGER DEFAULT 3,
      ADD COLUMN attendance_record_enabled BOOLEAN DEFAULT false,
      ADD COLUMN contractor_inactive_enabled BOOLEAN DEFAULT true,
      ADD COLUMN contractor_inactive_days INTEGER DEFAULT 7,
      ADD COLUMN exponential_growth_enabled BOOLEAN DEFAULT true,
      ADD COLUMN exponential_growth_threshold INTEGER DEFAULT 30,
      ADD COLUMN accident_reported_enabled BOOLEAN DEFAULT true,
      ADD COLUMN safety_milestone_enabled BOOLEAN DEFAULT false,
      ADD COLUMN safety_milestone_days INTEGER DEFAULT 30,
      ADD COLUMN weather_alert_enabled BOOLEAN DEFAULT true,
      ADD COLUMN attendance_prediction_enabled BOOLEAN DEFAULT false,
      ADD COLUMN birthday_enabled BOOLEAN DEFAULT false,
      ADD COLUMN worker_of_month_enabled BOOLEAN DEFAULT false,
      ADD COLUMN meeting_reminder_enabled BOOLEAN DEFAULT true,
      ADD COLUMN meeting_reminder_minutes INTEGER DEFAULT 30,
      ADD COLUMN announcement_enabled BOOLEAN DEFAULT true,
      ADD COLUMN inspector_visit_enabled BOOLEAN DEFAULT true;
  END IF;
END $$;

-- 6. Auto-create default user preferences when user joins a site
CREATE OR REPLACE FUNCTION create_default_user_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_notification_preferences (user_id, site_id)
  VALUES (NEW.user_id, NEW.site_id)
  ON CONFLICT (user_id, site_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_site_membership_created_preferences ON site_memberships;
CREATE TRIGGER on_site_membership_created_preferences
  AFTER INSERT ON site_memberships
  FOR EACH ROW
  EXECUTE FUNCTION create_default_user_preferences();

-- 7. Create preferences for existing site memberships
INSERT INTO user_notification_preferences (user_id, site_id)
SELECT user_id, site_id FROM site_memberships sm
WHERE NOT EXISTS (
  SELECT 1 FROM user_notification_preferences WHERE user_id = sm.user_id AND site_id = sm.site_id
)
ON CONFLICT (user_id, site_id) DO NOTHING;

-- 8. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_prefs_user_site ON user_notification_preferences(user_id, site_id);
CREATE INDEX IF NOT EXISTS idx_meetings_site ON scheduled_meetings(site_id);
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled ON scheduled_meetings(scheduled_at) WHERE notified = false;
CREATE INDEX IF NOT EXISTS idx_announcements_site ON announcements(site_id);
CREATE INDEX IF NOT EXISTS idx_workers_birthday ON workers_profile(birthday) WHERE birthday IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workers_inspector ON workers_profile(is_inspector) WHERE is_inspector = true;
