// Supabase Edge Function for Scheduled Alert Checks
// This runs periodically via cron jobs

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

        // Get all active sites
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
                switch (alert_type) {
                    case 'birthday':
                        await checkBirthdays(supabase, site.id)
                        break
                    case 'low_weekly_attendance':
                        await checkWeeklyAttendance(supabase, site.id)
                        break
                    case 'attendance_record':
                        await checkAttendanceRecord(supabase, site.id)
                        break
                    case 'contractor_inactive':
                        await checkInactiveContractors(supabase, site.id)
                        break
                    case 'exponential_growth':
                        await checkExponentialGrowth(supabase, site.id)
                        break
                    case 'worker_of_month':
                        await selectWorkerOfMonth(supabase, site.id)
                        break
                    case 'meeting_reminder':
                        await checkMeetingReminders(supabase, site.id)
                        break
                }
                processedSites++
            } catch (err) {
                console.error(`Error processing site ${site.id}:`, err)
            }
        }

        return new Response(
            JSON.stringify({ success: true, processed_sites: processedSites }),
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

async function checkBirthdays(supabase: any, siteId: string) {
    const today = new Date()
    const todayMD = `${today.getMonth() + 1}-${today.getDate()}`

    const { data: profiles } = await supabase
        .from('workers_profile')
        .select('person_id, person:people(name), birthday')
        .not('birthday', 'is', null)

    for (const profile of profiles || []) {
        if (!profile.birthday) continue
        const bday = new Date(profile.birthday)
        const bdayMD = `${bday.getMonth() + 1}-${bday.getDate()}`

        if (bdayMD === todayMD) {
            await sendAlert(supabase, {
                site_id: siteId,
                alert_type: 'birthday',
                title: '🎂 Cumpleaños en Obra',
                body: `${profile.person.name} cumple años hoy`,
                data: { person_id: profile.person_id }
            })
        }
    }
}

async function checkWeeklyAttendance(supabase: any, siteId: string) {
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

    const { count: totalWorkers } = await supabase
        .from('people')
        .select('*', { count: 'exact', head: true })

    const { count: activeWorkers } = await supabase
        .from('access_logs')
        .select('person_id', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .gte('entry_at', threeDaysAgo.toISOString())
        .is('voided_at', null)

    const attendanceRate = ((activeWorkers || 0) / (totalWorkers || 1)) * 100

    if (attendanceRate < 70) {
        await sendAlert(supabase, {
            site_id: siteId,
            alert_type: 'low_weekly_attendance',
            title: '📉 Baja Asistencia Semanal',
            body: `Solo ${attendanceRate.toFixed(0)}% de asistencia en los últimos 3 días`,
            data: { rate: attendanceRate }
        })
    }
}

async function checkAttendanceRecord(supabase: any, siteId: string) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { count: todayCount } = await supabase
        .from('access_logs')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .gte('entry_at', today.toISOString())
        .is('voided_at', null)

    // Get historical max (simplified - in production, use separate table)
    const { count: historicalMax } = await supabase
        .from('access_logs')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .is('voided_at', null)

    if (todayCount && todayCount > (historicalMax || 0) * 0.95) {
        await sendAlert(supabase, {
            site_id: siteId,
            alert_type: 'attendance_record',
            title: '🏆 Récord de Asistencia',
            body: `¡Hoy asistieron ${todayCount} personas!`,
            data: { count: todayCount }
        })
    }
}

async function checkInactiveContractors(supabase: any, siteId: string) {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data: contractors } = await supabase
        .from('contractors')
        .select('id, name')
        .eq('site_id', siteId)

    for (const contractor of contractors || []) {
        const { count } = await supabase
            .from('access_logs')
            .select('*', { count: 'exact', head: true })
            .eq('site_id', siteId)
            .eq('contractor_id', contractor.id)
            .gte('entry_at', sevenDaysAgo.toISOString())

        if (count === 0) {
            await sendAlert(supabase, {
                site_id: siteId,
                alert_type: 'contractor_inactive',
                title: '⚠️ Contratista Sin Actividad',
                body: `${contractor.name} sin trabajadores hace 7+ días`,
                data: { contractor_id: contractor.id }
            })
        }
    }
}

async function checkExponentialGrowth(supabase: any, siteId: string) {
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

    const growth = ((thisWeekCount || 0) - (lastWeekCount || 1)) / (lastWeekCount || 1) * 100

    if (growth > 30) {
        await sendAlert(supabase, {
            site_id: siteId,
            alert_type: 'exponential_growth',
            title: '📈 Crecimiento Exponencial',
            body: `+${growth.toFixed(0)}% más personas que la semana pasada`,
            data: { growth_percent: growth }
        })
    }
}

async function selectWorkerOfMonth(supabase: any, siteId: string) {
    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 1)

    // Get worker with best attendance
    const { data: logs } = await supabase
        .from('access_logs')
        .select('person_id, person:people(name)')
        .eq('site_id', siteId)
        .gte('entry_at', lastMonth.toISOString())
        .is('voided_at', null)

    if (!logs || logs.length === 0) return

    // Count attendance per person
    const attendance: Record<string, { name: string; count: number }> = {}
    logs.forEach((log: any) => {
        if (!attendance[log.person_id]) {
            attendance[log.person_id] = { name: log.person.name, count: 0 }
        }
        attendance[log.person_id].count++
    })

    const winner = Object.entries(attendance)
        .sort(([, a], [, b]) => b.count - a.count)[0]

    if (winner) {
        await sendAlert(supabase, {
            site_id: siteId,
            alert_type: 'worker_of_month',
            title: '🏆 Trabajador del Mes',
            body: `${winner[1].name} con ${winner[1].count} asistencias`,
            data: { person_id: winner[0], days: winner[1].count }
        })
    }
}

async function checkMeetingReminders(supabase: any, siteId: string) {
    const now = new Date()
    const in30min = new Date(now.getTime() + 30 * 60 * 1000)

    const { data: meetings } = await supabase
        .from('scheduled_meetings')
        .select('*')
        .eq('site_id', siteId)
        .eq('notified', false)
        .gte('scheduled_at', now.toISOString())
        .lte('scheduled_at', in30min.toISOString())

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
    }
}

async function sendAlert(supabase: any, payload: any) {
    await supabase.functions.invoke('send-alert', { body: payload })
}
