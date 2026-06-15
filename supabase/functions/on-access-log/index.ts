// ─── Server-Side Alert Triggers ─────────────────────────────────────────────
// Called via Database Webhook when access_logs are inserted or updated.
// This replaces client-side triggers to ensure alerts fire 100% of the time,
// regardless of the guard's browser version or state.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
            || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0ZW1mb3J2cGdxbmFsaG1la2dqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0NDQyNTAsImV4cCI6MjA4MzAyMDI1MH0.iiFb17p_lXSF0q3UQFXbAVsfUjfvRXgc1SA0km2CYBY'

        const payload = await req.json()

        // Database webhook sends: { type: 'INSERT'|'UPDATE', table, record, old_record }
        // Manual invocation sends: { record: {...}, event_type: 'entry'|'exit' }
        const record = payload.record
        const oldRecord = payload.old_record
        const eventType = payload.type // 'INSERT' or 'UPDATE'

        if (!record?.site_id) {
            return new Response(JSON.stringify({ success: false, error: 'No record.site_id' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Skip voided records
        if (record.voided_at) {
            return new Response(JSON.stringify({ success: true, skipped: 'voided' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const siteId = record.site_id
        const personId = record.person_id
        const personName = record.name_snapshot || 'Persona'
        const contractorName = record.contractor_snapshot || ''

        // Get alert settings
        const settings = await getAlertSettings(supabase, siteId)

        const results: string[] = []

        // Determine if this is an ENTRY or EXIT event
        const isNewEntry = eventType === 'INSERT' && record.entry_at && !record.exit_at
        const isExit = eventType === 'UPDATE' && record.exit_at && (!oldRecord?.exit_at)

        if (isNewEntry) {
            console.log(`[TRIGGER] ENTRY: ${personName} (${contractorName}) at ${siteId}`)

            // Run all entry triggers in parallel
            const triggers = await Promise.allSettled([
                checkFavoriteBlocked(supabase, siteId, personId, personName, contractorName, 'entry'),
                checkFirstEntry(supabase, siteId, personName, contractorName, settings),
                checkUnusualRotation(supabase, siteId, personId, personName, contractorName, settings),
                checkNightActivity(supabase, siteId, personName, contractorName, settings),
                checkMassEntry(supabase, siteId, settings),
                checkInspectorVisit(supabase, siteId, personId, personName, settings),
                checkDependents(supabase, siteId, personId, personName, contractorName, 'entry'),
            ])

            triggers.forEach((t, i) => {
                if (t.status === 'fulfilled' && t.value) results.push(t.value)
                if (t.status === 'rejected') console.error(`Trigger ${i} failed:`, t.reason)
            })
        } else if (isExit) {
            console.log(`[TRIGGER] EXIT: ${personName} (${contractorName}) at ${siteId}`)

            const triggers = await Promise.allSettled([
                checkFavoriteBlocked(supabase, siteId, personId, personName, contractorName, 'exit'),
                checkDependents(supabase, siteId, personId, personName, contractorName, 'exit'),
            ])

            triggers.forEach((t, i) => {
                if (t.status === 'fulfilled' && t.value) results.push(t.value)
                if (t.status === 'rejected') console.error(`Trigger ${i} failed:`, t.reason)
            })
        }

        return new Response(
            JSON.stringify({ success: true, event: isNewEntry ? 'entry' : isExit ? 'exit' : 'unknown', alerts: results }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    } catch (error: any) {
        console.error('Trigger error:', error)
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})

// ─── Alert Settings ──────────────────────────────────────────────────────────

async function getAlertSettings(supabase: any, siteId: string) {
    const defaults: Record<string, any> = {
        favorite_entry_enabled: true,
        blocked_entry_enabled: true,
        first_entry_enabled: true,
        unusual_rotation_enabled: true,
        unusual_rotation_threshold: 3,
        mass_entry_enabled: true,
        mass_entry_threshold: 20,
        mass_entry_minutes: 15,
        night_activity_enabled: true,
        night_activity_start: '22:00',
        night_activity_end: '06:00',
        inspector_visit_enabled: true,
    }

    const { data } = await supabase
        .from('alert_settings')
        .select('*')
        .eq('site_id', siteId)
        .maybeSingle()

    return { ...defaults, ...(data || {}) }
}

// ─── Helper: Send alert via send-alert Edge Function ─────────────────────────

async function sendAlert(payload: any): Promise<string | null> {
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
            || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0ZW1mb3J2cGdxbmFsaG1la2dqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0NDQyNTAsImV4cCI6MjA4MzAyMDI1MH0.iiFb17p_lXSF0q3UQFXbAVsfUjfvRXgc1SA0km2CYBY'

        const response = await fetch(`${supabaseUrl}/functions/v1/send-alert`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${anonKey}`,
            },
            body: JSON.stringify({ ...payload, data: { ...payload.data, app_version: 'server-trigger' } }),
        })

        const result = await response.json()
        if (result?.success) {
            console.log(`[ALERT SENT] ${payload.alert_type}: ${result.channels?.join(',')}`)
            return payload.alert_type
        } else {
            console.error(`[ALERT FAILED] ${payload.alert_type}:`, result)
        }
    } catch (err) {
        console.error('Error calling send-alert:', err)
    }
    return null
}

// ─── Bolivia Time Helpers ────────────────────────────────────────────────────

function getBoliviaNow(): Date {
    const now = new Date()
    const boliviaOffset = -4 * 60
    return new Date(now.getTime() + (boliviaOffset + now.getTimezoneOffset()) * 60000)
}

function getTodayStartUTC(): string {
    const now = new Date()
    const boliviaOffset = -4 * 60
    const boliviaNow = new Date(now.getTime() + (boliviaOffset + now.getTimezoneOffset()) * 60000)
    const todayStart = new Date(boliviaNow)
    todayStart.setHours(0, 0, 0, 0)
    const todayStartUTC = new Date(todayStart.getTime() - (boliviaOffset + now.getTimezoneOffset()) * 60000)
    return todayStartUTC.toISOString()
}

// ─── TRIGGER: Favorite / Blocked ─────────────────────────────────────────────

async function checkFavoriteBlocked(
    supabase: any, siteId: string, personId: string,
    personName: string, contractorName: string, direction: 'entry' | 'exit'
): Promise<string | null> {
    // Check if person is blocked (site-wide)
    if (direction === 'entry') {
        const { data: blocked } = await supabase
            .from('favorites')
            .select('id, block_reason')
            .eq('site_id', siteId)
            .eq('person_id', personId)
            .eq('is_blocked', true)
            .maybeSingle()

        if (blocked) {
            return await sendAlert({
                site_id: siteId,
                alert_type: 'blocked_entry',
                title: 'ALERTA: Bloqueado ingreso',
                body: `${personName}\n${contractorName}${blocked.block_reason ? '\nMotivo: ' + blocked.block_reason : ''}`,
                data: { person_id: personId, person_name: personName, contractor_name: contractorName, block_reason: blocked.block_reason },
            })
        }
    }

    // Check which users have this person as favorite
    const { data: favRecords } = await supabase
        .from('favorites')
        .select('user_id')
        .eq('site_id', siteId)
        .eq('person_id', personId)
        .eq('is_blocked', false)
        .not('user_id', 'is', null)

    if (!favRecords || favRecords.length === 0) return null

    const targetUserIds = favRecords.map((f: any) => f.user_id)
    const alertType = direction === 'entry' ? 'favorite_entry' : 'favorite_exit'
    const title = direction === 'entry' ? 'Favorito ingreso' : 'Favorito salio'

    return await sendAlert({
        site_id: siteId,
        alert_type: alertType,
        title,
        body: `${personName}\n${contractorName}`,
        data: { person_id: personId, person_name: personName, contractor_name: contractorName, target_user_ids: targetUserIds },
    })
}

// ─── TRIGGER: First Entry of the Day ─────────────────────────────────────────

async function checkFirstEntry(
    supabase: any, siteId: string,
    personName: string, contractorName: string, settings: any
): Promise<string | null> {
    if (!settings.first_entry_enabled) return null

    const todayStart = getTodayStartUTC()

    // Check dedup — only 1 first_entry alert per day
    const { count: alertsToday } = await supabase
        .from('alert_history')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .eq('alert_type', 'first_entry')
        .gte('sent_at', todayStart)

    if (alertsToday && alertsToday > 0) return null

    // Count entries today — must be exactly the first one
    const { count } = await supabase
        .from('access_logs')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .gte('entry_at', todayStart)
        .is('voided_at', null)

    if (count !== null && count <= 1) {
        // Optimistic lock: insert dedup record first to prevent race condition
        const { error: dedupError } = await supabase
            .from('alert_history')
            .insert({
                site_id: siteId,
                alert_type: 'first_entry',
                sent_at: new Date().toISOString(),
                message: `Dedup lock: ${personName}`,
            })

        // If insert fails (another trigger already inserted), skip
        if (dedupError) {
            console.log('[DEDUP] first_entry already locked by another trigger')
            return null
        }

        const timeStr = getBoliviaNow().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
        const contractor = contractorName ? `\n${contractorName}` : ''

        return await sendAlert({
            site_id: siteId,
            alert_type: 'first_entry',
            title: 'Primera entrada del dia',
            body: `${personName}${contractor}\nHora: ${timeStr}`,
            data: { person_name: personName, contractor_name: contractorName, time: timeStr },
        })
    }
    return null
}

// ─── TRIGGER: Unusual Rotation ───────────────────────────────────────────────

async function checkUnusualRotation(
    supabase: any, siteId: string, personId: string,
    personName: string, contractorName: string, settings: any
): Promise<string | null> {
    if (!settings.unusual_rotation_enabled) return null

    const threshold = settings.unusual_rotation_threshold || 3
    const todayStart = getTodayStartUTC()

    const { count } = await supabase
        .from('access_logs')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .eq('person_id', personId)
        .gte('entry_at', todayStart)

    if (count && count >= threshold) {
        const contractor = contractorName ? `\n${contractorName}` : ''
        return await sendAlert({
            site_id: siteId,
            alert_type: 'unusual_rotation',
            title: 'Rotacion inusual detectada',
            body: `${personName}${contractor}\nIngreso ${count} veces hoy (umbral: ${threshold})`,
            data: { person_id: personId, person_name: personName, contractor_name: contractorName, count, threshold },
        })
    }
    return null
}

// ─── TRIGGER: Night Activity ─────────────────────────────────────────────────

async function checkNightActivity(
    supabase: any, siteId: string,
    personName: string, contractorName: string, settings: any
): Promise<string | null> {
    if (!settings.night_activity_enabled) return null

    const now = getBoliviaNow()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()

    // Parse start/end — handle both number and string formats
    const rawStart = settings.night_activity_start
    const rawEnd = settings.night_activity_end
    let startH: number, startM: number, endH: number, endM: number

    if (typeof rawStart === 'number') { startH = rawStart; startM = 0 }
    else { const p = String(rawStart || '22:00').split(':').map(Number); startH = p[0] || 22; startM = p[1] || 0 }

    if (typeof rawEnd === 'number') { endH = rawEnd; endM = 0 }
    else { const p = String(rawEnd || '06:00').split(':').map(Number); endH = p[0] || 6; endM = p[1] || 0 }

    const startMinutes = startH * 60 + startM
    const endMinutes = endH * 60 + endM

    let isNight = false
    if (startMinutes > endMinutes) {
        isNight = currentMinutes >= startMinutes || currentMinutes < endMinutes
    } else {
        isNight = currentMinutes >= startMinutes && currentMinutes < endMinutes
    }

    if (isNight) {
        const timeStr = now.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
        const startLabel = `${String(startH).padStart(2,'0')}:${String(startM).padStart(2,'0')}`
        const endLabel = `${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}`
        const contractor = contractorName ? `\n${contractorName}` : ''

        return await sendAlert({
            site_id: siteId,
            alert_type: 'night_activity',
            title: 'Actividad nocturna',
            body: `${personName}${contractor}\nIngreso a las ${timeStr} (horario: ${startLabel}-${endLabel})`,
            data: { person_name: personName, contractor_name: contractorName, time: timeStr },
        })
    }
    return null
}

// ─── TRIGGER: Mass Entry (Wave-based, max 2 alerts/day) ──────────────────────

async function checkMassEntry(supabase: any, siteId: string, settings: any): Promise<string | null> {
    if (!settings.mass_entry_enabled) return null

    const threshold = settings.mass_entry_threshold || 20
    const minutes = settings.mass_entry_minutes || 15
    const todayStart = getTodayStartUTC()
    const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString()

    // Count recent entries in the window
    const { data: recentEntries } = await supabase
        .from('access_logs')
        .select('name_snapshot, contractor_snapshot, entry_method')
        .eq('site_id', siteId)
        .gte('entry_at', cutoff)
        .is('voided_at', null)
        .limit(200)

    const count = recentEntries?.length || 0
    if (count < threshold) return null

    // We have a mass entry event — check if we already sent "wave_started" today
    const { count: waveStartedToday } = await supabase
        .from('alert_history')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .eq('alert_type', 'mass_entry_wave_started')
        .gte('sent_at', todayStart)

    if (waveStartedToday && waveStartedToday > 0) {
        // Already sent wave_started — just accumulate, don't spam
        console.log('[MASS ENTRY] Wave already started, skipping alert')
        return null
    }

    // Optimistic lock: insert dedup first
    const { error: dedupError } = await supabase
        .from('alert_history')
        .insert({
            site_id: siteId,
            alert_type: 'mass_entry_wave_started',
            sent_at: new Date().toISOString(),
            message: `Wave started: ${count} entries`,
        })

    if (dedupError) {
        console.log('[DEDUP] mass_entry_wave_started already locked')
        return null
    }

    // Build contractor summary
    const byContractor: Record<string, number> = {}
    let manualCount = 0
    for (const e of recentEntries || []) {
        const c = e.contractor_snapshot || 'Sin contratista'
        byContractor[c] = (byContractor[c] || 0) + 1
        if (e.entry_method === 'manual') manualCount++
    }

    const lines = Object.entries(byContractor)
        .sort((a, b) => b[1] - a[1])
        .map(([c, n]) => `• ${c}: ${n}`)

    const timeStr = getBoliviaNow().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })

    // Get historical average for comparison
    const { data: patterns } = await supabase
        .from('site_entry_patterns')
        .select('total_entries, wave_start_time')
        .eq('site_id', siteId)
        .order('date', { ascending: false })
        .limit(20)

    let historyNote = ''
    if (patterns && patterns.length >= 5) {
        const avgTotal = Math.round(patterns.reduce((s: number, p: any) => s + (p.total_entries || 0), 0) / patterns.length)
        historyNote = `\n📈 Promedio histórico: ${avgTotal} personas/día`
    }

    const manualNote = manualCount > 0 
        ? `\n⚠️ ${manualCount} entrada${manualCount > 1 ? 's' : ''} manual${manualCount > 1 ? 'es' : ''} detectada${manualCount > 1 ? 's' : ''}` 
        : ''

    // Save wave start time for the summary later
    await supabase
        .from('site_entry_patterns')
        .upsert({
            site_id: siteId,
            date: getBoliviaNow().toISOString().split('T')[0],
            wave_start_time: timeStr,
            total_entries: count,
            manual_entries: manualCount,
            contractors: byContractor,
        }, { onConflict: 'site_id,date' })

    return await sendAlert({
        site_id: siteId,
        alert_type: 'mass_entry_wave_started',
        title: '🏗️ ¡Ingreso matutino comenzó!',
        body: `${count} personas ingresaron — ${timeStr}\n\n${lines.join('\n')}${manualNote}${historyNote}`,
        data: { count, threshold, minutes, contractors: byContractor },
    })
}

// ─── TRIGGER: Inspector Visit ────────────────────────────────────────────────

async function checkInspectorVisit(
    supabase: any, siteId: string, personId: string,
    personName: string, settings: any
): Promise<string | null> {
    if (!settings.inspector_visit_enabled) return null

    const { data: profile } = await supabase
        .from('workers_profile')
        .select('is_inspector')
        .eq('person_id', personId)
        .maybeSingle()

    if (profile?.is_inspector) {
        const timeStr = getBoliviaNow().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
        return await sendAlert({
            site_id: siteId,
            alert_type: 'inspector_visit',
            title: 'Inspector en obra',
            body: `${personName} (Inspector) ingreso a la obra a las ${timeStr}`,
            data: { person_id: personId, person_name: personName, time: timeStr },
        })
    }
    return null
}

// ─── TRIGGER: Dependents ─────────────────────────────────────────────────────

async function checkDependents(
    supabase: any, siteId: string, personId: string,
    personName: string, contractorName: string, direction: 'entry' | 'exit'
): Promise<string | null> {
    const { data: profile } = await supabase
        .from('workers_profile')
        .select('is_dependent')
        .eq('person_id', personId)
        .maybeSingle()

    if (!profile?.is_dependent) return null

    const alertType = direction === 'entry' ? 'dependent_entry' : 'dependent_exit'
    const title = direction === 'entry' ? 'Dependiente ingreso' : 'Dependiente salio'
    const timeStr = getBoliviaNow().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
    const contractor = contractorName ? `\n${contractorName}` : ''

    return await sendAlert({
        site_id: siteId,
        alert_type: alertType,
        title,
        body: `${personName}${contractor}\nHora: ${timeStr}`,
        data: { person_id: personId, person_name: personName, contractor_name: contractorName, time: timeStr },
    })
}
