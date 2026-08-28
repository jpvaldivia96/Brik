import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ══════════════════════════════════════════════════════════════════════
// Multi-provider AI chain: OpenRouter → Groq → Gemini (last resort)
// Each provider tries multiple models with retries = ~30+ attempts
// ══════════════════════════════════════════════════════════════════════

// OpenAI-compatible helper (works with OpenRouter, Groq, etc.)
async function callOpenAICompatible(
    baseUrl: string, apiKey: string, model: string,
    prompt: string, json = false, providerName = 'Provider'
): Promise<string | null> {
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const resp = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: json ? 0 : 0.7,
                    ...(json ? { response_format: { type: 'json_object' } } : {}),
                })
            })

            if (resp.status === 429 || resp.status === 503) {
                console.warn(`[${providerName}] ${model}: ${resp.status} attempt ${attempt}/2`)
                await new Promise(r => setTimeout(r, attempt * 1500))
                continue
            }

            if (!resp.ok) {
                const errBody = await resp.text().catch(() => '')
                console.warn(`[${providerName}] ${model}: HTTP ${resp.status} ${errBody.substring(0, 200)}`)
                return null
            }

            const d = await resp.json()
            const text = d.choices?.[0]?.message?.content || ''
            if (!text) { console.warn(`[${providerName}] ${model}: empty response`); return null }

            console.log(`[OK] ${providerName} ${model} (${d.usage?.total_tokens || '?'} tokens)`)
            return text
        } catch (e) {
            console.error(`[${providerName}] ${model}: ${e.message}`)
            return null
        }
    }
    return null
}

// Gemini-native caller (different API format)
async function callGeminiNative(
    key: string, model: string, prompt: string, json = false
): Promise<string | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
    const body = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: json ? 0 : 0.7,
            ...(json ? { responseMimeType: "application/json" } : {})
        }
    })

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
                body
            })

            if (resp.status === 503 || resp.status === 429) {
                console.warn(`[Gemini] ${model}: ${resp.status} attempt ${attempt}/2`)
                await new Promise(r => setTimeout(r, attempt * 2000))
                continue
            }

            if (!resp.ok) {
                console.warn(`[Gemini] ${model}: HTTP ${resp.status}`)
                return null
            }

            const d = await resp.json()
            const text = d.candidates?.[0]?.content?.parts?.[0]?.text || ''
            if (!text) { console.warn(`[Gemini] ${model}: empty`); return null }

            console.log(`[OK] Gemini ${model} (${d.usageMetadata?.totalTokenCount} tokens)`)
            return text
        } catch (e) {
            console.error(`[Gemini] ${model}: ${e.message}`)
            return null
        }
    }
    return null
}

// Main orchestrator: tries providers in priority order
async function callAI(prompt: string, json = false): Promise<string> {
    // ─── 1. OpenRouter (FREE models, 20 RPM, multiple models) ───
    const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')
    if (openrouterKey) {
        const models = [
            'google/gemini-2.0-flash-lite-preview-02-05:free',
            'meta-llama/llama-3.3-70b-instruct:free',
            'deepseek/deepseek-r1:free',
        ]
        for (const model of models) {
            const result = await callOpenAICompatible(
                'https://openrouter.ai/api/v1', openrouterKey, model,
                prompt, json, 'OpenRouter'
            )
            if (result) return result
        }
    }

    // ─── 2. Groq (30 RPM, very fast) ───
    const groqKey = Deno.env.get('GROQ_API_KEY')
    if (groqKey) {
        console.log('[FALLBACK] Trying Groq...')
        const models = ['llama-3.3-70b-versatile', 'deepseek-r1-distill-llama-70b', 'llama-3.1-8b-instant']
        for (const model of models) {
            const result = await callOpenAICompatible(
                'https://api.groq.com/openai/v1', groqKey, model,
                prompt, json, 'Groq'
            )
            if (result) return result
        }
    }

    // ─── 3. Gemini native (last resort, 15 RPM free) ───
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (geminiKey) {
        console.log('[FALLBACK] Trying Gemini...')
        const models = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash-latest']
        for (const model of models) {
            const result = await callGeminiNative(geminiKey, model, prompt, json)
            if (result) return result
        }
    }

    throw new Error('OVERLOADED')
}

// Helper: calculate hours between two dates
function calcHours(entry: string, exit: string | null): number {
    const entryDate = new Date(entry)
    const exitDate = exit ? new Date(exit) : new Date()
    return Math.round((exitDate.getTime() - entryDate.getTime()) / 3600000 * 10) / 10
}

// Helper: format date for Bolivia
function formatBolivia(dateStr: string): string {
    return new Date(dateStr).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })
}

