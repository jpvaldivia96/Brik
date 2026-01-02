-- Allow authenticated users to create sites
CREATE POLICY "Authenticated users can create sites"
ON public.sites
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to create their own membership when creating a site
CREATE POLICY "Users can create their own supervisor membership"
ON public.site_memberships
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND role = 'supervisor');

-- Allow supervisors to create memberships for others in their sites
CREATE POLICY "Supervisors can create memberships"
ON public.site_memberships
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.site_memberships sm
    WHERE sm.site_id = site_memberships.site_id
    AND sm.user_id = auth.uid()
    AND sm.role = 'supervisor'
  )
);

-- Allow supervisors to update sites they manage
CREATE POLICY "Supervisors can update their sites"
ON public.sites
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.site_memberships
    WHERE site_id = sites.id
    AND user_id = auth.uid()
    AND role = 'supervisor'
  )
);