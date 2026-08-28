import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Crown, Zap, Building2 } from 'lucide-react';
import { useSite } from '@/contexts/SiteContext';
import { useNavigate } from 'react-router-dom';

interface SubscribeModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const plans = [
    {
        id: 'free',
        name: 'Free',
        price: '$0',
        priceBs: 'Bs 0',
        limit: '100 registros/mes',
        features: ['Dashboard en vivo', 'Biometría facial', 'Registro entrada/salida', 'Gestión básica de personal'],
        color: 'from-gray-500 to-gray-600',
    },
    {
        id: 'starter',
        name: 'Starter',
        price: '$29',
        priceBs: 'Bs 290',
        limit: '500 registros/mes',
        features: ['Todo de Free', 'Alertas de favoritos', 'Exportar CSV', 'Control de capacidad', 'Importación masiva'],
        color: 'from-blue-500 to-cyan-500',
    },
    {
        id: 'pro',
        name: 'Pro',
        price: '$70',
        priceBs: 'Bs 700',
        limit: '2,000 registros/mes',
        popular: true,
        features: ['Todo de Starter', '16 alertas avanzadas', 'Bot Telegram', 'Asistente AI Brix', 'Fiscalización y reportes PDF'],
        color: 'from-purple-500 to-blue-500',
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        price: '$120',
        priceBs: 'Bs 1,200',
        limit: 'Ilimitado',
        features: ['Todo de Pro', 'Panel multi-obra', 'Worker Passport', 'Soporte dedicado', 'Onboarding asistido'],
        color: 'from-amber-500 to-orange-500',
    },
];

export default function SubscribeModal({ open, onOpenChange }: SubscribeModalProps) {
    const navigate = useNavigate();

    const handleSelectPlan = (planId: string) => {
        onOpenChange(false);
        if (planId !== 'free') {
            navigate('/billing');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg bg-gradient-to-br from-slate-900 via-purple-900/90 to-slate-900 border-purple-500/30 text-white">
                <DialogHeader className="text-center pb-4">
                    <DialogTitle className="text-xl font-bold text-white flex items-center justify-center gap-2">
                        <Crown className="w-5 h-5 text-yellow-400" />
                        Elige tu Plan
                    </DialogTitle>
                    <DialogDescription className="text-white/70">
                        Desbloquea más registros y funciones para tu obra
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    {plans.map((plan) => (
                        <button
                            key={plan.id}
                            onClick={() => handleSelectPlan(plan.id)}
                            className={`w-full p-4 rounded-xl border transition-all text-left hover:scale-[1.02] ${plan.popular
                                ? 'bg-purple-500/20 border-purple-400 ring-2 ring-purple-400/50'
                                : 'bg-white/5 border-white/20 hover:border-white/40'
                                }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${plan.color} flex items-center justify-center`}>
                                        {plan.id === 'free' && <Zap className="w-4 h-4 text-white" />}
                                        {plan.id === 'pro' && <Crown className="w-4 h-4 text-white" />}
                                        {plan.id === 'enterprise' && <Building2 className="w-4 h-4 text-white" />}
                                    </div>
                                    <span className="font-semibold text-lg">{plan.name}</span>
                                    {plan.popular && (
                                        <span className="text-xs bg-purple-500 text-white px-2 py-0.5 rounded-full">
                                            Popular
                                        </span>
                                    )}
                                </div>
                                <div className="text-right">
                                    <span className="text-xl font-bold">{plan.price}</span>
                                    {plan.price !== 'Custom' && plan.price !== '$0' && (
                                        <span className="text-white/60 text-sm">/mes</span>
                                    )}
                                </div>
                            </div>
                            <p className="text-sm text-white/60 mb-2">{plan.limit}</p>
                            <div className="flex flex-wrap gap-1">
                                {plan.features.slice(0, 3).map((feature, i) => (
                                    <span key={i} className="text-xs bg-white/10 px-2 py-0.5 rounded-full text-white/70">
                                        {feature}
                                    </span>
                                ))}
                            </div>
                        </button>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