// Helper: build chart data from logs
function buildChartData(logs: any[], queryParams: any) {
    // Group by day
    const byDay: Record<string, { count: number, unique: Set<string>, hours: number }> = {}
    
    for (const log of logs) {
        const day = new Date(log.entry_at).toLocaleDateString('es-BO', { 
            timeZone: 'America/La_Paz', weekday: 'short', day: '2-digit', month: '2-digit' 
        })
        if (!byDay[day]) byDay[day] = { count: 0, unique: new Set(), hours: 0 }
        byDay[day].count++
        byDay[day].unique.add(log.name_snapshot)
        byDay[day].hours += calcHours(log.entry_at, log.exit_at)
    }

    const labels = Object.keys(byDay)
    const attendanceData = labels.map(d => byDay[d].unique.size)
    const hoursData = labels.map(d => Math.round(byDay[d].hours * 10) / 10)

    const attachments: any[] = []

    // Attendance by day chart
    attachments.push({
        type: 'chart',
        chartType: 'bar',
        title: queryParams.contractor 
            ? `Asistencia diaria — ${queryParams.contractor}` 
            : 'Asistencia diaria',
        labels,
        datasets: [{ label: 'Personas únicas', data: attendanceData, color: '#8b5cf6' }]
    })

    // If multiple contractors, add pie chart
    const byContractor: Record<string, number> = {}
    for (const log of logs) {
        const c = log.contractor_snapshot || 'Sin contratista'
        byContractor[c] = (byContractor[c] || 0) + 1
    }
    if (Object.keys(byContractor).length > 1) {
        const pieLabels = Object.keys(byContractor)
        const pieData = pieLabels.map(c => byContractor[c])
        attachments.push({
            type: 'chart',
            chartType: 'pie',
            title: 'Distribución por contratista',
            labels: pieLabels,
            datasets: [{ label: 'Marcaciones', data: pieData }]
        })
    }

    return attachments
}

