// Supabase Edge Function for Scheduled Alert Checks
// This runs periodically via cron jobs or manual invocation

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

        const { alert_type } = await req.json()

        let processedSites = 0
        let alertsSent = 0

        // Get all active sites with their alert settings
        const { data: sites } = await supabase
            .from('sites')
            .select('id, name')

        if (!sites) {
            return new Response(JSON.stringify({ success: false }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Process each site based on alert type
        for (const site of sites) {
            try {
                // Get alert settings for this site
                const { data: settings } = await supabase
                    .from('alert_settings')
                    .select('*')
                    .eq('site_id', site.id)
                    .single()

                if (!settings) continue

                // Check if this alert type is enabled at site level
                const enabledKey = `${alert_type}_enabled`
                if (settings[enabledKey] === false) continue

                let sent = 0
                switch (alert_type) {
                    case 'contractor_attendance':
                        sent = await checkContractorAttendance(supabase, site.id, settings)
                        break
                    case 'birthday':
                        sent = await checkBirthdays(supabase, site.id)
                        break
                    case 'low_weekly_attendance':
                        sent = await checkWeeklyAttendance(supabase, site.id, settings)
                        break
                    case 'attendance_record':
                        sent = await checkAttendanceRecord(supabase, site.id)
                        break
                    case 'contractor_inactive':
                        sent = await checkInactiveContractors(supabase, site.id, settings)
                        break
                    case 'exponential_growth':
                        sent = await checkExponentialGrowth(supabase, site.id, settings)
                        break
                    case 'worker_of_month':
                        sent = await selectWorkerOfMonth(supabase, site.id)
                        break
                    case 'meeting_reminder':
                        sent = await checkMeetingReminders(supabase, site.id)
                        break
                    case 'overtime':
                        sent = await checkOvertime(supabase, site.id, settings)
                        break
                    case 'safety_milestone':
                        sent = await checkSafetyMilestone(supabase, site.id, settings)
                        break
                    case 'all':
                        // Run all checks
                        sent += await checkContractorAttendance(supabase, site.id, settings)
                        sent += await checkBirthdays(supabase, site.id)
                        sent += await checkWeeklyAttendance(supabase, site.id, settings)
                        sent += await checkAttendanceRecord(supabase, site.id)
                        sent += await checkInactiveContractors(supabase, site.id, settings)
                        sent += await checkExponentialGrowth(supabase, site.id, settings)
                        sent += await checkMeetingReminders(supabase, site.id)
                        sent += await checkOvertime(supabase, site.id, settings)
                        sent += await checkSafetyMilestone(supabase, site.id, settings)
                        break
                }
                alertsSent += sent
                processedSites++
            } catch (err) {
                console.error(`Error processing site ${site.id}:`, err)
            }
        }

        return new Response(
            JSON.stringify({ success: true, processed_sites: processedSites, alerts_sent: alertsSent }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    } catch (error: any) {
        console.error('Error:', error)
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})

// ─── Contractor Attendance Check ────────────────────────────────────────────

async function checkContractorAttendance(supabase: any, siteId: string, settings: any): Promise<number> {
    if (!settings.contractor_attendance_enabled) return 0

    const threshold = settings.contractor_attendance_threshold || 50
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    // Get contractors for this site
    const { data: contractors } = await supabase
        .from('contractors')
        .select('id, name')
        .eq('site_id', siteId)

    if (!contractors || contractors.length === 0) return 0

    const lowContractors: string[] = []
    for (const c of contractors) {
        // Total workers of this contractor
        const { count: total } = await supabase
            .from('people')
            .select('*', { count: 'exact', head: true })
            .eq('contractor', c.name)

        // Today's entries for this contractor
        const { data: todayEntries } = await supabase
            .from('access_logs')
            .select('person_id')
            .eq('site_id', siteId)
            .eq('contractor_snapshot', c.name)
            .gte('entry_at', todayStart.toISOString())
            .is('voided_at', null)

        const present = new Set((todayEntries || []).map((e: any) => e.person_id)).size
        const rate = total ? (present / total) * 100 : 100
        if (rate < threshold) {
            lowContractors.push(`• ${c.name}: ${present}/${total} (${rate.toFixed(0)}%)`)
        }
    }

    if (lowContractors.length > 0) {
        await sendAlert(supabase, {
            site_id: siteId,
            alert_type: 'contractor_attendance',
            title: '👷 Baja Asistencia de Contratistas',
            body: `${lowContractors.length} contratista(s) bajo ${threshold}%:\n${lowContractors.join('\n')}`,
            data: { count: lowContractors.length, threshold }
        })
        return 1
    }
    return 0
}

// ─── Birthday Check ─────────────────────────────────────────────────────────

async function checkBirthdays(supabase: any, siteId: string): Promise<number> {
    const today = new Date()
    const month = today.getMonth() + 1
    const day = today.getDate()

    // Get workers with birthdays today who have accessed this site
    const { data: profiles } = await supabase
        .from('workers_profile')
        .select('person_id, birthday, people!inner(full_name)')
        .not('birthday', 'is', null)

    let sent = 0
    for (const profile of profiles || []) {
        if (!profile.birthday) continue
        const bday = new Date(profile.birthday)
        if (bday.getMonth() + 1 === month && bday.getDate() === day) {
            const name = (profile as any).people?.full_name || 'Trabajador'
            const age = today.getFullYear() - bday.getFullYear()
            await sendAlert(supabase, {
                site_id: siteId,
                alert_type: 'birthday',
                title: '🎂 Cumpleaños en Obra',
                body: `¡${name} cumple ${age} años hoy! 🎉`,
                data: { person_id: profile.person_id }
            })
            sent++
        }
    }
    return sent
}

// ─── Weekly Attendance Check ────────────────────────────────────────────────

async function checkWeeklyAttendance(supabase: any, siteId: string, settings: any): Promise<number> {
    if (!settings.low_weekly_attendance_enabled) return 0
    
    const threshold = settings.low_weekly_attendance_threshold || 70
    const days = settings.low_weekly_attendance_days || 3
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)

    const { count: totalWorkers } = await supabase
        .from('people')
        .select('*', { count: 'exact', head: true })

    const { data: recentEntries } = await supabase
        .from('access_logs')
        .select('person_id')
        .eq('site_id', siteId)
        .gte('entry_at', cutoff.toISOString())
        .is('voided_at', null)

    const uniqueRecent = new Set((recentEntries || []).map((e: any) => e.person_id)).size
    const rate = totalWorkers ? (uniqueRecent / totalWorkers) * 100 : 100

    if (rate < threshold) {
        await sendAlert(supabase, {
            site_id: siteId,
            alert_type: 'low_weekly_attendance',
            title: '📉 Baja Asistencia Semanal',
            body: `Solo ${rate.toFixed(0)}% de asistencia en los últimos ${days} días (umbral: ${threshold}%)`,
            data: { rate, threshold, days }
        })
        return 1
    }
    return 0
}

// ─── Attendance Record Check ────────────────────────────────────────────────

async function checkAttendanceRecord(supabase: any, siteId: string): Promise<number> {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { count: todayCount } = await supabase
        .from('access_logs')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .gte('entry_at', today.toISOString())
        .is('voided_at', null)

    if (!todayCount || todayCount < 5) return 0 // minimum to consider a record

    // Check if today already has a record alert
    const { count: existingAlert } = await supabase
        .from('alert_history')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .eq('alert_type', 'attendance_record')
        .gte('sent_at', today.toISOString())

    if (existingAlert && existingAlert > 0) return 0 // already alerted today

    // Compare vs best day (simplified: check last 90 days)
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    
    // Get daily counts for last 90 days
    const { data: historicalLogs } = await supabase
        .from('access_logs')
        .select('entry_at')
        .eq('site_id', siteId)
        .gte('entry_at', ninetyDaysAgo.toISOString())
        .lt('entry_at', today.toISOString())
        .is('voided_at', null)

    // Calculate max per day
    const dailyCounts: Record<string, number> = {}
    for (const log of historicalLogs || []) {
        const day = new Date(log.entry_at).toISOString().split('T')[0]
        dailyCounts[day] = (dailyCounts[day] || 0) + 1
    }
    const historicalMax = Math.max(...Object.values(dailyCounts), 0)

    if (todayCount > historicalMax) {
        await sendAlert(supabase, {
            site_id: siteId,
            alert_type: 'attendance_record',
            title: '🏆 ¡Récord de Asistencia!',
            body: `¡Hoy asistieron ${todayCount} personas! Récord anterior: ${historicalMax}`,
            data: { count: todayCount, previous_record: historicalMax }
        })
        return 1
    }
    return 0
}

// ─── Inactive Contractors Check ─────────────────────────────────────────────

async function checkInactiveContractors(supabase: any, siteId: string, settings: any): Promise<number> {
    if (!settings.contractor_inactive_enabled) return 0

    const inactiveDays = settings.contractor_inactive_days || 7
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - inactiveDays)

    const { data: contractors } = await supabase
        .from('contractors')
        .select('id, name')
        .eq('site_id', siteId)

    let sent = 0
    for (const contractor of contractors || []) {
        const { count } = await supabase
            .from('access_logs')
            .select('*', { count: 'exact', head: true })
            .eq('site_id', siteId)
            .eq('contractor_snapshot', contractor.name)
            .gte('entry_at', cutoff.toISOString())

        if (count === 0) {
            await sendAlert(supabase, {
                site_id: siteId,
                alert_type: 'contractor_inactive',
                title: '⚠️ Contratista Sin Actividad',
                body: `${contractor.name} sin trabajadores hace ${inactiveDays}+ días`,
                data: { contractor_id: contractor.id, contractor_name: contractor.name, days: inactiveDays }
            })
            sent++
        }
    }
    return sent
}

// ─── Weekly Summary / Trend Report ──────────────────────────────────────────

async function checkExponentialGrowth(supabase: any, siteId: string, settings: any): Promise<number> {
    if (!settings.exponential_growth_enabled) return 0

    // Define week boundaries (Mon-Sun)
    const now = new Date()
    const dayOfWeek = now.getDay() // 0=Sun, 1=Mon...
    
    // This week start (last Monday)
    const thisWeekStart = new Date(now)
    thisWeekStart.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
    thisWeekStart.setHours(0, 0, 0, 0)

    // Last week boundaries
    const lastWeekStart = new Date(thisWeekStart)
    lastWeekStart.setDate(lastWeekStart.getDate() - 7)
    const lastWeekEnd = new Date(thisWeekStart)

    // --- Fetch this week's data ---
    const { data: thisWeekLogs } = await supabase
        .from('access_logs')
        .select('person_id, contractor_snapshot, entry_at, exit_at')
        .eq('site_id', siteId)
        .gte('entry_at', thisWeekStart.toISOString())
        .is('voided_at', null)

    // --- Fetch last week's data ---
    const { data: lastWeekLogs } = await supabase
        .from('access_logs')
        .select('person_id, contractor_snapshot, entry_at, exit_at')
        .eq('site_id', siteId)
        .gte('entry_at', lastWeekStart.toISOString())
        .lt('entry_at', lastWeekEnd.toISOString())
        .is('voided_at', null)

    const tw = thisWeekLogs || []
    const lw = lastWeekLogs || []

    // If no data from last week, skip (can't compare)
    if (lw.length === 0 && tw.length === 0) return 0

    // --- Calculate metrics ---
    const calcMetrics = (logs: any[]) => {
        const uniqueWorkers = new Set(logs.map(l => l.person_id))
        const contractors = new Map<string, Set<string>>()
        let exits = 0

        for (const log of logs) {
            const cName = log.contractor_snapshot || 'Sin Contratista'
            if (!contractors.has(cName)) contractors.set(cName, new Set())
            contractors.get(cName)!.add(log.person_id)
            if (log.exit_at) exits++
        }

        return {
            totalEntries: logs.length,
            totalExits: exits,
            uniqueWorkers: uniqueWorkers.size,
            activeContractors: contractors.size,
            contractorDetails: contractors,
        }
    }

    const twMetrics = calcMetrics(tw)
    const lwMetrics = calcMetrics(lw)

    // --- Trend indicator ---
    const trend = (current: number, previous: number): string => {
        if (previous === 0) return current > 0 ? '(nuevo)' : ''
        const pct = ((current - previous) / previous) * 100
        if (pct > 5) return `(+${pct.toFixed(0)}%)`
        if (pct < -5) return `(${pct.toFixed(0)}%)`
        return '(estable)'
    }

    // --- Build contractor breakdown (top 8) ---
    const contractorLines: string[] = []
    const allContractors = new Set([
        ...twMetrics.contractorDetails.keys(),
        ...lwMetrics.contractorDetails.keys()
    ])

    const contractorData = [...allContractors].map(name => ({
        name,
        thisWeek: twMetrics.contractorDetails.get(name)?.size || 0,
        lastWeek: lwMetrics.contractorDetails.get(name)?.size || 0,
    })).sort((a, b) => b.thisWeek - a.thisWeek)

    for (const c of contractorData.slice(0, 8)) {
        const t = trend(c.thisWeek, c.lastWeek)
        contractorLines.push(`  ${c.name}: ${c.thisWeek} ${t}`)
    }
    if (contractorData.length > 8) {
        contractorLines.push(`  ...y ${contractorData.length - 8} mas`)
    }

    // --- Overall change ---
    const overallChange = lwMetrics.totalEntries > 0
        ? ((twMetrics.totalEntries - lwMetrics.totalEntries) / lwMetrics.totalEntries * 100).toFixed(0)
        : 'N/A'

    // --- Build message body ---
    const body = [
        `Entradas: ${twMetrics.totalEntries} vs ${lwMetrics.totalEntries} ${trend(twMetrics.totalEntries, lwMetrics.totalEntries)}`,
        `Salidas: ${twMetrics.totalExits} vs ${lwMetrics.totalExits} ${trend(twMetrics.totalExits, lwMetrics.totalExits)}`,
        `Trabajadores unicos: ${twMetrics.uniqueWorkers} vs ${lwMetrics.uniqueWorkers} ${trend(twMetrics.uniqueWorkers, lwMetrics.uniqueWorkers)}`,
        `Contratistas activos: ${twMetrics.activeContractors} vs ${lwMetrics.activeContractors} ${trend(twMetrics.activeContractors, lwMetrics.activeContractors)}`,
        ``,
        `Por contratista:`,
        ...contractorLines,
    ].join('\n')

    await sendAlert(supabase, {
        site_id: siteId,
        alert_type: 'exponential_growth',
        title: 'Resumen Semanal',
        body,
        data: {
            this_week_entries: twMetrics.totalEntries,
            last_week_entries: lwMetrics.totalEntries,
            change_pct: overallChange,
            unique_workers_tw: twMetrics.uniqueWorkers,
            unique_workers_lw: lwMetrics.uniqueWorkers,
            active_contractors: twMetrics.activeContractors,
        }
    })
    return 1
}


// ─── Worker of the Month ────────────────────────────────────────────────────

async function selectWorkerOfMonth(supabase: any, siteId: string): Promise<number> {
    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 1)

    const { data: logs } = await supabase
        .from('access_logs')
        .select('person_id, people!inner(full_name)')
        .eq('site_id', siteId)
        .gte('entry_at', lastMonth.toISOString())
        .is('voided_at', null)

    if (!logs || logs.length === 0) return 0

    const attendance: Record<string, { name: string; count: number }> = {}
    logs.forEach((log: any) => {
        if (!attendance[log.person_id]) {
            attendance[log.person_id] = { name: log.people?.full_name || 'Trabajador', count: 0 }
        }
        attendance[log.person_id].count++
    })

    const winner = Object.entries(attendance)
        .sort(([, a], [, b]) => b.count - a.count)[0]

    if (winner) {
        await sendAlert(supabase, {
            site_id: siteId,
            alert_type: 'worker_of_month',
            title: '🏅 Trabajador del Mes',
            body: `${winner[1].name} con ${winner[1].count} asistencias el mes pasado`,
            data: { person_id: winner[0], days: winner[1].count }
        })
        return 1
    }
    return 0
}

