-- Push Notifications Schema
-- Migration: add_push_notifications

-- 1. Add receive_notifications column to site_memberships
ALTER TABLE site_memberships
ADD COLUMN IF NOT EXISTS receive_notifications boolean DEFAULT true;

-- 2. Create notification_tokens table for storing FCM tokens
CREATE TABLE IF NOT EXISTS notification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, token)
);

-- Enable RLS
ALTER TABLE notification_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage their own tokens
CREATE POLICY "Users can manage own tokens" ON notification_tokens
  FOR ALL USING (auth.uid() = user_id);

-- 3. Create notification_log table for tracking sent notifications
CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb,
  sent_at timestamptz DEFAULT now(),
  read_at timestamptz,
  error text
);

-- Enable RLS
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own notifications
CREATE POLICY "Users can read own notifications" ON notification_log
  FOR SELECT USING (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_notification_tokens_user ON notification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_user ON notification_log(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_site ON notification_log(site_id, sent_at DESC);

-- Comment
COMMENT ON TABLE notification_tokens IS 'Stores FCM push notification tokens for each user device';
COMMENT ON TABLE notification_log IS 'Log of all push notifications sent';
COMMENT ON COLUMN site_memberships.receive_notifications IS 'Whether user wants to receive push notifications for this site';
