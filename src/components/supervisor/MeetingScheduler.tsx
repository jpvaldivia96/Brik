import { useState } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, Plus } from 'lucide-react';
import { toast } from 'sonner';

export function MeetingScheduler() {
    const { currentSite } = useSite();
    const [creating, setCreating] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [scheduledAt, setScheduledAt] = useState('');

    const handleSchedule = async () => {
        if (!currentSite || !title || !scheduledAt) {
            toast.error('Complete título y fecha/hora');
            return;
        }

        setCreating(true);
        try {
            const { error } = await (supabase as any)
                .from('scheduled_meetings')
                .insert({
                    site_id: currentSite.id,
                    title,
                    description,
                    scheduled_at: new Date(scheduledAt).toISOString()
                });

            if (error) throw error;

            toast.success('Reunión programada. Se enviará recordatorio 30 min antes.');
            setTitle('');
            setDescription('');
            setScheduledAt('');
        } catch (err) {
            console.error('Error scheduling meeting:', err);
            toast.error('Error al programar reunión');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="bg-slate-800 rounded-xl p-6 border border-white/10">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-white">Programar Reunión</h2>
                    <p className="text-sm text-white/50">Se enviará recordatorio automático 30 min antes</p>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <Label className="text-white/70 text-sm">Título de la reunión</Label>
                    <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Ej: Reunión de seguridad"
                        className="mt-1 bg-slate-700 border-white/20 text-white"
                    />
                </div>

                <div>
                    <Label className="text-white/70 text-sm">Descripción (opcional)</Label>
                    <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Detalles de la reunión..."
                        className="mt-1 bg-slate-700 border-white/20 text-white"
                        rows={3}
                    />
                </div>

                <div>
                    <Label className="text-white/70 text-sm">Fecha y hora</Label>
                    <Input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        className="mt-1 bg-slate-700 border-white/20 text-white"
                        min={new Date().toISOString().slice(0, 16)}
                    />
                </div>

                <Button
                    onClick={handleSchedule}
                    disabled={creating || !title || !scheduledAt}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                >
                    {creating ? (
                        'Programando...'
                    ) : (
                        <>
                            <Plus className="w-4 h-4 mr-2" />
                            Programar Reunión
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
