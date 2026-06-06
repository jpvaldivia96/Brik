// Telegram Bot Webhook - Bidirectional: alerts + interactive queries
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BOT_TOKEN = '8825992226:AAGHxy_dAXKo_FHOM6L46Sq4FvkUJ6zapdg'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserContext {
    userId: string
    siteId: string
    siteName: string
}

// ─── Main Handler ────────────────────────────────────────────────────────────

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const body = await req.json()
        const message = body?.message
        if (!message?.text) {
            return new Response('ok', { status: 200 })
        }

        const chatId = message.chat.id.toString()
        const text = message.text.trim()
        const firstName = message.from?.first_name || 'Usuario'

        // ── Public commands (no auth needed) ──
        if (text.startsWith('/start')) {
            await handleStart(supabase, chatId, text, firstName)
            return new Response('ok', { status: 200 })
        }

        if (text === '/help') {
            await handleHelp(chatId)
            return new Response('ok', { status: 200 })
        }

        // ── Resolve user context (auth required) ──
        const ctx = await resolveUserContext(supabase, chatId)

        if (!ctx) {
            await sendTG(chatId,
                `🔒 *No estás vinculado*\n\n` +
                `Para usar comandos, conecta tu cuenta:\n` +
                `📱 BRIK → Configuración → Alertas → *Conectar Telegram*\n\n` +
                `Tu Chat ID: \`${chatId}\``
            )
            return new Response('ok', { status: 200 })
        }

        // ── Route commands ──
        const cmd = text.split(' ')[0].toLowerCase()
        const args = text.substring(cmd.length).trim()

        switch (cmd) {
            case '/adentro':
                await handleAdentro(supabase, chatId, ctx)
                break
            case '/hoy':
                await handleHoy(supabase, chatId, ctx)
                break
            case '/buscar':
                await handleBuscar(supabase, chatId, ctx, args)
                break
            case '/contratista':
                await handleContratista(supabase, chatId, ctx, args)
                break
            case '/favoritos':
                await handleFavoritos(supabase, chatId, ctx)
                break
            case '/horas':
                await handleHoras(supabase, chatId, ctx)
                break
            case '/overtime':
                await handleOvertime(supabase, chatId, ctx)
                break
            case '/status':
                await handleStatus(supabase, chatId)
                break
            case '/desconectar':
                await handleDesconectar(supabase, chatId)
                break
            default:
                // Try keyword matching for natural language
                await handleNatural(supabase, chatId, ctx, text)
                break
        }

        return new Response('ok', { status: 200 })
    } catch (error: any) {
        console.error('Webhook error:', error)
        return new Response('ok', { status: 200 })
    }
})

// ─── Context Resolution ──────────────────────────────────────────────────────

async function resolveUserContext(supabase: any, chatId: string): Promise<UserContext | null> {
    // Find user by telegram_chat_id in preferences
    const { data } = await supabase
        .from('user_notification_preferences')
        .select('user_id, site_id, sites!inner(name)')
        .eq('telegram_chat_id', chatId)
        .limit(1)
        .maybeSingle()

    if (!data) return null

    return {
        userId: data.user_id,
        siteId: data.site_id,
        siteName: (data as any).sites?.name || 'Obra',
    }
}

// ─── /start ──────────────────────────────────────────────────────────────────