// ─── Meeting Reminders ──────────────────────────────────────────────────────

async function checkMeetingReminders(supabase: any, siteId: string): Promise<number> {
    const now = new Date()
    const in30min = new Date(now.getTime() + 30 * 60 * 1000)

    const { data: meetings } = await supabase
        .from('scheduled_meetings')
        .select('*')
        .eq('site_id', siteId)
        .eq('notified', false)
        .gte('scheduled_at', now.toISOString())
        .lte('scheduled_at', in30min.toISOString())

    let sent = 0
    for (const meeting of meetings || []) {
        await sendAlert(supabase, {
            site_id: siteId,
            alert_type: 'meeting_reminder',
            title: '📅 Reunión Próxima',
            body: `"${meeting.title}" en 30 minutos`,
            data: { meeting_id: meeting.id }
        })

        await supabase
            .from('scheduled_meetings')
            .update({ notified: true })
            .eq('id', meeting.id)
        sent++
    }
    return sent
}

// ─── Overtime Check (server-side) ───────────────────────────────────────────

async function checkOvertime(supabase: any, siteId: string, settings: any): Promise<number> {
    if (!settings.overtime_enabled) return 0

    const thresholdHours = settings.overtime_hours || 12
    const cutoffTime = new Date(Date.now() - thresholdHours * 60 * 60 * 1000).toISOString()

    const { data: overtime } = await supabase
        .from('access_logs')
        .select('id, name_snapshot, contractor_snapshot, entry_at')
        .eq('site_id', siteId)
        .is('exit_at', null)
        .is('voided_at', null)
        .lt('entry_at', cutoffTime)
        .limit(20)

    if (overtime && overtime.length > 0) {
        const lines = overtime.map((p: any) => {
            const hours = Math.round((Date.now() - new Date(p.entry_at).getTime()) / 3600000)
            const contractor = p.contractor_snapshot ? ` (${p.contractor_snapshot})` : ''
            return `• ${p.name_snapshot}${contractor} — ${hours}h`
        })
        await sendAlert(supabase, {
            site_id: siteId,
            alert_type: 'overtime',
            title: '⏰ Alerta de Horas Extras',
            body: `${overtime.length} persona(s) superan ${thresholdHours}h:\n${lines.join('\n')}`,
            data: { count: overtime.length, people: overtime }
        })
        return 1
    }
    return 0
}

