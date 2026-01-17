-- Phase 8.1: Fully Customizable User Preferences
-- Add threshold columns to user_notification_preferences so each user can set their own limits

ALTER TABLE user_notification_preferences
-- Contractor Attendance
ADD COLUMN IF NOT EXISTS contractor_attendance_threshold INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS contractor_attendance_time TIME DEFAULT '09:00',

-- Mass Entry
ADD COLUMN IF NOT EXISTS mass_entry_threshold INTEGER DEFAULT 20,
ADD COLUMN IF NOT EXISTS mass_entry_minutes INTEGER DEFAULT 15,

-- Low Weekly Attendance
ADD COLUMN IF NOT EXISTS low_weekly_attendance_threshold INTEGER DEFAULT 70,

-- Exponetial Growth
ADD COLUMN IF NOT EXISTS exponential_growth_threshold INTEGER DEFAULT 30,

-- Night Activity
ADD COLUMN IF NOT EXISTS night_activity_start TIME DEFAULT '22:00',
ADD COLUMN IF NOT EXISTS night_activity_end TIME DEFAULT '06:00',

-- Capacity
ADD COLUMN IF NOT EXISTS min_capacity_threshold INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS max_capacity_threshold INTEGER DEFAULT 100,

-- Overtime
ADD COLUMN IF NOT EXISTS overtime_hours INTEGER DEFAULT 12,

-- Contractor Inactive
ADD COLUMN IF NOT EXISTS contractor_inactive_days INTEGER DEFAULT 7,

-- Unusual Rotation
ADD COLUMN IF NOT EXISTS unusual_rotation_threshold INTEGER DEFAULT 3,

-- Safety Milestone
ADD COLUMN IF NOT EXISTS safety_milestone_days INTEGER DEFAULT 30,

-- Meeting Reminder
ADD COLUMN IF NOT EXISTS meeting_reminder_minutes INTEGER DEFAULT 30,

-- Birthday Alert
ADD COLUMN IF NOT EXISTS birthday_alert_time TIME DEFAULT '09:00';

-- Update RLS to ensure users can update their own columns
-- (Existing policy should cover this, but good to verify ownership)
