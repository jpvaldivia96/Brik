// ─── Check Wave End ──────────────────────────────────────────────────────────
// Cron function that runs periodically (every 15 min between 7-10 AM Bolivia)
// Checks if the morning entry wave has ended and sends a summary alert.
// Schedule this via Supabase cron: SELECT cron.schedule('check-wave-end', '*/15 7-10 * * *', ...)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

function formatTime24(dateStr: string): string {
    const d = new Date(dateStr)
    const boliviaTime = new Date(d.getTime() - 4 * 60 * 60 * 1000)
    const h = String(boliviaTime.getUTCHours()).padStart(2, '0')
    const m = String(boliviaTime.getUTCMinutes()).padStart(2, '0')
    return `${h}:${m}`
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const urlObj = new URL(req.url)
        const isDebug = urlObj.searchParams.get('debug') === 'true'

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
            || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0ZW1mb3J2cGdxbmFsaG1la2dqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0NDQyNTAsImV4cCI6MjA4MzAyMDI1MH0.iiFb17p_lXSF0q3UQFXbAVsfUjfvRXgc1SA0km2CYBY'

        const todayStart = getTodayStartUTC()
        const boliviaNow = getBoliviaNow()
        const currentHour = boliviaNow.getHours()

        // Only run between 7 AM and 11 AM Bolivia time (skip check if debug is true)
        if (!isDebug && (currentHour < 7 || currentHour > 11)) {
            return new Response(JSON.stringify({ skipped: 'outside_window', hour: currentHour }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Get all sites that had entries today
        const { data: todayLogs } = await supabase
            .from('access_logs')
            .select('site_id')
            .gte('entry_at', todayStart)
            .is('voided_at', null)

        if (!todayLogs || todayLogs.length === 0) {
            return new Response(JSON.stringify({ skipped: 'no_entries_today', todayStart, isDebug }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const uniqueSiteIds = [...new Set(todayLogs.map((log: any) => log.site_id))]
        const results: string[] = []
        const debugLogs: any[] = []

        for (const siteId of uniqueSiteIds) {
            // Check if wave_ended already sent
            const { count: endedCount } = await supabase
                .from('alert_history')
                .select('*', { count: 'exact', head: true })
                .eq('site_id', siteId)
                .eq('alert_type', 'mass_entry_wave_ended')
                .gte('sent_at', todayStart)

            if (endedCount && endedCount > 0) {
                if (isDebug) debugLogs.push({ siteId, status: 'skipped', reason: 'already_sent_wave_ended', endedCount })
                continue // Already sent summary
            }

            // Get all entries today
            const { data: todayEntries, error: entriesError } = await supabase
                .from('access_logs')
                .select('name_snapshot, contractor_snapshot, entry_at')
                .eq('site_id', siteId)
                .gte('entry_at', todayStart)
                .is('voided_at', null)
                .order('entry_at', { ascending: true })
                .limit(500)

            if (!todayEntries || todayEntries.length === 0) {
                if (isDebug) debugLogs.push({ siteId, status: 'skipped', reason: 'no_entries_in_detailed_fetch', error: entriesError?.message || null })
                continue
            }

            const totalEntries = todayEntries.length

            // To avoid sending summaries too early (e.g. at 7:15 AM with only 1 entry):
            // We require either:
            // a) At least 10 entries today (so we know a significant start happened), OR
            // b) It's already late morning (currentHour >= 9 Bolivia time) and there is at least 1 entry
            const isLateMorning = currentHour >= 9
            const hasEnoughEntries = totalEntries >= 10

            if (!hasEnoughEntries && !isLateMorning) {
                console.log(`[WAVE] Site ${siteId}: too early/few entries (${totalEntries} entries, hour ${currentHour})`)
                if (isDebug) debugLogs.push({ siteId, status: 'skipped', reason: 'too_early_or_few_entries', totalEntries, currentHour, isLateMorning, hasEnoughEntries })
                continue
            }

            // Check if entries have slowed down (no mass entry in last 30 min)
            const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
            const { count: recentCount } = await supabase
                .from('access_logs')
                .select('*', { count: 'exact', head: true })
                .eq('site_id', siteId)
                .gte('entry_at', thirtyMinAgo)
                .is('voided_at', null)

            // If more than 5 entries in last 30 min, and it's not late morning yet, wave is still active
            if (recentCount && recentCount > 5 && !isLateMorning) {
                console.log(`[WAVE] Site ${siteId}: still active (${recentCount} entries in 30 min)`)
                if (isDebug) debugLogs.push({ siteId, status: 'skipped', reason: 'wave_still_active_and_not_late_morning', recentCount, currentHour, isLateMorning })
                continue
            }

            if (isDebug) {
                debugLogs.push({
                    siteId,
                    status: 'processing',
                    totalEntries,
                    recentCount,
                    isLateMorning,
                    hasEnoughEntries,
                    currentHour
                })
            }

            // Wave has ended! Build summary
            console.log(`[WAVE] Site ${siteId}: wave ended, building summary...`)

            // Get site name
            const { data: site } = await supabase
                .from('sites')
                .select('name')
                .eq('id', siteId)
                .single()

            const siteName = site?.name || 'Obra'

            // Check if todayEntries is valid (already checked, but keeping logic consistent)
            if (!todayEntries || todayEntries.length === 0) continue

            const firstEntry = todayEntries[0]
            const lastEntry = todayEntries[todayEntries.length - 1]

            const waveStartTime = formatTime24(firstEntry.entry_at)
            const waveEndTime = formatTime24(lastEntry.entry_at)

            // Count by contractor
            const byContractor: Record<string, number> = {}
            let manualCount = 0
            const uniqueNames = new Set<string>()
            for (const e of todayEntries) {
                const c = e.contractor_snapshot || 'Sin contratista'
                byContractor[c] = (byContractor[c] || 0) + 1
                uniqueNames.add(e.name_snapshot)
            }

            const contractorLines = Object.entries(byContractor)
                .sort((a, b) => b[1] - a[1])
                .map(([c, n]) => `• ${c}: ${n}`)

            // Get historical average
            const { data: patterns } = await supabase
                .from('site_entry_patterns')
                .select('total_entries')
                .eq('site_id', siteId)
                .order('date', { ascending: false })
                .limit(20)

            let historyNote = ''
            if (patterns && patterns.length >= 3) {
                const avgTotal = Math.round(
                    patterns.reduce((s: number, p: any) => s + (p.total_entries || 0), 0) / patterns.length
                )
                const diff = totalEntries - avgTotal
                const diffSign = diff > 0 ? '+' : ''
                historyNote = `\n📈 vs promedio: ${avgTotal} personas (${diffSign}${diff})`
            }

            const manualNote = manualCount > 0
                ? `\n⚠️ ${manualCount} entrada${manualCount > 1 ? 's' : ''} manual${manualCount > 1 ? 'es' : ''}`
                : ''

            const nowTimeStr = boliviaNow.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })

            const summaryBody = `✅ ${totalEntries} personas (${uniqueNames.size} únicas)\n`
                + `🕐 Ventana: ${waveStartTime} — ${waveEndTime}\n\n`
                + `${contractorLines.join('\n')}`
                + manualNote
                + historyNote

            // Update site_entry_patterns with final data
            const todayDate = boliviaNow.toISOString().split('T')[0]
            const { error: upsertError } = await supabase
                .from('site_entry_patterns')
                .upsert({
                    site_id: siteId,
                    date: todayDate,
                    wave_start_time: waveStartTime,
                    wave_end_time: waveEndTime,
                    total_entries: totalEntries,
                    manual_entries: manualCount,
                    contractors: byContractor,
                }, { onConflict: 'site_id,date' })

            // Insert dedup for wave_ended
            const { error: dedupError } = await supabase
                .from('alert_history')
                .insert({
                    site_id: siteId,
                    alert_type: 'mass_entry_wave_ended',
                    title: 'Resumen de ingreso matutino',
                    sent_at: new Date().toISOString(),
                    body: `Wave ended: ${totalEntries} entries`,
                })

            if (isDebug) {
                const idx = debugLogs.findIndex(d => d.siteId === siteId)
                if (idx !== -1) {
                    debugLogs[idx].upsertError = upsertError?.message || null
                    debugLogs[idx].dedupError = dedupError?.message || null
                }
            }

            if (dedupError) {
                console.log(`[DEDUP] wave_ended already sent for site ${siteId}`)
                continue
            }

            // Send the summary alert
            try {
                const response = await fetch(`${supabaseUrl}/functions/v1/send-alert`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${anonKey}`,
                    },
                    body: JSON.stringify({
                        site_id: siteId,
                        alert_type: 'mass_entry_wave_ended',
                        title: '📊 Resumen de ingreso matutino',
                        body: summaryBody,
                        data: {
                            total_entries: totalEntries,
                            unique_people: uniqueNames.size,
                            wave_start: waveStartTime,
                            wave_end: waveEndTime,
                            manual_entries: manualCount,
                            contractors: byContractor,
                            app_version: 'server-trigger',
                        },
                    }),
                })

                const result = await response.json()
                if (result?.success) {
                    results.push(`${siteName}: summary sent (${totalEntries} entries)`)
                    console.log(`[WAVE SUMMARY] Sent for ${siteName}`)
                }
            } catch (err) {
                console.error(`Error sending wave summary for ${siteId}:`, err)
            }
        }

        return new Response(
            JSON.stringify(isDebug ? { success: true, results, debugLogs } : { success: true, results }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        console.error('check-wave-end error:', error)
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
