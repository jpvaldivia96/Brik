import { useState, useEffect } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    Save,
    Check
} from 'lucide-react';
import { toast } from 'sonner';

interface AlertSettings {
    id: string;
    site_id: string;
    contractor_attendance_enabled: boolean;
    contractor_attendance_time: string;
    contractor_attendance_threshold: number;
    favorite_entry_enabled: boolean;
    blocked_entry_enabled: boolean;
    min_capacity_enabled: boolean;
    min_capacity_threshold: number;
    max_capacity_enabled: boolean;
    max_capacity_threshold: number;
    overtime_enabled: boolean;
    overtime_hours: number;
}

const defaultSettings: Omit<AlertSettings, 'id' | 'site_id'> = {
    contractor_attendance_enabled: true,
    contractor_attendance_time: '09:00',
    contractor_attendance_threshold: 50,
    favorite_entry_enabled: true,
    blocked_entry_enabled: true,
    min_capacity_enabled: false,
    min_capacity_threshold: 0,
    max_capacity_enabled: false,
    max_capacity_threshold: 100,
    overtime_enabled: true,
    overtime_hours: 12,
};

export function AlertSettingsTab() {
    const { currentSite } = useSite();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState<AlertSettings | null>(null);

    useEffect(() => {
        if (currentSite) {
            fetchSettings();
        }
    }, [currentSite]);

    const fetchSettings = async () => {
        if (!currentSite) return;
        setLoading(true);

        try {
            const { data, error } = await (supabase as any)
                .from('alert_settings')
                .select('*')
                .eq('site_id', currentSite.id)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('Error fetching alert settings:', error);
            }

            if (data) {
                setSettings(data);
            } else {
                // Create default settings
                const { data: newSettings, error: createError } = await (supabase as any)
                    .from('alert_settings')
                    .insert({ site_id: currentSite.id, ...defaultSettings })
                    .select()
                    .single();

                if (!createError && newSettings) {
                    setSettings(newSettings);
                }
            }
        } catch (err) {
            console.error('Error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!settings) return;
        setSaving(true);

        try {
            const { error } = await (supabase as any)
                .from('alert_settings')
                .update({
                    contractor_attendance_enabled: settings.contractor_attendance_enabled,
                    contractor_attendance_time: settings.contractor_attendance_time,
                    contractor_attendance_threshold: settings.contractor_attendance_threshold,
                    favorite_entry_enabled: settings.favorite_entry_enabled,
                    blocked_entry_enabled: settings.blocked_entry_enabled,
                    min_capacity_enabled: settings.min_capacity_enabled,
                    min_capacity_threshold: settings.min_capacity_threshold,
                    max_capacity_enabled: settings.max_capacity_enabled,
                    max_capacity_threshold: settings.max_capacity_threshold,
                    overtime_enabled: settings.overtime_enabled,
                    overtime_hours: settings.overtime_hours,
                    updated_at: new Date().toISOString()
                })
                .eq('id', settings.id);

            if (error) throw error;
            toast.success('Configuración guardada');
        } catch (err) {
            console.error('Error saving:', err);
            toast.error('Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    const updateSetting = <K extends keyof AlertSettings>(key: K, value: AlertSettings[K]) => {
        if (settings) {
            setSettings({ ...settings, [key]: value });
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <Spinner size="lg" />
            </div>
        );
    }

    if (!settings) {
        return (
            <div className="text-center text-white/60 py-8">
                Error cargando configuración de alertas
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                        <Bell className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">Configuración de Alertas</h2>
                        <p className="text-sm text-white/50">Notificaciones push inteligentes</p>
                    </div>
                </div>
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                    {saving ? <Spinner size="sm" /> : <Save className="w-4 h-4" />}
                    Guardar
                </Button>
            </div>

            {/* Alert Settings Cards */}
            <div className="space-y-4">
                {/* Contractor Attendance */}
                <div className="bg-slate-800 rounded-xl p-4 border border-white/10">
                    <div className="flex items-start justify-between">
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                                <Users className="w-4 h-4 text-blue-400" />
                            </div>
                            <div>
                                <h3 className="font-medium text-white">Asistencia de Contratistas</h3>
                                <p className="text-sm text-white/50 mt-1">
                                    Alertar si un contratista tiene menos del {settings.contractor_attendance_threshold}% de sus trabajadores a las {settings.contractor_attendance_time}
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={settings.contractor_attendance_enabled}
                            onCheckedChange={(v) => updateSetting('contractor_attendance_enabled', v)}
                        />
                    </div>
                    {settings.contractor_attendance_enabled && (
                        <div className="mt-4 grid grid-cols-2 gap-4 pl-11">
                            <div>
                                <Label className="text-white/70 text-xs">Hora de verificación</Label>
                                <Input
                                    type="time"
                                    value={settings.contractor_attendance_time}
                                    onChange={(e) => updateSetting('contractor_attendance_time', e.target.value)}
                                    className="mt-1 bg-slate-700 border-white/20"
                                />
                            </div>
                            <div>
                                <Label className="text-white/70 text-xs">Umbral mínimo (%)</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={settings.contractor_attendance_threshold}
                                    onChange={(e) => updateSetting('contractor_attendance_threshold', parseInt(e.target.value) || 0)}
                                    className="mt-1 bg-slate-700 border-white/20"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Favorite Entry */}
                <div className="bg-slate-800 rounded-xl p-4 border border-white/10">
                    <div className="flex items-start justify-between">
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center shrink-0">
                                <Star className="w-4 h-4 text-yellow-400" />
                            </div>
                            <div>
                                <h3 className="font-medium text-white">Ingreso de Favoritos</h3>
                                <p className="text-sm text-white/50 mt-1">
                                    Notificar cuando una persona marcada como favorita ingrese a la obra
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={settings.favorite_entry_enabled}
                            onCheckedChange={(v) => updateSetting('favorite_entry_enabled', v)}
                        />
                    </div>
                </div>

                {/* Blocked Entry */}
                <div className="bg-slate-800 rounded-xl p-4 border border-white/10">
                    <div className="flex items-start justify-between">
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
                                <Ban className="w-4 h-4 text-red-400" />
                            </div>
                            <div>
                                <h3 className="font-medium text-white">Ingreso de Bloqueados</h3>
                                <p className="text-sm text-white/50 mt-1">
                                    Alertar cuando una persona bloqueada intente ingresar
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={settings.blocked_entry_enabled}
                            onCheckedChange={(v) => updateSetting('blocked_entry_enabled', v)}
                        />
                    </div>
                </div>

                {/* Min Capacity */}
                <div className="bg-slate-800 rounded-xl p-4 border border-white/10">
                    <div className="flex items-start justify-between">
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0">
                                <TrendingDown className="w-4 h-4 text-orange-400" />
                            </div>
                            <div>
                                <h3 className="font-medium text-white">Capacidad Mínima</h3>
                                <p className="text-sm text-white/50 mt-1">
                                    Alertar cuando haya menos de {settings.min_capacity_threshold} personas en obra
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={settings.min_capacity_enabled}
                            onCheckedChange={(v) => updateSetting('min_capacity_enabled', v)}
                        />
                    </div>
                    {settings.min_capacity_enabled && (
                        <div className="mt-4 pl-11 max-w-[200px]">
                            <Label className="text-white/70 text-xs">Mínimo de personas</Label>
                            <Input
                                type="number"
                                min={0}
                                value={settings.min_capacity_threshold}
                                onChange={(e) => updateSetting('min_capacity_threshold', parseInt(e.target.value) || 0)}
                                className="mt-1 bg-slate-700 border-white/20"
                            />
                        </div>
                    )}
                </div>

                {/* Max Capacity */}
                <div className="bg-slate-800 rounded-xl p-4 border border-white/10">
                    <div className="flex items-start justify-between">
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                                <TrendingUp className="w-4 h-4 text-emerald-400" />
                            </div>
                            <div>
                                <h3 className="font-medium text-white">Capacidad Máxima</h3>
                                <p className="text-sm text-white/50 mt-1">
                                    Alertar cuando haya más de {settings.max_capacity_threshold} personas en obra
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={settings.max_capacity_enabled}
                            onCheckedChange={(v) => updateSetting('max_capacity_enabled', v)}
                        />
                    </div>
                    {settings.max_capacity_enabled && (
                        <div className="mt-4 pl-11 max-w-[200px]">
                            <Label className="text-white/70 text-xs">Máximo de personas</Label>
                            <Input
                                type="number"
                                min={0}
                                value={settings.max_capacity_threshold}
                                onChange={(e) => updateSetting('max_capacity_threshold', parseInt(e.target.value) || 0)}
                                className="mt-1 bg-slate-700 border-white/20"
                            />
                        </div>
                    )}
                </div>

                {/* Overtime Alert */}
                <div className="bg-slate-800 rounded-xl p-4 border border-white/10">
                    <div className="flex items-start justify-between">
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
                                <Clock className="w-4 h-4 text-purple-400" />
                            </div>
                            <div>
                                <h3 className="font-medium text-white">Horas Extras / Estado Crítico</h3>
                                <p className="text-sm text-white/50 mt-1">
                                    Alertar cuando alguien supere {settings.overtime_hours} horas en obra
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={settings.overtime_enabled}
                            onCheckedChange={(v) => updateSetting('overtime_enabled', v)}
                        />
                    </div>
                    {settings.overtime_enabled && (
                        <div className="mt-4 pl-11 max-w-[200px]">
                            <Label className="text-white/70 text-xs">Horas máximas</Label>
                            <Input
                                type="number"
                                min={1}
                                max={24}
                                value={settings.overtime_hours}
                                onChange={(e) => updateSetting('overtime_hours', parseInt(e.target.value) || 12)}
                                className="mt-1 bg-slate-700 border-white/20"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Info Note */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                <p className="text-sm text-blue-300">
                    <strong>Nota:</strong> Estas configuraciones aplican a nivel de <strong>obra</strong>. Cada supervisor puede personalizar sus preferencias individuales en Settings → Notificaciones. Solo recibirán alertas si están habilitadas en AMBOS niveles.
                </p>
            </div>
        </div>
    );
}
