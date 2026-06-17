import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Zap, Building2, ArrowRight, Check, Crown } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { useSite } from '@/contexts/SiteContext';

interface WelcomeModalProps {
    onComplete: () => void;
}

const plans = [
    {
        name: 'Free',
        price: '$0',
        limit: '100/mes',
        current: true,
        features: ['100 registros mensuales', 'Dashboard en vivo', 'Biometría facial'],
    },
    {
        name: 'Starter',
        price: '$29',
        limit: '500/mes',
        features: ['500 registros mensuales', 'Alertas de favoritos', 'Exportar CSV'],
    },
    {
        name: 'Pro',
        price: '$70',
        limit: '2,000/mes',
        popular: true,
        features: ['2,000 registros mensuales', 'Bot Telegram + AI', 'Reportes PDF + fiscalización'],
    },
    {
        name: 'Enterprise',
        price: '$120',
        limit: 'Ilimitado',
        features: ['Registros ilimitados', 'Panel multi-obra', 'Soporte dedicado'],
    },
];

export default function WelcomeModal({ onComplete }: WelcomeModalProps) {
    const [step, setStep] = useState<'welcome' | 'plans' | 'tutorial'>('welcome');
    const { subscription } = useSubscription();
    const { currentSite } = useSite();

    return (
        <Dialog open onOpenChange={() => { }}>
            <DialogContent className="max-w-lg bg-gradient-to-br from-slate-900 via-purple-900/90 to-slate-900 border-purple-500/30 text-white">
                {step === 'welcome' && (
                    <>
                        <DialogHeader className="text-center pb-4">
                            <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                                <Sparkles className="w-8 h-8 text-white" />
                            </div>
                            <DialogTitle className="text-2xl font-bold text-white">
                                ¡Bienvenido a BRIK Pro!
                            </DialogTitle>
                            <DialogDescription className="text-white/70 text-base mt-2">
                                Tu obra <span className="text-purple-300 font-medium">{currentSite?.name}</span> está lista.
                                <br />
                                Estás en el <span className="text-green-400 font-semibold">Plan Trial (14 días gratis)</span>.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="bg-white/10 rounded-xl p-4 border border-white/20 mb-4">
                            <div className="flex items-center gap-3 mb-3">
                                <Zap className="w-5 h-5 text-yellow-400" />
                                <span className="font-medium">Incluido en tu Trial:</span>
                            </div>
                            <ul className="space-y-2 text-sm text-white/80">
                                <li className="flex items-center gap-2">
                                    <Check className="w-4 h-4 text-green-400" />
                                    2000 registros de acceso por mes
                                </li>
                                <li className="flex items-center gap-2">
                                    <Check className="w-4 h-4 text-green-400" />
                                    Dashboard en tiempo real
                                </li>
                                <li className="flex items-center gap-2">
                                    <Check className="w-4 h-4 text-green-400" />
                                    Alertas y reportes avanzados
                                </li>
                            </ul>
                        </div>

                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                className="flex-1 border-white/30 text-white hover:bg-white/10"
                                onClick={() => setStep('plans')}
                            >
                                Ver planes
                            </Button>
                            <Button
                                className="flex-1 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                                onClick={() => setStep('tutorial')}
                            >
                                Continuar
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </div>
                    </>
                )}

                {step === 'plans' && (
                    <>
                        <DialogHeader className="text-center pb-4">
                            <DialogTitle className="text-xl font-bold text-white">
                                Elige tu Plan
                            </DialogTitle>
                        </DialogHeader>

                        <div className="space-y-3">
                            {plans.map((plan) => (
                                <div
                                    key={plan.name}
                                    className={`p-4 rounded-xl border transition-all ${plan.popular
                                            ? 'bg-purple-500/20 border-purple-400 ring-2 ring-purple-400/50'
                                            : 'bg-white/5 border-white/20 hover:border-white/40'
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-lg">{plan.name}</span>
                                            {plan.popular && (
                                                <span className="text-xs bg-purple-500 text-white px-2 py-0.5 rounded-full">
                                                    Popular
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xl font-bold">{plan.price}</span>
                                            {plan.price !== '$0' && <span className="text-white/60 text-sm">/mes</span>}
                                        </div>
                                    </div>
                                    <p className="text-sm text-white/60">{plan.limit} registros</p>
                                </div>
                            ))}
                        </div>

                        <Button
                            className="w-full mt-4 bg-gradient-to-r from-purple-500 to-blue-500"
                            onClick={() => setStep('tutorial')}
                        >
                            Empezar con Trial
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    </>
                )}

                {step === 'tutorial' && (
                    <>
                        <DialogHeader className="text-center pb-4">
                            <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center">
                                <Building2 className="w-8 h-8 text-white" />
                            </div>
                            <DialogTitle className="text-xl font-bold text-white">
                                Conoce tu Dashboard
                            </DialogTitle>
                            <DialogDescription className="text-white/70 text-sm mt-2">
                                Aquí está lo más importante:
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-3 text-sm">
                            <div className="flex items-start gap-3 bg-white/10 p-3 rounded-xl">
                                <div className="w-8 h-8 rounded-lg bg-purple-500/30 flex items-center justify-center flex-shrink-0">
                                    <span className="text-purple-300 font-bold">1</span>
                                </div>
                                <div>
                                    <p className="font-medium text-white">Logo BRIK = Inicio</p>
                                    <p className="text-white/60">Toca el logo para volver al dashboard</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 bg-white/10 p-3 rounded-xl">
                                <div className="w-8 h-8 rounded-lg bg-orange-500/30 flex items-center justify-center flex-shrink-0">
                                    <span className="text-orange-300 font-bold">2</span>
                                </div>
                                <div>
                                    <p className="font-medium text-white">Alerta / Riesgo</p>
                                    <p className="text-white/60">Trabajadores cerca del límite de tiempo</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 bg-white/10 p-3 rounded-xl">
                                <div className="w-8 h-8 rounded-lg bg-green-500/30 flex items-center justify-center flex-shrink-0">
                                    <span className="text-green-300 font-bold">3</span>
                                </div>
                                <div>
                                    <p className="font-medium text-white">En Obra = Total en Vivo</p>
                                    <p className="text-white/60">Personas dentro de la obra ahora mismo</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 bg-white/10 p-3 rounded-xl">
                                <div className="w-8 h-8 rounded-lg bg-blue-500/30 flex items-center justify-center flex-shrink-0">
                                    <span className="text-blue-300 font-bold">4</span>
                                </div>
                                <div>
                                    <p className="font-medium text-white">Calendario = Fechas Anteriores</p>
                                    <p className="text-white/60">Revisa registros de días pasados</p>
                                </div>
                            </div>
                        </div>

                        <Button
                            className="w-full mt-4 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600"
                            onClick={onComplete}
                        >
                            ¡Entendido!
                            <Check className="w-4 h-4 ml-2" />
                        </Button>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
