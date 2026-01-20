-- FIX: Allow all members to update access_logs for exit registration
-- The previous migration (20260120_fix_audit_and_tools_rls.sql) was too restrictive
-- and blocked guards from registering exits.
-- 
-- This migration restores the original behavior:
-- - ALL members can UPDATE access_logs (for exit registration)
-- - The audit_events policy remains restricted to managers only

-- ============================================================================
-- RESTORE ACCESS_LOGS UPDATE: All members can update (register exits)
-- ============================================================================
DROP POLICY IF EXISTS "Managers can update access_logs" ON public.access_logs;
CREATE POLICY "Members can update access_logs"
ON public.access_logs
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM site_memberships sm
    WHERE sm.site_id = access_logs.site_id
    AND sm.user_id = auth.uid()
  )
);
