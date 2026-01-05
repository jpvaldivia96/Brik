import { useState, useEffect } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { Bell, Slack, MessageSquare, Save, TestTube, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Settings {
    slack_webhook_url: string;
    teams_webhook_url: string;
    notify_on_watchlist_entry: boolean;
    notify_on_contractor_complete: boolean;
    notify_on_late_arrivals: boolean;
    notify_on_fatigue_alerts: boolean;
    notify_on_visitor_entry: boolean;
    late_arrival_time: string;
}

const defaultSettings: Settings = {
    slack_webhook_url: '',
    teams_webhook_url: '',
    notify_on_watchlist_entry: true,
    notify_on_contractor_complete: false,
    notify_on_late_arrivals: false,
    notify_on_fatigue_alerts: true,
    notify_on_visitor_entry: false,
    late_arrival_time: '08:30',
};

export function NotificationSettings() {
    const { currentSite } = useSite();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState<'slack' | 'teams' | null>(null);
    const [settings, setSettings] = useState<Settings>(defaultSettings);

    // Fetch settings
    useEffect(() => {
        async function fetchSettings() {
            if (!currentSite) return;
            setLoading(true);

            const { data } = await supabase
                .from('notification_settings')
                .select('*')
                .eq('site_id', currentSite.id)
                .maybeSingle();

            if (data) {
                setSettings({
                    slack_webhook_url: (data as any).slack_webhook_url || '',
                    teams_webhook_url: (data as any).teams_webhook_url || '',
                    notify_on_watchlist_entry: (data as any).notify_on_watchlist_entry ?? true,
                    notify_on_contractor_complete: (data as any).notify_on_contractor_complete ?? false,
                    notify_on_late_arrivals: (data as any).notify_on_late_arrivals ?? false,
                    notify_on_fatigue_alerts: (data as any).notify_on_fatigue_alerts ?? true,
                    notify_on_visitor_entry: (data as any).notify_on_visitor_entry ?? false,
                    late_arrival_time: (data as any).late_arrival_time?.slice(0, 5) || '08:30',
                });
            }

            setLoading(false);
        }

        fetchSettings();
    }, [currentSite]);

    const handleSave = async () => {
        if (!currentSite) return;
        setSaving(true);

        const payload = {
            site_id: currentSite.id,
            slack_webhook_url: settings.slack_webhook_url || null,
            teams_webhook_url: settings.teams_webhook_url || null,
            notify_on_watchlist_entry: settings.notify_on_watchlist_entry,
            notify_on_contractor_complete: settings.notify_on_contractor_complete,
            notify_on_late_arrivals: settings.notify_on_late_arrivals,
            notify_on_fatigue_alerts: settings.notify_on_fatigue_alerts,
            notify_on_visitor_entry: settings.notify_on_visitor_entry,
            late_arrival_time: settings.late_arrival_time + ':00',
            updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
            .from('notification_settings')
            .upsert(payload, { onConflict: 'site_id' });

        setSaving(false);

        if (error) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } else {
            toast({ title: 'Guardado', description: 'Configuración de notificaciones actualizada.' });
        }
    };

    const testWebhook = async (type: 'slack' | 'teams') => {
        const url = type === 'slack' ? settings.slack_webhook_url : settings.teams_webhook_url;
        if (!url) return;

        setTesting(type);

        try {
            const payload = type === 'slack'
                ? {
                    blocks: [
                        { type: 'header', text: { type: 'plain_text', text: '🔔 Test de BRIK', emoji: true } },
                        { type: 'section', text: { type: 'mrkdwn', text: 'Si ves este mensaje, la integración está funcionando correctamente.' } },
                        { type: 'context', elements: [{ type: 'mrkdwn', text: `📍 *${currentSite?.name}* | ${new Date().toLocaleTimeString('es-BO')}` }] }
                    ]
                }
                : {
                    '@type': 'MessageCard',
                    '@context': 'http://schema.org/extensions',
                    themeColor: '0076D7',
                    summary: 'Test de BRIK',
                    sections: [{ activityTitle: '🔔 Test de BRIK', text: 'Si ves este mensaje, la integración está funcionando correctamente.' }]
                };

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                toast({ title: '¡Éxito!', description: `Mensaje de prueba enviado a ${type === 'slack' ? 'Slack' : 'Teams'}.` });
            } else {
                throw new Error('Failed to send');
            }
        } catch {
            toast({ title: 'Error', description: 'No se pudo enviar el mensaje. Verifica la URL.', variant: 'destructive' });
        } finally {
            setTesting(null);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <Spinner />
            </div>
        );
    }

    const triggers = [
        { key: 'notify_on_watchlist_entry', label: 'Entrada de persona bloqueada', description: 'Alerta cuando alguien de la watchlist intenta entrar', icon: '⚠️' },
        { key: 'notify_on_fatigue_alerts', label: 'Alertas de fatiga', description: 'Cuando trabajadores superan 10-12 horas', icon: '🔴' },
        { key: 'notify_on_visitor_entry', label: 'Entrada de visitantes', description: 'Cuando ingresa un visitante', icon: '👔' },
        { key: 'notify_on_contractor_complete', label: 'Contratista completo', description: 'Cuando todos los trabajadores de un contratista ingresaron', icon: '✅' },
        { key: 'notify_on_late_arrivals', label: 'Llegadas tarde', description: 'Trabajadores que no llegaron a tiempo', icon: '⏰' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
                <Bell className="w-6 h-6 text-primary" />
                <h2 className="text-lg font-medium">Notificaciones</h2>
            </div>

            {/* Webhook URLs */}
            <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Canales</h3>

                <div className="p-4 bg-card/50 rounded-xl border border-border space-y-4">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-[#4A154B] rounded-lg flex items-center justify-center flex-shrink-0">
                            <Slack className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 space-y-2">
                            <Label className="text-sm font-medium">Slack Webhook URL</Label>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="https://hooks.slack.com/services/..."
                                    value={settings.slack_webhook_url}
                                    onChange={(e) => setSettings({ ...settings, slack_webhook_url: e.target.value })}
                                    className="flex-1"
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => testWebhook('slack')}
                                    disabled={!settings.slack_webhook_url || testing === 'slack'}
                                >
                                    {testing === 'slack' ? <Spinner size="sm" /> : <TestTube className="w-4 h-4" />}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener" className="underline">
                                    Cómo crear un webhook de Slack
                                </a>
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-card/50 rounded-xl border border-border space-y-4">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-[#6264A7] rounded-lg flex items-center justify-center flex-shrink-0">
                            <MessageSquare className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 space-y-2">
                            <Label className="text-sm font-medium">Microsoft Teams Webhook URL</Label>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="https://outlook.office.com/webhook/..."
                                    value={settings.teams_webhook_url}
                                    onChange={(e) => setSettings({ ...settings, teams_webhook_url: e.target.value })}
                                    className="flex-1"
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => testWebhook('teams')}
                                    disabled={!settings.teams_webhook_url || testing === 'teams'}
                                >
                                    {testing === 'teams' ? <Spinner size="sm" /> : <TestTube className="w-4 h-4" />}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                <a href="https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook" target="_blank" rel="noopener" className="underline">
                                    Cómo crear un webhook de Teams
                                </a>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Triggers */}
            <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Eventos</h3>

                <div className="space-y-2">
                    {triggers.map((trigger) => (
                        <div
                            key={trigger.key}
                            className={cn(
                                "flex items-center justify-between p-4 rounded-xl border transition-colors",
                                settings[trigger.key as keyof Settings]
                                    ? "bg-primary/5 border-primary/30"
                                    : "bg-card/30 border-border"
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-xl">{trigger.icon}</span>
                                <div>
                                    <p className="font-medium text-sm">{trigger.label}</p>
                                    <p className="text-xs text-muted-foreground">{trigger.description}</p>
                                </div>
                            </div>
                            <Switch
                                checked={settings[trigger.key as keyof Settings] as boolean}
                                onCheckedChange={(checked) => setSettings({ ...settings, [trigger.key]: checked })}
                            />
                        </div>
                    ))}
                </div>

                {/* Late arrival time */}
                {settings.notify_on_late_arrivals && (
                    <div className="p-4 bg-card/30 rounded-xl border border-border">
                        <Label className="text-sm font-medium mb-2 block">Hora límite de llegada</Label>
                        <Input
                            type="time"
                            value={settings.late_arrival_time}
                            onChange={(e) => setSettings({ ...settings, late_arrival_time: e.target.value })}
                            className="w-32"
                        />
                    </div>
                )}
            </div>

            {/* Save Button */}
            <Button onClick={handleSave} disabled={saving} className="w-full h-12">
                {saving ? <Spinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Guardar Configuración
            </Button>
        </div>
    );
}
