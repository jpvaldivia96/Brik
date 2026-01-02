-- =============================================
-- BRIK - Sistema de Control de Accesos Multi-Obra
-- Schema SQL Completo
-- =============================================

-- 1) ENUMS
CREATE TYPE public.role_enum AS ENUM ('guard', 'supervisor');
CREATE TYPE public.person_type AS ENUM ('worker', 'visitor');

-- 2) TABLAS

-- Sites (Obras)
CREATE TABLE public.sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/La_Paz',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Site Settings (Configuración por obra)
CREATE TABLE public.site_settings (
  site_id UUID PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE,
  warn_hours NUMERIC NOT NULL DEFAULT 10,
  crit_hours NUMERIC NOT NULL DEFAULT 12,
  seguro_warn_days INT NOT NULL DEFAULT 30,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Site Memberships (Usuarios asociados a obras)
CREATE TABLE public.site_memberships (
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role role_enum NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (site_id, user_id)
);

-- People (Trabajadores y Visitantes)
CREATE TABLE public.people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  ci TEXT NOT NULL,
  full_name TEXT NOT NULL,
  type person_type NOT NULL,
  contractor TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(site_id, ci)
);

-- Workers Profile (Perfil adicional para trabajadores)
CREATE TABLE public.workers_profile (
  person_id UUID PRIMARY KEY REFERENCES public.people(id) ON DELETE CASCADE,
  insurance_number TEXT,
  insurance_expiry DATE,
  phone TEXT,
  emergency_contact TEXT,
  blood_type TEXT
);

-- Visitors Profile (Perfil adicional para visitantes)
CREATE TABLE public.visitors_profile (
  person_id UUID PRIMARY KEY REFERENCES public.people(id) ON DELETE CASCADE,
  company TEXT
);

-- Favorites (Favoritos globales por obra)
CREATE TABLE public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  person_id UUID REFERENCES public.people(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(site_id, person_id)
);

-- Access Logs (Registros de entrada/salida)
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

-- Índice único parcial: solo un log abierto por persona en una obra
CREATE UNIQUE INDEX access_logs_open_unique 
  ON public.access_logs (site_id, person_id) 
  WHERE exit_at IS NULL AND voided_at IS NULL;

-- Audit Events (Historial de auditoría)
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

-- 3) FUNCIONES HELPER PARA RLS

-- Verificar si el usuario es miembro de una obra
CREATE OR REPLACE FUNCTION public.is_member(p_site_id UUID)
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
  )
$$;

-- Obtener rol del usuario en una obra
CREATE OR REPLACE FUNCTION public.member_role(p_site_id UUID)
RETURNS role_enum
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.site_memberships
  WHERE site_id = p_site_id
    AND user_id = auth.uid()
$$;

-- Verificar si el usuario es supervisor en una obra
CREATE OR REPLACE FUNCTION public.is_supervisor(p_site_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.member_role(p_site_id) = 'supervisor'
$$;

-- 4) HABILITAR RLS EN TODAS LAS TABLAS

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

-- Sites: solo ver obras donde eres miembro
CREATE POLICY "Users can view their sites"
  ON public.sites FOR SELECT
  USING (public.is_member(id));

-- Site Settings: ver si eres miembro, actualizar solo supervisor
CREATE POLICY "Members can view site settings"
  ON public.site_settings FOR SELECT
  USING (public.is_member(site_id));

CREATE POLICY "Supervisors can update site settings"
  ON public.site_settings FOR UPDATE
  USING (public.is_supervisor(site_id));

-- Site Memberships: ver tus propias memberships
CREATE POLICY "Users can view their memberships"
  ON public.site_memberships FOR SELECT
  USING (user_id = auth.uid());

-- People: CRUD si eres miembro de la obra
CREATE POLICY "Members can view people"
  ON public.people FOR SELECT
  USING (public.is_member(site_id));

CREATE POLICY "Members can insert people"
  ON public.people FOR INSERT
  WITH CHECK (public.is_member(site_id));

CREATE POLICY "Members can update people"
  ON public.people FOR UPDATE
  USING (public.is_member(site_id));

-- Workers Profile: CRUD si eres miembro de la obra (via people)
CREATE POLICY "Members can view workers_profile"
  ON public.workers_profile FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.people p 
    WHERE p.id = person_id AND public.is_member(p.site_id)
  ));

CREATE POLICY "Members can insert workers_profile"
  ON public.workers_profile FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.people p 
    WHERE p.id = person_id AND public.is_member(p.site_id)
  ));

CREATE POLICY "Members can update workers_profile"
  ON public.workers_profile FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.people p 
    WHERE p.id = person_id AND public.is_member(p.site_id)
  ));

-- Visitors Profile: CRUD si eres miembro de la obra (via people)
CREATE POLICY "Members can view visitors_profile"
  ON public.visitors_profile FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.people p 
    WHERE p.id = person_id AND public.is_member(p.site_id)
  ));

CREATE POLICY "Members can insert visitors_profile"
  ON public.visitors_profile FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.people p 
    WHERE p.id = person_id AND public.is_member(p.site_id)
  ));

CREATE POLICY "Members can update visitors_profile"
  ON public.visitors_profile FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.people p 
    WHERE p.id = person_id AND public.is_member(p.site_id)
  ));

-- Favorites: CRUD si eres miembro de la obra
CREATE POLICY "Members can view favorites"
  ON public.favorites FOR SELECT
  USING (public.is_member(site_id));

CREATE POLICY "Members can insert favorites"
  ON public.favorites FOR INSERT
  WITH CHECK (public.is_member(site_id));

CREATE POLICY "Members can delete favorites"
  ON public.favorites FOR DELETE
  USING (public.is_member(site_id));

-- Access Logs: CRUD si eres miembro de la obra
CREATE POLICY "Members can view access_logs"
  ON public.access_logs FOR SELECT
  USING (public.is_member(site_id));

CREATE POLICY "Members can insert access_logs"
  ON public.access_logs FOR INSERT
  WITH CHECK (public.is_member(site_id));

CREATE POLICY "Members can update access_logs"
  ON public.access_logs FOR UPDATE
  USING (public.is_member(site_id));

-- Audit Events: solo supervisores pueden ver, todos los miembros pueden insertar
CREATE POLICY "Supervisors can view audit_events"
  ON public.audit_events FOR SELECT
  USING (public.is_supervisor(site_id));

CREATE POLICY "Members can insert audit_events"
  ON public.audit_events FOR INSERT
  WITH CHECK (public.is_member(site_id));

-- 6) TRIGGER PARA AUTO-CREAR SETTINGS AL CREAR SITE
CREATE OR REPLACE FUNCTION public.create_site_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.site_settings (site_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_site_created
  AFTER INSERT ON public.sites
  FOR EACH ROW
  EXECUTE FUNCTION public.create_site_settings();

-- 7) TRIGGER PARA ACTUALIZAR updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_people_updated_at
  BEFORE UPDATE ON public.people
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_site_settings_updated_at
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_favorites_updated_at
  BEFORE UPDATE ON public.favorites
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();