async function handleStart(supabase: any, chatId: string, text: string, firstName: string) {
    const parts = text.split(' ')
    const userId = parts[1]

    if (userId) {
        const { data: memberships } = await supabase
            .from('site_memberships')
            .select('site_id')
            .eq('user_id', userId)

        let linked = 0
        for (const m of memberships || []) {
            const { error } = await supabase
                .from('user_notification_preferences')
                .upsert({
                    user_id: userId,
                    site_id: m.site_id,
                    telegram_chat_id: chatId,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'user_id,site_id' })
            if (!error) linked++
        }

        await sendTG(chatId,
            `✅ *Conectado exitosamente!*\n\n` +
            `Hola ${firstName}, tu cuenta BRIK esta vinculada.\n` +
            `Recibiras alertas de ${linked} obra(s) aqui.\n\n` +
            `Escribe /help para ver los comandos disponibles.`
        )
    } else {
        await sendTG(chatId,
            `👋 *Hola ${firstName}!*\n\n` +
            `Soy el bot de BRIK Pro.\n\n` +
            `Para conectar tu cuenta, ve a:\n` +
            `📱 BRIK → Configuración → Alertas → *Conectar Telegram*\n\n` +
            `Tu Chat ID: \`${chatId}\``
        )
    }
}

// ─── /help ───────────────────────────────────────────────────────────────────

async function handleHelp(chatId: string) {
    await sendTG(chatId,
        `🤖 *Comandos BRIK Bot*\n\n` +
        `📊 *Consultas en tiempo real:*\n` +
        `/adentro — Quién está en obra ahora\n` +
        `/hoy — Resumen del día\n` +
        `/buscar _nombre_ — Buscar persona\n` +
        `/contratista _nombre_ — Info de contratista\n` +
        `/favoritos — Estado de mis favoritos\n` +
        `/horas — Top horas del día\n` +
        `/overtime — Personas con horas extra\n\n` +
        `⚙️ *Configuración:*\n` +
        `/status — Ver estado de conexión\n` +
        `/desconectar — Dejar de recibir alertas\n` +
        `/help — Ver esta ayuda\n\n` +
        `💡 También puedes escribir en texto libre:\n` +
        `_"cuantos hay adentro"_, _"busca a pedro"_, etc.`
    )
}

// ─── /adentro ────────────────────────────────────────────────────────────────

async function handleAdentro(supabase: any, chatId: string, ctx: UserContext) {
    // People currently inside (entry without exit)
    const { data: inside } = await supabase
        .from('access_logs')
        .select('person_id, name_snapshot, contractor_snapshot, entry_at')
        .eq('site_id', ctx.siteId)
        .is('exit_at', null)
        .is('voided_at', null)
        .order('entry_at', { ascending: true })

    if (!inside || inside.length === 0) {
        await sendTG(chatId, `📊 *${ctx.siteName}*\n\nNo hay nadie adentro en este momento.`)
        return
    }

    // Group by contractor
    const byContractor = new Map<string, any[]>()
    for (const log of inside) {
        const c = log.contractor_snapshot || 'Sin Contratista'
        if (!byContractor.has(c)) byContractor.set(c, [])
        byContractor.get(c)!.push(log)
    }

    // Sort contractors by count (descending)
    const sorted = [...byContractor.entries()].sort((a, b) => b[1].length - a[1].length)

    let lines = [`📊 *${ctx.siteName}* — ${inside.length} personas adentro\n`]

    for (const [contractor, people] of sorted) {
        lines.push(`\n*${contractor}* (${people.length})`)
        // Show up to 5 names per contractor
        for (const p of people.slice(0, 5)) {
            const time = formatTime(p.entry_at)
            lines.push(`  • ${p.name_snapshot} _(${time})_`)
        }
        if (people.length > 5) {
            lines.push(`  _...y ${people.length - 5} más_`)
        }
    }

    await sendTG(chatId, lines.join('\n'))
}

// ─── /hoy ────────────────────────────────────────────────────────────────────

