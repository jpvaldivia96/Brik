import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
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
        const { message, siteId, userId } = await req.json()
        const geminiKey = Deno.env.get('GEMINI_API_KEY')

        if (!geminiKey) {
            return new Response(
                JSON.stringify({ text: "⚠️ Para que yo funcione, el administrador necesita configurar la API Key de Gemini." }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // 1. Get site info for context
        const { data: site } = await supabase.from('sites').select('name').eq('id', siteId).single()
        const siteName = site?.name || 'la obra'

        // 2. Ask Gemini to classify the intent
        const prompt = `You are a helpful assistant for a construction site gate access system. 
The user is asking a question about the site "${siteName}".
Classify the user's input into one of these commands: 
- /adentro (who is inside right now)
- /hoy (today's summary)
- /buscar (search for a specific person, requires name)
- /contratista (info about a specific contractor, requires name)
- /horas (top hours worked today)
- /overtime (people working overtime)

User Input: "${message}"

Respond ONLY with a valid JSON object matching this schema, nothing else:
{"command": "/command_name", "arg": "argument if required, or null"}
`

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0,
                    responseMimeType: "application/json"
                }
            })
        })

        if (!response.ok) throw new Error(`Gemini API error`)
        const data = await response.json()
        const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (!resultText) throw new Error('Empty response from Gemini')

        const parsed = JSON.parse(resultText)
        let responseText = ""

        // 3. Execute query based on intent
        switch (parsed.command) {
            case '/adentro': {
                const { data: inside } = await supabase
                    .from('access_logs')
                    .select('contractor_snapshot, name_snapshot')
                    .eq('site_id', siteId)
                    .is('exit_at', null)
                    .is('voided_at', null)

                if (!inside || inside.length === 0) {
                    responseText = `No hay **nadie** adentro en ${siteName} en este momento.`
                    break
                }
                
                const byC: Record<string, number> = {}
                for (const log of inside) {
                    const c = log.contractor_snapshot || 'Sin Contratista'
                    byC[c] = (byC[c] || 0) + 1
                }
                const sorted = Object.entries(byC).sort((a, b) => b[1] - a[1])
                
                responseText = `Hay **${inside.length} personas** adentro en este momento.\n\n### Por Contratista\n`
                for (const [c, n] of sorted.slice(0, 10)) {
                    responseText += `- **${c}**: ${n}\n`
                }
                if (sorted.length > 10) responseText += `\n*...y ${sorted.length - 10} más.*`
                break
            }
            case '/buscar': {
                if (!parsed.arg) {
                    responseText = "¿A quién quieres que busque? Dime su nombre."
                    break
                }
                const { data: people } = await supabase
                    .from('access_logs')
                    .select('name_snapshot, contractor_snapshot, entry_at, exit_at')
                    .eq('site_id', siteId)
                    .ilike('name_snapshot', `%${parsed.arg}%`)
                    .is('voided_at', null)
                    .order('entry_at', { ascending: false })
                    .limit(5)

                if (!people || people.length === 0) {
                    responseText = `No encontré registros recientes para "${parsed.arg}".`
                    break
                }

                responseText = `Resultados para **${parsed.arg}**:\n\n`
                for (const p of people) {
                    const c = p.contractor_snapshot ? `(${p.contractor_snapshot})` : ''
                    const state = p.exit_at ? '🔴 Salió' : '🟢 **Adentro**'
                    responseText += `- ${p.name_snapshot} ${c} - ${state}\n`
                }
                break
            }
            default:
                responseText = "Entiendo lo que dices, pero aún estoy aprendiendo. Por ahora puedo decirte **quién está adentro**, **resúmenes de hoy**, o **buscar personas**."
        }

        return new Response(
            JSON.stringify({ text: responseText }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        console.error('Assistant error:', error)
        return new Response(
            JSON.stringify({ text: "Lo siento, ocurrió un error interno al intentar responder." }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})
