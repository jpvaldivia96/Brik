-- Add notification settings table for site-specific webhook configurations
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  
  -- Webhook URLs
  slack_webhook_url TEXT,
  teams_webhook_url TEXT,
  
  -- Trigger configurations (what events trigger notifications)
  notify_on_watchlist_entry BOOLEAN DEFAULT TRUE,
  notify_on_contractor_complete BOOLEAN DEFAULT FALSE,
  notify_on_late_arrivals BOOLEAN DEFAULT FALSE,
  notify_on_fatigue_alerts BOOLEAN DEFAULT TRUE,
  notify_on_visitor_entry BOOLEAN DEFAULT FALSE,
  
  -- Late arrival settings
  late_arrival_time TIME DEFAULT '08:30:00',
  
  -- Created/Updated
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(site_id)
);

-- Enable RLS
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Supervisors can manage notification settings" ON notification_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM site_memberships
      WHERE site_memberships.site_id = notification_settings.site_id
        AND site_memberships.user_id = auth.uid()
        AND site_memberships.role IN ('supervisor', 'guard')
    )
  );

-- Add comment
COMMENT ON TABLE notification_settings IS 'Stores notification webhook URLs and trigger configurations per site';