async function handleHoy(supabase: any, chatId: string, ctx: UserContext) {
    const todayStart = getTodayStartBolivia()

    // Today's entries
    const { data: entries, count: entryCount } = await supabase
        .from('access_logs')
        .select('name_snapshot, contractor_snapshot, entry_at, exit_at', { count: 'exact' })
        .eq('site_id', ctx.siteId)
        .gte('entry_at', todayStart)
        .is('voided_at', null)
        .order('entry_at', { ascending: true })

    if (!entries || entries.length === 0) {
        await sendTG(chatId, `📅 *${ctx.siteName}* — Hoy\n\nAún no hay registros hoy.`)
        return
    }

    const exitCount = entries.filter((e: any) => e.exit_at).length
    const insideCount = entries.filter((e: any) => !e.exit_at).length
    const uniqueWorkers = new Set(entries.map((e: any) => e.name_snapshot)).size

    // First and last entry
    const first = entries[0]
    const last = entries[entries.length - 1]

    // Unique contractors
    const contractors = new Set(entries.map((e: any) => e.contractor_snapshot).filter(Boolean))

    let msg = [
        `📅 *${ctx.siteName}* — Resumen de Hoy\n`,
        `📥 Entradas: *${entryCount}*`,
        `📤 Salidas: *${exitCount}*`,
        `👷 Adentro ahora: *${insideCount}*`,
        `👤 Personas unicas: *${uniqueWorkers}*`,
        `🏗️ Contratistas: *${contractors.size}*`,
        ``,
        `⏰ Primera entrada: ${formatTime(first.entry_at)}`,
        `   ${first.name_snapshot}${first.contractor_snapshot ? ` (${first.contractor_snapshot})` : ''}`,
    ]

    if (entries.length > 1) {
        msg.push(
            `⏰ Ultima entrada: ${formatTime(last.entry_at)}`,
            `   ${last.name_snapshot}${last.contractor_snapshot ? ` (${last.contractor_snapshot})` : ''}`,
        )
    }

    await sendTG(chatId, msg.join('\n'))
}

// ─── /buscar <nombre> ────────────────────────────────────────────────────────

async function handleBuscar(supabase: any, chatId: string, ctx: UserContext, query: string) {
    if (!query) {
        await sendTG(chatId, `🔍 Uso: /buscar _nombre_\n\nEjemplo: /buscar Juan Perez`)
        return
    }

    // Search people by name (case insensitive)
    const { data: people } = await supabase
        .from('people')
        .select('id, full_name, ci, type, contractor')
        .eq('site_id', ctx.siteId)
        .ilike('full_name', `%${query}%`)
        .limit(5)

    if (!people || people.length === 0) {
        await sendTG(chatId, `🔍 No encontré a nadie con "${query}" en ${ctx.siteName}`)
        return
    }

    let lines: string[] = [`🔍 *Resultados para "${query}":*\n`]

    for (const person of people) {
        // Check if currently inside
        const { data: activeLog } = await supabase
            .from('access_logs')
            .select('entry_at')
            .eq('site_id', ctx.siteId)
            .eq('person_id', person.id)
            .is('exit_at', null)
            .is('voided_at', null)
            .order('entry_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        // Count recent attendance (last 7 days)
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)
        const { count: weekCount } = await supabase
            .from('access_logs')
            .select('*', { count: 'exact', head: true })
            .eq('site_id', ctx.siteId)
            .eq('person_id', person.id)
            .gte('entry_at', weekAgo.toISOString())
            .is('voided_at', null)

        const status = activeLog
            ? `✅ Adentro desde ${formatTime(activeLog.entry_at)}`
            : `⬜ Fuera`

        const contractor = person.contractor ? ` — ${person.contractor}` : ''

        lines.push(
            `*${person.full_name}*${contractor}`,
            `   CI: ${person.ci || 'N/A'} · ${person.type === 'worker' ? 'Trabajador' : 'Visitante'}`,
            `   ${status}`,
            `   Ult. 7 dias: ${weekCount || 0} asistencias`,
            ``
        )
    }

    await sendTG(chatId, lines.join('\n'))
}

// ─── /contratista <nombre> ───────────────────────────────────────────────────

