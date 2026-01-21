import { Lock, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';

export function SuspendedOverlay() {
    const { currentSite } = useSite();
    const { signOut } = useAuth();

    const handleContact = () => {
        const message = encodeURIComponent(
            `Hola! Mi obra "${currentSite?.name}" está suspendida. Necesito ayuda para reactivarla.`
        );
        window.open(`https://wa.me/59178997696?text=${message}`, '_blank');
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/95 flex items-center justify-center p-4">
            <div className="max-w-md text-center">
                <div className="mx-auto mb-6 w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
                    <Lock className="w-10 h-10 text-red-400" />
                </div>

                <h1 className="text-2xl font-bold text-white mb-2">
                    Cuenta Suspendida
                </h1>

                <p className="text-white/60 mb-6">
                    El acceso a <span className="text-white font-medium">{currentSite?.name}</span> ha sido pausado.
                    Contacta al administrador para reactivar tu suscripción.
                </p>

                <div className="space-y-3">
                    <Button
                        onClick={handleContact}
                        className="w-full bg-green-500 hover:bg-green-600"
                    >
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Contactar por WhatsApp
                    </Button>

                    <Button
                        variant="outline"
                        onClick={signOut}
                        className="w-full border-white/20 text-white hover:bg-white/10"
                    >
                        Cerrar Sesión
                    </Button>
                </div>
            </div>
        </div>
    );
}
