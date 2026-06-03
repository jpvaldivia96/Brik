-- Add user_id to favorites so each user has their own favorites list
-- Blocked persons remain site-wide (no user_id needed for blocks)
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Create index for per-user queries
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);

-- Create unique constraint: one user can only favorite a person once per site
-- (Allow NULL user_id for backwards compatibility with existing blocked records)
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_unique_user_person 
ON favorites(site_id, person_id, user_id) WHERE user_id IS NOT NULL;
