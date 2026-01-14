import { useSubscription } from '@/hooks/useSubscription';
import { AlertTriangle, Crown, Sparkles, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UsageBannerProps {
    className?: string;
}

export function UsageBanner({ className }: UsageBannerProps) {
    const { subscription, loading, getPlanDisplayName } = useSubscription();

    if (loading) return null;

    // Trial banner
    if (subscription.isInTrial && subscription.daysLeftInTrial !== null) {
        return (
            <div className={cn(
                "flex items-center justify-between px-4 py-2 bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-400/30 rounded-xl",
                className
            )}>
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span className="text-sm text-white/90">
                        <span className="font-medium">Prueba Pro:</span>{' '}
                        {subscription.daysLeftInTrial} días restantes
                    </span>
                </div>
                <button className="text-xs px-3 py-1 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 text-white font-medium hover:opacity-90 transition-opacity">
                    Suscribirse
                </button>
            </div>
        );
    }

    // Over limit warning
    if (subscription.isOverLimit) {
        return (
            <div className={cn(
                "flex items-center justify-between px-4 py-2 bg-red-500/20 border border-red-400/30 rounded-xl",
                className
            )}>
                <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="text-sm text-red-200">
                        <span className="font-medium">Límite alcanzado:</span>{' '}
                        {subscription.currentUsage}/{subscription.monthlyLimit} registros
                    </span>
                </div>
                <button className="text-xs px-3 py-1 rounded-full bg-red-500 text-white font-medium hover:bg-red-600 transition-colors">
                    Actualizar Plan
                </button>
            </div>
        );
    }

    // Near limit warning (> 80%)
    if (subscription.isNearLimit) {
        return (
            <div className={cn(
                "flex items-center justify-between px-4 py-2 bg-yellow-500/20 border border-yellow-400/30 rounded-xl",
                className
            )}>
                <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm text-yellow-200">
                        <span className="font-medium">{subscription.usagePercentage}% usado:</span>{' '}
                        {subscription.currentUsage}/{subscription.monthlyLimit} registros
                    </span>
                </div>
                <button className="text-xs px-3 py-1 rounded-full bg-yellow-500 text-black font-medium hover:bg-yellow-400 transition-colors">
                    Ver Planes
                </button>
            </div>
        );
    }

    // Free plan subtle indicator
    if (subscription.plan === 'free') {
        return (
            <div className={cn(
                "flex items-center justify-between px-4 py-2 bg-white/5 border border-white/10 rounded-xl",
                className
            )}>
                <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-white/50" />
                    <span className="text-sm text-white/60">
                        Plan {getPlanDisplayName(subscription.plan)} • {subscription.currentUsage}/{subscription.monthlyLimit} registros
                    </span>
                </div>
                <button className="text-xs px-3 py-1 rounded-full bg-white/10 text-white/80 font-medium hover:bg-white/20 transition-colors">
                    Mejorar
                </button>
            </div>
        );
    }

    return null;
}

// Compact version for header
export function UsageBadge() {
    const { subscription, loading, getPlanDisplayName } = useSubscription();

    if (loading) return null;

    return (
        <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium",
            subscription.isOverLimit && "bg-red-500/20 text-red-300",
            subscription.isNearLimit && "bg-yellow-500/20 text-yellow-300",
            !subscription.isOverLimit && !subscription.isNearLimit && "bg-white/10 text-white/70"
        )}>
            {subscription.isInTrial ? (
                <>
                    <Sparkles className="w-3 h-3" />
                    Trial Pro
                </>
            ) : (
                <>
                    <Crown className="w-3 h-3" />
                    {getPlanDisplayName(subscription.plan)}
                </>
            )}
        </div>
    );
}
