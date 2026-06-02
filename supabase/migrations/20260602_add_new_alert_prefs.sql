-- Add new alert type columns to user_notification_preferences
ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS favorite_exit BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS dependent_entry BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS dependent_exit BOOLEAN DEFAULT true;
