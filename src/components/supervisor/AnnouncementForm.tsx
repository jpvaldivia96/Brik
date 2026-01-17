import { useState } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Megaphone, Send } from 'lucide-react';
import { toast } from 'sonner';

export function AnnouncementForm() {
    const { currentSite } = useSite();
    const [sending, setSending] = useState(false);
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>('normal');

    const handleSend = async () => {
        if (!currentSite || !title || !body) {
            toast.error('Complete todos los campos');
            return;
        }

        setSending(true);
        try {
            // Save announcement
            const { error: dbError } = await (supabase as any)
                .from('announcements')
                .insert({
                    site_id: currentSite.id,
                    title,
                    body,
                    priority
                });

            if (dbError) throw dbError;

            // Send push notification
            const { error: alertError } = await (supabase as any).functions.invoke('send-alert', {
                body: {
                    site_id: currentSite.id,
                    alert_type: 'announcement',
                    title: `📢 ${title}`,
                    body: body,
                    data: { priority }
                }
            });

            if (alertError) throw alertError;

            toast.success('Anuncio enviado a todos los supervisores');
            setTitle('');
            setBody('');
            setPriority('normal');
        } catch (err) {
            console.error('Error sending announcement:', err);
            toast.error('Error al enviar anuncio');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="bg-slate-800 rounded-xl p-6 border border-white/10">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <Megaphone className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-white">Enviar Anuncio</h2>
                    <p className="text-sm text-white/50">Notificación broadcast a supervisores</p>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <Label className="text-white/70 text-sm">Título</Label>
                    <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Ej: Reunión urgente a las 3pm"
                        className="mt-1 bg-slate-700 border-white/20 text-white"
                        maxLength={100}
                    />
                </div>

                <div>
                    <Label className="text-white/70 text-sm">Mensaje</Label>
                    <Textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="Escriba el mensaje del anuncio..."
                        className="mt-1 bg-slate-700 border-white/20 text-white min-h-[100px]"
                        maxLength={500}
                    />
                </div>

                <div>
                    <Label className="text-white/70 text-sm">Prioridad</Label>
                    <div className="flex gap-2 mt-2">
                        {(['normal', 'high', 'urgent'] as const).map((p) => (
                            <button
                                key={p}
                                onClick={() => setPriority(p)}
                                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${priority === p
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-slate-700 text-white/70 hover:bg-slate-600'
                                    }`}
                            >
                                {p === 'normal' ? 'Normal' : p === 'high' ? 'Alta' : 'Urgente'}
                            </button>
                        ))}
                    </div>
                </div>

                <Button
                    onClick={handleSend}
                    disabled={sending || !title || !body}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                >
                    {sending ? (
                        'Enviando...'
                    ) : (
                        <>
                            <Send className="w-4 h-4 mr-2" />
                            Enviar Anuncio
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
