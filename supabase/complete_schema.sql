-- =============================================
-- BRIK - Complete Database Schema
-- Run this in Supabase SQL Editor
-- =============================================

-- 1) ENUMS
CREATE TYPE public.role_enum AS ENUM ('guard', 'supervisor');
CREATE TYPE public.person_type AS ENUM ('worker', 'visitor');

-- 2) TABLES

CREATE TABLE public.sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/La_Paz',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.site_settings (
  site_id UUID PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE,
  warn_hours NUMERIC NOT NULL DEFAULT 10,
  crit_hours NUMERIC NOT NULL DEFAULT 12,
  seguro_warn_days INT NOT NULL DEFAULT 30,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.site_memberships (
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role role_enum NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (site_id, user_id)
);

CREATE TABLE public.people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  ci TEXT NOT NULL,
  full_name TEXT NOT NULL,
  type person_type NOT NULL,
  contractor TEXT,
  photo_url TEXT,
  face_descriptor TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(site_id, ci)
);

CREATE TABLE public.workers_profile (
  person_id UUID PRIMARY KEY REFERENCES public.people(id) ON DELETE CASCADE,
  insurance_number TEXT,
  insurance_expiry DATE,
  phone TEXT,
  emergency_contact TEXT,
  blood_type TEXT
);

CREATE TABLE public.visitors_profile (
  person_id UUID PRIMARY KEY REFERENCES public.people(id) ON DELETE CASCADE,
  company TEXT
);

CREATE TABLE public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  person_id UUID REFERENCES public.people(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(site_id, person_id)
);

CREATE TABLE public.access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  person_id UUID REFERENCES public.people(id) ON DELETE CASCADE,
  entry_at TIMESTAMPTZ NOT NULL,
  exit_at TIMESTAMPTZ,
  observations TEXT,
  entry_by_user_id UUID REFERENCES auth.users(id),
  exit_by_user_id UUID REFERENCES auth.users(id),
  ci_snapshot TEXT,
  name_snapshot TEXT,
  type_snapshot person_type,
  contractor_snapshot TEXT,
  voided_at TIMESTAMPTZ,
  voided_by_user_id UUID REFERENCES auth.users(id),
  void_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX access_logs_open_unique 
  ON public.access_logs (site_id, person_id) 
  WHERE exit_at IS NULL AND voided_at IS NULL;

CREATE TABLE public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  role_snapshot role_enum,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  before JSONB,
  after JSONB,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3) HELPER FUNCTIONS

CREATE OR REPLACE FUNCTION public.is_member(p_site_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.site_memberships WHERE site_id = p_site_id AND user_id = auth.uid()) $$;

CREATE OR REPLACE FUNCTION public.member_role(p_site_id UUID)
RETURNS role_enum
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.site_memberships WHERE site_id = p_site_id AND user_id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.is_supervisor(p_site_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.member_role(p_site_id) = 'supervisor' $$;

-- 4) ENABLE RLS

ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitors_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- 5) RLS POLICIES

-- Sites
CREATE POLICY "Anyone authenticated can create sites" ON public.sites FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can view their sites" ON public.sites FOR SELECT TO authenticated USING (public.is_member(id));
CREATE POLICY "Supervisors can update their sites" ON public.sites FOR UPDATE TO authenticated USING (public.is_supervisor(id));

-- Site Memberships
CREATE POLICY "Users can view their memberships" ON public.site_memberships FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can create their own supervisor membership" ON public.site_memberships FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND role = 'supervisor'::public.role_enum);
CREATE POLICY "Supervisors can create memberships" ON public.site_memberships FOR INSERT TO authenticated WITH CHECK (public.is_supervisor(site_id));

-- Site Settings
CREATE POLICY "Members can view site settings" ON public.site_settings FOR SELECT TO authenticated USING (public.is_member(site_id));
CREATE POLICY "Supervisors can update site settings" ON public.site_settings FOR UPDATE TO authenticated USING (public.is_supervisor(site_id));