// ─── Safety Milestone Check ─────────────────────────────────────────────────

async function checkSafetyMilestone(supabase: any, siteId: string, settings: any): Promise<number> {
    if (!settings.safety_milestone_enabled) return 0

    const milestoneDays = settings.safety_milestone_days || 30

    // Check last accident in alert_history
    const { data: lastAccident } = await supabase
        .from('alert_history')
        .select('sent_at')
        .eq('site_id', siteId)
        .eq('alert_type', 'accident_reported')
        .order('sent_at', { ascending: false })
        .limit(1)

    let daysSinceAccident = 999
    if (lastAccident && lastAccident.length > 0) {
        const lastDate = new Date(lastAccident[0].sent_at)
        daysSinceAccident = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
    }

    // Check if we hit a milestone (exact match to avoid spam)
    if (daysSinceAccident === milestoneDays) {
        await sendAlert(supabase, {
            site_id: siteId,
            alert_type: 'safety_milestone',
            title: '🛡️ ¡Meta de Seguridad Alcanzada!',
            body: `¡${milestoneDays} días consecutivos sin incidentes! 🎉`,
            data: { days: milestoneDays }
        })
        return 1
    }
    return 0
}

// ─── Helper: Send alert via send-alert Edge Function (HTTP) ─────────────────

async function sendAlert(_supabase: any, payload: any) {
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

        const response = await fetch(`${supabaseUrl}/functions/v1/send-alert`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceKey}`,
            },
            body: JSON.stringify(payload),
        })

        const result = await response.json()
        if (!response.ok) {
            console.error('send-alert error:', response.status, result)
        } else {
            console.log('send-alert OK:', result?.channels)
        }
    } catch (err) {
        console.error('Error calling send-alert:', err)
    }
}
