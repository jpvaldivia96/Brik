import { useSubscription } from '@/hooks/useSubscription';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Crown, Zap, Check } from 'lucide-react';

interface LimitBlockModalProps {
    onClose?: () => void;
}

export function LimitBlockModal({ onClose }: LimitBlockModalProps) {
    const { subscription, getPlanDisplayName } = useSubscription();

    if (!subscription.isOverLimit) return null;

    const plans = [
        {
            name: 'Starter',
            price: '350 Bs',
            priceUsd: '$50',
            limit: 500,
            features: ['500 registros/mes', 'Reportes PDF', 'Soporte email'],
            popular: false,
        },
        {
            name: 'Pro',
            price: '700 Bs',
            priceUsd: '$100',
            limit: 2000,
            features: ['2,000 registros/mes', 'Reportes avanzados', 'Permisos nocturnos', 'Soporte prioritario'],
            popular: true,
        },
        {
            name: 'Enterprise',
            price: 'Cotizar',
            priceUsd: '',
            limit: 999999,
            features: ['Registros ilimitados', 'Multi-obra', 'API access', 'Soporte dedicado'],
            popular: false,
        },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-white/20 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="p-6 border-b border-white/10 text-center">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle className="w-8 h-8 text-red-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Límite de Registros Alcanzado</h2>
                    <p className="text-white/60">
                        Has usado <span className="text-red-400 font-semibold">{subscription.currentUsage}</span> de tus{' '}
                        <span className="font-semibold">{subscription.monthlyLimit}</span> registros mensuales.
                    </p>
                </div>

                {/* Plans */}
                <div className="p-6">
                    <p className="text-center text-white/80 mb-6">
                        Actualiza tu plan para continuar registrando entradas y salidas.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {plans.map((plan) => (
                            <div
                                key={plan.name}
                                className={`relative p-5 rounded-2xl border ${plan.popular
                                        ? 'border-purple-400 bg-purple-500/10'
                                        : 'border-white/20 bg-white/5'
                                    }`}
                            >
                                {plan.popular && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full text-xs font-medium text-white">
                                        Más Popular
                                    </div>
                                )}

                                <div className="text-center mb-4">
                                    <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                                    <div className="mt-2">
                                        <span className="text-2xl font-bold text-white">{plan.price}</span>
                                        {plan.priceUsd && (
                                            <span className="text-white/50 text-sm ml-1">/ mes</span>
                                        )}
                                    </div>
                                    {plan.priceUsd && (
                                        <p className="text-xs text-white/40">(~{plan.priceUsd} USD)</p>
                                    )}
                                </div>

                                <ul className="space-y-2 mb-4">
                                    {plan.features.map((feature, i) => (
                                        <li key={i} className="flex items-center gap-2 text-sm text-white/80">
                                            <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                                            {feature}
                                        </li>
                                    ))}
                                </ul>

                                <Button
                                    className={`w-full ${plan.popular
                                            ? 'bg-gradient-to-r from-purple-500 to-blue-500'
                                            : 'bg-white/10 hover:bg-white/20'
                                        }`}
                                    onClick={() => {
                                        // TODO: Integrate with Stripe or contact form
                                        window.open('mailto:ventas@brik.bo?subject=Upgrade a ' + plan.name, '_blank');
                                    }}
                                >
                                    {plan.name === 'Enterprise' ? 'Contactar' : 'Seleccionar'}
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/10 flex justify-between items-center">
                    <p className="text-xs text-white/40">
                        El límite se reinicia el primer día de cada mes.
                    </p>
                    {onClose && (
                        <Button variant="ghost" onClick={onClose} className="text-white/60">
                            Cerrar (solo lectura)
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
