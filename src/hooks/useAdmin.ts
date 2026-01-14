import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface AdminStats {
    total_sites: number;
    total_workers: number;
    total_visitors: number;
    total_access_logs_this_month: number;
    sites_on_trial: number;
    sites_on_pro: number;
    trials_expiring_soon: number;
    new_sites_this_month: number;
}

interface SiteSubscription {
    plan: string;
    status: string;
    monthly_limit: number;
    current_usage: number;
    trial_ends_at: string | null;
    trial_days_added: number;
}

export interface AdminSite {
    id: string;
    name: string;
    timezone: string;
    created_at: string;
    subscription: SiteSubscription | null;
    worker_count: number;
    visitor_count: number;
    access_logs_this_month: number;
    supervisor_email: string | null;
}

const ADMIN_EMAILS = ['juanpablovaldc@gmail.com'];

export function useAdmin() {
    const { user } = useAuth();
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [sites, setSites] = useState<AdminSite[]>([]);

    // Check if current user is a platform admin
    const checkAdminStatus = useCallback(async () => {
        if (!user?.email) {
            setIsAdmin(false);
            setLoading(false);
            return;
        }

        // Quick client-side check first
        if (ADMIN_EMAILS.includes(user.email)) {
            setIsAdmin(true);
            setLoading(false);
            return;
        }

        // Check database
        try {
            const { data } = await (supabase as any)
                .from('platform_admins')
                .select('email')
                .eq('email', user.email)
                .maybeSingle();

            setIsAdmin(!!data);
        } catch (err) {
            console.error('Error checking admin status:', err);
            setIsAdmin(false);
        }
        setLoading(false);
    }, [user]);

    useEffect(() => {
        checkAdminStatus();
    }, [checkAdminStatus]);

    // Fetch all sites directly (bypassing RPC that may have issues)
    const fetchSites = useCallback(async () => {
        if (!isAdmin) return;

        try {
            // Fetch all sites
            const { data: sitesData, error: sitesError } = await (supabase as any)
                .from('sites')
                .select('id, name, timezone, created_at')
                .order('created_at', { ascending: false });

            if (sitesError) {
                console.error('Error fetching sites:', sitesError);
                return;
            }

            // Fetch subscriptions for all sites
            const { data: subscriptions } = await (supabase as any)
                .from('subscriptions')
                .select('*');

            // Fetch people counts per site
            const { data: people } = await (supabase as any)
                .from('people')
                .select('site_id, type');

            // Fetch supervisor emails per site
            const { data: memberships } = await (supabase as any)
                .from('site_memberships')
                .select('site_id, user_id, role');

            // Get current month start for access logs count
            const monthStart = new Date();
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);

            const { data: accessLogs } = await (supabase as any)
                .from('access_logs')
                .select('site_id')
                .gte('created_at', monthStart.toISOString());

            // Build sites with enriched data
            const enrichedSites: AdminSite[] = (sitesData || []).map((site: any) => {
                const sub = (subscriptions || []).find((s: any) => s.site_id === site.id);
                const siteWorkers = (people || []).filter((p: any) => p.site_id === site.id && p.type === 'worker');
                const siteVisitors = (people || []).filter((p: any) => p.site_id === site.id && p.type === 'visitor');
                const siteLogs = (accessLogs || []).filter((l: any) => l.site_id === site.id);
                const supervisor = (memberships || []).find((m: any) => m.site_id === site.id && m.role === 'supervisor');

                return {
                    id: site.id,
                    name: site.name,
                    timezone: site.timezone,
                    created_at: site.created_at,
                    subscription: sub ? {
                        plan: sub.plan,
                        status: sub.status,
                        monthly_limit: sub.monthly_limit,
                        current_usage: sub.current_month_usage || 0,
                        trial_ends_at: sub.trial_ends_at,
                        trial_days_added: sub.trial_days_added || 0,
                    } : null,
                    worker_count: siteWorkers.length,
                    visitor_count: siteVisitors.length,
                    access_logs_this_month: siteLogs.length,
                    supervisor_email: supervisor?.user_id || null, // We'll need to get email separately
                };
            });

            setSites(enrichedSites);

            // Calculate stats
            const now = new Date();
            const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
            const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

            const newStats: AdminStats = {
                total_sites: enrichedSites.length,
                total_workers: (people || []).filter((p: any) => p.type === 'worker').length,
                total_visitors: (people || []).filter((p: any) => p.type === 'visitor').length,
                total_access_logs_this_month: (accessLogs || []).length,
                sites_on_trial: enrichedSites.filter(s => s.subscription?.status === 'trial').length,
                sites_on_pro: enrichedSites.filter(s => s.subscription?.plan === 'pro' && s.subscription?.status === 'active').length,
                trials_expiring_soon: enrichedSites.filter(s => {
                    if (!s.subscription?.trial_ends_at) return false;
                    const endDate = new Date(s.subscription.trial_ends_at);
                    return endDate > now && endDate <= threeDaysFromNow;
                }).length,
                new_sites_this_month: enrichedSites.filter(s => new Date(s.created_at) >= monthStartDate).length,
            };

            setStats(newStats);
        } catch (err) {
            console.error('Error fetching admin data:', err);
        }
    }, [isAdmin]);

    // Combined fetch for stats and sites
    const fetchStats = fetchSites;

    // Update subscription (using direct update instead of RPC)
    const updateSubscription = useCallback(async (
        siteId: string,
        updates: {
            plan?: string;
            status?: string;
            trialDaysToAdd?: number;
            notes?: string;
        }
    ) => {
        if (!isAdmin) return { success: false, error: 'Not authorized' };

        try {
            // Get current subscription
            const { data: current } = await (supabase as any)
                .from('subscriptions')
                .select('*')
                .eq('site_id', siteId)
                .single();

            if (!current) {
                return { success: false, error: 'Subscription not found' };
            }

            // Build update object
            const updateObj: any = {
                updated_at: new Date().toISOString(),
            };

            if (updates.plan) {
                updateObj.plan = updates.plan;
                // Update limits based on plan
                const limits: Record<string, number> = {
                    free: 100,
                    starter: 500,
                    pro: 2000,
                    enterprise: 999999,
                };
                updateObj.monthly_limit = limits[updates.plan] || 100;
            }

            if (updates.status) {
                updateObj.status = updates.status;
            }

            if (updates.trialDaysToAdd) {
                const currentEndDate = current.trial_ends_at ? new Date(current.trial_ends_at) : new Date();
                const newEndDate = new Date(currentEndDate.getTime() + updates.trialDaysToAdd * 24 * 60 * 60 * 1000);
                updateObj.trial_ends_at = newEndDate.toISOString();
                updateObj.trial_days_added = (current.trial_days_added || 0) + updates.trialDaysToAdd;
            }

            if (updates.notes) {
                updateObj.admin_notes = updates.notes;
            }

            const { error } = await (supabase as any)
                .from('subscriptions')
                .update(updateObj)
                .eq('site_id', siteId);

            if (error) {
                console.error('Error updating subscription:', error);
                return { success: false, error: error.message };
            }

            // Refresh data
            await fetchSites();
            return { success: true };
        } catch (err: any) {
            console.error('Error in updateSubscription:', err);
            return { success: false, error: err.message };
        }
    }, [isAdmin, fetchSites]);

    // Get site details (workers, visitors, logs)
    const getSiteDetails = useCallback(async (siteId: string) => {
        if (!isAdmin) return null;

        try {
            // Fetch people for this site
            const { data: people } = await (supabase as any)
                .from('people')
                .select('*')
                .eq('site_id', siteId)
                .order('full_name');

            const workers = (people || []).filter((p: any) => p.type === 'worker');
            const visitors = (people || []).filter((p: any) => p.type === 'visitor');

            // Fetch recent access logs
            const { data: logs } = await (supabase as any)
                .from('access_logs')
                .select('*')
                .eq('site_id', siteId)
                .order('created_at', { ascending: false })
                .limit(100);

            return {
                workers: workers.map((w: any) => ({ ...w, name: w.full_name })),
                visitors: visitors.map((v: any) => ({ ...v, name: v.full_name })),
                recentLogs: logs || [],
            };
        } catch (err) {
            console.error('Error fetching site details:', err);
            return { workers: [], visitors: [], recentLogs: [] };
        }
    }, [isAdmin]);

    // Global search
    const globalSearch = useCallback(async (query: string, type: 'workers' | 'visitors' | 'all' = 'all') => {
        if (!isAdmin || !query || query.length < 2) return [];

        try {
            const results: any[] = [];

            // Search in people table
            const { data: people } = await (supabase as any)
                .from('people')
                .select('*, sites(name)')
                .or(`full_name.ilike.%${query}%,ci.ilike.%${query}%`)
                .limit(30);

            if (people) {
                const filtered = type === 'all'
                    ? people
                    : people.filter((p: any) => p.type === type.slice(0, -1)); // remove 's' from 'workers'/'visitors'

                results.push(...filtered.map((p: any) => ({
                    ...p,
                    name: p.full_name,
                    type: p.type,
                })));
            }

            return results;
        } catch (err) {
            console.error('Error in global search:', err);
            return [];
        }
    }, [isAdmin]);

    return {
        isAdmin,
        loading,
        stats,
        sites,
        fetchStats,
        fetchSites,
        updateSubscription,
        getSiteDetails,
        globalSearch,
    };
}
