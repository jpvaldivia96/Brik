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

        if (text === '/debug') {
            // Debug: test DB connectivity
            const hasServiceKey = !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
            const { data: testData, error: testError } = await supabase
                .from('user_notification_preferences')
                .select('user_id, site_id, telegram_chat_id')
                .eq('telegram_chat_id', chatId)
            
            await sendTG(chatId,
                `🔧 Debug Info:\n` +
                `Service Key: ${hasServiceKey ? 'YES' : 'NO'}\n` +
                `Chat ID: ${chatId}\n` +
                `DB Query Error: ${testError ? testError.message : 'none'}\n` +
                `DB Rows Found: ${testData?.length || 0}\n` +
                `Data: ${JSON.stringify(testData)}`
            )
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
        // Send error to user for debugging
        try {
            const body2 = await req.clone().json().catch(() => null)
            const errChatId = body2?.message?.chat?.id?.toString()
            if (errChatId) {
                await sendTG(errChatId, `❌ Error: ${error?.message || String(error)}`)
            }
        } catch (_) {}
        return new Response('ok', { status: 200 })
    }
})

// ─── Context Resolution ──────────────────────────────────────────────────────

async function resolveUserContext(supabase: any, chatId: string): Promise<UserContext | null> {
    try {
        const { data, error } = await supabase
            .from('user_notification_preferences')
            .select('user_id, site_id')
            .eq('telegram_chat_id', chatId)
            .limit(1)

        if (error) {
            console.error('resolveUserContext error:', error)
            return null
        }
        if (!data || data.length === 0) return null

        const row = data[0]

        // Get site name separately
        let siteName = 'Obra'
        const { data: siteData } = await supabase
            .from('sites')
            .select('name')
            .eq('id', row.site_id)
            .limit(1)

        if (siteData?.[0]?.name) siteName = siteData[0].name

        return {
            userId: row.user_id,
            siteId: row.site_id,
            siteName,
        }
    } catch (err) {
        console.error('resolveUserContext exception:', err)
        return null
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
    // Get all contractors for this site
    const { data: allContractors } = await supabase
        .from('contractors')
        .select('name')
        .eq('site_id', ctx.siteId)
        .order('name')

    // Get people inside
    const { data: inside } = await supabase
        .from('access_logs')
        .select('contractor_snapshot')
        .eq('site_id', ctx.siteId)
        .is('exit_at', null)
        .is('voided_at', null)

    // Count by contractor from people inside
    const byC: Record<string, number> = {}
    for (const log of (inside || [])) {
        const c = log.contractor_snapshot || 'Sin Contratista'
        byC[c] = (byC[c] || 0) + 1
    }

    // Merge with all contractors (add 0s for those not inside)
    for (const c of (allContractors || [])) {
        if (c.name && !(c.name in byC)) {
            byC[c.name] = 0
        }
    }

    const sorted = Object.entries(byC).sort((a, b) => b[1] - a[1])
    const total = (inside || []).length

    let msg = `📊 *${esc(ctx.siteName)}*\n👷 *${total}* personas adentro\n`

    for (const [c, n] of sorted) {
        const icon = n > 0 ? '🟢' : '⚪'
        msg += `\n${icon} ${esc(c)}: *${n}*`
    }

    msg += `\n\n💡 /contratista nombre`

    await sendTG(chatId, msg)
}

// ─── /hoy ────────────────────────────────────────────────────────────────────

async function handleHoy(supabase: any, chatId: string, ctx: UserContext, relativeDay: string = 'today') {
    const { start, end } = getBoliviaDayRange(relativeDay)

    // Today's entries
    const { data: entries, count: entryCount } = await supabase
        .from('access_logs')
        .select('name_snapshot, contractor_snapshot, entry_at, exit_at', { count: 'exact' })
        .eq('site_id', ctx.siteId)
        .gte('entry_at', start)
        .lte('entry_at', end)
        .is('voided_at', null)
        .order('entry_at', { ascending: true })

    const dateLabel = relativeDay === 'today' ? 'Hoy' : relativeDay === 'yesterday' ? 'Ayer' : relativeDay

    if (!entries || entries.length === 0) {
        await sendTG(chatId, `📅 *${esc(ctx.siteName)}* — ${dateLabel}\n\nNo hay registros para este día.`)
        return
    }

    const exitCount = entries.filter((e: any) => e.exit_at && e.exit_at <= end).length
    const insideCount = entries.filter((e: any) => !e.exit_at || e.exit_at > end).length
    const uniqueWorkers = new Set(entries.map((e: any) => e.name_snapshot)).size

    // First and last entry
    const first = entries[0]
    const last = entries[entries.length - 1]

    // Unique contractors
    const contractors = new Set(entries.map((e: any) => e.contractor_snapshot).filter(Boolean))

    let msg = [
        `📅 *${esc(ctx.siteName)}* — Resumen de ${dateLabel}\n`,
        `📥 Entradas: *${entryCount}*`,
        `📤 Salidas: *${exitCount}*`,
        relativeDay === 'today' ? `👷 Adentro ahora: *${insideCount}*` : `👷 Se quedaron adentro: *${insideCount}*`,
        `👤 Personas unicas: *${uniqueWorkers}*`,
        `🏗️ Contratistas: *${contractors.size}*`,
        ``,
        `⏰ Primera entrada: ${formatTime(first.entry_at)}`,
        `   ${esc(first.name_snapshot)}${first.contractor_snapshot ? ` (${esc(first.contractor_snapshot)})` : ''}`,
    ]

    if (entries.length > 1) {
        msg.push(
            `⏰ Ultima entrada: ${formatTime(last.entry_at)}`,
            `   ${esc(last.name_snapshot)}${last.contractor_snapshot ? ` (${esc(last.contractor_snapshot)})` : ''}`,
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

async function handleContratista(supabase: any, chatId: string, ctx: UserContext, query: string, relativeDay: string = 'today', detail: boolean = false) {
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
        let lines = [`🏗️ *Contratistas en ${esc(ctx.siteName)}:*\n`]
        for (const [name, count] of sorted) {
            lines.push(`  • *${esc(name)}*: ${count} personas`)
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
        await sendTG(chatId, `🏗️ No encontre contratista "${esc(query)}"`)
        return
    }

    // Check who's inside / entered in the date range
    const { start, end } = getBoliviaDayRange(relativeDay)
    const personIds = allPeople.map((p: any) => p.id)

    const { data: rangeLogs } = await supabase
        .from('access_logs')
        .select('person_id, name_snapshot, entry_at, exit_at')
        .eq('site_id', ctx.siteId)
        .in('person_id', personIds)
        .gte('entry_at', start)
        .lte('entry_at', end)
        .is('voided_at', null)

    const presentIds = new Set((rangeLogs || []).map((l: any) => l.person_id))
    const contractorName = query.toUpperCase()
    const dateLabel = relativeDay === 'today' ? 'Hoy' : relativeDay === 'yesterday' ? 'Ayer' : relativeDay

    const total = allPeople.length
    const present = presentIds.size
    const absent = total - present

    let lines = [
        `🏗️ *${esc(contractorName)}* — ${esc(ctx.siteName)} (${dateLabel})\n`,
        `👷 *${present}* trabajadores presentes de *${total}* registrados (${absent} ausentes)`,
    ]

    if (present > 0) {
        if (detail) {
            lines.push(`\n*Horarios de ingreso/salida:*`)
            for (const log of (rangeLogs || []).slice(0, 15)) {
                const exitTime = log.exit_at && log.exit_at <= end ? ` - Salió ${formatTime(log.exit_at)}` : ''
                lines.push(`  • *${esc(log.name_snapshot)}* _(Entró ${formatTime(log.entry_at)}${exitTime})_`)
            }
            if (rangeLogs.length > 15) lines.push(`  _...y ${rangeLogs.length - 15} más_`)
        } else {
            lines.push(`\n*Trabajadores presentes:*`)
            const uniqueNamesInLogs = [...new Set((rangeLogs || []).map((l: any) => l.name_snapshot))]
            for (const name of uniqueNamesInLogs.slice(0, 12)) {
                lines.push(`  • ${esc(name)}`)
            }
            if (uniqueNamesInLogs.length > 12) {
                lines.push(`  _... y ${uniqueNamesInLogs.length - 12} más_`)
            }
            lines.push(
                `\n💡 Si quieres ver los horarios detallados de entrada/salida, pídeme las "horas" o "detalle" de este contratista.`
            )
        }
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
        .select('site_id')
        .eq('telegram_chat_id', chatId)

    if (data && data.length > 0) {
        // Get site names separately
        const siteNames: string[] = []
        for (const d of data) {
            const { data: site } = await supabase.from('sites').select('name').eq('id', d.site_id).maybeSingle()
            siteNames.push(`  • ${site?.name || d.site_id}`)
        }
        await sendTG(chatId,
            `✅ *Estado: Conectado*\n\nObras vinculadas:\n${siteNames.join('\n')}\n\n` +
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
    // Check if any AI provider is available
    const hasAI = Deno.env.get('OPENROUTER_API_KEY') || Deno.env.get('GROQ_API_KEY') || Deno.env.get('GEMINI_API_KEY')
    
    // Fallback to keyword matching if no AI is configured
    if (!hasAI) {
        const lower = text.toLowerCase()
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
        return
    }

    // Process with AI (multi-provider chain)
    try {
        const boliviaNow = new Date(Date.now() - 4 * 60 * 60 * 1000)
        const todayDateStr = boliviaNow.toISOString().split('T')[0]
        const dayOfWeekStr = boliviaNow.toLocaleDateString('es-BO', { weekday: 'long' })
        const prompt = `You are an AI assistant for a construction site gate access system.
Today is ${dayOfWeekStr}, ${todayDateStr} (Bolivia time).

Classify the user's input into one of these commands:
- /adentro (who is inside)
- /hoy (today's summary or summary of another day)
- /buscar (search for a specific person, requires name)
- /contratista (info about a specific contractor, requires name)
- /favoritos (status of favorite people)
- /horas (top hours worked today)
- /overtime (people working overtime)

User Input: "${text}"

Respond ONLY with a valid JSON object matching this schema, nothing else:
{"command": "/command_name", "arg": "argument if required, or null", "date": "relative date like 'today', 'yesterday', or a specific date in 'YYYY-MM-DD' format if mentioned, resolved using today's date ${todayDateStr} (default is 'today')", "detail": false}
`

        let resultText: string | null = null

        // ─── 1. OpenRouter (FREE, 20 RPM) ───
        const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')
        if (!resultText && openrouterKey) {
            const orModels = ['qwen/qwen3-30b-a3b:free', 'meta-llama/llama-4-maverick:free']
            for (const model of orModels) {
                try {
                    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openrouterKey}` },
                        body: JSON.stringify({
                            model,
                            messages: [{ role: 'user', content: prompt }],
                            temperature: 0,
                            response_format: { type: 'json_object' },
                        })
                    })
                    if (resp.ok) {
                        const d = await resp.json()
                        resultText = d.choices?.[0]?.message?.content || null
                        if (resultText) { console.log(`[TG OK] OpenRouter ${model}`); break }
                    } else {
                        console.warn(`[TG OpenRouter] ${model}: HTTP ${resp.status}`)
                    }
                } catch (e) { console.error(`[TG OpenRouter] ${model}: ${e.message}`) }
            }
        }

        // ─── 2. Groq (30 RPM) ───
        const groqKey = Deno.env.get('GROQ_API_KEY')
        if (!resultText && groqKey) {
            const groqModels = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
            for (const model of groqModels) {
                try {
                    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
                        body: JSON.stringify({
                            model,
                            messages: [{ role: 'user', content: prompt }],
                            temperature: 0,
                            response_format: { type: 'json_object' },
                        })
                    })
                    if (resp.ok) {
                        const d = await resp.json()
                        resultText = d.choices?.[0]?.message?.content || null
                        if (resultText) { console.log(`[TG OK] Groq ${model}`); break }
                    } else {
                        console.warn(`[TG Groq] ${model}: HTTP ${resp.status}`)
                    }
                } catch (e) { console.error(`[TG Groq] ${model}: ${e.message}`) }
            }
        }

        // ─── 3. Gemini native (last resort) ───
        const geminiKey = Deno.env.get('GEMINI_API_KEY')
        if (!resultText && geminiKey) {
            const gemModels = ['gemini-2.0-flash', 'gemini-2.0-flash-lite']
            for (const model of gemModels) {
                try {
                    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': geminiKey },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }],
                            generationConfig: { temperature: 0, responseMimeType: "application/json" }
                        })
                    })
                    if (resp.ok) {
                        const d = await resp.json()
                        resultText = d.candidates?.[0]?.content?.parts?.[0]?.text || null
                        if (resultText) { console.log(`[TG OK] Gemini ${model}`); break }
                    } else {
                        console.warn(`[TG Gemini] ${model}: HTTP ${resp.status}`)
                    }
                } catch (e) { console.error(`[TG Gemini] ${model}: ${e.message}`) }
            }
        }

        if (!resultText) {
            throw new Error('All AI providers failed')
        }

        const parsed = JSON.parse(resultText)

        // Dispatch based on Gemini classification
        switch (parsed.command) {
            case '/adentro':
                await handleAdentro(supabase, chatId, ctx)
                break
            case '/hoy':
                await handleHoy(supabase, chatId, ctx, parsed.date || 'today')
                break
            case '/buscar':
                if (parsed.arg) await handleBuscar(supabase, chatId, ctx, parsed.arg)
                else await sendTG(chatId, "⚠️ Dime el nombre de quién quieres buscar.")
                break
            case '/contratista':
                if (parsed.arg) await handleContratista(supabase, chatId, ctx, parsed.arg, parsed.date || 'today', !!parsed.detail)
                else await sendTG(chatId, "⚠️ Dime el nombre del contratista.")
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
            default:
                await sendTG(chatId,
                    `🤔 No entendi tu mensaje.\n\n` +
                    `Escribe /help para ver los comandos disponibles.`
                )
        }
    } catch (err) {
        console.error('NLP Error:', err)
        await sendTG(chatId, `❌ Ocurrió un error al procesar tu mensaje.`)
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getBoliviaDayRange(relativeDay: string): { start: string, end: string } {
    const now = new Date()
    // Bolivia = UTC-4
    const boliviaOffset = -4 * 60
    const boliviaNow = new Date(now.getTime() + (boliviaOffset + now.getTimezoneOffset()) * 60000)
    
    let targetDate = new Date(boliviaNow)
    
    if (relativeDay === 'yesterday') {
        targetDate.setDate(targetDate.getDate() - 1)
    } else if (relativeDay !== 'today') {
        // Try parsing YYYY-MM-DD
        const parsed = new Date(relativeDay + 'T00:00:00')
        if (!isNaN(parsed.getTime())) {
            targetDate = parsed
        }
    }
    
    const start = new Date(targetDate)
    start.setHours(0, 0, 0, 0)
    const startUTC = new Date(start.getTime() - (boliviaOffset + now.getTimezoneOffset()) * 60000)
    
    const end = new Date(targetDate)
    end.setHours(23, 59, 59, 999)
    const endUTC = new Date(end.getTime() - (boliviaOffset + now.getTimezoneOffset()) * 60000)
    
    return {
        start: startUTC.toISOString(),
        end: endUTC.toISOString()
    }
}

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

// Escape Markdown special characters in user-supplied text
function esc(text: string): string {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1')
}

async function sendTG(chatId: string, text: string) {
    try {
        // Truncate to Telegram limit
        const maxLen = 4000
        const truncated = text.length > maxLen ? text.slice(0, maxLen) + '\n\n_...mensaje truncado_' : text

        const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: truncated,
                parse_mode: 'Markdown',
                disable_web_page_preview: true,
            }),
        })
        const result = await resp.json()
        if (!result.ok) {
            console.error('Telegram Markdown error, retrying plain:', result)
            // Fallback: send without Markdown
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: truncated.replace(/[_*`\[\]]/g, ''),
                    disable_web_page_preview: true,
                }),
            })
        }
    } catch (err) {
        console.error('Telegram send error:', err)
    }
}
