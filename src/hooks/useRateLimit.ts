import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface RateLimitResult {
    allowed: boolean;
    remaining?: number;
    retryAfter?: number;
    requiresCaptcha?: boolean;
    error?: string;
}

export function useRateLimit() {
    const [isLimited, setIsLimited] = useState(false);
    const [retryAfter, setRetryAfter] = useState<number | null>(null);

    const checkRateLimit = useCallback(async (
        action: 'login' | 'register_person' | 'api',
        identifier: string,
        siteId?: string,
        hcaptchaToken?: string
    ): Promise<RateLimitResult> => {
        try {
            const { data, error } = await supabase.functions.invoke('rate-limit', {
                body: { action, identifier, siteId, hcaptchaToken },
            });

            if (error) {
                console.error('Rate limit check error:', error);
                // Allow on error to not block users
                return { allowed: true };
            }

            if (!data.allowed) {
                setIsLimited(true);
                if (data.retryAfter) {
                    setRetryAfter(data.retryAfter);
                    // Auto-reset after retry period
                    setTimeout(() => {
                        setIsLimited(false);
                        setRetryAfter(null);
                    }, data.retryAfter * 1000);
                }
            }

            return data as RateLimitResult;
        } catch (err) {
            console.error('Rate limit error:', err);
            return { allowed: true };
        }
    }, []);

    const resetLimit = useCallback(() => {
        setIsLimited(false);
        setRetryAfter(null);
    }, []);

    return {
        checkRateLimit,
        isLimited,
        retryAfter,
        resetLimit,
    };
}
