import { Crown, Lock } from 'lucide-react';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { useNavigate } from 'react-router-dom';

type Feature = Parameters<ReturnType<typeof useFeatureGate>['canUse']>[0];

interface FeatureGateProps {
  feature: Feature;
  children: React.ReactNode;
  /** Show a subtle lock overlay instead of replacing content */
  mode?: 'block' | 'overlay';
  /** Custom message */
  message?: string;
}

/**
 * Wraps a section that requires a specific plan.
 * If the user's plan is too low, shows an upgrade prompt instead.
 * 
 * Usage:
 *   <FeatureGate feature="telegram">
 *     <TelegramSettings />
 *   </FeatureGate>
 */
export function FeatureGate({ feature, children, mode = 'block', message }: FeatureGateProps) {
  const { canUse, planRequired } = useFeatureGate();
  const navigate = useNavigate();

  if (canUse(feature)) {
    return <>{children}</>;
  }

  const requiredPlan = planRequired(feature);
  const defaultMessage = `Esta función requiere el plan ${requiredPlan} o superior`;

  if (mode === 'overlay') {
    return (
      <div className="relative">
        <div className="opacity-30 pointer-events-none select-none blur-[1px]">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={() => navigate('/billing')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600/90 to-blue-600/90 backdrop-blur-md border border-white/20 shadow-xl hover:shadow-purple-500/20 transition-all hover:scale-105 active:scale-95"
          >
            <Lock className="w-3.5 h-3.5 text-white/80" />
            <span className="text-xs font-medium text-white">
              {message || defaultMessage}
            </span>
            <Crown className="w-3.5 h-3.5 text-amber-400" />
          </button>
        </div>
      </div>
    );
  }

  // Block mode - replace entire content
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-col items-center text-center gap-3 py-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
          <Lock className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-white mb-1">
            Función del plan {requiredPlan}
          </p>
          <p className="text-xs text-white/40 max-w-xs">
            {message || defaultMessage}
          </p>
        </div>
        <button
          onClick={() => navigate('/billing')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xs font-medium hover:opacity-90 transition-opacity active:scale-95"
        >
          <Crown className="w-3.5 h-3.5" />
          Mejorar plan
        </button>
      </div>
    </div>
  );
}
