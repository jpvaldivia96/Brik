import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Zap, Building2, ArrowRight, Check, Shield, BarChart3, Users, Calendar, Bell, Brain } from 'lucide-react';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';

interface WelcomeModalProps {
    onComplete: () => void;
}

const trialFeatures = [
    { icon: Users, label: '2,000 registros de acceso', color: 'from-purple-500 to-blue-500' },
    { icon: BarChart3, label: 'Dashboard en tiempo real', color: 'from-blue-500 to-cyan-500' },
    { icon: Bell, label: 'Alertas y reportes avanzados', color: 'from-orange-500 to-amber-500' },
    { icon: Brain, label: 'Asistente AI Brix', color: 'from-pink-500 to-purple-500' },
];

const plans = [
    { name: 'Free', price: '$0', limit: '100/mes', gradient: 'from-gray-500 to-gray-600' },
    { name: 'Starter', price: '$29', limit: '500/mes', gradient: 'from-blue-500 to-cyan-500' },
    { name: 'Pro', price: '$70', limit: '2,000/mes', popular: true, gradient: 'from-purple-500 to-blue-500' },
    { name: 'Enterprise', price: '$120', limit: 'Ilimitado', gradient: 'from-amber-500 to-orange-500' },
];

const tutorialSteps = [
    { icon: Building2, title: 'Logo BRIK = Inicio', desc: 'Toca el logo para volver al dashboard', color: 'from-purple-500 to-blue-500' },
    { icon: Bell, title: 'Alertas en Tiempo Real', desc: 'Recibe notificaciones de eventos importantes', color: 'from-orange-500 to-amber-500' },
    { icon: Users, title: 'En Obra = Total en Vivo', desc: 'Personas dentro de la obra ahora mismo', color: 'from-green-500 to-teal-500' },
    { icon: Calendar, title: 'Calendario = Historial', desc: 'Revisa registros de días pasados', color: 'from-blue-500 to-cyan-500' },
];

type Step = 'welcome' | 'plans' | 'tutorial';