-- People
CREATE POLICY "Members can view people" ON public.people FOR SELECT TO authenticated USING (public.is_member(site_id));
CREATE POLICY "Members can insert people" ON public.people FOR INSERT TO authenticated WITH CHECK (public.is_member(site_id));
CREATE POLICY "Members can update people" ON public.people FOR UPDATE TO authenticated USING (public.is_member(site_id));
CREATE POLICY "Allow delete for site members" ON public.people FOR DELETE USING (is_member(site_id));

-- Workers Profile
CREATE POLICY "Members can view workers_profile" ON public.workers_profile FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.people p WHERE p.id = workers_profile.person_id AND public.is_member(p.site_id)));
CREATE POLICY "Members can insert workers_profile" ON public.workers_profile FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.people p WHERE p.id = workers_profile.person_id AND public.is_member(p.site_id)));
CREATE POLICY "Members can update workers_profile" ON public.workers_profile FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.people p WHERE p.id = workers_profile.person_id AND public.is_member(p.site_id)));
CREATE POLICY "Allow delete workers_profile" ON public.workers_profile FOR DELETE USING (EXISTS (SELECT 1 FROM people WHERE people.id = workers_profile.person_id AND is_member(people.site_id)));

-- Visitors Profile
CREATE POLICY "Members can view visitors_profile" ON public.visitors_profile FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.people p WHERE p.id = visitors_profile.person_id AND public.is_member(p.site_id)));
CREATE POLICY "Members can insert visitors_profile" ON public.visitors_profile FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.people p WHERE p.id = visitors_profile.person_id AND public.is_member(p.site_id)));
CREATE POLICY "Members can update visitors_profile" ON public.visitors_profile FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.people p WHERE p.id = visitors_profile.person_id AND public.is_member(p.site_id)));
CREATE POLICY "Allow delete visitors_profile" ON public.visitors_profile FOR DELETE USING (EXISTS (SELECT 1 FROM people WHERE people.id = visitors_profile.person_id AND is_member(people.site_id)));

-- Favorites
CREATE POLICY "Members can view favorites" ON public.favorites FOR SELECT TO authenticated USING (public.is_member(site_id));
CREATE POLICY "Members can insert favorites" ON public.favorites FOR INSERT TO authenticated WITH CHECK (public.is_member(site_id));
CREATE POLICY "Members can delete favorites" ON public.favorites FOR DELETE TO authenticated USING (public.is_member(site_id));

-- Access Logs
CREATE POLICY "Members can view access_logs" ON public.access_logs FOR SELECT TO authenticated USING (public.is_member(site_id));
CREATE POLICY "Members can insert access_logs" ON public.access_logs FOR INSERT TO authenticated WITH CHECK (public.is_member(site_id));
CREATE POLICY "Members can update access_logs" ON public.access_logs FOR UPDATE TO authenticated USING (public.is_member(site_id));
CREATE POLICY "Allow delete access_logs" ON public.access_logs FOR DELETE USING (is_member(site_id));

-- Audit Events
CREATE POLICY "Supervisors can view audit_events" ON public.audit_events FOR SELECT TO authenticated USING (public.is_supervisor(site_id));
CREATE POLICY "Members can insert audit_events" ON public.audit_events FOR INSERT TO authenticated WITH CHECK (public.is_member(site_id));

-- 6) TRIGGERS

CREATE OR REPLACE FUNCTION public.create_site_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN INSERT INTO public.site_settings (site_id) VALUES (NEW.id); RETURN NEW; END; $$;

CREATE TRIGGER create_site_settings AFTER INSERT ON public.sites FOR EACH ROW EXECUTE FUNCTION public.create_site_settings();

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_people_updated_at BEFORE UPDATE ON public.people FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_site_settings_updated_at BEFORE UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_favorites_updated_at BEFORE UPDATE ON public.favorites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