async function handleContratista(supabase: any, chatId: string, ctx: UserContext, query: string) {
    if (!query) {
        // List all contractors with current count
        const { data: inside } = await supabase
            .from('access_logs')
            .select('contractor_snapshot')
            .eq('site_id', ctx.siteId)
            .is('exit_at', null)
            .is('voided_at', null)

        if (!inside || inside.length === 0) {
            await sendTG(chatId, `🏗️ No hay nadie adentro ahora.`)
            return
        }

        const counts = new Map<string, number>()
        for (const log of inside) {
            const c = log.contractor_snapshot || 'Sin Contratista'
            counts.set(c, (counts.get(c) || 0) + 1)
        }

        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
        let lines = [`🏗️ *Contratistas en ${ctx.siteName}:*\n`]
        for (const [name, count] of sorted) {
            lines.push(`  • *${name}*: ${count} personas`)
        }
        lines.push(`\n_Detalle: /contratista NombreContratista_`)

        await sendTG(chatId, lines.join('\n'))
        return
    }

    // Search for specific contractor
    const { data: allPeople } = await supabase
        .from('people')
        .select('id, full_name')
        .eq('site_id', ctx.siteId)
        .ilike('contractor', `%${query}%`)

    if (!allPeople || allPeople.length === 0) {
        await sendTG(chatId, `🏗️ No encontre contratista "${query}"`)
        return
    }

    // Check who's inside today
    const todayStart = getTodayStartBolivia()
    const personIds = allPeople.map((p: any) => p.id)

    const { data: todayLogs } = await supabase
        .from('access_logs')
        .select('person_id, name_snapshot, entry_at, exit_at')
        .eq('site_id', ctx.siteId)
        .in('person_id', personIds)
        .gte('entry_at', todayStart)
        .is('voided_at', null)

    const presentIds = new Set((todayLogs || []).map((l: any) => l.person_id))
    const insideNow = (todayLogs || []).filter((l: any) => !l.exit_at)
    const absent = allPeople.filter((p: any) => !presentIds.has(p.id))

    // Get contractor name from first match
    const contractorName = query.toUpperCase()

    let lines = [
        `🏗️ *${contractorName}* — ${ctx.siteName}\n`,
        `👷 Total registrados: *${allPeople.length}*`,
        `✅ Presentes hoy: *${presentIds.size}*`,
        `🟢 Adentro ahora: *${insideNow.length}*`,
        `❌ Ausentes: *${absent.length}*`,
    ]

    if (insideNow.length > 0) {
        lines.push(`\n_Adentro ahora:_`)
        for (const log of insideNow.slice(0, 8)) {
            lines.push(`  • ${log.name_snapshot} _(${formatTime(log.entry_at)})_`)
        }
        if (insideNow.length > 8) lines.push(`  _...y ${insideNow.length - 8} mas_`)
    }

    if (absent.length > 0 && absent.length <= 10) {
        lines.push(`\n_Ausentes hoy:_`)
        for (const p of absent) {
            lines.push(`  • ${p.full_name}`)
        }
    } else if (absent.length > 10) {
        lines.push(`\n_Ausentes hoy: ${absent.slice(0, 5).map((p: any) => p.full_name).join(', ')}... y ${absent.length - 5} mas_`)
    }

    await sendTG(chatId, lines.join('\n'))
}

// ─── /favoritos ──────────────────────────────────────────────────────────────

