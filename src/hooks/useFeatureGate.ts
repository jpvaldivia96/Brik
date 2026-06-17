import { useMemo } from 'react';
import { useSubscription } from './useSubscription';

/**
 * Feature gating based on subscription plan.
 * 
 * Usage:
 *   const { canUse, planRequired } = useFeatureGate();
 *   if (!canUse('telegram')) { show upgrade prompt }
 */

type Feature =
  | 'telegram'
  | 'ai_assistant'
  | 'advanced_alerts'
  | 'csv_export'
  | 'pdf_reports'
  | 'fiscalization'
  | 'categories'
  | 'bulk_import'
  | 'capacity_control'
  | 'favorite_alerts'
  | 'blocked_alerts'
  | 'alert_history'
  | 'overtime_alerts'
  | 'night_alerts'
  | 'rotation_alerts'
  | 'mass_alerts'
  | 'weekly_summary'
  | 'audit_log'
  | 'statistics'
  | 'multi_site'
  | 'geofencing'
  | 'worker_passport'
  | 'digital_induction'
  | 'work_permits';

type PlanLevel = 'free' | 'starter' | 'pro' | 'enterprise';

// Maps each feature to the minimum plan required
const FEATURE_PLAN_MAP: Record<Feature, PlanLevel> = {
  // Starter features
  favorite_alerts: 'starter',
  blocked_alerts: 'starter',
  alert_history: 'starter',
  csv_export: 'starter',
  capacity_control: 'starter',
  bulk_import: 'starter',

  // Pro features
  telegram: 'pro',
  ai_assistant: 'pro',
  advanced_alerts: 'pro',
  pdf_reports: 'pro',
  fiscalization: 'pro',
  categories: 'pro',
  overtime_alerts: 'pro',
  night_alerts: 'pro',
  rotation_alerts: 'pro',
  mass_alerts: 'pro',
  weekly_summary: 'pro',
  audit_log: 'pro',
  statistics: 'pro',

  // Enterprise features
  multi_site: 'enterprise',
  geofencing: 'enterprise',
  worker_passport: 'enterprise',
  digital_induction: 'enterprise',
  work_permits: 'enterprise',
};

const PLAN_HIERARCHY: Record<PlanLevel, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  enterprise: 3,
};

const PLAN_DISPLAY_NAMES: Record<PlanLevel, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

export function useFeatureGate() {
  const { subscription } = useSubscription();

  const currentPlanLevel = PLAN_HIERARCHY[subscription.plan] ?? 0;

  const canUse = useMemo(() => {
    return (feature: Feature): boolean => {
      const requiredPlan = FEATURE_PLAN_MAP[feature];
      if (!requiredPlan) return true; // Unknown feature = allow
      const requiredLevel = PLAN_HIERARCHY[requiredPlan];
      return currentPlanLevel >= requiredLevel;
    };
  }, [currentPlanLevel]);

  const planRequired = (feature: Feature): string => {
    const plan = FEATURE_PLAN_MAP[feature];
    return PLAN_DISPLAY_NAMES[plan] || 'Pro';
  };

  const isFreePlan = subscription.plan === 'free';
  const isStarterPlan = subscription.plan === 'starter';
  const isProPlan = subscription.plan === 'pro';
  const isEnterprise = subscription.plan === 'enterprise';
  const isPaidPlan = currentPlanLevel >= 1;
  const isProOrAbove = currentPlanLevel >= 2;

  return {
    canUse,
    planRequired,
    currentPlan: subscription.plan,
    isFreePlan,
    isStarterPlan,
    isProPlan,
    isEnterprise,
    isPaidPlan,
    isProOrAbove,
  };
}
