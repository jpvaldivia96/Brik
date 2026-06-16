import { useState, useEffect, useCallback } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Crown, Zap, Building2, Check, X, CreditCard, TrendingUp,
  MessageCircle, ArrowRight, Sparkles, Shield, BarChart3,
  Bell, Bot, Users, Eye, FileText, ChevronDown, ChevronUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

// ─── Plan Definitions ────────────────────────────────────────────────────────

interface PlanFeature {
  name: string;
  free: boolean | string;
  starter: boolean | string;
  pro: boolean | string;
  enterprise: boolean | string;
}

const PLAN_FEATURES: PlanFeature[] = [
  { name: 'Dashboard en vivo', free: true, starter: true, pro: true, enterprise: true },
  { name: 'Registro entrada/salida', free: true, starter: true, pro: true, enterprise: true },
  { name: 'Biometría facial', free: true, starter: true, pro: true, enterprise: true },
  { name: 'Reportes básicos', free: true, starter: true, pro: true, enterprise: true },
  { name: 'Alertas de favoritos', free: false, starter: true, pro: true, enterprise: true },
  { name: 'Exportar CSV', free: false, starter: true, pro: true, enterprise: true },
  { name: 'Historial de alertas', free: false, starter: true, pro: true, enterprise: true },
  { name: 'Todas las alertas', free: false, starter: false, pro: true, enterprise: true },
  { name: 'Telegram bot', free: false, starter: false, pro: true, enterprise: true },
  { name: 'Asistente AI (Brix)', free: false, starter: false, pro: true, enterprise: true },
  { name: 'Dependientes', free: false, starter: false, pro: true, enterprise: true },
  { name: 'Fiscalización', free: false, starter: false, pro: true, enterprise: true },
  { name: 'Reportes avanzados', free: false, starter: false, pro: true, enterprise: true },
  { name: 'Categorías personalizadas', free: false, starter: false, pro: true, enterprise: true },
  { name: 'API de integración', free: false, starter: false, pro: false, enterprise: true },
  { name: 'Multi-obra unificado', free: false, starter: false, pro: false, enterprise: true },
  { name: 'Soporte dedicado', free: false, starter: false, pro: false, enterprise: true },
];

const PLANS = [
  {
    id: 'free' as const,
    name: 'Free',
    price: 0,
    priceBs: 0,
    limit: 100,
    description: 'Ideal para probar',
    icon: Zap,
    gradient: 'from-slate-500 to-slate-600',
    borderColor: 'border-slate-500/30',
    bgColor: 'bg-slate-500/10',
    textColor: 'text-slate-300',
  },
  {
    id: 'starter' as const,
    name: 'Starter',
    price: 29,
    priceBs: 200,
    limit: 500,
    description: 'Para obras pequeñas',
    icon: Shield,
    gradient: 'from-blue-500 to-cyan-500',
    borderColor: 'border-blue-500/30',
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-300',
  },
  {
    id: 'pro' as const,
    name: 'Pro',
    price: 70,
    priceBs: 490,
    limit: 2000,
    description: 'Todo incluido',
    icon: Crown,
    gradient: 'from-purple-500 to-blue-500',
    borderColor: 'border-purple-500/30',
    bgColor: 'bg-purple-500/10',
    textColor: 'text-purple-300',
    popular: true,
  },
  {
    id: 'enterprise' as const,
    name: 'Enterprise',
    price: 149,
    priceBs: 1050,
    limit: 999999,
    description: 'Para grandes empresas',
    icon: Building2,
    gradient: 'from-amber-500 to-orange-500',
    borderColor: 'border-amber-500/30',
    bgColor: 'bg-amber-500/10',
    textColor: 'text-amber-300',
  },
];

// ─── Usage History ───────────────────────────────────────────────────────────

