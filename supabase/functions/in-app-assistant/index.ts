import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper: call Gemini
async function callGemini(key: string, prompt: string, json = false): Promise<string> {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
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
    if (!resp.ok) {
        const errorText = await resp.text()
        console.error("Gemini API Error:", resp.status, errorText)
        throw new Error(`Gemini ${resp.status}`)
    }
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

        const now = new Date()
        const boliviaOffset = -4 * 60
        const boliviaNow = new Date(now.getTime() + (boliviaOffset + now.getTimezoneOffset()) * 60000)

        // 2. Classify intent and extract query parameters
        const classifyPrompt = `You are a query router for a construction site access control system called BRIK.
The site is "${siteName}". Today's date is ${boliviaNow.toISOString().split('T')[0]} (Bolivia time). The current time is ${boliviaNow.toLocaleTimeString('es-BO')}.
Analyze the user's message and output a JSON object to query the database.
User message: "${message}"

Output JSON strictly with these optional fields:
- intent: "query" (needs database search) or "greeting" (no data needed)
- startDate: YYYY-MM-DD (if user mentions a date range or a specific day. "hoy" = today's date, "ayer" = yesterday's date, "mes" = start of month, etc)
- endDate: YYYY-MM-DD (inclusive. "ayer" = yesterday's date. Default to today if only start is given but user implies up to now)
- contractor: string (if user mentions a contractor name, e.g. "kuattro", "mariscal")
- name: string (if user mentions a person's name)
- status: "inside" (if user asks who is currently inside/working right now) or "all"
- limit: integer (default 1000, max 5000)

If the user is asking about historical data (e.g. "horas trabajadas desde el 1 de junio"), make sure to provide startDate and endDate.
If the user asks "quien esta adentro" or "quienes siguen en la obra", use status: "inside".
If it's just a greeting like "hola", "gracias", return {"intent":"greeting"}.`

        let rawJsonText = await callGemini(geminiKey, classifyPrompt, true)
        // Clean up markdown block if present
        rawJsonText = rawJsonText.replace(/```json/g, '').replace(/```/g, '').trim()
        
        let queryParams: any = {}
        try {
            queryParams = JSON.parse(rawJsonText)
        } catch (e) {
            console.error("Failed to parse Gemini classification JSON:", rawJsonText)
            throw new Error("Invalid JSON from Gemini")
        }

        let rawData = ''

        if (queryParams.intent === 'greeting') {
            rawData = 'GREETING'
        } else {
            // Build the Supabase query
            let query = supabase
                .from('access_logs')
                .select('name_snapshot, contractor_snapshot, categories_snapshot, type_snapshot, entry_at, exit_at')
                .eq('site_id', siteId)
                .is('voided_at', null)
                .order('entry_at', { ascending: false })
            
            if (queryParams.status === 'inside') {
                query = query.is('exit_at', null)
            }
            
            if (queryParams.startDate) {
                // Bolivia is UTC-4. So a day starts at 04:00:00Z
                const d = new Date(queryParams.startDate + 'T00:00:00-04:00')
                query = query.gte('entry_at', d.toISOString())
            }
            
            if (queryParams.endDate) {
                const d = new Date(queryParams.endDate + 'T23:59:59-04:00')
                query = query.lte('entry_at', d.toISOString())
            }

            if (queryParams.contractor) {
                query = query.ilike('contractor_snapshot', `%${queryParams.contractor}%`)
            }

            if (queryParams.name) {
                query = query.ilike('name_snapshot', `%${queryParams.name}%`)
            }

            const { data: logs, error } = await query.limit(queryParams.limit || 1000)

            if (error) {
                console.error("Supabase query error:", error)
                throw error
            }

            if (!logs || logs.length === 0) {
                rawData = `No se encontraron registros para la consulta solicitada.`
            } else {
                // Compress data into CSV format to save context window and make it easy for Gemini to read
                const headers = ["Nombre", "Contratista", "Categoria", "Entrada", "Salida"]
                const rows = logs.map(l => {
                    const entry = new Date(l.entry_at).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })
                    const exit = l.exit_at ? new Date(l.exit_at).toLocaleString('es-BO', { timeZone: 'America/La_Paz' }) : 'ADENTRO'
                    return `${l.name_snapshot}|${l.contractor_snapshot || '-'}|${l.categories_snapshot || '-'}|${entry}|${exit}`
                })
                rawData = `Registros encontrados: ${logs.length}\n\n${headers.join('|')}\n${rows.join('\n')}`
                
                // Truncate if too large, though 1000 rows is fine for Gemini Flash
                if (rawData.length > 500000) {
                    rawData = rawData.substring(0, 500000) + "\n...[DATA TRUNCATED]..."
                }
            }
        }

        // 4. Generate natural response using Gemini
        let finalResponse = ''
        if (rawData === 'GREETING') {
            finalResponse = '¡Hola! 👋 ¿En qué puedo ayudarte? Puedo darte reportes de horas, buscar personas, decirte quién está en la obra, y revisar el historial de accesos.'
        } else {
            const responsePrompt = `Eres BRIK AI, el asistente inteligente de un sistema de control de acceso para obras de construcción.
La obra actual es: "${siteName}".
Hoy es: ${boliviaNow.toLocaleString('es-BO')}.
El usuario preguntó: "${message}"

Aquí están los datos extraídos de la base de datos según lo que pidió el usuario (Formato CSV separado por |):
---
${rawData}
---

Instrucciones:
1. Responde de forma natural, amigable y profesional en español.
2. Si el usuario pide calcular "cuántas horas trabajaron", usa la fecha de entrada y salida para calcular la diferencia. Si dice 'ADENTRO', esa persona sigue trabajando (puedes calcular horas hasta la hora actual). Suma las horas si pide un total, o desglósalo si es relevante.
3. Puedes usar markdown para tablas o listas si la información es larga y útil (ej. top de trabajadores con más horas).
4. Usa negritas (**texto**) para destacar números totales y nombres.
5. NO inventes datos. Si los datos no responden completamente, indícalo. Si los datos están truncados, menciónalo.
6. Sé directo con la respuesta.
7. Mantén el tono de un experto en datos de la obra.`

            finalResponse = await callGemini(geminiKey, responsePrompt)
        }

        return new Response(
            JSON.stringify({ text: finalResponse }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        console.error('Assistant error:', error)
        return new Response(
            JSON.stringify({ text: "Lo siento, ocurrió un error interno al procesar los datos. Intenta de nuevo. 🙏" }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})
