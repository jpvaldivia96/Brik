import { useState, useEffect } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import {
    Bell,
    Users,
    Star,
    Ban,
    Clock,
    TrendingUp,
    TrendingDown,
    AlertCircle,
    Calendar,
    Trophy,
    Cloud,
    Brain,
    Gift,
    Shield,
    Megaphone,
    UserCheck,
    Save
} from 'lucide-react';
import { toast } from 'sonner';

interface UserPreferences {
    id?: string;
    user_id: string;
    site_id: string;
    // Original 6
    contractor_attendance: boolean;
    favorite_entry: boolean;
    blocked_entry: boolean;
    min_capacity: boolean;
    max_capacity: boolean;
    overtime: boolean;
    // New 18
    unusual_rotation: boolean;
    mass_entry: boolean;
    night_activity: boolean;
    first_entry: boolean;
    exit_without_entry: boolean;
    low_weekly_attendance: boolean;
    attendance_record: boolean;
    contractor_inactive: boolean;
    exponential_growth: boolean;
    accident_reported: boolean;
    safety_milestone: boolean;
    weather_alert: boolean;
    attendance_prediction: boolean;
    birthday: boolean;
    worker_of_month: boolean;
    meeting_reminder: boolean;
    announcement: boolean;
    inspector_visit: boolean;
}

const alertCategories = [
    {
        name: 'Productividad & Operaciones',
        icon: TrendingUp,
        alerts: [
            { key: 'contractor_attendance', label: 'Asistencia de Contratistas', icon: Users, description: 'Menos del 50% presentes a las 9am' },
            { key: 'unusual_rotation', label: 'Rotación Inusual', icon: AlertCircle, description: 'Misma persona entra/sale múltiples veces' },
            { key: 'mass_entry', label: 'Entrada Masiva', icon: Users, description: 'Más de 20 personas en 15 minutos' },
            { key: 'first_entry', label: 'Primera Entrada del Día', icon: Clock, description: 'Primer trabajador que llega' },
            { key: 'low_weekly_attendance', label: 'Baja Asistencia Semanal', icon: TrendingDown, description: 'Menos del 70% por 3 días consecutivos' },
            { key: 'attendance_record', label: 'Récord de Asistencia', icon: Trophy, description: 'Día con mayor asistencia histórica' },
            { key: 'contractor_inactive', label: 'Contratista Sin Actividad', icon: AlertCircle, description: 'Sin trabajadores por X días' },
            { key: 'exponential_growth', label: 'Crecimiento Exponencial', icon: TrendingUp, description: '+30% más que la semana pasada' },
        ]
    },
    {
        name: 'Seguridad & Compliance',
        icon: Shield,
        alerts: [
            { key: 'blocked_entry', label: 'Bloqueado Ingresó', icon: Ban, description: 'Persona bloqueada intenta entrar' },
            { key: 'night_activity', label: 'Actividad Nocturna', icon: Clock, description: 'Ingreso fuera del horario normal' },
            { key: 'exit_without_entry', label: 'Salida sin Entrada', icon: AlertCircle, description: 'Detecta errores o fraude' },
            { key: 'overtime', label: 'Horas Extras / Crítico', icon: Clock, description: 'Alguien supera 12+ horas' },
            { key: 'accident_reported', label: 'Accidente Reportado', icon: AlertCircle, description: 'Botón de emergencia activado' },
            { key: 'safety_milestone', label: 'Meta de Seguridad', icon: Shield, description: 'X días sin incidentes' },
            { key: 'inspector_visit', label: 'Visita de Inspector', icon: UserCheck, description: 'Inspector ingresa a la obra' },
        ]
    },
    {
        name: 'Capacidad y Umbrales',
        icon: TrendingUp,
        alerts: [
            { key: 'min_capacity', label: 'Capacidad Mínima', icon: TrendingDown, description: 'Menos de X personas en obra' },
            { key: 'max_capacity', label: 'Capacidad Máxima', icon: TrendingUp, description: 'Más de X personas en obra' },
        ]
    },
    {
        name: 'Inteligentes & Predictivas',
        icon: Brain,
        alerts: [
            { key: 'weather_alert', label: 'Alerta Climática', icon: Cloud, description: 'Lluvia/viento fuerte detectado' },
            { key: 'attendance_prediction', label: 'Predicción de Asistencia', icon: Brain, description: 'IA predice baja asistencia mañana' },
        ]
    },
    {
        name: 'Social & Comunicación',
        icon: Users,
        alerts: [
            { key: 'favorite_entry', label: 'Favorito Ingresó', icon: Star, description: 'Persona marcada como favorita' },
            { key: 'birthday', label: 'Cumpleaños en Obra', icon: Gift, description: 'Trabajador cumple años hoy' },
            { key: 'worker_of_month', label: 'Trabajador del Mes', icon: Trophy, description: 'Mejor asistencia/puntualidad' },
            { key: 'meeting_reminder', label: 'Recordatorio de Reunión', icon: Calendar, description: '30 min antes de reunión' },
            { key: 'announcement', label: 'Anuncio Importante', icon: Megaphone, description: 'Mensaje broadcast del supervisor' },
        ]
    },
];