async function handleFavoritos(supabase: any, chatId: string, ctx: UserContext) {
    // Get user's favorites
    const { data: favs } = await supabase
        .from('favorites')
        .select('person_id, is_blocked, people!inner(full_name, contractor)')
        .eq('site_id', ctx.siteId)
        .eq('user_id', ctx.userId)
        .eq('is_blocked', false)

    if (!favs || favs.length === 0) {
        await sendTG(chatId,
            `⭐ *Mis Favoritos* — ${ctx.siteName}\n\n` +
            `No tienes favoritos configurados.\n` +
            `Agrega favoritos desde la app BRIK.`
        )
        return
    }

    let activeList: string[] = []
    let absentList: string[] = []

    for (const fav of favs) {
        const name = (fav as any).people?.full_name || '???'
        const contractor = (fav as any).people?.contractor || ''

        // Check if currently inside
        const { data: activeLog } = await supabase
            .from('access_logs')
            .select('entry_at')
            .eq('site_id', ctx.siteId)
            .eq('person_id', fav.person_id)
            .is('exit_at', null)
            .is('voided_at', null)
            .limit(1)
            .maybeSingle()

        if (activeLog) {
            activeList.push(`  ✅ *${name}* — adentro desde ${formatTime(activeLog.entry_at)}${contractor ? ` (${contractor})` : ''}`)
        } else {
            absentList.push(`  ⬜ ${name}${contractor ? ` (${contractor})` : ''}`)
        }
    }

    let lines = [`⭐ *Mis Favoritos* — ${ctx.siteName}\n`]

    if (activeList.length > 0) {
        lines.push(`_En obra (${activeList.length}):_`)
        lines.push(...activeList)
    }
    if (absentList.length > 0) {
        lines.push(`\n_Fuera (${absentList.length}):_`)
        lines.push(...absentList)
    }

    await sendTG(chatId, lines.join('\n'))
}

// ─── /horas ──────────────────────────────────────────────────────────────────

async function handleHoras(supabase: any, chatId: string, ctx: UserContext) {
    // People currently inside, ordered by entry time (longest first)
    const { data: inside } = await supabase
        .from('access_logs')
        .select('name_snapshot, contractor_snapshot, entry_at')
        .eq('site_id', ctx.siteId)
        .is('exit_at', null)
        .is('voided_at', null)
        .order('entry_at', { ascending: true })
        .limit(10)

    if (!inside || inside.length === 0) {
        await sendTG(chatId, `⏱️ *${ctx.siteName}*\n\nNo hay nadie adentro.`)
        return
    }

    const now = Date.now()
    let lines = [`⏱️ *Top Horas* — ${ctx.siteName}\n`]

    inside.forEach((log: any, i: number) => {
        const hours = ((now - new Date(log.entry_at).getTime()) / 3600000).toFixed(1)
        const contractor = log.contractor_snapshot ? ` (${log.contractor_snapshot})` : ''
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
        lines.push(`${medal} *${log.name_snapshot}*${contractor} — ${hours}h`)
    })

    await sendTG(chatId, lines.join('\n'))
}

// ─── /overtime ───────────────────────────────────────────────────────────────

async function handleOvertime(supabase: any, chatId: string, ctx: UserContext) {
    // Get overtime threshold from settings (default 12h)
    const { data: settings } = await supabase
        .from('alert_settings')
        .select('overtime_hours')
        .eq('site_id', ctx.siteId)
        .maybeSingle()

    const thresholdHours = settings?.overtime_hours || 12
    const cutoff = new Date(Date.now() - thresholdHours * 3600000).toISOString()

    const { data: overtime } = await supabase
        .from('access_logs')
        .select('name_snapshot, contractor_snapshot, entry_at')
        .eq('site_id', ctx.siteId)
        .is('exit_at', null)
        .is('voided_at', null)
        .lt('entry_at', cutoff)
        .order('entry_at', { ascending: true })

    if (!overtime || overtime.length === 0) {
        await sendTG(chatId,
            `⏰ *Overtime* — ${ctx.siteName}\n\n` +
            `Ninguna persona supera ${thresholdHours}h. Todo bien! ✅`
        )
        return
    }

    const now = Date.now()
    let lines = [
        `⏰ *Overtime* — ${ctx.siteName}`,
        `${overtime.length} persona(s) superan ${thresholdHours}h:\n`,
    ]

    for (const log of overtime) {
        const hours = ((now - new Date(log.entry_at).getTime()) / 3600000).toFixed(1)
        const contractor = log.contractor_snapshot ? ` (${log.contractor_snapshot})` : ''
        lines.push(`  ⚠️ *${log.name_snapshot}*${contractor} — ${hours}h`)
    }

    await sendTG(chatId, lines.join('\n'))
}

