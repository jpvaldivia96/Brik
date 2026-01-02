import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Site, SiteMembership, SiteSettings, RoleEnum } from '@/lib/types';

interface SiteContextType {
  sites: Site[];
  memberships: SiteMembership[];
  currentSite: Site | null;
  currentRole: RoleEnum | null;
  currentSettings: SiteSettings | null;
  loading: boolean;
  selectSite: (siteId: string) => void;
  refreshSites: () => Promise<void>;
  isSupervisor: boolean;
}

const SiteContext = createContext<SiteContextType | undefined>(undefined);

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [memberships, setMemberships] = useState<SiteMembership[]>([]);
  const [currentSite, setCurrentSite] = useState<Site | null>(null);
  const [currentRole, setCurrentRole] = useState<RoleEnum | null>(null);
  const [currentSettings, setCurrentSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSites = async () => {
    if (!user) {
      setSites([]);
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
    } catch (error) {
      console.error('Error fetching sites:', error);
    } finally {
      setLoading(false);
    }
  };

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

  const selectSite = (siteId: string) => {
    const membership = memberships.find(m => m.site_id === siteId);
    if (membership) {
      setCurrentSite(membership.sites as Site);
      setCurrentRole(membership.role);
      localStorage.setItem('brik_current_site', siteId);
      fetchSettings(siteId);
    }
  };

  const refreshSites = async () => {
    await fetchSites();
  };

  useEffect(() => {
    fetchSites();
  }, [user]);

  const isSupervisor = currentRole === 'supervisor';

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