export function PersonalNotificationSettings() {
    const { currentSite } = useSite();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [preferences, setPreferences] = useState<UserPreferences | null>(null);

    useEffect(() => {
        if (currentSite && user) {
            loadPreferences();
        }
    }, [currentSite, user]);

    const loadPreferences = async () => {
        if (!currentSite || !user) return;

        try {
            setLoading(true);
            const { data, error } = await (supabase as any)
                .from('user_notification_preferences')
                .select('*')
                .eq('user_id', user.id)
                .eq('site_id', currentSite.id)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            setPreferences(data || createDefaultPreferences());
        } catch (err) {
            console.error('Error loading preferences:', err);
            toast.error('Error al cargar preferencias');
        } finally {
            setLoading(false);
        }
    };

    const createDefaultPreferences = (): UserPreferences => ({
        user_id: user!.id,
        site_id: currentSite!.id,
        contractor_attendance: true,
        favorite_entry: true,
        blocked_entry: true,
        min_capacity: false,
        max_capacity: false,
        overtime: true,
        unusual_rotation: true,
        mass_entry: true,
        night_activity: true,
        first_entry: false,
        exit_without_entry: true,
        low_weekly_attendance: true,
        attendance_record: false,
        contractor_inactive: true,
        exponential_growth: true,
        accident_reported: true,
        safety_milestone: false,
        weather_alert: true,
        attendance_prediction: false,
        birthday: false,
        worker_of_month: false,
        meeting_reminder: true,
        announcement: true,
        inspector_visit: true,
    });

    const handleToggle = (key: string, value: boolean) => {
        if (!preferences) return;
        setPreferences({ ...preferences, [key]: value });
    };

    const handleSave = async () => {
        if (!preferences || !currentSite || !user) return;

        try {
            setSaving(true);
            const { error } = await (supabase as any)
                .from('user_notification_preferences')
                .upsert({
                    ...preferences,
                    user_id: user.id,
                    site_id: currentSite.id,
                    updated_at: new Date().toISOString(),
                }, {
                    onConflict: 'user_id,site_id'
                });

            if (error) throw error;

            toast.success('Preferencias guardadas exitosamente');
        } catch (err) {
            console.error('Error saving preferences:', err);
            toast.error('Error al guardar preferencias');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Spinner className="h-8 w-8" />
            </div>
        );
    }

    if (!preferences) {
        return (
            <div className="text-center py-12">
                <p className="text-muted-foreground">No se pudieron cargar las preferencias</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-8">
            <div className="space-y-2">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Bell className="h-6 w-6" />
                    Preferencias de Notificaciones
                </h2>
                <p className="text-muted-foreground">
                    Personaliza qué alertas quieres recibir en tu dispositivo móvil
                </p>
            </div>

            {alertCategories.map((category) => (
                <div key={category.name} className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b">
                        <category.icon className="h-5 w-5 text-primary" />
                        <h3 className="text-lg font-semibold">{category.name}</h3>
                    </div>

                    <div className="grid gap-4">
                        {category.alerts.map((alert) => {
                            const Icon = alert.icon;
                            return (
                                <div
                                    key={alert.key}
                                    className="flex items-start justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                                >
                                    <div className="flex items-start gap-3 flex-1">
                                        <Icon className="h-5 w-5 mt-0.5 text-muted-foreground" />
                                        <div className="space-y-1">
                                            <p className="font-medium">{alert.label}</p>
                                            <p className="text-sm text-muted-foreground">{alert.description}</p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={preferences[alert.key as keyof UserPreferences] as boolean}
                                        onCheckedChange={(checked) => handleToggle(alert.key, checked)}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            <div className="flex justify-end gap-2 pt-4">
                <Button onClick={handleSave} disabled={saving}>
                    {saving ? (
                        <>
                            <Spinner className="h-4 w-4 mr-2" />
                            Guardando...
                        </>
                    ) : (
                        <>
                            <Save className="h-4 w-4 mr-2" />
                            Guardar Preferencias
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
