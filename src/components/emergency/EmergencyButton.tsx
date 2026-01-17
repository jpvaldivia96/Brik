import { useState } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AlertCircle, Check } from 'lucide-react';
import { toast } from 'sonner';

export function EmergencyButton() {
    const { currentSite } = useSite();
    const [reporting, setReporting] = useState(false);
    const [reported, setReported] = useState(false);

    const handleEmergency = async () => {
        if (!currentSite || reported) return;

        setReporting(true);
        try {
            // Trigger emergency alert
            const { error } = await (supabase as any).functions.invoke('send-alert', {
                body: {
                    site_id: currentSite.id,
                    alert_type: 'accident_reported',
                    title: '🚨 EMERGENCIA REPORTADA',
                    body: 'Se activó el botón de emergencia en obra',
                    data: { timestamp: new Date().toISOString() }
                }
            });

            if (error) throw error;

            setReported(true);
            toast.success('Alerta de emergencia enviada a supervisores');

            // Reset after 5 minutes
            setTimeout(() => setReported(false), 5 * 60 * 1000);
        } catch (err) {
            console.error('Error reporting emergency:', err);
            toast.error('Error al enviar alerta');
        } finally {
            setReporting(false);
        }
    };

    return (
        <div className="bg-gradient-to-br from-red-900/40 to-red-800/40 border border-red-500/50 rounded-xl p-6">
            <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-red-500/30 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-6 h-6 text-red-400" />
                </div>
                <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-2">Botón de Emergencia</h3>
                    <p className="text-sm text-white/70 mb-4">
                        Use este botón solo en caso de accidente o emergencia real. Se notificará inmediatamente a todos los supervisores.
                    </p>
                    <Button
                        onClick={handleEmergency}
                        disabled={reporting || reported}
                        className={`w-full ${reported
                                ? 'bg-green-600 hover:bg-green-700'
                                : 'bg-red-600 hover:bg-red-700'
                            }`}
                    >
                        {reporting ? (
                            'Enviando...'
                        ) : reported ? (
                            <>
                                <Check className="w-4 h-4 mr-2" />
                                Emergencia Reportada
                            </>
                        ) : (
                            <>
                                <AlertCircle className="w-4 h-4 mr-2" />
                                Reportar Emergencia
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
