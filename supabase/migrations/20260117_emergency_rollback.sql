-- EMERGENCY ROLLBACK: Fix Data Access Issue
-- This removes the problematic observer policy that is blocking user access

-- The issue: The policy we added had an ambiguous table reference
-- that prevented non-observer users from seeing their site memberships.
-- Since memberships determine which sites users can access, this caused
-- a cascading effect where users see "no data".

-- THIS DOES NOT DELETE ANY DATA - it only removes the problematic permission rule

DROP POLICY IF EXISTS "Observers can view site memberships" ON site_memberships;

-- After running this, all users should regain access to their sites and data immediately.
-- The original policy "Users can view their memberships" will continue to work correctly.
