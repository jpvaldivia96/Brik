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
    Save,
    Key
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

    // Thresholds & Settings
    contractor_attendance_threshold?: number;
    contractor_attendance_time?: string;
    mass_entry_threshold?: number;
    mass_entry_minutes?: number;
    low_weekly_attendance_threshold?: number;
    min_capacity_threshold?: number;
    max_capacity_threshold?: number;
    overtime_hours?: number;
    contractor_inactive_days?: number;
    exponential_growth_threshold?: number;
    night_activity_start?: string;
    night_activity_end?: string;
    unusual_rotation_threshold?: number;
    safety_milestone_days?: number;
    birthday_alert_time?: string;
    meeting_reminder_minutes?: number;
}


const alertCategories = [
    {
        name: 'Productividad & Operaciones',
        icon: TrendingUp,
        alerts: [
            { key: 'contractor_attendance', label: 'Asistencia de Contratistas', icon: Users, description: 'Configura umbral mínimo y hora' },
            { key: 'unusual_rotation', label: 'Rotación Inusual', icon: AlertCircle, description: 'Misma persona entra/sale múltiples veces' },
            { key: 'mass_entry', label: 'Entrada Masiva', icon: Users, description: 'Detección de alto flujo en corto tiempo' },
            { key: 'first_entry', label: 'Primera Entrada del Día', icon: Clock, description: 'Primer trabajador que llega' },
            { key: 'low_weekly_attendance', label: 'Baja Asistencia Semanal', icon: TrendingDown, description: 'Alerta basada en promedio semanal' },
            { key: 'attendance_record', label: 'Récord de Asistencia', icon: Trophy, description: 'Día con mayor asistencia histórica' },
            { key: 'contractor_inactive', label: 'Contratista Sin Actividad', icon: AlertCircle, description: 'Sin trabajadores por X días' },
            { key: 'exponential_growth', label: 'Crecimiento Exponencial', icon: TrendingUp, description: 'Detección de aumento rápido' },
        ]
    },
    {
        name: 'Seguridad & Compliance',
        icon: Shield,
        alerts: [
            { key: 'blocked_entry', label: 'Bloqueado Ingresó', icon: Ban, description: 'Persona bloqueada intenta entrar' },
            { key: 'night_activity', label: 'Actividad Nocturna', icon: Clock, description: 'Ingreso fuera del horario normal' },
            { key: 'exit_without_entry', label: 'Salida sin Entrada', icon: AlertCircle, description: 'Detecta errores o fraude' },
            { key: 'overtime', label: 'Horas Extras / Crítico', icon: Clock, description: 'Alguien supera el límite de horas' },
            { key: 'accident_reported', label: 'Accidente Reportado', icon: AlertCircle, description: 'Botón de emergencia activado' },
            { key: 'safety_milestone', label: 'Meta de Seguridad', icon: Shield, description: 'X días sin incidentes' },
            { key: 'inspector_visit', label: 'Visita de Inspector', icon: UserCheck, description: 'Inspector ingresa a la obra' },
        ]
    },
    {
        name: 'Capacidad y Umbrales',
        icon: TrendingUp,
        alerts: [
            { key: 'min_capacity', label: 'Capacidad Mínima', icon: TrendingDown, description: 'Alerta de baja ocupación' },
            { key: 'max_capacity', label: 'Capacidad Máxima', icon: TrendingUp, description: 'Alerta de sobrecupo' },
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

    // Password change state
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [changingPassword, setChangingPassword] = useState(false);

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
        contractor_attendance_threshold: 50,
        contractor_attendance_time: '09:00',
        favorite_entry: true,
        blocked_entry: true,
        min_capacity: false,
        min_capacity_threshold: 5,
        max_capacity: false,
        max_capacity_threshold: 100,
        overtime: true,
        overtime_hours: 12,
        unusual_rotation: true,
        unusual_rotation_threshold: 3,
        mass_entry: true,
        mass_entry_threshold: 20,
        mass_entry_minutes: 15,
        night_activity: true,
        night_activity_start: '22:00',
        night_activity_end: '06:00',
        first_entry: false,
        exit_without_entry: true,
        low_weekly_attendance: true,
        low_weekly_attendance_threshold: 70,
        attendance_record: false,
        contractor_inactive: true,
        contractor_inactive_days: 7,
        exponential_growth: true,
        exponential_growth_threshold: 30,
        accident_reported: true,
        safety_milestone: false,
        safety_milestone_days: 30,
        weather_alert: true,
        attendance_prediction: false,
        birthday: false,
        birthday_alert_time: '09:00',
        worker_of_month: false,
        meeting_reminder: true,
        meeting_reminder_minutes: 60,
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

    const handleChangePassword = async () => {
        if (!newPassword || !confirmPassword) {
            toast.error('Completa ambos campos');
            return;
        }
        if (newPassword.length < 6) {
            toast.error('La contraseña debe tener al menos 6 caracteres');
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error('Las contraseñas no coinciden');
            return;
        }

        setChangingPassword(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;

            toast.success('Contraseña actualizada correctamente');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            console.error('Error changing password:', err);
            toast.error(err.message || 'Error al cambiar contraseña');
        } finally {
            setChangingPassword(false);
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
                            const isEnabled = preferences[alert.key as keyof UserPreferences] as boolean;

                            return (
                                <div
                                    key={alert.key}
                                    className="flex flex-col p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-3 flex-1">
                                            <Icon className="h-5 w-5 mt-0.5 text-muted-foreground" />
                                            <div className="space-y-1">
                                                <p className="font-medium">{alert.label}</p>
                                                <p className="text-sm text-muted-foreground">{alert.description}</p>
                                            </div>
                                        </div>
                                        <Switch
                                            checked={isEnabled}
                                            onCheckedChange={(checked) => handleToggle(alert.key, checked)}
                                        />
                                    </div>

                                    {/* Inline Settings for specific alerts */}
                                    {isEnabled && (
                                        <div className="mt-4 ml-8 grid grid-cols-2 gap-4">
                                            {alert.key === 'contractor_attendance' && (
                                                <>
                                                    <div>
                                                        <label className="text-xs text-muted-foreground">Hora</label>
                                                        <input
                                                            type="time"
                                                            className="w-full bg-background border rounded px-2 py-1 text-sm mt-1"
                                                            value={(preferences as any).contractor_attendance_time || '09:00'}
                                                            onChange={(e) => setPreferences({ ...preferences, contractor_attendance_time: e.target.value })}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs text-muted-foreground">Mínimo (%)</label>
                                                        <input
                                                            type="number"
                                                            className="w-full bg-background border rounded px-2 py-1 text-sm mt-1"
                                                            value={(preferences as any).contractor_attendance_threshold || 50}
                                                            onChange={(e) => setPreferences({ ...preferences, contractor_attendance_threshold: parseInt(e.target.value) })}
                                                        />
                                                    </div>
                                                </>
                                            )}
                                            {alert.key === 'mass_entry' && (
                                                <>
                                                    <div>
                                                        <label className="text-xs text-muted-foreground">Personas</label>
                                                        <input
                                                            type="number"
                                                            className="w-full bg-background border rounded px-2 py-1 text-sm mt-1"
                                                            value={(preferences as any).mass_entry_threshold || 20}
                                                            onChange={(e) => setPreferences({ ...preferences, mass_entry_threshold: parseInt(e.target.value) })}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs text-muted-foreground">Minutos</label>
                                                        <input
                                                            type="number"
                                                            className="w-full bg-background border rounded px-2 py-1 text-sm mt-1"
                                                            value={(preferences as any).mass_entry_minutes || 15}
                                                            onChange={(e) => setPreferences({ ...preferences, mass_entry_minutes: parseInt(e.target.value) })}
                                                        />
                                                    </div>
                                                </>
                                            )}
                                            {alert.key === 'low_weekly_attendance' && (
                                                <div>
                                                    <label className="text-xs text-muted-foreground">Mínimo (%)</label>
                                                    <input
                                                        type="number"
                                                        className="w-full bg-background border rounded px-2 py-1 text-sm mt-1"
                                                        value={(preferences as any).low_weekly_attendance_threshold || 70}
                                                        onChange={(e) => setPreferences({ ...preferences, low_weekly_attendance_threshold: parseInt(e.target.value) })}
                                                    />
                                                </div>
                                            )}
                                            {alert.key === 'min_capacity' && (
                                                <div>
                                                    <label className="text-xs text-muted-foreground">Mínimo Personas</label>
                                                    <input
                                                        type="number"
                                                        className="w-full bg-background border rounded px-2 py-1 text-sm mt-1"
                                                        value={(preferences as any).min_capacity_threshold || 5}
                                                        onChange={(e) => setPreferences({ ...preferences, min_capacity_threshold: parseInt(e.target.value) })}
                                                    />
                                                </div>
                                            )}
                                            {alert.key === 'max_capacity' && (
                                                <div>
                                                    <label className="text-xs text-muted-foreground">Máximo Personas</label>
                                                    <input
                                                        type="number"
                                                        className="w-full bg-background border rounded px-2 py-1 text-sm mt-1"
                                                        value={(preferences as any).max_capacity_threshold || 100}
                                                        onChange={(e) => setPreferences({ ...preferences, max_capacity_threshold: parseInt(e.target.value) })}
                                                    />
                                                </div>
                                            )}
                                            {alert.key === 'overtime' && (
                                                <div>
                                                    <label className="text-xs text-muted-foreground">Horas Máximas</label>
                                                    <input
                                                        type="number"
                                                        className="w-full bg-background border rounded px-2 py-1 text-sm mt-1"
                                                        value={(preferences as any).overtime_hours || 12}
                                                        onChange={(e) => setPreferences({ ...preferences, overtime_hours: parseInt(e.target.value) })}
                                                    />
                                                </div>
                                            )}
                                            {alert.key === 'unusual_rotation' && (
                                                <div>
                                                    <label className="text-xs text-muted-foreground">Entradas/Salidas</label>
                                                    <input
                                                        type="number"
                                                        className="w-full bg-background border rounded px-2 py-1 text-sm mt-1"
                                                        value={(preferences as any).unusual_rotation_threshold || 3}
                                                        onChange={(e) => setPreferences({ ...preferences, unusual_rotation_threshold: parseInt(e.target.value) })}
                                                    />
                                                </div>
                                            )}
                                            {alert.key === 'contractor_inactive' && (
                                                <div>
                                                    <label className="text-xs text-muted-foreground">Días Inactivo</label>
                                                    <input
                                                        type="number"
                                                        className="w-full bg-background border rounded px-2 py-1 text-sm mt-1"
                                                        value={(preferences as any).contractor_inactive_days || 7}
                                                        onChange={(e) => setPreferences({ ...preferences, contractor_inactive_days: parseInt(e.target.value) })}
                                                    />
                                                </div>
                                            )}
                                            {alert.key === 'exponential_growth' && (
                                                <div>
                                                    <label className="text-xs text-muted-foreground">Crecimiento (%)</label>
                                                    <input
                                                        type="number"
                                                        className="w-full bg-background border rounded px-2 py-1 text-sm mt-1"
                                                        value={(preferences as any).exponential_growth_threshold || 30}
                                                        onChange={(e) => setPreferences({ ...preferences, exponential_growth_threshold: parseInt(e.target.value) })}
                                                    />
                                                </div>
                                            )}
                                            {alert.key === 'safety_milestone' && (
                                                <div>
                                                    <label className="text-xs text-muted-foreground">Días sin Accidentes</label>
                                                    <select
                                                        className="w-full bg-background border rounded px-2 py-1 text-sm mt-1"
                                                        value={(preferences as any).safety_milestone_days || 30}
                                                        onChange={(e) => setPreferences({ ...preferences, safety_milestone_days: parseInt(e.target.value) })}
                                                    >
                                                        <option value={7}>7 días</option>
                                                        <option value={15}>15 días</option>
                                                        <option value={30}>30 días</option>
                                                        <option value={60}>60 días</option>
                                                        <option value={100}>100 días</option>
                                                        <option value={365}>1 año</option>
                                                    </select>
                                                </div>
                                            )}
                                            {alert.key === 'birthday' && (
                                                <div>
                                                    <label className="text-xs text-muted-foreground">Hora de Aviso</label>
                                                    <input
                                                        type="time"
                                                        className="w-full bg-background border rounded px-2 py-1 text-sm mt-1"
                                                        value={(preferences as any).birthday_alert_time || '09:00'}
                                                        onChange={(e) => setPreferences({ ...preferences, birthday_alert_time: e.target.value })}
                                                    />
                                                </div>
                                            )}
                                            {alert.key === 'meeting_reminder' && (
                                                <div>
                                                    <label className="text-xs text-muted-foreground">Minutos Antes</label>
                                                    <select
                                                        className="w-full bg-background border rounded px-2 py-1 text-sm mt-1"
                                                        value={(preferences as any).meeting_reminder_minutes || 30}
                                                        onChange={(e) => setPreferences({ ...preferences, meeting_reminder_minutes: parseInt(e.target.value) })}
                                                    >
                                                        <option value={5}>5 min</option>
                                                        <option value={10}>10 min</option>
                                                        <option value={15}>15 min</option>
                                                        <option value={30}>30 min</option>
                                                        <option value={60}>1 hora</option>
                                                        <option value={1440}>1 día</option>
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            {/* Mi Cuenta - Password Change */}
            <div className="space-y-4 pt-6 border-t">
                <div className="flex items-center gap-2 pb-2">
                    <Key className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">Mi Cuenta</h3>
                </div>

                <div className="p-4 rounded-lg border bg-card">
                    <h4 className="font-medium mb-4">Cambiar Contraseña</h4>
                    <div className="grid gap-4 max-w-md">
                        <div className="space-y-2">
                            <Label htmlFor="new-password">Nueva contraseña</Label>
                            <Input
                                id="new-password"
                                type="password"
                                placeholder="Mínimo 6 caracteres"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirm-password">Confirmar contraseña</Label>
                            <Input
                                id="confirm-password"
                                type="password"
                                placeholder="Repetir contraseña"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                            />
                        </div>
                        <Button
                            onClick={handleChangePassword}
                            disabled={changingPassword || !newPassword || !confirmPassword}
                            variant="outline"
                            className="w-fit"
                        >
                            {changingPassword ? (
                                <>
                                    <Spinner className="h-4 w-4 mr-2" />
                                    Cambiando...
                                </>
                            ) : (
                                <>
                                    <Key className="h-4 w-4 mr-2" />
                                    Cambiar Contraseña
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </div>

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
