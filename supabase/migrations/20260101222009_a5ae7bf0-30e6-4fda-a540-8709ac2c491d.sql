-- Fix RLS policies: current policies were created as RESTRICTIVE (permissive=false), which blocks access.
-- Recreate them as PERMISSIVE (default) so authenticated users can use the app.

-- public.sites
DROP POLICY IF EXISTS "Anyone authenticated can create sites" ON public.sites;
CREATE POLICY "Anyone authenticated can create sites"
ON public.sites
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can view their sites" ON public.sites;
CREATE POLICY "Users can view their sites"
ON public.sites
FOR SELECT
TO authenticated
USING (public.is_member(id));

DROP POLICY IF EXISTS "Supervisors can update their sites" ON public.sites;
CREATE POLICY "Supervisors can update their sites"
ON public.sites
FOR UPDATE
TO authenticated
USING (public.is_supervisor(id));

-- public.site_memberships
DROP POLICY IF EXISTS "Users can view their memberships" ON public.site_memberships;
CREATE POLICY "Users can view their memberships"
ON public.site_memberships
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can create their own supervisor membership" ON public.site_memberships;
CREATE POLICY "Users can create their own supervisor membership"
ON public.site_memberships
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND role = 'supervisor'::public.role_enum);

DROP POLICY IF EXISTS "Supervisors can create memberships" ON public.site_memberships;
CREATE POLICY "Supervisors can create memberships"
ON public.site_memberships
FOR INSERT
TO authenticated
WITH CHECK (public.is_supervisor(site_id));

-- public.site_settings
DROP POLICY IF EXISTS "Members can view site settings" ON public.site_settings;
CREATE POLICY "Members can view site settings"
ON public.site_settings
FOR SELECT
TO authenticated
USING (public.is_member(site_id));

DROP POLICY IF EXISTS "Supervisors can update site settings" ON public.site_settings;
CREATE POLICY "Supervisors can update site settings"
ON public.site_settings
FOR UPDATE
TO authenticated
USING (public.is_supervisor(site_id));

-- public.people
DROP POLICY IF EXISTS "Members can view people" ON public.people;
CREATE POLICY "Members can view people"
ON public.people
FOR SELECT
TO authenticated
USING (public.is_member(site_id));

DROP POLICY IF EXISTS "Members can insert people" ON public.people;
CREATE POLICY "Members can insert people"
ON public.people
FOR INSERT
TO authenticated
WITH CHECK (public.is_member(site_id));

DROP POLICY IF EXISTS "Members can update people" ON public.people;
CREATE POLICY "Members can update people"
ON public.people
FOR UPDATE
TO authenticated
USING (public.is_member(site_id));

-- public.favorites
DROP POLICY IF EXISTS "Members can view favorites" ON public.favorites;
CREATE POLICY "Members can view favorites"
ON public.favorites
FOR SELECT
TO authenticated
USING (public.is_member(site_id));

DROP POLICY IF EXISTS "Members can insert favorites" ON public.favorites;
CREATE POLICY "Members can insert favorites"
ON public.favorites
FOR INSERT
TO authenticated
WITH CHECK (public.is_member(site_id));

DROP POLICY IF EXISTS "Members can delete favorites" ON public.favorites;
CREATE POLICY "Members can delete favorites"
ON public.favorites
FOR DELETE
TO authenticated
USING (public.is_member(site_id));

-- public.access_logs
DROP POLICY IF EXISTS "Members can view access_logs" ON public.access_logs;
CREATE POLICY "Members can view access_logs"
ON public.access_logs
FOR SELECT
TO authenticated
USING (public.is_member(site_id));

DROP POLICY IF EXISTS "Members can insert access_logs" ON public.access_logs;
CREATE POLICY "Members can insert access_logs"
ON public.access_logs
FOR INSERT
TO authenticated
WITH CHECK (public.is_member(site_id));

DROP POLICY IF EXISTS "Members can update access_logs" ON public.access_logs;
CREATE POLICY "Members can update access_logs"
ON public.access_logs
FOR UPDATE
TO authenticated
USING (public.is_member(site_id));

-- public.audit_events
DROP POLICY IF EXISTS "Supervisors can view audit_events" ON public.audit_events;
CREATE POLICY "Supervisors can view audit_events"
ON public.audit_events
FOR SELECT
TO authenticated
USING (public.is_supervisor(site_id));

DROP POLICY IF EXISTS "Members can insert audit_events" ON public.audit_events;
CREATE POLICY "Members can insert audit_events"
ON public.audit_events
FOR INSERT
TO authenticated
WITH CHECK (public.is_member(site_id));

-- public.visitors_profile
DROP POLICY IF EXISTS "Members can view visitors_profile" ON public.visitors_profile;
CREATE POLICY "Members can view visitors_profile"
ON public.visitors_profile
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.people p
    WHERE p.id = visitors_profile.person_id
      AND public.is_member(p.site_id)
  )
);

DROP POLICY IF EXISTS "Members can insert visitors_profile" ON public.visitors_profile;
CREATE POLICY "Members can insert visitors_profile"
ON public.visitors_profile
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.people p
    WHERE p.id = visitors_profile.person_id
      AND public.is_member(p.site_id)
  )
);

DROP POLICY IF EXISTS "Members can update visitors_profile" ON public.visitors_profile;
CREATE POLICY "Members can update visitors_profile"
ON public.visitors_profile
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.people p
    WHERE p.id = visitors_profile.person_id
      AND public.is_member(p.site_id)
  )
);

-- public.workers_profile
DROP POLICY IF EXISTS "Members can view workers_profile" ON public.workers_profile;
CREATE POLICY "Members can view workers_profile"
ON public.workers_profile
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.people p
    WHERE p.id = workers_profile.person_id
      AND public.is_member(p.site_id)
  )
);

DROP POLICY IF EXISTS "Members can insert workers_profile" ON public.workers_profile;
CREATE POLICY "Members can insert workers_profile"
ON public.workers_profile
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.people p
    WHERE p.id = workers_profile.person_id
      AND public.is_member(p.site_id)
  )
);

DROP POLICY IF EXISTS "Members can update workers_profile" ON public.workers_profile;
CREATE POLICY "Members can update workers_profile"
ON public.workers_profile
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.people p
    WHERE p.id = workers_profile.person_id
      AND public.is_member(p.site_id)
  )
);

-- Create missing trigger: auto-create site_settings row whenever a site is created.
DROP TRIGGER IF EXISTS create_site_settings ON public.sites;
CREATE TRIGGER create_site_settings
AFTER INSERT ON public.sites
FOR EACH ROW
EXECUTE FUNCTION public.create_site_settings();
