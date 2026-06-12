// Alert triggering helpers - call these from entry/exit flows
import { supabase } from '@/integrations/supabase/client';
import { APP_VERSION } from '@/lib/version';

// Cooldown map to prevent spam (in-memory, resets on page reload)
const capacityCooldowns = new Map<string, number>();
// Mass entry cooldown: 30 minutes between alerts per site (checked via alert_history DB)
const MASS_ENTRY_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

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
                data: { ...data, app_version: APP_VERSION },
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

// ─── TRIGGER 1a: Favorite/Blocked Entry ─────────────────────────────────────

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
        // Check if person is blocked (site-wide, no user_id)
        const { data: blockedRecord } = await (supabase as any)
            .from('favorites')
            .select('id, is_blocked, block_reason')
            .eq('site_id', siteId)
            .eq('person_id', personId)
            .eq('is_blocked', true)
            .maybeSingle();

        if (blockedRecord) {
            await triggerAlert({
                siteId,
                alertType: 'blocked_entry',
                title: 'ALERTA: Bloqueado ingreso',
                body: `${personName}\n${contractorName || ''}${blockedRecord.block_reason ? '\nMotivo: ' + blockedRecord.block_reason : ''}`,
                data: { person_id: personId, person_name: personName, contractor_name: contractorName || '', block_reason: blockedRecord.block_reason },
            });
            return;
        }

        // Check which users have this person as favorite (per-user)
        const { data: favRecords } = await (supabase as any)
            .from('favorites')
            .select('user_id')
            .eq('site_id', siteId)
            .eq('person_id', personId)
            .eq('is_blocked', false)
            .not('user_id', 'is', null);

        if (!favRecords || favRecords.length === 0) return;

        const targetUserIds = favRecords.map((f: any) => f.user_id);
        console.log(`[FAVORITE_ALERT] person=${personName} targetUsers=${targetUserIds.join(',')}`);

        await triggerAlert({
            siteId,
            alertType: 'favorite_entry',
            title: 'Favorito ingreso',
            body: `${personName}\n${contractorName || ''}`,
            data: { person_id: personId, person_name: personName, contractor_name: contractorName || '', target_user_ids: targetUserIds },
        });
    } catch (err) {
        console.error('Error checking entry alerts:', err);
    }
}

// ─── TRIGGER 1b: Favorite/Blocked Exit ──────────────────────────────────────

/**
 * Check and trigger favorite/blocked exit alerts
 * Call this when someone exits
 */
export async function checkExitAlerts(
    siteId: string,
    personId: string,
    personName: string,
    contractorName?: string
): Promise<void> {
    try {
        // Check which users have this person as favorite (per-user)
        const { data: favRecords } = await (supabase as any)
            .from('favorites')
            .select('user_id')
            .eq('site_id', siteId)
            .eq('person_id', personId)
            .eq('is_blocked', false)
            .not('user_id', 'is', null);

        if (!favRecords || favRecords.length === 0) return;

        const targetUserIds = favRecords.map((f: any) => f.user_id);

        await triggerAlert({
            siteId,
            alertType: 'favorite_exit',
            title: 'Favorito salio',
            body: `${personName}\n${contractorName || ''}`,
            data: { person_id: personId, person_name: personName, contractor_name: contractorName || '', target_user_ids: targetUserIds },
        });
    } catch (err) {
        console.error('Error checking exit alerts:', err);
    }
}

// ─── TRIGGER 1c: Dependent Entry/Exit ───────────────────────────────────────

/**
 * Check if person is a dependent (is_dependent in workers_profile)
 * and trigger entry or exit alerts. Dependents are company-standard tracked employees.
 */
