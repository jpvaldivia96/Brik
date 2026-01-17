-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant permissions
GRANT USAGE ON SCHEMA cron TO postgres;

-- 1. Daily Birthday Notifications (7:00 AM)
SELECT cron.schedule(
  'send-birthday-alerts',
  '0 7 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://xtemforvpgqnalhmekgj.supabase.co/functions/v1/check-scheduled-alerts',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
      body := '{"alert_type": "birthday"}'::jsonb
    ) AS request_id;
  $$
);

-- 2. Daily Attendance Checks (8:00 AM)
SELECT cron.schedule(
  'check-weekly-attendance',
  '0 8 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://xtemforvpgqnalhmekgj.supabase.co/functions/v1/check-scheduled-alerts',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
      body := '{"alert_type": "low_weekly_attendance"}'::jsonb
    ) AS request_id;
  $$
);

-- 3. Daily Attendance Record Check (11:00 PM)
SELECT cron.schedule(
  'check-attendance-record',
  '0 23 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://xtemforvpgqnalhmekgj.supabase.co/functions/v1/check-scheduled-alerts',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
      body := '{"alert_type": "attendance_record"}'::jsonb
    ) AS request_id;
  $$
);

-- 4. Weekly Inactive Contractor Check (Monday 8:00 AM)
SELECT cron.schedule(
  'check-inactive-contractors',
  '0 8 * * 1',
  $$
  SELECT
    net.http_post(
      url := 'https://xtemforvpgqnalhmekgj.supabase.co/functions/v1/check-scheduled-alerts',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
      body := '{"alert_type": "contractor_inactive"}'::jsonb
    ) AS request_id;
  $$
);

-- 5. Weekly Growth Check (Monday 9:00 AM)
SELECT cron.schedule(
  'check-exponential-growth',
  '0 9 * * 1',
  $$
  SELECT
    net.http_post(
      url := 'https://xtemforvpgqnalhmekgj.supabase.co/functions/v1/check-scheduled-alerts',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
      body := '{"alert_type": "exponential_growth"}'::jsonb
    ) AS request_id;
  $$
);

-- 6. Monthly Worker of the Month (1st day 10:00 AM)
SELECT cron.schedule(
  'select-worker-of-month',
  '0 10 1 * *',
  $$
  SELECT
    net.http_post(
      url := 'https://xtemforvpgqnalhmekgj.supabase.co/functions/v1/check-scheduled-alerts',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
      body := '{"alert_type": "worker_of_month"}'::jsonb
    ) AS request_id;
  $$
);

-- 7. Meeting Reminders (Every 15 minutes)
SELECT cron.schedule(
  'check-meeting-reminders',
  '*/15 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://xtemforvpgqnalhmekgj.supabase.co/functions/v1/check-scheduled-alerts',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
      body := '{"alert_type": "meeting_reminder"}'::jsonb
    ) AS request_id;
  $$
);

-- 8. Weather Alerts (Every 30 minutes)
SELECT cron.schedule(
  'check-weather-alerts',
  '*/30 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://xtemforvpgqnalhmekgj.supabase.co/functions/v1/check-weather',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
    ) AS request_id;
  $$
);
