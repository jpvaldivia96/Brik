import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper: call Gemini with retries + fallback models
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-2.0-flash-lite']

async function callGemini(key: string, prompt: string, json = false): Promise<string> {
    const body = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: json ? 0 : 0.7,
            ...(json ? { responseMimeType: "application/json" } : {})
        }
    })

    for (const model of GEMINI_MODELS) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
        
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
                    body
                })
                
                if (resp.status === 503 || resp.status === 429) {
                    console.warn(`${model}: ${resp.status} attempt ${attempt}/2`)
                    await new Promise(r => setTimeout(r, attempt * 1500))
                    continue
                }
                
                if (!resp.ok) {
                    console.error(`${model}: HTTP ${resp.status}`)
                    break // try next model
                }
                
                const d = await resp.json()
                const text = d.candidates?.[0]?.content?.parts?.[0]?.text || ''
                if (!text) {
                    console.warn(`${model}: empty response`)
                    break // try next model
                }
                
                console.log(`OK: ${model} (${d.modelVersion}, ${d.usageMetadata?.totalTokenCount} tokens)`)
                return text
            } catch (e) {
                console.error(`${model}: fetch error: ${e.message}`)
                break // try next model
            }
        }
        console.warn(`${model} failed, trying next...`)
    }
    throw new Error('OVERLOADED')
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { message, siteId, userId, history } = await req.json()
        console.log("Request:", { message, siteId, historyLen: history?.length || 0 })
        
        const geminiKey = Deno.env.get('GEMINI_API_KEY')

        if (!geminiKey) {
            console.error("GEMINI_API_KEY not set")
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

        // Bolivia time
        const now = new Date()
        const boliviaNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/La_Paz' }))
        const todayStr = boliviaNow.toISOString().split('T')[0]
        const timeStr = boliviaNow.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })

        // 2. Classify intent — include recent conversation for context
        const recentContext = (history || []).slice(-4).map((m: any) => 
            `${m.role === 'user' ? 'Usuario' : 'Brix'}: ${m.content.substring(0, 200)}`
        ).join('\n')

        const classifyPrompt = `You are a query router for a construction site access control system called BRIK.
The site is "${siteName}". Today is ${todayStr}. Current time: ${timeStr} (Bolivia).

${recentContext ? `Recent conversation:\n${recentContext}\n\n` : ''}Classify the user's LATEST message and extract query parameters. Consider the conversation context for follow-up questions.
User message: "${message}"

Return a JSON object with these fields:
- "intent": "query" or "greeting" or "followup"
- "startDate": "YYYY-MM-DD" or null (hoy=${todayStr}, ayer=yesterday)
- "endDate": "YYYY-MM-DD" or null
- "contractor": contractor name string or null
- "name": person name string or null
- "status": "inside" (who is currently inside) or "all" or null
- "metric": "hours" or "count" or "list" or null

If greeting (hola, gracias, etc), return: {"intent":"greeting"}
If it's a follow-up question that refers to previous context ("se repiten?", "los mismos?", "dame mas detalles"), use intent:"followup" and infer the same query params from context.
For "quien esta adentro", use status:"inside" with no dates.
For "horas trabajadas", include dates and metric:"hours".`

        console.log("Calling Gemini for classification...")
        const rawJsonText = await callGemini(geminiKey, classifyPrompt, true)
        console.log("Classification result:", rawJsonText)
        
        // Parse JSON - handle markdown wrapping
        const cleaned = rawJsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
        let queryParams: any
        try {
            queryParams = JSON.parse(cleaned)
        } catch (e) {
            console.error("JSON parse error:", e.message, "Raw:", cleaned)
            // Fallback: treat as general query for today
            queryParams = { intent: 'query', status: 'inside' }
        }

        console.log("Query params:", queryParams)

        // Handle greeting
        if (queryParams.intent === 'greeting') {
            return new Response(
                JSON.stringify({ text: '¡Hola! 👋 ¿En qué puedo ayudarte? Puedo darte reportes de horas, buscar personas, decirte quién está en la obra, y más.' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 3. Build query
        let query = supabase
            .from('access_logs')
            .select('name_snapshot, contractor_snapshot, categories_snapshot, entry_at, exit_at')
            .eq('site_id', siteId)
            .is('voided_at', null)
            .order('entry_at', { ascending: false })
        
        if (queryParams.status === 'inside') {
            query = query.is('exit_at', null)
        }
        
        if (queryParams.startDate) {
            query = query.gte('entry_at', queryParams.startDate + 'T04:00:00Z')
        }
        
        if (queryParams.endDate) {
            // End of day in Bolivia = next day 03:59:59 UTC
            query = query.lte('entry_at', queryParams.endDate + 'T27:59:59Z'.replace('27', '03'))
        }

        if (queryParams.contractor) {
            query = query.ilike('contractor_snapshot', `%${queryParams.contractor}%`)
        }

        if (queryParams.name) {
            query = query.ilike('name_snapshot', `%${queryParams.name}%`)
        }

        const { data: logs, error: queryError } = await query.limit(1000)

        if (queryError) {
            console.error("Supabase query error:", queryError)
            throw queryError
        }

        console.log(`Found ${logs?.length || 0} records`)

        let rawData = ''
        if (!logs || logs.length === 0) {
            rawData = 'No se encontraron registros.'
        } else {
            // Build CSV data
            const rows = logs.map(l => {
                const entry = new Date(l.entry_at).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })
                const exit = l.exit_at ? new Date(l.exit_at).toLocaleString('es-BO', { timeZone: 'America/La_Paz' }) : 'ADENTRO'
                return `${l.name_snapshot}|${l.contractor_snapshot || '-'}|${l.categories_snapshot || '-'}|${entry}|${exit}`
            })
            rawData = `Registros: ${logs.length}\nNombre|Contratista|Categoria|Entrada|Salida\n${rows.join('\n')}`
            
            if (rawData.length > 200000) {
                rawData = rawData.substring(0, 200000) + '\n...[TRUNCADO]...'
            }
        }

        // 4. Generate response with conversation history
        const historyForPrompt = (history || []).slice(-6).map((m: any) => 
            `${m.role === 'user' ? 'Usuario' : 'Brix'}: ${m.content.substring(0, 500)}`
        ).join('\n')

        const responsePrompt = `Eres Brix, el asistente inteligente de BRIK — un sistema de control de acceso para obras de construcción.
Obra: "${siteName}". Hoy: ${todayStr} ${timeStr}.

${historyForPrompt ? `Conversación previa:\n${historyForPrompt}\n\n` : ''}Pregunta actual del usuario: "${message}"

Datos del sistema (CSV con |):
${rawData}

Instrucciones:
- Responde en español, amigable y profesional. Tu nombre es Brix.
- Si piden horas trabajadas, calcula diferencia entre Entrada y Salida. Si dice ADENTRO, calcula hasta ahora.
- Usa **negritas** para números importantes.
- Considera el contexto de la conversación previa para responder follow-ups coherentes.
- NO inventes datos. Sé conciso.
- Máximo 300 palabras.`

        console.log("Calling Gemini for response...")
        const finalResponse = await callGemini(geminiKey, responsePrompt)
        console.log("Response generated, length:", finalResponse.length)

        return new Response(
            JSON.stringify({ text: finalResponse }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        console.error('Assistant error:', error.message, error.stack)
        // User-friendly error messages
        let userMsg = '❌ Ocurrió un error. Intenta de nuevo en unos segundos.'
        if (error.message === 'OVERLOADED') {
            userMsg = '⏳ El servidor de IA está saturado en este momento. Intenta de nuevo en unos segundos.'
        } else if (error.message === 'EMPTY_RESPONSE') {
            userMsg = '🤔 No pude generar una respuesta. Intenta reformular tu pregunta.'
        }
        return new Response(
            JSON.stringify({ text: userMsg }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
    }
})
