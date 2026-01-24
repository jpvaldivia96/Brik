-- Fix: Allow users to create their own membership with 'owner' role (not just 'supervisor')
-- This is needed for the onboarding flow where a user creates a new site and becomes its owner.

-- 1. Drop the old restrictive policy
DROP POLICY IF EXISTS "Users can create their own supervisor membership" ON public.site_memberships;

-- 2. Create a new policy that allows users to create their own membership with owner OR supervisor role
CREATE POLICY "Users can create their own membership as owner or supervisor"
ON public.site_memberships
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND role IN ('owner'::public.role_enum, 'supervisor'::public.role_enum)
);
