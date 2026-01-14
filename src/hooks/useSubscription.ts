import { useState, useEffect, useCallback } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';

export interface SubscriptionData {
    id: string;
    plan: 'free' | 'starter' | 'pro' | 'enterprise';
    status: 'active' | 'trial' | 'past_due' | 'cancelled' | 'paused';
    monthlyLimit: number;
    currentUsage: number;
    usagePercentage: number;
    isOverLimit: boolean;
    isNearLimit: boolean; // > 80%
    trialEndsAt: string | null;
    isInTrial: boolean;
    daysLeftInTrial: number | null;
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

            if (fetchError) throw fetchError;

            if (!data) {
                // No subscription yet, use defaults
                setSubscription(defaultSubscription);
                setLoading(false);
                return;
            }

            const usagePercentage = Math.round((data.current_month_usage / data.monthly_limit) * 100);
            const isInTrial = data.status === 'trial' && data.trial_ends_at;
            let daysLeftInTrial = null;

            if (isInTrial && data.trial_ends_at) {
                const trialEnd = new Date(data.trial_ends_at);
                const now = new Date();
                daysLeftInTrial = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
            }

            setSubscription({
                id: data.id,
                plan: data.plan,
                status: data.status,
                monthlyLimit: data.monthly_limit,
                currentUsage: data.current_month_usage,
                usagePercentage,
                isOverLimit: data.current_month_usage >= data.monthly_limit,
                isNearLimit: usagePercentage >= 80 && usagePercentage < 100,
                trialEndsAt: data.trial_ends_at,
                isInTrial,
                daysLeftInTrial,
            });
        } catch (err: any) {
            console.error('Error fetching subscription:', err);
            setError(err.message);
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
