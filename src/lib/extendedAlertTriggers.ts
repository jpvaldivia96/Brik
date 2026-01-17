// Extended Alert Triggers - Real-time alerts
// This extends alertTriggers.ts with the new 18 alert types
import { supabase } from '@/integrations/supabase/client';
import { triggerAlert } from './alertTriggers';

/**
 * #7 - Unusual Rotation Alert
 * Detect when same person enters/exits multiple times in a day
 */
export async function checkUnusualRotation(
    siteId: string,
    personId: string,
    personName: string
): Promise<void> {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Count entries today
        const { count } = await supabase
            .from('access_logs')
            .select('*', { count: 'exact', head: true })
            .eq('site_id', siteId)
            .eq('person_id', personId)
            .gte('entry_at', today.toISOString())
            .is('voided_at', null);

        const entryCount = count || 0;

        // Get threshold from settings
        const { data: settings } = await (supabase as any)
            .from('alert_settings')
            .select('unusual_rotation_enabled, unusual_rotation_threshold')
            .eq('site_id', siteId)
            .single();

        const threshold = settings?.unusual_rotation_threshold || 3;

        if (settings?.unusual_rotation_enabled && entryCount >= threshold) {
            await triggerAlert({
                siteId,
                alertType: 'unusual_rotation' as any,
                title: '🔄 Rotación Inusual Detectada',
                body: `${personName} ha entrado/salido ${entryCount} veces hoy`,
                data: { person_id: personId, person_name: personName, count: entryCount },
            });
        }
    } catch (err) {
        console.error('Error checking unusual rotation:', err);
    }
}

/**
 * #8 - Mass Entry Alert
 * Detect when many people enter in short time
 */
export async function checkMassEntry(siteId: string): Promise<void> {
    try {
        const { data: settings } = await (supabase as any)
            .from('alert_settings')
            .select('mass_entry_enabled, mass_entry_threshold, mass_entry_minutes')
            .eq('site_id', siteId)
            .single();

        if (!settings?.mass_entry_enabled) return;

        const threshold = settings.mass_entry_threshold || 20;
        const minutes = settings.mass_entry_minutes || 15;
        const cutoffTime = new Date(Date.now() - minutes * 60 * 1000).toISOString();

        const { count } = await supabase
            .from('access_logs')
            .select('*', { count: 'exact', head: true })
            .eq('site_id', siteId)
            .gte('entry_at', cutoffTime)
            .is('voided_at', null);

        const recentEntries = count || 0;

        if (recentEntries >= threshold) {
            await triggerAlert({
                siteId,
                alertType: 'mass_entry' as any,
                title: '⚡ Entrada Masiva Detectada',
                body: `${recentEntries} personas ingresaron en los últimos ${minutes} minutos`,
                data: { count: recentEntries, minutes },
            });
        }
    } catch (err) {
        console.error('Error checking mass entry:', err);
    }
}

/**
 * #9 - Night Activity Alert
 * Detect entries outside normal hours
 */
export async function checkNightActivity(
    siteId: string,
    personId: string,
    personName: string,
    entryTime: Date
): Promise<void> {
    try {
        const { data: settings } = await (supabase as any)
            .from('alert_settings')
            .select('night_activity_enabled, night_activity_start, night_activity_end')
            .eq('site_id', siteId)
            .single();

        if (!settings?.night_activity_enabled) return;

        const hour = entryTime.getHours();
        const startHour = parseInt(settings.night_activity_start?.split(':')[0] || '22');
        const endHour = parseInt(settings.night_activity_end?.split(':')[0] || '6');

        const isNightTime = hour >= startHour || hour < endHour;

        if (isNightTime) {
            await triggerAlert({
                siteId,
                alertType: 'night_activity' as any,
                title: '🌙 Actividad Nocturna Detectada',
                body: `${personName} ingresó a las ${entryTime.getHours()}:${entryTime.getMinutes().toString().padStart(2, '0')}`,
                data: { person_id: personId, person_name: personName, time: entryTime.toISOString() },
            });
        }
    } catch (err) {
        console.error('Error checking night activity:', err);
    }
}

/**
 * #10 - First Entry of the Day
 */
export async function checkFirstEntry(
    siteId: string,
    personId: string,
    personName: string
): Promise<void> {
    try {
        const { data: settings } = await (supabase as any)
            .from('alert_settings')
            .select('first_entry_enabled')
            .eq('site_id', siteId)
            .single();

        if (!settings?.first_entry_enabled) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Check if this is the first entry today
        const { count } = await supabase
            .from('access_logs')
            .select('*', { count: 'exact', head: true })
            .eq('site_id', siteId)
            .gte('entry_at', today.toISOString())
            .is('voided_at', null);

        if (count === 1) {
            await triggerAlert({
                siteId,
                alertType: 'first_entry' as any,
                title: '🌅 Primera Entrada del Día',
                body: `${personName} es el primero en llegar hoy`,
                data: { person_id: personId, person_name: personName },
            });
        }
    } catch (err) {
        console.error('Error checking first entry:', err);
    }
}

/**
 * #13 - Exit Without Entry
 * Detect when someone exits without prior entry
 */
export async function checkExitWithoutEntry(
    siteId: string,
    personId: string,
    personName: string
): Promise<void> {
    try {
        const { data: settings } = await (supabase as any)
            .from('alert_settings')
            .select('exit_without_entry_enabled')
            .eq('site_id', siteId)
            .single();

        if (!settings?.exit_without_entry_enabled) return;

        // Check if person has an open entry
        const { data: openEntry } = await supabase
            .from('access_logs')
            .select('id')
            .eq('site_id', siteId)
            .eq('person_id', personId)
            .is('exit_at', null)
            .is('voided_at', null)
            .order('entry_at', { ascending: false })
            .limit(1)
            .single();

        if (!openEntry) {
            await triggerAlert({
                siteId,
                alertType: 'exit_without_entry' as any,
                title: '⚠️ Salida sin Entrada',
                body: `${personName} registró salida sin entrada previa`,
                data: { person_id: personId, person_name: personName },
            });
        }
    } catch (err) {
        console.error('Error checking exit without entry:', err);
    }
}

/**
 * #32 - Inspector Visit
 * Detect when inspector enters
 */
export async function checkInspectorVisit(
    siteId: string,
    personId: string,
    personName: string
): Promise<void> {
    try {
        const { data: settings } = await (supabase as any)
            .from('alert_settings')
            .select('inspector_visit_enabled')
            .eq('site_id', siteId)
            .single();

        if (!settings?.inspector_visit_enabled) return;

        // Check if person is marked as inspector
        const { data: profile } = await (supabase as any)
            .from('workers_profile')
            .select('is_inspector')
            .eq('person_id', personId)
            .single();

        if (profile?.is_inspector) {
            await triggerAlert({
                siteId,
                alertType: 'inspector_visit' as any,
                title: '👔 Inspector en Obra',
                body: `${personName} (Inspector) ha ingresado`,
                data: { person_id: personId, person_name: personName },
            });
        }
    } catch (err) {
        console.error('Error checking inspector visit:', err);
    }
}
