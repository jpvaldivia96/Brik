// Alert triggering helpers - call these from entry/exit flows
import { supabase } from '@/integrations/supabase/client';

// Cooldown map to prevent spam (in-memory, resets on page reload)
const capacityCooldowns = new Map<string, number>();

interface AlertTriggerOptions {
    siteId: string;
    alertType: string;
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

// ─── Default settings for sites without explicit configuration ──────────────
const DEFAULT_ALERT_SETTINGS: Record<string, any> = {
    favorite_entry_enabled: true,
    blocked_entry_enabled: true,
    min_capacity_enabled: false,
    min_capacity_threshold: 0,
    max_capacity_enabled: false,
    max_capacity_threshold: 100,
    overtime_enabled: true,
    overtime_hours: 12,
    contractor_attendance_enabled: true,
    contractor_attendance_threshold: 50,
    // These don't have DB columns yet but triggers check them:
    unusual_rotation_enabled: true,
    unusual_rotation_threshold: 3,
    mass_entry_enabled: true,
    mass_entry_threshold: 20,
    mass_entry_minutes: 15,
    night_activity_enabled: true,
    night_activity_start: 22,
    night_activity_end: 6,
    first_entry_enabled: true,
    exit_without_entry_enabled: true,
    inspector_visit_enabled: true,
};

async function getAlertSettings(siteId: string): Promise<Record<string, any>> {
    try {
        const { data } = await (supabase as any)
            .from('alert_settings')
            .select('*')
            .eq('site_id', siteId)
            .single();
        // Merge DB settings with defaults (DB values override defaults)
        return { ...DEFAULT_ALERT_SETTINGS, ...(data || {}) };
    } catch {
        return { ...DEFAULT_ALERT_SETTINGS };
    }
}

// ─── TRIGGER 1: Favorite/Blocked Entry ──────────────────────────────────────

/**
 * Check and trigger favorite/blocked entry alerts
 * Call this when someone enters
 */
export async function checkEntryAlerts(
    siteId: string,
    personId: string,
    personName: string,
    contractorName?: string
): Promise<void> {
    try {
        const { data: favRecord } = await (supabase as any)
            .from('favorites')
            .select('id, is_blocked, block_reason')
            .eq('site_id', siteId)
            .eq('person_id', personId)
            .maybeSingle();

        if (!favRecord) return;

        if (favRecord.is_blocked) {
            await triggerAlert({
                siteId,
                alertType: 'blocked_entry',
                title: '🚫 ALERTA: Bloqueado Ingresó',
                body: `${personName} (BLOQUEADO) ha ingresado a la obra${favRecord.block_reason ? '. Motivo: ' + favRecord.block_reason : ''}`,
                data: { person_id: personId, person_name: personName, contractor_name: contractorName || '', block_reason: favRecord.block_reason },
            });
        } else {
            await triggerAlert({
                siteId,
                alertType: 'favorite_entry',
                title: '⭐ Favorito Ingresó',
                body: `${personName} ha ingresado a la obra`,
                data: { person_id: personId, person_name: personName, contractor_name: contractorName || '' },
            });
        }
    } catch (err) {
        console.error('Error checking entry alerts:', err);
    }
}

// ─── TRIGGER 2: Capacity Alerts ─────────────────────────────────────────────

/**
 * Check capacity thresholds and trigger alerts if needed
 * Call this after any entry/exit
 */
export async function checkCapacityAlerts(siteId: string): Promise<void> {
    try {
        const { count } = await supabase
            .from('access_logs')
            .select('*', { count: 'exact', head: true })
            .eq('site_id', siteId)
            .is('exit_at', null)
            .is('voided_at', null);

        const currentCount = count || 0;
        const settings = await getAlertSettings(siteId);
        if (!settings) return;

        // Cooldown: don't send same capacity alert more than once every 30 min
        const cooldownMs = 30 * 60 * 1000;

        if (settings.min_capacity_enabled && currentCount < settings.min_capacity_threshold) {
            const lastKey = `capacity_min_${siteId}`;
            const lastSent = capacityCooldowns.get(lastKey);
            if (!lastSent || Date.now() - lastSent > cooldownMs) {
                capacityCooldowns.set(lastKey, Date.now());
                await triggerAlert({
                    siteId,
                    alertType: 'min_capacity',
                    title: '📉 Baja Asistencia',
                    body: `Solo hay ${currentCount} personas en obra (mínimo: ${settings.min_capacity_threshold})`,
                    data: { current_count: currentCount, threshold: settings.min_capacity_threshold },
                });
            }
        }

        if (settings.max_capacity_enabled && currentCount > settings.max_capacity_threshold) {
            const lastKey = `capacity_max_${siteId}`;
            const lastSent = capacityCooldowns.get(lastKey);
            if (!lastSent || Date.now() - lastSent > cooldownMs) {
                capacityCooldowns.set(lastKey, Date.now());
                await triggerAlert({
                    siteId,
                    alertType: 'max_capacity',
                    title: '📈 Capacidad Máxima Excedida',
                    body: `Hay ${currentCount} personas en obra (máximo: ${settings.max_capacity_threshold})`,
                    data: { current_count: currentCount, threshold: settings.max_capacity_threshold },
                });
            }
        }
    } catch (err) {
        console.error('Error checking capacity alerts:', err);
    }
}

// ─── TRIGGER 3: Overtime ────────────────────────────────────────────────────

/**
 * Check overtime alerts
 * Call this periodically or when viewing dashboard
 */
export async function checkOvertimeAlerts(siteId: string): Promise<void> {
    try {
        const settings = await getAlertSettings(siteId);
        if (!settings?.overtime_enabled) return;

        const thresholdHours = settings.overtime_hours || 12;
        const thresholdMs = thresholdHours * 60 * 60 * 1000;
        const cutoffTime = new Date(Date.now() - thresholdMs).toISOString();

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

// ─── TRIGGER 4: Unusual Rotation ────────────────────────────────────────────

/**
 * Detect when someone enters/exits multiple times in one day
 * Call this on every entry
 */
export async function checkUnusualRotation(
    siteId: string,
    personId: string,
    personName: string
): Promise<void> {
    try {
        const settings = await getAlertSettings(siteId);
        if (!settings?.unusual_rotation_enabled) return;

        const threshold = settings.unusual_rotation_threshold || 3;
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { count } = await supabase
            .from('access_logs')
            .select('*', { count: 'exact', head: true })
            .eq('site_id', siteId)
            .eq('person_id', personId)
            .gte('entry_at', todayStart.toISOString());

        if (count && count >= threshold) {
            await triggerAlert({
                siteId,
                alertType: 'unusual_rotation',
                title: '🔄 Rotación Inusual Detectada',
                body: `${personName} ha ingresado ${count} veces hoy (umbral: ${threshold})`,
                data: { person_id: personId, person_name: personName, count, threshold },
            });
        }
    } catch (err) {
        console.error('Error checking unusual rotation:', err);
    }
}

// ─── TRIGGER 5: Mass Entry ──────────────────────────────────────────────────

/**
 * Detect high volume of entries in short time
 * Call this on every entry
 */
export async function checkMassEntry(siteId: string): Promise<void> {
    try {
        const settings = await getAlertSettings(siteId);
        if (!settings?.mass_entry_enabled) return;

        const threshold = settings.mass_entry_threshold || 20;
        const minutes = settings.mass_entry_minutes || 15;
        const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();

        const { count } = await supabase
            .from('access_logs')
            .select('*', { count: 'exact', head: true })
            .eq('site_id', siteId)
            .gte('entry_at', cutoff);

        if (count && count >= threshold) {
            await triggerAlert({
                siteId,
                alertType: 'mass_entry',
                title: '🏃 Entrada Masiva Detectada',
                body: `${count} personas ingresaron en los últimos ${minutes} minutos (umbral: ${threshold})`,
                data: { count, threshold, minutes },
            });
        }
    } catch (err) {
        console.error('Error checking mass entry:', err);
    }
}

// ─── TRIGGER 6: Night Activity ──────────────────────────────────────────────

/**
 * Detect entry outside normal hours
 * Call this on every entry
 */
export async function checkNightActivity(
    siteId: string,
    personName: string
): Promise<void> {
    try {
        const settings = await getAlertSettings(siteId);
        if (!settings?.night_activity_enabled) return;

        const now = new Date();
        const currentHour = now.getHours();
        const currentMinutes = currentHour * 60 + now.getMinutes();

        // Parse start/end times (default 22:00 - 06:00)
        const startStr = settings.night_activity_start || '22:00';
        const endStr = settings.night_activity_end || '06:00';
        const [startH, startM] = startStr.split(':').map(Number);
        const [endH, endM] = endStr.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        let isNight = false;
        if (startMinutes > endMinutes) {
            // Overnight range (e.g., 22:00 - 06:00)
            isNight = currentMinutes >= startMinutes || currentMinutes < endMinutes;
        } else {
            // Same-day range
            isNight = currentMinutes >= startMinutes && currentMinutes < endMinutes;
        }

        if (isNight) {
            const timeStr = now.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
            await triggerAlert({
                siteId,
                alertType: 'night_activity',
                title: '🌙 Actividad Nocturna',
                body: `${personName} ingresó a las ${timeStr} (fuera de horario: ${startStr}-${endStr})`,
                data: { person_name: personName, time: timeStr },
            });
        }
    } catch (err) {
        console.error('Error checking night activity:', err);
    }
}

// ─── TRIGGER 7: First Entry of the Day ──────────────────────────────────────

/**
 * Detect the first person to enter the site today
 * Call this on every entry
 */
export async function checkFirstEntry(
    siteId: string,
    personName: string
): Promise<void> {
    try {
        const settings = await getAlertSettings(siteId);
        if (!settings?.first_entry_enabled) return;

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // Count entries today (including this one)
        const { count } = await supabase
            .from('access_logs')
            .select('*', { count: 'exact', head: true })
            .eq('site_id', siteId)
            .gte('entry_at', todayStart.toISOString());

        // If this is the first (or only) entry of the day
        if (count !== null && count <= 1) {
            const timeStr = new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
            await triggerAlert({
                siteId,
                alertType: 'first_entry',
                title: '🌅 Primera Entrada del Día',
                body: `${personName} fue el primero en llegar hoy a las ${timeStr}`,
                data: { person_name: personName, time: timeStr },
            });
        }
    } catch (err) {
        console.error('Error checking first entry:', err);
    }
}

// ─── TRIGGER 8: Exit Without Entry ──────────────────────────────────────────

/**
 * Detect when someone exits but has no active entry
 * Call this on every exit attempt
 */
export async function checkExitWithoutEntry(
    siteId: string,
    personId: string,
    personName: string
): Promise<void> {
    try {
        const settings = await getAlertSettings(siteId);
        if (!settings?.exit_without_entry_enabled) return;

        // Check if person has an active entry (entry without exit)
        const { count } = await supabase
            .from('access_logs')
            .select('*', { count: 'exact', head: true })
            .eq('site_id', siteId)
            .eq('person_id', personId)
            .is('exit_at', null)
            .is('voided_at', null);

        if (count === 0) {
            await triggerAlert({
                siteId,
                alertType: 'exit_without_entry',
                title: '❌ Salida sin Entrada',
                body: `${personName} registró salida pero no tiene entrada activa. Posible error o fraude.`,
                data: { person_id: personId, person_name: personName },
            });
        }
    } catch (err) {
        console.error('Error checking exit without entry:', err);
    }
}

// ─── TRIGGER 9: Inspector Visit ─────────────────────────────────────────────

/**
 * Detect when an inspector enters the site
 * Call this on every entry
 */
export async function checkInspectorVisit(
    siteId: string,
    personId: string,
    personName: string
): Promise<void> {
    try {
        const settings = await getAlertSettings(siteId);
        if (!settings?.inspector_visit_enabled) return;

        // Check if person is an inspector
        const { data: profile } = await (supabase as any)
            .from('workers_profile')
            .select('is_inspector')
            .eq('person_id', personId)
            .maybeSingle();

        if (profile?.is_inspector) {
            const timeStr = new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
            await triggerAlert({
                siteId,
                alertType: 'inspector_visit',
                title: '👮 Inspector en Obra',
                body: `${personName} (Inspector) ha ingresado a la obra a las ${timeStr}`,
                data: { person_id: personId, person_name: personName, time: timeStr },
            });
        }
    } catch (err) {
        console.error('Error checking inspector visit:', err);
    }
}

// ─── COMBINED: Run all entry-time triggers ──────────────────────────────────

/**
 * Run all triggers that should fire on entry
 * Call this once per entry to avoid duplicate code
 */
export async function runEntryTriggers(
    siteId: string,
    personId: string,
    personName: string,
    contractorName?: string
): Promise<void> {
    // Run all triggers in parallel for performance
    await Promise.allSettled([
        checkEntryAlerts(siteId, personId, personName, contractorName),
        checkCapacityAlerts(siteId),
        checkUnusualRotation(siteId, personId, personName),
        checkMassEntry(siteId),
        checkNightActivity(siteId, personName),
        checkFirstEntry(siteId, personName),
        checkInspectorVisit(siteId, personId, personName),
    ]);
}

/**
 * Run all triggers that should fire on exit
 */
export async function runExitTriggers(
    siteId: string,
    personId: string,
    personName: string
): Promise<void> {
    await Promise.allSettled([
        checkCapacityAlerts(siteId),
        checkExitWithoutEntry(siteId, personId, personName),
    ]);
}
