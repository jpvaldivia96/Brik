import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper: call Gemini
async function callGemini(key: string, prompt: string, json = false): Promise<string> {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: json ? 0 : 0.7,
                ...(json ? { responseMimeType: "application/json" } : {})
            }
        })
    })
    if (!resp.ok) throw new Error(`Gemini ${resp.status}`)
    const d = await resp.json()
    return d.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { message, siteId, userId } = await req.json()
        const geminiKey = Deno.env.get('GEMINI_API_KEY')

        if (!geminiKey) {
            return new Response(
                JSON.stringify({ text: "⚠️ El asistente AI no está configurado aún." }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // 1. Get site name
        const { data: site } = await supabase.from('sites').select('name').eq('id', siteId).single()
        const siteName = site?.name || 'la obra'

        // 2. Classify intent
        const classifyPrompt = `You are a router for a construction site access control system called BRIK.
The site is "${siteName}".
Classify the user's message into exactly one of these intents:
- adentro: who is currently inside
- buscar: search for a specific person (extract their name)
- contratista: info about a contractor (extract name)
- hoy: today's summary stats
- horas: who worked the most hours today
- overtime: who is working overtime
- saludo: a greeting or general chat (hi, thanks, etc.)

User message: "${message}"

Return JSON: {"intent":"...", "arg":"name or null"}`

        const classJson = await callGemini(geminiKey, classifyPrompt, true)
        const { intent, arg } = JSON.parse(classJson)

        // 3. Fetch relevant data based on intent
        let rawData = ''

        if (intent === 'adentro') {
            const { data: inside } = await supabase
                .from('access_logs')
                .select('contractor_snapshot, name_snapshot')
                .eq('site_id', siteId)
                .is('exit_at', null)
                .is('voided_at', null)

            if (!inside || inside.length === 0) {
                rawData = 'No hay nadie adentro en este momento.'
            } else {
                const byC: Record<string, string[]> = {}
                for (const log of inside) {
                    const c = log.contractor_snapshot || 'Sin Contratista'
                    if (!byC[c]) byC[c] = []
                    byC[c].push(log.name_snapshot)
                }
                rawData = `Total adentro: ${inside.length}.\n`
                for (const [c, names] of Object.entries(byC)) {
                    rawData += `${c} (${names.length}): ${names.join(', ')}\n`
                }
            }
        } else if (intent === 'buscar' && arg) {
            const { data: logs } = await supabase
                .from('access_logs')
                .select('name_snapshot, contractor_snapshot, entry_at, exit_at')
                .eq('site_id', siteId)
                .ilike('name_snapshot', `%${arg}%`)
                .is('voided_at', null)
                .order('entry_at', { ascending: false })
                .limit(10)

            if (!logs || logs.length === 0) {
                rawData = `No se encontraron registros para "${arg}".`
            } else {
                rawData = logs.map(l => {
                    const status = l.exit_at ? `Salió a las ${new Date(l.exit_at).toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit' })}` : 'ADENTRO ahora'
                    const entry = new Date(l.entry_at).toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit' })
                    return `${l.name_snapshot} (${l.contractor_snapshot || 'N/A'}) - Entró: ${entry} - ${status}`
                }).join('\n')
            }
        } else if (intent === 'contratista' && arg) {
            const { data: logs } = await supabase
                .from('access_logs')
                .select('name_snapshot, entry_at, exit_at')
                .eq('site_id', siteId)
                .ilike('contractor_snapshot', `%${arg}%`)
                .is('exit_at', null)
                .is('voided_at', null)

            if (!logs || logs.length === 0) {
                rawData = `No hay personas de "${arg}" adentro en este momento.`
            } else {
                rawData = `${logs.length} personas de "${arg}" adentro:\n`
                rawData += logs.map(l => `- ${l.name_snapshot} (entró ${new Date(l.entry_at).toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit' })})`).join('\n')
            }
        } else if (intent === 'hoy') {
            // Today's stats
            const now = new Date()
            const boliviaOffset = -4 * 60
            const boliviaNow = new Date(now.getTime() + (boliviaOffset + now.getTimezoneOffset()) * 60000)
            const todayStart = new Date(boliviaNow)
            todayStart.setHours(0, 0, 0, 0)
            const todayStartUTC = new Date(todayStart.getTime() - (boliviaOffset + now.getTimezoneOffset()) * 60000)

            const { data: todayLogs } = await supabase
                .from('access_logs')
                .select('entry_at, exit_at, name_snapshot')
                .eq('site_id', siteId)
                .gte('entry_at', todayStartUTC.toISOString())
                .is('voided_at', null)

            const entries = todayLogs?.length || 0
            const exits = todayLogs?.filter(l => l.exit_at).length || 0
            const inside = todayLogs?.filter(l => !l.exit_at).length || 0
            rawData = `Resumen de hoy en ${siteName}:\n- Entradas totales: ${entries}\n- Salidas: ${exits}\n- Adentro ahora: ${inside}`
        } else if (intent === 'saludo') {
            rawData = 'GREETING'
        } else {
            rawData = `No tengo información específica para eso. Puedo decirte quién está adentro, buscar personas, ver info de contratistas, o darte el resumen del día.`
        }

        // 4. Generate natural response using Gemini
        let finalResponse = ''
        if (rawData === 'GREETING') {
            finalResponse = '¡Hola! 👋 ¿En qué puedo ayudarte? Puedo decirte quién está en la obra, buscar personas, o darte un resumen del día.'
        } else {
            const responsePrompt = `Eres BRIK AI, un asistente amigable para un sistema de control de acceso de obras de construcción llamado BRIK.
El usuario preguntó: "${message}"
Aquí están los datos reales del sistema:

${rawData}

Responde de forma natural, amigable y concisa en español. Usa emojis ocasionalmente. 
- Si hay personas adentro, resume la info de forma clara y fácil de leer.
- Usa negritas (**texto**) para destacar números y nombres importantes.
- Sé breve pero informativo. No repitas toda la data cruda; resume inteligentemente.
- Si no hay datos, sugiere al usuario qué más puede preguntar.
- NO inventes datos. Solo usa la info proporcionada.
- Responde en máximo 200 palabras.`

            finalResponse = await callGemini(geminiKey, responsePrompt)
        }

        return new Response(
            JSON.stringify({ text: finalResponse }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        console.error('Assistant error:', error)
        return new Response(
            JSON.stringify({ text: "Lo siento, ocurrió un error. Intenta de nuevo en un momento. 🙏" }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})
