import { useState, useEffect, useCallback } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';

export interface SubscriptionData {
    id: string;
    plan: 'free' | 'starter' | 'pro' | 'enterprise';
    status: 'active' | 'trial' | 'past_due' | 'cancelled' | 'paused' | 'suspended';
    monthlyLimit: number;
    currentUsage: number;
    usagePercentage: number;
    isOverLimit: boolean;
    isNearLimit: boolean; // > 80%
    trialEndsAt: string | null;
    isInTrial: boolean;
    daysLeftInTrial: number | null;
    isSuspended: boolean;
}

const defaultSubscription: SubscriptionData = {
    id: '',
    plan: 'free',
    status: 'active',
    monthlyLimit: 100,
    currentUsage: 0,
    usagePercentage: 0,
    isOverLimit: false,
    isNearLimit: false,
    trialEndsAt: null,
    isInTrial: false,
    daysLeftInTrial: null,
    isSuspended: false,
};

export function useSubscription() {
    const { currentSite } = useSite();
    const [subscription, setSubscription] = useState<SubscriptionData>(defaultSubscription);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSubscription = useCallback(async () => {
        if (!currentSite) {
            setSubscription(defaultSubscription);
            setLoading(false);
            return;
        }

        try {
            // Note: subscriptions table is new - using type assertion until types are regenerated
            const { data, error: fetchError } = await (supabase as any)
                .from('subscriptions')
                .select('*')
                .eq('site_id', currentSite.id)
                .maybeSingle();

            // If error (table doesn't exist, RLS, etc), silently use defaults
            if (fetchError) {
                console.warn('Subscription fetch warning:', fetchError.message);
                setSubscription(defaultSubscription);
                setLoading(false);
                return;
            }

            if (!data) {
                // No subscription yet, use defaults
                setSubscription(defaultSubscription);
                setLoading(false);
                return;
            }

            const monthlyLimit = data.monthly_limit || 100;
            const currentUsage = data.current_month_usage || 0;
            const usagePercentage = monthlyLimit > 0 ? Math.round((currentUsage / monthlyLimit) * 100) : 0;
            const isPaidPlan = ['starter', 'pro', 'enterprise'].includes(data.plan);
            const isInTrial = data.status === 'trial' && data.trial_ends_at && !isPaidPlan;
            let daysLeftInTrial = null;

            if (isInTrial && data.trial_ends_at) {
                const trialEnd = new Date(data.trial_ends_at);
                const now = new Date();
                daysLeftInTrial = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
            }

            setSubscription({
                id: data.id || '',
                plan: data.plan || 'free',
                status: data.status || 'active',
                monthlyLimit,
                currentUsage,
                usagePercentage,
                isOverLimit: currentUsage >= monthlyLimit,
                isNearLimit: usagePercentage >= 80 && usagePercentage < 100,
                trialEndsAt: data.trial_ends_at || null,
                isInTrial: !!isInTrial,
                daysLeftInTrial,
                isSuspended: data.status === 'suspended',
            });
        } catch (err: any) {
            // Silently fail and use defaults - don't break the app
            console.warn('Subscription error (using defaults):', err?.message || err);
            setSubscription(defaultSubscription);
        } finally {
            setLoading(false);
        }
    }, [currentSite]);

    useEffect(() => {
        fetchSubscription();
    }, [fetchSubscription]);

    // Subscribe to realtime updates
    useEffect(() => {
        if (!currentSite) return;

        const channel = supabase
            .channel(`subscription:${currentSite.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'subscriptions',
                    filter: `site_id=eq.${currentSite.id}`,
                },
                () => {
                    fetchSubscription();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentSite, fetchSubscription]);

    const canAddEntry = !subscription.isOverLimit;

    const getPlanDisplayName = (plan: string): string => {
        const names: Record<string, string> = {
            free: 'Gratis',
            starter: 'Starter',
            pro: 'Pro',
            enterprise: 'Enterprise',
        };
        return names[plan] || plan;
    };

    return {
        subscription,
        loading,
        error,
        canAddEntry,
        refetch: fetchSubscription,
        getPlanDisplayName,
    };
}
