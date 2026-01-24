-- COMPREHENSIVE FIX: Add 'owner' role and update all permissions
-- This migration addresses all role consistency issues found in the audit.

-- ============================================================================
-- PART 1: Add 'owner' to role_enum if not exists
-- ============================================================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'role_enum' AND e.enumlabel = 'owner'
  ) THEN
    ALTER TYPE role_enum ADD VALUE 'owner';
  END IF;
END $$;

-- ============================================================================
-- PART 2: Update is_supervisor() function to also return true for 'owner'
-- This is the KEY fix - many RLS policies use this function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_supervisor(p_site_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM site_memberships
    WHERE site_id = p_site_id
      AND user_id = auth.uid()
      AND role IN ('supervisor', 'owner')
  );
END;
$$;

-- ============================================================================
-- PART 3: Fix specific policies that hardcode 'supervisor' without using is_supervisor()
-- ============================================================================

-- 3a. alert_settings: Allow owner to manage
DROP POLICY IF EXISTS "Supervisors can manage alert settings" ON alert_settings;
CREATE POLICY "Owners and Supervisors can manage alert settings" ON alert_settings
FOR ALL
USING (
  EXISTS (SELECT 1 FROM site_memberships 
          WHERE site_id = alert_settings.site_id 
          AND user_id = auth.uid() 
          AND role IN ('supervisor', 'owner'))
);

-- 3b. user_invitations: Allow owner to manage
DROP POLICY IF EXISTS "Supervisors can create invitations" ON user_invitations;
CREATE POLICY "Owners and Supervisors can create invitations" ON user_invitations
FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM site_memberships 
          WHERE site_id = user_invitations.site_id 
          AND user_id = auth.uid() 
          AND role IN ('supervisor', 'owner'))
);

DROP POLICY IF EXISTS "Supervisors can view invitations" ON user_invitations;
CREATE POLICY "Owners and Supervisors can view invitations" ON user_invitations
FOR SELECT
USING (
  EXISTS (SELECT 1 FROM site_memberships 
          WHERE site_id = user_invitations.site_id 
          AND user_id = auth.uid() 
          AND role IN ('supervisor', 'owner'))
);

DROP POLICY IF EXISTS "Supervisors can delete invitations" ON user_invitations;
CREATE POLICY "Owners and Supervisors can delete invitations" ON user_invitations
FOR DELETE
USING (
  EXISTS (SELECT 1 FROM site_memberships 
          WHERE site_id = user_invitations.site_id 
          AND user_id = auth.uid() 
          AND role IN ('supervisor', 'owner'))
);

-- 3c. scheduled_meetings: Allow owner
DROP POLICY IF EXISTS "Supervisors can manage meetings" ON scheduled_meetings;
CREATE POLICY "Owners and Supervisors can manage meetings" ON scheduled_meetings
FOR ALL
USING (
  EXISTS (SELECT 1 FROM site_memberships 
          WHERE site_id = scheduled_meetings.site_id 
          AND user_id = auth.uid() 
          AND role IN ('supervisor', 'owner'))
);

-- 3d. announcements: Allow owner
DROP POLICY IF EXISTS "Supervisors can manage announcements" ON announcements;
CREATE POLICY "Owners and Supervisors can manage announcements" ON announcements
FOR ALL
USING (
  EXISTS (SELECT 1 FROM site_memberships 
          WHERE site_id = announcements.site_id 
          AND user_id = auth.uid() 
          AND role IN ('supervisor', 'owner'))
);

-- ============================================================================
-- PART 4: Fix site_memberships INSERT policy (already done in separate file but ensure it's here too)
-- ============================================================================
DROP POLICY IF EXISTS "Users can create their own supervisor membership" ON site_memberships;
DROP POLICY IF EXISTS "Users can create their own membership as owner or supervisor" ON site_memberships;

CREATE POLICY "Users can create their own membership as owner or supervisor"
ON site_memberships
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND role IN ('owner', 'supervisor')
);