export async function checkDependentAlerts(
    siteId: string,
    personId: string,
    personName: string,
    contractorName?: string,
    direction: 'entry' | 'exit' = 'entry'
): Promise<void> {
    try {
        const { data: profile } = await (supabase as any)
            .from('workers_profile')
            .select('is_dependent')
            .eq('person_id', personId)
            .maybeSingle();

        if (!profile?.is_dependent) return;

        const timeStr = new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
        const alertType = direction === 'entry' ? 'dependent_entry' : 'dependent_exit';
        const title = direction === 'entry' ? 'Dependiente ingresó' : 'Dependiente salió';

        await triggerAlert({
            siteId,
            alertType,
            title,
            body: `${personName}\n${contractorName || ''}\nHora: ${timeStr}`,
            data: { person_id: personId, person_name: personName, contractor_name: contractorName || '', time: timeStr },
        });
    } catch (err) {
        console.error('Error checking dependent alerts:', err);
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
                    title: 'Baja asistencia',
                    body: `Solo hay ${currentCount} personas en obra (minimo: ${settings.min_capacity_threshold})`,
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
                    title: 'Capacidad maxima excedida',
                    body: `Hay ${currentCount} personas en obra (maximo: ${settings.max_capacity_threshold})`,
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
            .select('id, name_snapshot, contractor_snapshot, entry_at')
            .eq('site_id', siteId)
            .is('exit_at', null)
            .is('voided_at', null)
            .lt('entry_at', cutoffTime)
            .limit(20);

        if (overtime && overtime.length > 0) {
            const lines = overtime.map(p => {
                const hours = Math.round((Date.now() - new Date(p.entry_at).getTime()) / 3600000);
                const contractor = p.contractor_snapshot ? ` (${p.contractor_snapshot})` : '';
                return `• ${p.name_snapshot}${contractor} — ${hours}h`;
            });
            await triggerAlert({
                siteId,
                alertType: 'overtime',
                title: 'Alerta de horas extras',
                body: `${overtime.length} persona(s) superan ${thresholdHours}h:\n${lines.join('\n')}`,
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
    personName: string,
    contractorName?: string
): Promise<void> {
    try {
        const settings = await getAlertSettings(siteId);
        if (!settings?.unusual_rotation_enabled) return;

        const threshold = settings.unusual_rotation_threshold || 3;

        // Use Bolivia timezone for "today" (UTC-4)
        const now = new Date();
        const boliviaOffset = -4 * 60;
        const boliviaNow = new Date(now.getTime() + (boliviaOffset + now.getTimezoneOffset()) * 60000);
        const todayStart = new Date(boliviaNow);
        todayStart.setHours(0, 0, 0, 0);
        const todayStartUTC = new Date(todayStart.getTime() - (boliviaOffset + now.getTimezoneOffset()) * 60000);

        const { count } = await supabase
            .from('access_logs')
            .select('*', { count: 'exact', head: true })
            .eq('site_id', siteId)
            .eq('person_id', personId)
            .gte('entry_at', todayStartUTC.toISOString());

        if (count && count >= threshold) {
            const contractor = contractorName ? `\n${contractorName}` : '';
            await triggerAlert({
                siteId,
                alertType: 'unusual_rotation',
                title: 'Rotacion inusual detectada',
                body: `${personName}${contractor}\nIngreso ${count} veces hoy (umbral: ${threshold})`,
                data: { person_id: personId, person_name: personName, contractor_name: contractorName || '', count, threshold },
            });
        }
    } catch (err) {
        console.error('Error checking unusual rotation:', err);
    }
}

// ─── TRIGGER 5: Mass Entry ──────────────────────────────────────────────────

/**
 * Detect high volume of entries in short time
 * Call this on every entry — but fires only once per 30-min window
 */
export async function checkMassEntry(siteId: string): Promise<void> {
    try {
        const settings = await getAlertSettings(siteId);
        if (!settings?.mass_entry_enabled) return;

        const threshold = settings.mass_entry_threshold || 20;
        const minutes = settings.mass_entry_minutes || 15;
        const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();

        const { data: recentEntries } = await supabase
            .from('access_logs')
            .select('name_snapshot, contractor_snapshot, entry_at')
            .eq('site_id', siteId)
            .gte('entry_at', cutoff)
            .order('entry_at', { ascending: false })
            .limit(100);

        const count = recentEntries?.length || 0;
        if (count < threshold) return;

        // Persistent cooldown: check alert_history for last mass_entry alert
        const cooldownCutoff = new Date(Date.now() - MASS_ENTRY_COOLDOWN_MS).toISOString();
        const { data: lastAlert } = await supabase
            .from('alert_history')
            .select('id, data, sent_at')
            .eq('site_id', siteId)
            .eq('alert_type', 'mass_entry')
            .gte('sent_at', cooldownCutoff)
            .order('sent_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (lastAlert) {
            // Already sent a mass entry alert within the cooldown window.
            // Only send another if count has grown significantly (>= 5 more people)
            const previousCount = lastAlert.data?.count || 0;
            if (count < previousCount + 5) {
                console.log(`Mass entry cooldown: ${count} people (was ${previousCount}), skipping`);
                return;
            }
            console.log(`Mass entry: count grew ${previousCount} → ${count}, sending update`);
        }

        // Group by contractor — only show contractor name + count (no person names)
        const byContractor: Record<string, number> = {};
        for (const e of recentEntries || []) {
            const c = e.contractor_snapshot || 'Sin contratista';
            byContractor[c] = (byContractor[c] || 0) + 1;
        }
        // Sort by count descending
        const lines = Object.entries(byContractor)
            .sort((a, b) => b[1] - a[1])
            .map(([contractor, n]) => `• ${contractor}: ${n}`);

        // Detect manual entries in this window (check audit_events)
        let manualWarning = '';
        try {
            const { data: manualLogs } = await (supabase as any)
                .from('audit_events')
                .select('note')
                .eq('site_id', siteId)
                .in('action', ['MANUAL_ENTRY'])
                .gte('created_at', cutoff);
            const manualCount = manualLogs?.length || 0;
            if (manualCount > 0) {
                manualWarning = `\n\n⚠️ ${manualCount} ingreso${manualCount > 1 ? 's' : ''} manual${manualCount > 1 ? 'es' : ''} detectado${manualCount > 1 ? 's' : ''}`;
            }
        } catch { /* audit_events might not exist */ }

        await triggerAlert({
            siteId,
            alertType: 'mass_entry',
            title: 'Entrada masiva detectada',
            body: `${count} personas en ${minutes} min:\n${lines.join('\n')}${manualWarning}`,
            data: { count, threshold, minutes },
        });
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
    personName: string,
    contractorName?: string
): Promise<void> {
    try {
        const settings = await getAlertSettings(siteId);
        if (!settings?.night_activity_enabled) return;

        const now = new Date();
        const currentHour = now.getHours();
        const currentMinutes = currentHour * 60 + now.getMinutes();

        // Parse start/end times — handle both number (22) and string ("22:00") formats
        const rawStart = settings.night_activity_start;
        const rawEnd = settings.night_activity_end;
        let startH: number, startM: number, endH: number, endM: number;

        if (typeof rawStart === 'number') {
            startH = rawStart; startM = 0;
        } else {
            const parts = String(rawStart || '22:00').split(':').map(Number);
            startH = parts[0] || 22; startM = parts[1] || 0;
        }
        if (typeof rawEnd === 'number') {
            endH = rawEnd; endM = 0;
        } else {
            const parts = String(rawEnd || '06:00').split(':').map(Number);
            endH = parts[0] || 6; endM = parts[1] || 0;
        }

        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        let isNight = false;
        if (startMinutes > endMinutes) {
            isNight = currentMinutes >= startMinutes || currentMinutes < endMinutes;
        } else {
            isNight = currentMinutes >= startMinutes && currentMinutes < endMinutes;
        }

        if (isNight) {
            const timeStr = now.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
            const startLabel = `${String(startH).padStart(2,'0')}:${String(startM).padStart(2,'0')}`;
            const endLabel = `${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}`;
            const contractor = contractorName ? `\n${contractorName}` : '';
            await triggerAlert({
                siteId,
                alertType: 'night_activity',
                title: 'Actividad nocturna',
                body: `${personName}${contractor}\nIngreso a las ${timeStr} (horario: ${startLabel}-${endLabel})`,
                data: { person_name: personName, contractor_name: contractorName || '', time: timeStr },
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
    personName: string,
    contractorName?: string
): Promise<void> {
    try {
        const settings = await getAlertSettings(siteId);
        if (!settings?.first_entry_enabled) return;

        // Use Bolivia timezone for "today" (UTC-4)
        const now = new Date();
        const boliviaOffset = -4 * 60; // UTC-4 in minutes
        const boliviaNow = new Date(now.getTime() + (boliviaOffset + now.getTimezoneOffset()) * 60000);
        const todayStart = new Date(boliviaNow);
        todayStart.setHours(0, 0, 0, 0);
        // Convert back to UTC for the query
        const todayStartUTC = new Date(todayStart.getTime() - (boliviaOffset + now.getTimezoneOffset()) * 60000);

        // Check if we already sent first_entry today (dedup)
        const { count: alertsToday } = await (supabase as any)
            .from('alert_history')
            .select('*', { count: 'exact', head: true })
            .eq('site_id', siteId)
            .eq('alert_type', 'first_entry')
            .gte('sent_at', todayStartUTC.toISOString());

        if (alertsToday && alertsToday > 0) return; // Already alerted today

        // Count entries today (the insert may or may not have been committed)
        const { count } = await supabase
            .from('access_logs')
            .select('*', { count: 'exact', head: true })
            .eq('site_id', siteId)
            .gte('entry_at', todayStartUTC.toISOString());

        // Use <= 2 to handle race condition (entry might already be in DB)
        if (count !== null && count <= 2) {
            const timeStr = boliviaNow.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
            const contractor = contractorName ? `\n${contractorName}` : '';
            await triggerAlert({
                siteId,
                alertType: 'first_entry',
                title: 'Primera entrada del dia',
                body: `${personName}${contractor}\nHora: ${timeStr}`,
                data: { person_name: personName, contractor_name: contractorName || '', time: timeStr },
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
    personName: string,
    contractorName?: string
): Promise<void> {
    try {
        const settings = await getAlertSettings(siteId);
        if (!settings?.exit_without_entry_enabled) return;

        // Check if person had ANY entry today (exit_at may already be set by the exit flow)
        const now = new Date();
        const boliviaOffset = -4 * 60;
        const boliviaNow = new Date(now.getTime() + (boliviaOffset + now.getTimezoneOffset()) * 60000);
        const todayStart = new Date(boliviaNow);
        todayStart.setHours(0, 0, 0, 0);
        const todayStartUTC = new Date(todayStart.getTime() - (boliviaOffset + now.getTimezoneOffset()) * 60000);

        const { count } = await supabase
            .from('access_logs')
            .select('*', { count: 'exact', head: true })
            .eq('site_id', siteId)
            .eq('person_id', personId)
            .gte('entry_at', todayStartUTC.toISOString())
            .is('voided_at', null);

        // If no entry at all today, this is a real exit without entry
        if (count === 0) {
            const contractor = contractorName ? `\n${contractorName}` : '';
            await triggerAlert({
                siteId,
                alertType: 'exit_without_entry',
                title: 'Salida sin entrada',
                body: `${personName}${contractor}\nRegistro salida sin entrada hoy`,
                data: { person_id: personId, person_name: personName, contractor_name: contractorName || '' },
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
                title: 'Inspector en obra',
                body: `${personName} (Inspector) ingreso a la obra a las ${timeStr}`,
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
        checkUnusualRotation(siteId, personId, personName, contractorName),
        checkMassEntry(siteId),
        checkNightActivity(siteId, personName, contractorName),
        checkFirstEntry(siteId, personName, contractorName),
        checkInspectorVisit(siteId, personId, personName),
        checkDependentAlerts(siteId, personId, personName, contractorName, 'entry'),
    ]);
}

/**
 * Run all triggers that should fire on exit
 */
export async function runExitTriggers(
    siteId: string,
    personId: string,
    personName: string,
    contractorName?: string
): Promise<void> {
    await Promise.allSettled([
        checkCapacityAlerts(siteId),
        checkExitWithoutEntry(siteId, personId, personName, contractorName),
        checkExitAlerts(siteId, personId, personName, contractorName),
        checkDependentAlerts(siteId, personId, personName, contractorName, 'exit'),
    ]);
}
