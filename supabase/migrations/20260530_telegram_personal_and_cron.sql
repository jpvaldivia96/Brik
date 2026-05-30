-- Add personal Telegram chat_id to user notification preferences
ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

-- Index for quick lookups by chat_id
CREATE INDEX IF NOT EXISTS idx_user_prefs_telegram 
  ON user_notification_preferences(telegram_chat_id) 
  WHERE telegram_chat_id IS NOT NULL;

-- Cron jobs for periodic alerts (requires pg_cron extension)
-- Run: SELECT cron.schedule(...) from the SQL Editor

-- Every day at 8:00 AM Bolivia time (12:00 UTC)
SELECT cron.schedule(
  'daily-birthday-check',
  '0 12 * * *',
  $$SELECT net.http_post(
    url := 'https://xtemforvpgqnalhmekgj.supabase.co/functions/v1/check-scheduled-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"alert_type":"birthday"}'::jsonb
  );$$
);

-- Every day at 9:30 AM Bolivia time (13:30 UTC)
SELECT cron.schedule(
  'daily-attendance-check',
  '30 13 * * *',
  $$SELECT net.http_post(
    url := 'https://xtemforvpgqnalhmekgj.supabase.co/functions/v1/check-scheduled-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"alert_type":"contractor_attendance"}'::jsonb
  );$$
);

-- Every 2 hours: overtime check
SELECT cron.schedule(
  'overtime-check',
  '0 */2 * * *',
  $$SELECT net.http_post(
    url := 'https://xtemforvpgqnalhmekgj.supabase.co/functions/v1/check-scheduled-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"alert_type":"overtime"}'::jsonb
  );$$
);

-- Every day at 6:00 PM Bolivia time (22:00 UTC)
SELECT cron.schedule(
  'daily-evening-checks',
  '0 22 * * *',
  $$SELECT net.http_post(
    url := 'https://xtemforvpgqnalhmekgj.supabase.co/functions/v1/check-scheduled-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"alert_type":"all"}'::jsonb
  );$$
);

-- Every 15 minutes: meeting reminders
SELECT cron.schedule(
  'meeting-reminders',
  '*/15 * * * *',
  $$SELECT net.http_post(
    url := 'https://xtemforvpgqnalhmekgj.supabase.co/functions/v1/check-scheduled-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"alert_type":"meeting_reminder"}'::jsonb
  );$$
);
