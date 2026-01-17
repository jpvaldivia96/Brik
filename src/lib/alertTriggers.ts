// Alert triggering helpers - call these from entry/exit flows
import { supabase } from '@/integrations/supabase/client';

interface AlertTriggerOptions {
    siteId: string;
    alertType: 'contractor_attendance' | 'favorite_entry' | 'blocked_entry' | 'min_capacity' | 'max_capacity' | 'overtime';
    title: string;
    body: string;
    data?: Record<string, any>;
}

/**
 * Send an alert notification to all supervisors of a site
 * This calls the Supabase Edge Function
 */
export async function triggerAlert(options: AlertTriggerOptions): Promise<boolean> {
    const { siteId, alertType, title, body, data = {} } = options;

    try {
        const { data: response, error } = await supabase.functions.invoke('send-alert', {
            body: {
                site_id: siteId,
                alert_type: alertType,
                title,
                body,
                data,
            },
        });

        if (error) {
            console.error('Error triggering alert:', error);
            return false;
        }

        console.log('Alert triggered:', response);
        return response?.success || false;
    } catch (err) {
        console.error('Failed to trigger alert:', err);
        return false;
    }
}

/**
 * Check and trigger favorite/blocked entry alerts
 * Call this when someone enters
 */
export async function checkEntryAlerts(
    siteId: string,
    personId: string,
    personName: string
): Promise<void> {
    try {
        // Get worker profile to check favorite/blocked status
        const { data: profile } = await (supabase as any)
            .from('workers_profile')
            .select('is_favorite, is_blocked')
            .eq('person_id', personId)
            .single();

        if (!profile) return;

        if (profile.is_favorite) {
            await triggerAlert({
                siteId,
                alertType: 'favorite_entry',
                title: '⭐ Favorito Ingresó',
                body: `${personName} ha ingresado a la obra`,
                data: { person_id: personId, person_name: personName },
            });
        }

        if (profile.is_blocked) {
            await triggerAlert({
                siteId,
                alertType: 'blocked_entry',
                title: '🚫 ALERTA: Bloqueado Ingresó',
                body: `${personName} (BLOQUEADO) ha ingresado a la obra`,
                data: { person_id: personId, person_name: personName },
            });
        }
    } catch (err) {
        console.error('Error checking entry alerts:', err);
    }
}

/**
 * Check capacity thresholds and trigger alerts if needed
 * Call this after any entry/exit
 */
export async function checkCapacityAlerts(siteId: string): Promise<void> {
    try {
        // Get current inside count
        const { count } = await supabase
            .from('access_logs')
            .select('*', { count: 'exact', head: true })
            .eq('site_id', siteId)
            .is('exit_at', null)
            .is('voided_at', null);

        const currentCount = count || 0;

        // Get alert settings
        const { data: settings } = await (supabase as any)
            .from('alert_settings')
            .select('*')
            .eq('site_id', siteId)
            .single();

        if (!settings) return;

        // Check min capacity
        if (settings.min_capacity_enabled && currentCount < settings.min_capacity_threshold) {
            await triggerAlert({
                siteId,
                alertType: 'min_capacity',
                title: '📉 Baja Asistencia',
                body: `Solo hay ${currentCount} personas en obra (mínimo: ${settings.min_capacity_threshold})`,
                data: { current_count: currentCount, threshold: settings.min_capacity_threshold },
            });
        }

        // Check max capacity
        if (settings.max_capacity_enabled && currentCount > settings.max_capacity_threshold) {
            await triggerAlert({
                siteId,
                alertType: 'max_capacity',
                title: '📈 Capacidad Máxima Excedida',
                body: `Hay ${currentCount} personas en obra (máximo: ${settings.max_capacity_threshold})`,
                data: { current_count: currentCount, threshold: settings.max_capacity_threshold },
            });
        }
    } catch (err) {
        console.error('Error checking capacity alerts:', err);
    }
}

/**
 * Check overtime alerts
 * Call this periodically or when viewing dashboard
 */
export async function checkOvertimeAlerts(siteId: string): Promise<void> {
    try {
        // Get alert settings
        const { data: settings } = await (supabase as any)
            .from('alert_settings')
            .select('overtime_enabled, overtime_hours')
            .eq('site_id', siteId)
            .single();

        if (!settings?.overtime_enabled) return;

        const thresholdHours = settings.overtime_hours || 12;
        const thresholdMs = thresholdHours * 60 * 60 * 1000;
        const cutoffTime = new Date(Date.now() - thresholdMs).toISOString();

        // Find people who entered before the cutoff and haven't exited
        const { data: overtime } = await supabase
            .from('access_logs')
            .select('id, name_snapshot, entry_at')
            .eq('site_id', siteId)
            .is('exit_at', null)
            .is('voided_at', null)
            .lt('entry_at', cutoffTime)
            .limit(5);

        if (overtime && overtime.length > 0) {
            const names = overtime.map(p => p.name_snapshot).join(', ');
            await triggerAlert({
                siteId,
                alertType: 'overtime',
                title: '⏰ Alerta de Horas Extras',
                body: `${overtime.length} persona(s) superaron ${thresholdHours}h: ${names}`,
                data: { count: overtime.length, people: overtime },
            });
        }
    } catch (err) {
        console.error('Error checking overtime alerts:', err);
    }
}
