import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { isNetworkError } from '@/lib/offline/errorHandler';
import type { Site, SiteMembership, SiteSettings, RoleEnum } from '@/lib/types';

// Platform admin emails
const PLATFORM_ADMIN_EMAILS = ['juanpablovaldc@gmail.com'];

interface SiteContextType {
  sites: Site[];
  memberships: SiteMembership[];
  currentSite: Site | null;
  currentRole: RoleEnum | null;
  currentSettings: SiteSettings | null;
  loading: boolean;
  selectSite: (siteId: string | null) => void;
  refreshSites: () => Promise<void>;
  isSupervisor: boolean;
  isInspector: boolean;
  // Super Admin features
  isPlatformAdmin: boolean;
  isInAdminMode: boolean;
  allSites: Site[];
  enterSiteAsAdmin: (siteId: string) => Promise<void>;
  exitAdminMode: () => void;
}

const SiteContext = createContext<SiteContextType | undefined>(undefined);

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [allSites, setAllSites] = useState<Site[]>([]);
  const [memberships, setMemberships] = useState<SiteMembership[]>([]);
  const [currentSite, setCurrentSite] = useState<Site | null>(null);
  const [currentRole, setCurrentRole] = useState<RoleEnum | null>(null);
  const [currentSettings, setCurrentSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInAdminMode, setIsInAdminMode] = useState(false);

  // Check if user is platform admin
  const isPlatformAdmin = user?.email ? PLATFORM_ADMIN_EMAILS.includes(user.email) : false;

  const fetchSettings = async (siteId: string) => {
    const { data, error } = await supabase
      .from('site_settings')
      .select('*')
      .eq('site_id', siteId)
      .maybeSingle();

    if (!error && data) {
      setCurrentSettings(data as SiteSettings);
    }
  };

  const fetchSites = async () => {
    if (!user) {
      setSites([]);
      setAllSites([]);
      setMemberships([]);
      setCurrentSite(null);
      setCurrentRole(null);
      setCurrentSettings(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch memberships with sites
      const { data: membershipData, error } = await supabase
        .from('site_memberships')
        .select('*, sites(*)')
        .eq('user_id', user.id);

      if (error) throw error;

      const typedMemberships = (membershipData || []).map(m => ({
        site_id: m.site_id,
        user_id: m.user_id,
        role: m.role as RoleEnum,
        created_at: m.created_at,
        sites: m.sites as Site
      }));

      setMemberships(typedMemberships);
      setSites(typedMemberships.map(m => m.sites).filter(Boolean) as Site[]);

      // If platform admin, also fetch ALL sites
      if (isPlatformAdmin) {
        const { data: allSitesData } = await (supabase as any)
          .from('sites')
          .select('*')
          .order('created_at', { ascending: false });
        setAllSites(allSitesData || []);
      }

      // Check if in admin mode (persists through reload)
      // Wrap in try/catch for Capacitor WebView compatibility
      try {
        const adminModeSiteId = sessionStorage.getItem('brik_admin_mode_site');
        if (adminModeSiteId && isPlatformAdmin) {
          // Restore admin mode
          const { data: siteData } = await (supabase as any)
            .from('sites')
            .select('*')
            .eq('id', adminModeSiteId)
            .single();

          if (siteData) {
            setCurrentSite(siteData as Site);
            setCurrentRole('supervisor');
            setIsInAdminMode(true);
            await fetchSettings(adminModeSiteId);
            setLoading(false);
            return;
          }
        }
      } catch (e) {
        console.warn('SessionStorage access failed:', e);
      }

      // Check if user explicitly wants to see site selector (persists through reload)
      try {
        const forceSiteSelector = sessionStorage.getItem('brik_force_site_selector');
        if (forceSiteSelector === 'true') {
          // Keep the flag active - user wanted to see site selector
          // DON'T auto-select - user will see site selector
          setCurrentSite(null);
          setCurrentRole(null);
          setLoading(false);
          return; // Exit early, don't auto-select
        }
      } catch (e) {
        console.warn('SessionStorage access failed:', e);
      }

      // Auto-select site if only one
      if (typedMemberships.length === 1) {
        const membership = typedMemberships[0];
        setCurrentSite(membership.sites as Site);
        setCurrentRole(membership.role);
        await fetchSettings(membership.site_id);
      } else {
        // Check localStorage for previously selected site
        const savedSiteId = localStorage.getItem('brik_current_site');
        if (savedSiteId) {
          const membership = typedMemberships.find(m => m.site_id === savedSiteId);
          if (membership) {
            setCurrentSite(membership.sites as Site);
            setCurrentRole(membership.role);
            await fetchSettings(membership.site_id);
          }
        }
      }
    } catch (error: any) {
      // Silently ignore network errors when offline
      if (!isNetworkError(error)) {
        console.error('Error fetching sites:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const selectSite = (siteId: string | null) => {
    // Clear the force flag when user explicitly selects
    sessionStorage.removeItem('brik_force_site_selector');

    if (!siteId) {
      setCurrentSite(null);
      setCurrentRole(null);
      setCurrentSettings(null);
      localStorage.removeItem('brik_current_site');
      return;
    }

    const membership = memberships.find(m => m.site_id === siteId);
    if (membership) {
      setCurrentSite(membership.sites as Site);
      setCurrentRole(membership.role);
      localStorage.setItem('brik_current_site', siteId);
      fetchSettings(siteId);
    }
  };

  // Enter a site as platform admin (full access)
  const enterSiteAsAdmin = useCallback(async (siteId: string) => {
    if (!isPlatformAdmin) return;

    try {
      const { data: siteData } = await (supabase as any)
        .from('sites')
        .select('*')
        .eq('id', siteId)
        .single();

      if (siteData) {
        sessionStorage.setItem('brik_admin_mode_site', siteId);
        setCurrentSite(siteData as Site);
        setCurrentRole('supervisor');
        setIsInAdminMode(true);
        await fetchSettings(siteId);
      }
    } catch (error) {
      console.error('Error entering site as admin:', error);
    }
  }, [isPlatformAdmin]);

  // Exit admin mode and return to admin panel
  const exitAdminMode = useCallback(() => {
    sessionStorage.removeItem('brik_admin_mode_site');
    setIsInAdminMode(false);
    setCurrentSite(null);
    setCurrentRole(null);
    setCurrentSettings(null);
  }, []);

  const refreshSites = async () => {
    await fetchSites();
  };

  useEffect(() => {
    fetchSites();
  }, [user]);

  // Supervisor is true when role is supervisor, owner, admin OR when in admin mode
  const isSupervisor = ['supervisor', 'owner', 'admin'].includes(currentRole || '') || isInAdminMode;
  const isInspector = currentRole === 'inspector';

  return (
    <SiteContext.Provider
      value={{
        sites,
        memberships,
        currentSite,
        currentRole,
        currentSettings,
        loading,
        selectSite,
        refreshSites,
        isSupervisor,
        isInspector,
        // Super Admin features
        isPlatformAdmin,
        isInAdminMode,
        allSites,
        enterSiteAsAdmin,
        exitAdminMode,
      }}
    >
      {children}
    </SiteContext.Provider>
  );
}

export function useSite() {
  const context = useContext(SiteContext);
  if (context === undefined) {
    throw new Error('useSite must be used within a SiteProvider');
  }
  return context;
}
