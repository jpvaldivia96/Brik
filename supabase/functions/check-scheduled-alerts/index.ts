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

    // Get total registered workers for this site
    const { count: totalWorkers } = await supabase
        .from('access_logs')
        .select('person_id', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .is('voided_at', null)

    // Get today's unique entries
    const { data: todayEntries } = await supabase
        .from('access_logs')
        .select('person_id')
        .eq('site_id', siteId)
        .gte('entry_at', todayStart.toISOString())
        .is('voided_at', null)

    const uniqueToday = new Set((todayEntries || []).map((e: any) => e.person_id)).size
    const rate = totalWorkers ? (uniqueToday / totalWorkers) * 100 : 0

    if (rate < threshold) {
        await sendAlert(supabase, {
            site_id: siteId,
            alert_type: 'contractor_attendance',
            title: '👷 Baja Asistencia de Contratistas',
            body: `Asistencia actual: ${rate.toFixed(0)}% (${uniqueToday} de ${totalWorkers} registrados). Umbral: ${threshold}%`,
            data: { rate, unique_today: uniqueToday, total: totalWorkers, threshold }
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

// ─── Exponential Growth Check ───────────────────────────────────────────────

async function checkExponentialGrowth(supabase: any, siteId: string, settings: any): Promise<number> {
    if (!settings.exponential_growth_enabled) return 0

    const growthThreshold = settings.exponential_growth_threshold || 30
    const thisWeek = new Date()
    thisWeek.setDate(thisWeek.getDate() - 7)
    const lastWeek = new Date()
    lastWeek.setDate(lastWeek.getDate() - 14)

    const { count: thisWeekCount } = await supabase
        .from('access_logs')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .gte('entry_at', thisWeek.toISOString())

    const { count: lastWeekCount } = await supabase
        .from('access_logs')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .gte('entry_at', lastWeek.toISOString())
        .lt('entry_at', thisWeek.toISOString())

    const growth = lastWeekCount ? ((thisWeekCount || 0) - lastWeekCount) / lastWeekCount * 100 : 0

    if (growth > growthThreshold) {
        await sendAlert(supabase, {
            site_id: siteId,
            alert_type: 'exponential_growth',
            title: '📈 Crecimiento Exponencial',
            body: `+${growth.toFixed(0)}% más entradas vs semana pasada (${thisWeekCount} vs ${lastWeekCount})`,
            data: { growth_percent: growth, this_week: thisWeekCount, last_week: lastWeekCount }
        })
        return 1
    }
    return 0
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
        .select('id, name_snapshot, entry_at')
        .eq('site_id', siteId)
        .is('exit_at', null)
        .is('voided_at', null)
        .lt('entry_at', cutoffTime)
        .limit(10)

    if (overtime && overtime.length > 0) {
        const names = overtime.map((p: any) => p.name_snapshot).join(', ')
        await sendAlert(supabase, {
            site_id: siteId,
            alert_type: 'overtime',
            title: '⏰ Alerta de Horas Extras',
            body: `${overtime.length} persona(s) superaron ${thresholdHours}h en obra: ${names}`,
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

// ─── Helper: Send alert via send-alert Edge Function ────────────────────────

async function sendAlert(supabase: any, payload: any) {
    try {
        await supabase.functions.invoke('send-alert', { body: payload })
    } catch (err) {
        console.error('Error sending alert:', err)
    }
}