// Helper: build CSV attachment
function buildCsvAttachment(logs: any[], siteName: string, queryParams: any) {
    const header = 'Nombre,Contratista,Categoría,Entrada,Salida,Horas'
    const rows = logs.map(l => {
        const entry = formatBolivia(l.entry_at)
        const exit = l.exit_at ? formatBolivia(l.exit_at) : 'ADENTRO'
        const hours = calcHours(l.entry_at, l.exit_at)
        // Escape commas in names
        const name = `"${(l.name_snapshot || '').replace(/"/g, '""')}"`
        const contractor = `"${(l.contractor_snapshot || '-').replace(/"/g, '""')}"`
        const category = `"${(l.categories_snapshot || '-').replace(/"/g, '""')}"`
        return `${name},${contractor},${category},${entry},${exit},${hours}`
    })
    
    const csv = `${header}\n${rows.join('\n')}`
    const dateRange = queryParams.startDate 
        ? `${queryParams.startDate}_${queryParams.endDate || queryParams.startDate}`
        : new Date().toISOString().split('T')[0]
    const contractor = queryParams.contractor ? `_${queryParams.contractor}` : ''
    const filename = `reporte_${siteName}${contractor}_${dateRange}.csv`

    return {
        type: 'csv',
        filename: filename.replace(/[^a-zA-Z0-9_\-.]/g, '_'),
        data: csv
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { message, siteId, userId, history } = await req.json()
        console.log("Request:", { message, siteId, historyLen: history?.length || 0 })

        // Verify at least one AI provider is configured
        const hasProvider = Deno.env.get('OPENROUTER_API_KEY') || Deno.env.get('GROQ_API_KEY') || Deno.env.get('GEMINI_API_KEY')
        if (!hasProvider) {
            console.error("No AI provider keys set")
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
- "startDate": "YYYY-MM-DD" or null (hoy=${todayStr}, ayer=yesterday, esta semana=monday of current week)
- "endDate": "YYYY-MM-DD" or null
- "contractor": contractor name string or null
- "name": person name string or null
- "status": "inside" (who is currently inside) or "all" or null
- "metric": "hours" or "count" or "list" or null
- "attach_csv": true or false (true if user asks for details, names, list, csv, excel, or data export)
- "attach_chart": true or false (true if user asks for chart, gráfico, resumen visual, or visualización)

Intent rules:
- If greeting (hola, gracias, etc), return: {"intent":"greeting", "attach_csv": false, "attach_chart": false}
- If it's a follow-up question, use "followup" and infer params from context.
- For "quien esta adentro", use status:"inside" with no dates.
- For "horas trabajadas", include dates and metric:"hours".
- Default startDate for reports without date specified: monday of current week.`

        console.log("Calling AI for classification...")
        const rawJsonText = await callAI(classifyPrompt, true)
        console.log("Classification result:", rawJsonText)
        
        let cleaned = rawJsonText;
        // Strip <think> blocks (DeepSeek-R1)
        cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, '');
        // Extract just the JSON block if it's wrapped in markdown
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            cleaned = match[0];
        }
        
        let queryParams: any
        try {
            queryParams = JSON.parse(cleaned)
        } catch (e) {
            console.error("JSON parse error:", e.message, "Raw:", rawJsonText)
            queryParams = { intent: 'query', status: 'all', attach_csv: false, attach_chart: false }
        }

        console.log("Query params:", queryParams)

        // Handle greeting
        if (queryParams.intent === 'greeting') {
            return new Response(
                JSON.stringify({ 
                    text: '¡Hola! 👋 ¿En qué puedo ayudarte? Puedo darte reportes, generar gráficos, exportar CSV, buscar personas, y más.' 
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Removed isReport declaration

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
            query = query.lte('entry_at', queryParams.endDate + 'T03:59:59Z')
        }

        if (queryParams.contractor) {
            query = query.ilike('contractor_snapshot', `%${queryParams.contractor}%`)
        }

        if (queryParams.name) {
            query = query.ilike('name_snapshot', `%${queryParams.name}%`)
        }

        const { data: logs, error: queryError } = await query.limit(2000)

        if (queryError) {
            console.error("Supabase query error:", queryError)
            throw queryError
        }

        console.log(`Found ${logs?.length || 0} records`)

        // 4. Build attachments based on explicit flags
        const attachments: any[] = []

        if (logs && logs.length > 0) {
            // Auto-attach CSV if explicitly requested OR if returning more than 10 records (to be helpful)
            if (queryParams.attach_csv || logs.length > 10) {
                attachments.push(buildCsvAttachment(logs, siteName, queryParams))
            }
            if (queryParams.attach_chart) {
                attachments.push(...buildChartData(logs, queryParams))
            }
        }

        // 5. Build raw data for Gemini context
        let rawData = ''
        if (!logs || logs.length === 0) {
            rawData = 'No se encontraron registros.'
        } else {
            const rows = logs.map(l => {
                const entry = formatBolivia(l.entry_at)
                const exit = l.exit_at ? formatBolivia(l.exit_at) : 'ADENTRO'
                return `${l.name_snapshot}|${l.contractor_snapshot || '-'}|${l.categories_snapshot || '-'}|${entry}|${exit}`
            })
            rawData = `Registros: ${logs.length}\nNombre|Contratista|Categoria|Entrada|Salida\n${rows.join('\n')}`
            
            if (rawData.length > 200000) {
                rawData = rawData.substring(0, 200000) + '\n...[TRUNCADO]...'
            }
        }

        // 6. Generate response
        const historyForPrompt = (history || []).slice(-6).map((m: any) => 
            `${m.role === 'user' ? 'Usuario' : 'Brix'}: ${m.content.substring(0, 500)}`
        ).join('\n')

        const reportContext = attachments.length > 0
            ? `\n¡IMPORTANTE! Ya se han adjuntado automáticamente ${attachments.length} archivo(s)/gráfico(s) a tu respuesta (CSV/gráficos). NO pidas disculpas por no poder adjuntarlos, porque el sistema ya los incluyó por ti. Simplemente menciona "Te adjunto los detalles / gráficos".`
            : `\n¡IMPORTANTE! NO hay archivos ni gráficos adjuntos a tu respuesta. Si el usuario los pidió, y no hay datos, explica que no hay datos. NO digas "Te adjunto" si no hay archivos.`

        const responsePrompt = `Eres Brix, el asistente inteligente de BRIK — un sistema de control de acceso para obras de construcción.
Obra: "${siteName}". Hoy: ${todayStr} ${timeStr}.

${historyForPrompt ? `Conversación previa:\n${historyForPrompt}\n\n` : ''}Pregunta actual del usuario: "${message}"
${reportContext}

Datos del sistema (CSV con |):
${rawData}

Instrucciones:
- Responde en español, amigable y profesional. Tu nombre es Brix.
- Si piden horas trabajadas, calcula diferencia entre Entrada y Salida. Si dice ADENTRO, calcula hasta ahora.
- Usa **negritas** para números importantes.
- Considera el contexto de la conversación previa para responder follow-ups coherentes.
- Lee el "¡IMPORTANTE!" arriba sobre los adjuntos. Nunca digas que adjuntaste algo si el sistema dice que no hay adjuntos.
- NO inventes datos. Sé conciso y analítico, brindando razonamiento de alta calidad.
- Máximo 300 palabras.`

        console.log("Calling AI for response...")
        const finalResponse = await callAI(responsePrompt)
        console.log("Response generated, length:", finalResponse.length, "attachments:", attachments.length)

        const responseBody: any = { text: finalResponse }
        if (attachments.length > 0) {
            responseBody.attachments = attachments
        }

        return new Response(
            JSON.stringify(responseBody),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        console.error('Assistant error:', error.message, error.stack)
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