// ─── /status ─────────────────────────────────────────────────────────────────

async function handleStatus(supabase: any, chatId: string) {
    const { data } = await supabase
        .from('user_notification_preferences')
        .select('site_id, sites!inner(name)')
        .eq('telegram_chat_id', chatId)

    if (data && data.length > 0) {
        const sites = data.map((d: any) => `  • ${d.sites?.name || d.site_id}`).join('\n')
        await sendTG(chatId,
            `✅ *Estado: Conectado*\n\nObras vinculadas:\n${sites}\n\n` +
            `Escribe /help para ver comandos.`
        )
    } else {
        await sendTG(chatId,
            `❌ *No estás conectado*\n\nVe a BRIK → Alertas → Conectar Telegram`
        )
    }
}

// ─── /desconectar ────────────────────────────────────────────────────────────

async function handleDesconectar(supabase: any, chatId: string) {
    await supabase
        .from('user_notification_preferences')
        .update({ telegram_chat_id: null })
        .eq('telegram_chat_id', chatId)

    await sendTG(chatId,
        `🔌 *Desconectado*\n\nYa no recibiras alertas de BRIK aqui.`
    )
}

// ─── Natural Language (keyword matching) ─────────────────────────────────────

async function handleNatural(supabase: any, chatId: string, ctx: UserContext, text: string) {
    const lower = text.toLowerCase()

    // Match patterns
    if (lower.includes('adentro') || lower.includes('cuantos') || lower.includes('cuántos') || lower.includes('dentro') || lower.includes('presentes')) {
        await handleAdentro(supabase, chatId, ctx)
    } else if (lower.includes('hoy') || lower.includes('resumen') || lower.includes('dia') || lower.includes('día')) {
        await handleHoy(supabase, chatId, ctx)
    } else if (lower.includes('favorito') || lower.includes('estrella')) {
        await handleFavoritos(supabase, chatId, ctx)
    } else if (lower.includes('hora') || lower.includes('tiempo')) {
        await handleHoras(supabase, chatId, ctx)
    } else if (lower.includes('overtime') || lower.includes('extra')) {
        await handleOvertime(supabase, chatId, ctx)
    } else if (lower.startsWith('busca ') || lower.startsWith('quien es ') || lower.startsWith('quién es ')) {
        const name = text.replace(/^(busca a |busca |quien es |quién es )/i, '').trim()
        await handleBuscar(supabase, chatId, ctx, name)
    } else {
        await sendTG(chatId,
            `🤔 No entendi tu mensaje.\n\n` +
            `Escribe /help para ver los comandos disponibles.`
        )
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTodayStartBolivia(): string {
    const now = new Date()
    // Bolivia = UTC-4
    const boliviaOffset = -4 * 60
    const boliviaNow = new Date(now.getTime() + (boliviaOffset + now.getTimezoneOffset()) * 60000)
    const todayStart = new Date(boliviaNow)
    todayStart.setHours(0, 0, 0, 0)
    // Convert back to UTC for DB query
    const todayStartUTC = new Date(todayStart.getTime() - (boliviaOffset + now.getTimezoneOffset()) * 60000)
    return todayStartUTC.toISOString()
}

function formatTime(isoDate: string): string {
    const d = new Date(isoDate)
    return d.toLocaleTimeString('es-BO', {
        timeZone: 'America/La_Paz',
        hour: '2-digit',
        minute: '2-digit',
    })
}

async function sendTG(chatId: string, text: string) {
    try {
        const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'Markdown',
                disable_web_page_preview: true,
            }),
        })
        const result = await resp.json()
        if (!result.ok) {
            console.error('Telegram send error:', result)
        }
    } catch (err) {
        console.error('Telegram send error:', err)
    }
}
