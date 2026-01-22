-- Migration: Fix permissions to allow Owners and Supervisors to change roles
-- The previous RLS policies for site_memberships likely didn't allow updates by Supervisors or even Owners properly for other users.

-- 1. Drop existing update policy if it exists (to be safe/clean)
DROP POLICY IF EXISTS "Allow update for site members" ON site_memberships;
DROP POLICY IF EXISTS "Allow update for owners and supervisors" ON site_memberships;

-- 2. Create a comprehensive update policy
-- Owners can update anyone's role (except potentially themselves, handled by frontend logic usually, but good to have DB check if needed)
-- Supervisors can update roles (but typically not promote to Owner, although this policy is broad for now to ensure it works)

CREATE POLICY "Allow update for owners and supervisors"
ON site_memberships
FOR UPDATE
USING (
  -- The user performing the action must be an owner or supervisor of the site
  EXISTS (
    SELECT 1 FROM site_memberships requester
    WHERE requester.site_id = site_memberships.site_id
    AND requester.user_id = auth.uid()
    AND requester.role IN ('owner', 'supervisor')
  )
)
WITH CHECK (
  -- Re-validate that the user is still an owner or supervisor
  EXISTS (
    SELECT 1 FROM site_memberships requester
    WHERE requester.site_id = site_memberships.site_id
    AND requester.user_id = auth.uid()
    AND requester.role IN ('owner', 'supervisor')
  )
);

-- 3. Also verify DELETE permissions (in case they want to remove users)
DROP POLICY IF EXISTS "Allow delete for owners and supervisors" ON site_memberships;

CREATE POLICY "Allow delete for owners and supervisors"
ON site_memberships
FOR DELETE
USING (
  -- The user performing the action must be an owner or supervisor
  EXISTS (
    SELECT 1 FROM site_memberships requester
    WHERE requester.site_id = site_memberships.site_id
    AND requester.user_id = auth.uid()
    AND requester.role IN ('owner', 'supervisor')
  )
);
