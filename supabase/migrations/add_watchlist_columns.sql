-- Add block functionality to favorites table
-- Run this in Supabase SQL Editor

ALTER TABLE favorites ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS block_reason TEXT;
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS blocked_by UUID REFERENCES auth.users(id);

-- Rename table to better reflect dual function
COMMENT ON TABLE favorites IS 'Stores both favorites (quick access) and blocked people (watchlist)';