function UsageChart({ siteId, monthlyLimit }: { siteId: string; monthlyLimit: number }) {
  const [history, setHistory] = useState<{ month: string; usage: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        // Get last 6 months of access logs counts
        const months: { month: string; usage: number }[] = [];
        const now = new Date();

        for (let i = 5; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
          const monthLabel = date.toLocaleDateString('es-BO', { month: 'short' });

          const { count } = await supabase
            .from('access_logs')
            .select('*', { count: 'exact', head: true })
            .eq('site_id', siteId)
            .gte('entry_at', date.toISOString())
            .lt('entry_at', nextMonth.toISOString());

          months.push({ month: monthLabel, usage: count || 0 });
        }

        setHistory(months);
      } catch (err) {
        console.error('Error fetching usage history:', err);
      } finally {
        setLoading(false);
      }
    };

    if (siteId) fetchHistory();
  }, [siteId]);

  if (loading) {
    return (
      <div className="h-40 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const maxUsage = Math.max(...history.map(h => h.usage), monthlyLimit);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-2 h-32">
        {history.map((month, i) => {
          const height = maxUsage > 0 ? (month.usage / maxUsage) * 100 : 0;
          const limitHeight = maxUsage > 0 ? (monthlyLimit / maxUsage) * 100 : 0;
          const isOverLimit = month.usage > monthlyLimit;
          const isCurrentMonth = i === history.length - 1;

          return (
            <div key={month.month} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-white/40 font-medium tabular-nums">
                {month.usage > 999 ? `${(month.usage / 1000).toFixed(1)}k` : month.usage}
              </span>
              <div className="w-full relative" style={{ height: '100px' }}>
                {/* Limit line */}
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-white/20"
                  style={{ bottom: `${limitHeight}%` }}
                />
                {/* Bar */}
                <div
                  className={`absolute bottom-0 left-1 right-1 rounded-t-md transition-all duration-700 ${
                    isOverLimit
                      ? 'bg-gradient-to-t from-red-500 to-red-400'
                      : isCurrentMonth
                        ? 'bg-gradient-to-t from-purple-500 to-blue-400'
                        : 'bg-gradient-to-t from-white/20 to-white/10'
                  }`}
                  style={{ height: `${Math.max(height, 2)}%` }}
                />
              </div>
              <span className={`text-[10px] font-medium ${isCurrentMonth ? 'text-purple-300' : 'text-white/40'}`}>
                {month.month}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 justify-center">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-sm bg-gradient-to-t from-purple-500 to-blue-400" />
          <span className="text-[10px] text-white/40">Mes actual</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 border-t border-dashed border-white/30" />
          <span className="text-[10px] text-white/40">Límite del plan</span>
        </div>
      </div>
    </div>
  );
}

// ─── Plan Card ───────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  currentPlan,
  onSelect,
}: {
  plan: typeof PLANS[0];
  currentPlan: string;
  onSelect: (planId: string) => void;
}) {
  const isCurrent = plan.id === currentPlan;
  const Icon = plan.icon;

  return (
    <button
      onClick={() => !isCurrent && onSelect(plan.id)}
      disabled={isCurrent}
      className={`relative w-full p-4 rounded-2xl border transition-all duration-300 text-left ${
        isCurrent
          ? `${plan.borderColor} ${plan.bgColor} ring-1 ring-white/10`
          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 active:scale-[0.98]'
      }`}
    >
      {/* Popular badge */}
      {plan.popular && (
        <div className="absolute -top-2.5 right-3">
          <span className="text-[10px] font-semibold bg-gradient-to-r from-purple-500 to-blue-500 text-white px-2.5 py-0.5 rounded-full shadow-lg shadow-purple-500/20">
            Popular
          </span>
        </div>
      )}

      {/* Current badge */}
      {isCurrent && (
        <div className="absolute -top-2.5 left-3">
          <span className="text-[10px] font-semibold bg-white/20 text-white px-2.5 py-0.5 rounded-full backdrop-blur-sm">
            Plan actual
          </span>
        </div>
      )}

      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center shadow-lg`}>
            <Icon className="w-4.5 h-4.5 text-white" strokeWidth={1.8} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{plan.name}</h3>
            <p className="text-[11px] text-white/40">{plan.description}</p>
          </div>
        </div>
        <div className="text-right">
          {plan.price === 0 ? (
            <span className="text-lg font-bold text-white">Gratis</span>
          ) : (
            <>
              <span className="text-lg font-bold text-white">${plan.price}</span>
              <span className="text-[11px] text-white/40">/mes</span>
              <p className="text-[10px] text-white/30">Bs {plan.priceBs}</p>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/50">
          {plan.limit === 999999 ? 'Registros ilimitados' : `${plan.limit.toLocaleString()} registros/mes`}
        </span>
        {!isCurrent && plan.id !== 'free' && (
          <span className={`text-[11px] font-medium ${plan.textColor} flex items-center gap-1`}>
            {currentPlan === 'free' || 
             (currentPlan === 'starter' && (plan.id === 'pro' || plan.id === 'enterprise')) ||
             (currentPlan === 'pro' && plan.id === 'enterprise')
              ? 'Mejorar' : 'Cambiar'}
            <ArrowRight className="w-3 h-3" />
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Feature Comparison Table ────────────────────────────────────────────────

function FeatureComparison({ currentPlan }: { currentPlan: string }) {
  const [expanded, setExpanded] = useState(false);
  const visibleFeatures = expanded ? PLAN_FEATURES : PLAN_FEATURES.slice(0, 7);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="p-4 border-b border-white/10">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-purple-400" />
          Comparación de planes
        </h3>
      </div>
      
      {/* Header */}
      <div className="grid grid-cols-5 gap-0 px-4 py-2.5 bg-white/[0.02] border-b border-white/5">
        <div className="col-span-1" />
        {PLANS.map(plan => (
          <div key={plan.id} className="text-center">
            <span className={`text-[10px] font-semibold ${plan.id === currentPlan ? plan.textColor : 'text-white/50'}`}>
              {plan.name}
            </span>
          </div>
        ))}
      </div>

      {/* Rows */}
      {visibleFeatures.map((feature, i) => (
        <div
          key={feature.name}
          className={`grid grid-cols-5 gap-0 px-4 py-2 ${i % 2 === 0 ? 'bg-white/[0.01]' : ''} border-b border-white/[0.03]`}
        >
          <div className="col-span-1 flex items-center">
            <span className="text-[11px] text-white/60">{feature.name}</span>
          </div>
          {(['free', 'starter', 'pro', 'enterprise'] as const).map(planId => {
            const val = feature[planId];
            const isCurrent = planId === currentPlan;
            return (
              <div key={planId} className="flex items-center justify-center">
                {val === true ? (
                  <Check className={`w-3.5 h-3.5 ${isCurrent ? 'text-green-400' : 'text-white/30'}`} />
                ) : val === false ? (
                  <X className="w-3.5 h-3.5 text-white/10" />
                ) : (
                  <span className="text-[10px] text-white/40">{val}</span>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[11px] text-white/40 hover:text-white/60 transition-colors"
      >
        {expanded ? (
          <>
            Ver menos <ChevronUp className="w-3 h-3" />
          </>
        ) : (
          <>
            Ver todas las funciones ({PLAN_FEATURES.length}) <ChevronDown className="w-3 h-3" />
          </>
        )}
      </button>
    </div>
  );
}

// ─── Payment Section ─────────────────────────────────────────────────────────

function PaymentSection({
  selectedPlan,
  siteName,
  onCancel,
}: {
  selectedPlan: typeof PLANS[0];
  siteName: string;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<'qr' | 'confirm'>('qr');

  const handleConfirmWhatsApp = () => {
    const message = encodeURIComponent(
      `Hola! Pagué por el plan ${selectedPlan.name} para la obra "${siteName}". Mi correo es: [MI_EMAIL]`
    );
    window.open(`https://wa.me/59178997696?text=${message}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      {/* Sheet */}
      <div
        className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden animate-in slide-in-from-bottom duration-300"
        style={{
          background: 'rgba(30, 30, 40, 0.95)',
          backdropFilter: 'blur(40px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderBottom: 'none',
        }}
      >
        {/* Handle bar (mobile) */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="p-6">
          {step === 'qr' ? (
            <>
              <div className="text-center mb-5">
                <div className={`inline-flex w-12 h-12 rounded-2xl bg-gradient-to-br ${selectedPlan.gradient} items-center justify-center mb-3 shadow-lg`}>
                  <CreditCard className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-lg font-bold text-white">Mejorar a {selectedPlan.name}</h2>
                <p className="text-sm text-white/50 mt-1">
                  Bs {selectedPlan.priceBs}/mes (~${selectedPlan.price} USD)
                </p>
              </div>

              {/* QR placeholder */}
              <div className="bg-white rounded-2xl p-4 mx-auto max-w-[220px] mb-4">
                <img
                  src="/payment-qr.png"
                  alt="QR de pago - Banco Ganadero"
                  className="w-full h-auto"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).parentElement!.innerHTML = `
                      <div class="w-full aspect-square bg-gray-100 rounded-xl flex items-center justify-center">
                        <p class="text-gray-400 text-xs text-center px-4">QR no disponible<br/>Contacta por WhatsApp</p>
                      </div>
                    `;
                  }}
                />
              </div>

              <p className="text-center text-xs text-white/40 mb-5">
                Escanea el QR con tu app bancaria · <span className="text-green-400">Banco Ganadero</span>
              </p>

              <div className="space-y-2.5">
                <Button
                  onClick={() => setStep('confirm')}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white font-medium"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Ya pagué
                </Button>
                <Button
                  onClick={onCancel}
                  variant="ghost"
                  className="w-full h-10 text-white/40 hover:text-white/60 hover:bg-white/5"
                >
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="text-center mb-5">
                <div className="inline-flex w-14 h-14 rounded-full bg-gradient-to-br from-green-500 to-teal-500 items-center justify-center mb-3 shadow-lg">
                  <Check className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-lg font-bold text-white">¡Gracias!</h2>
                <p className="text-sm text-white/50 mt-1">
                  Confirma tu pago por WhatsApp
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-5">
                <p className="text-xs text-white/60 leading-relaxed">
                  Envía un mensaje confirmando tu pago con el nombre de la obra, correo y comprobante.
                  Te activaremos el plan <span className="text-white font-medium">{selectedPlan.name}</span> en minutos.
                </p>
              </div>

              <Button
                onClick={handleConfirmWhatsApp}
                className="w-full h-12 rounded-xl bg-green-500 hover:bg-green-600 text-white font-medium"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Confirmar por WhatsApp
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Billing Page ───────────────────────────────────────────────────────

export default function BillingPage() {
  const { subscription, loading, getPlanDisplayName } = useSubscription();
  const { currentSite } = useSite();
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<typeof PLANS[0] | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const currentPlanId = subscription.plan || 'free';
  const currentPlanData = PLANS.find(p => p.id === currentPlanId) || PLANS[0];

  const handleSelectPlan = (planId: string) => {
    if (planId === 'free') {
      toast({ title: 'Plan gratuito', description: 'Ya estás en el plan gratuito' });
      return;
    }
    if (planId === currentPlanId) return;

    const plan = PLANS.find(p => p.id === planId);
    if (plan) setSelectedPlan(plan);
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${currentPlanData.gradient} flex items-center justify-center shadow-lg`}>
          <CreditCard className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">Facturación</h1>
          <p className="text-xs text-white/40">Gestiona tu plan y uso</p>
        </div>
      </div>

      {/* Current Plan Card */}
      <div className={`rounded-2xl border ${currentPlanData.borderColor} ${currentPlanData.bgColor} p-5`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${currentPlanData.gradient} flex items-center justify-center shadow-lg`}>
              <currentPlanData.icon className="w-5 h-5 text-white" strokeWidth={1.8} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Plan {currentPlanData.name}</h2>
              {subscription.isInTrial && subscription.daysLeftInTrial !== null && (
                <p className="text-xs text-amber-400 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  {subscription.daysLeftInTrial} días de prueba restantes
                </p>
              )}
              {!subscription.isInTrial && subscription.status === 'active' && currentPlanId !== 'free' && (
                <p className="text-xs text-green-400">Activo</p>
              )}
              {currentPlanId === 'free' && !subscription.isInTrial && (
                <p className="text-xs text-white/40">Plan gratuito</p>
              )}
            </div>
          </div>
          <div className="text-right">
            {currentPlanData.price > 0 ? (
              <>
                <span className="text-2xl font-bold text-white">${currentPlanData.price}</span>
                <span className="text-xs text-white/40">/mes</span>
              </>
            ) : (
              <span className="text-lg font-bold text-white/60">Gratis</span>
            )}
          </div>
        </div>

        {/* Usage bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/50">Registros este mes</span>
            <span className={`font-medium ${
              subscription.isOverLimit ? 'text-red-400' : 
              subscription.isNearLimit ? 'text-amber-400' : 'text-white/70'
            }`}>
              {subscription.currentUsage.toLocaleString()} / {subscription.monthlyLimit === 999999 ? '∞' : subscription.monthlyLimit.toLocaleString()}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                subscription.isOverLimit
                  ? 'bg-gradient-to-r from-red-500 to-red-400'
                  : subscription.isNearLimit
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                    : 'bg-gradient-to-r from-purple-500 to-blue-400'
              }`}
              style={{ width: `${Math.min(subscription.usagePercentage, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-white/30 text-center">
            {subscription.usagePercentage}% utilizado · Se reinicia el 1° de cada mes
          </p>
        </div>
      </div>

      {/* Usage History */}
      {currentSite && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            Historial de uso
          </h3>
          <UsageChart siteId={currentSite.id} monthlyLimit={subscription.monthlyLimit} />
        </div>
      )}

      {/* Plans */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Crown className="w-4 h-4 text-amber-400" />
          Planes disponibles
        </h3>
        <div className="space-y-3">
          {PLANS.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              currentPlan={currentPlanId}
              onSelect={handleSelectPlan}
            />
          ))}
        </div>
      </div>

      {/* Feature Comparison */}
      <FeatureComparison currentPlan={currentPlanId} />

      {/* FAQ mini */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-green-400" />
          ¿Preguntas?
        </h3>
        <p className="text-xs text-white/50 leading-relaxed">
          Contacta con nuestro equipo para dudas sobre planes, pagos o funciones personalizadas.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full border-green-500/30 text-green-400 hover:bg-green-500/10 hover:text-green-300"
          onClick={() => {
            const msg = encodeURIComponent('Hola! Tengo una consulta sobre los planes de BRIK.');
            window.open(`https://wa.me/59178997696?text=${msg}`, '_blank');
          }}
        >
          <MessageCircle className="w-3.5 h-3.5 mr-2" />
          WhatsApp Soporte
        </Button>
      </div>

      {/* Payment Sheet */}
      {selectedPlan && (
        <PaymentSection
          selectedPlan={selectedPlan}
          siteName={currentSite?.name || ''}
          onCancel={() => setSelectedPlan(null)}
        />
      )}
    </div>
  );
}