export default function WelcomeModal({ onComplete }: WelcomeModalProps) {
    const [step, setStep] = useState<Step>('welcome');
    const { currentSite } = useSite();
    const { user } = useAuth();

    const userName = user?.user_metadata?.full_name?.split(' ')[0] || '';
    const stepIndex = step === 'welcome' ? 0 : step === 'plans' ? 1 : 2;

    return (
        <Dialog open onOpenChange={() => { }}>
            <DialogContent
                className="max-w-md p-0 border-0 overflow-hidden bg-transparent shadow-2xl"
                style={{ background: 'none' }}
            >
                {/* Glass container */}
                <div
                    className="relative overflow-hidden rounded-2xl"
                    style={{
                        background: 'rgba(15, 15, 25, 0.92)',
                        backdropFilter: 'blur(40px)',
                        border: '1px solid rgba(255,255,255,0.08)',
                    }}
                >
                    {/* Animated gradient header */}
                    <div
                        className="absolute top-0 left-0 right-0 h-40 opacity-60"
                        style={{
                            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.4) 0%, rgba(59, 130, 246, 0.3) 50%, rgba(16, 185, 129, 0.2) 100%)',
                            filter: 'blur(30px)',
                        }}
                    />

                    {/* Progress dots */}
                    <div className="relative flex justify-center gap-2 pt-6 pb-2">
                        {[0, 1, 2].map(i => (
                            <div
                                key={i}
                                className={`h-1 rounded-full transition-all duration-500 ${i === stepIndex
                                    ? 'w-8 bg-purple-400'
                                    : i < stepIndex
                                        ? 'w-4 bg-purple-500/50'
                                        : 'w-4 bg-white/15'
                                    }`}
                            />
                        ))}
                    </div>

                    <div className="relative p-6 pt-4">
                        {/* ─── Welcome Step ─── */}
                        {step === 'welcome' && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                {/* Icon */}
                                <div className="flex justify-center mb-5">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
                                        <Sparkles className="w-8 h-8 text-white" />
                                    </div>
                                </div>

                                {/* Title */}
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-white mb-2">
                                        {userName ? `¡Hola ${userName}!` : '¡Bienvenido!'}
                                    </h2>
                                    <p className="text-white/60 text-sm">
                                        Tu obra <span className="text-purple-300 font-medium">{currentSite?.name}</span> está lista.
                                    </p>
                                    <div className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-full bg-green-500/15 border border-green-500/20">
                                        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                        <span className="text-green-400 text-xs font-medium">Trial Pro · 14 días gratis</span>
                                    </div>
                                </div>

                                {/* Features grid */}
                                <div className="grid grid-cols-2 gap-2.5 mb-6">
                                    {trialFeatures.map((feat) => (
                                        <div
                                            key={feat.label}
                                            className="group p-3 rounded-xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-200"
                                        >
                                            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${feat.color} flex items-center justify-center mb-2 shadow-sm group-hover:scale-110 transition-transform duration-200`}>
                                                <feat.icon className="w-4 h-4 text-white" />
                                            </div>
                                            <p className="text-xs text-white/70 leading-tight">{feat.label}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Actions */}
                                <div className="flex gap-2.5">
                                    <Button
                                        variant="ghost"
                                        className="flex-1 h-11 text-white/50 hover:text-white hover:bg-white/8 rounded-xl text-sm"
                                        onClick={() => setStep('plans')}
                                    >
                                        Ver planes
                                    </Button>
                                    <Button
                                        className="flex-1 h-11 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white rounded-xl font-medium text-sm shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                                        onClick={() => setStep('tutorial')}
                                    >
                                        Continuar
                                        <ArrowRight className="w-4 h-4 ml-1.5" />
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* ─── Plans Step ─── */}
                        {step === 'plans' && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="text-center mb-5">
                                    <h2 className="text-xl font-bold text-white">Planes disponibles</h2>
                                    <p className="text-white/40 text-xs mt-1">Después del trial, elige el plan ideal</p>
                                </div>

                                <div className="space-y-2 mb-5">
                                    {plans.map((plan) => (
                                        <div
                                            key={plan.name}
                                            className={`flex items-center justify-between p-3.5 rounded-xl border transition-all duration-200 cursor-default ${plan.popular
                                                ? 'bg-purple-500/10 border-purple-500/30 ring-1 ring-purple-500/20'
                                                : 'bg-white/[0.02] border-white/8 hover:border-white/15 hover:bg-white/[0.04]'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${plan.gradient} flex items-center justify-center shadow-sm`}>
                                                    <Shield className="w-4 h-4 text-white" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-semibold text-white">{plan.name}</span>
                                                        {plan.popular && (
                                                            <span className="text-[10px] font-medium bg-purple-500 text-white px-1.5 py-0.5 rounded-full leading-none">
                                                                Popular
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-white/40">{plan.limit} registros</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-lg font-bold text-white">{plan.price}</span>
                                                {plan.price !== '$0' && <span className="text-white/40 text-xs">/mes</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <Button
                                    className="w-full h-11 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white rounded-xl font-medium text-sm shadow-lg shadow-purple-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
                                    onClick={() => setStep('tutorial')}
                                >
                                    Empezar con Trial
                                    <ArrowRight className="w-4 h-4 ml-1.5" />
                                </Button>
                            </div>
                        )}

                        {/* ─── Tutorial Step ─── */}
                        {step === 'tutorial' && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                {/* Icon */}
                                <div className="flex justify-center mb-5">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center shadow-lg shadow-green-500/30">
                                        <Zap className="w-8 h-8 text-white" />
                                    </div>
                                </div>

                                <div className="text-center mb-5">
                                    <h2 className="text-xl font-bold text-white">Guía rápida</h2>
                                    <p className="text-white/40 text-xs mt-1">Lo esencial para empezar</p>
                                </div>

                                <div className="space-y-2.5 mb-6">
                                    {tutorialSteps.map((item, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center gap-3 p-3 rounded-xl border border-white/8 bg-white/[0.02] hover:bg-white/[0.05] transition-all duration-200"
                                        >
                                            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center shadow-sm flex-shrink-0`}>
                                                <item.icon className="w-4.5 h-4.5 text-white" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-white">{item.title}</p>
                                                <p className="text-xs text-white/40 truncate">{item.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <Button
                                    className="w-full h-11 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white rounded-xl font-medium text-sm shadow-lg shadow-green-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
                                    onClick={onComplete}
                                >
                                    <Check className="w-4 h-4 mr-1.5" />
                                    ¡Entendido, empezar!
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
