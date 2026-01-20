-- Fix RLS policies for audit_events and access_logs
-- The is_supervisor() function only works for 'supervisor' role,
-- but we need owner, admin, and supervisor to access these features.

-- ============================================================================
-- 1. FIX AUDIT_EVENTS: Allow owner, admin, supervisor to view
-- ============================================================================
DROP POLICY IF EXISTS "Supervisors can view audit_events" ON public.audit_events;
CREATE POLICY "Managers can view audit_events"
ON public.audit_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM site_memberships sm
    WHERE sm.site_id = audit_events.site_id
    AND sm.user_id = auth.uid()
    AND sm.role IN ('supervisor', 'admin', 'owner')
  )
);

-- ============================================================================
-- 2. FIX ACCESS_LOGS UPDATE: Only owner, admin, supervisor can edit
-- ============================================================================
DROP POLICY IF EXISTS "Members can update access_logs" ON public.access_logs;
CREATE POLICY "Managers can update access_logs"
ON public.access_logs
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM site_memberships sm
    WHERE sm.site_id = access_logs.site_id
    AND sm.user_id = auth.uid()
    AND sm.role IN ('supervisor', 'admin', 'owner')
  )
);

-- ============================================================================
-- 3. ENSURE is_supervisor() or create is_manager() function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_manager(p_site_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.site_memberships
    WHERE site_id = p_site_id
      AND user_id = auth.uid()
      AND role IN ('supervisor', 'admin', 'owner')
  )
$$;
