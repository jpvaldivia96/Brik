// Weather Alert Edge Function
// Checks for extreme weather conditions only
// Runs every 30 minutes via cron

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
        const WEATHER_API_KEY = Deno.env.get('WEATHER_API_KEY')
        if (!WEATHER_API_KEY) {
            throw new Error('WEATHER_API_KEY not configured')
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Get all sites with locations
        const { data: sites } = await supabase
            .from('sites')
            .select('id, name, latitude, longitude')
            .not('latitude', 'is', null)
            .not('longitude', 'is', null)

        if (!sites) {
            return new Response(JSON.stringify({ success: false }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        let alertsSent = 0

        for (const site of sites) {
            try {
                // Call WeatherAPI.com
                const weatherRes = await fetch(
                    `http://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${site.latitude},${site.longitude}&lang=es`
                )

                if (!weatherRes.ok) continue

                const weather = await weatherRes.json()
                const current = weather.current

                // Check for EXTREME conditions only
                const alerts: string[] = []

                // Extreme cold (< 5°C)
                if (current.temp_c < 5) {
                    alerts.push(`🥶 Frío extremo: ${current.temp_c}°C`)
                }

                // Extreme heat (> 35°C)
                if (current.temp_c > 35) {
                    alerts.push(`🔥 Calor extremo: ${current.temp_c}°C`)
                }

                // Strong wind (> 40 km/h)
                if (current.wind_kph > 40) {
                    alerts.push(`💨 Vientos fuertes: ${current.wind_kph} km/h`)
                }

                // Heavy rain (> 10mm/h)
                if (current.precip_mm > 10) {
                    alerts.push(`🌧️ Lluvia fuerte: ${current.precip_mm} mm/h`)
                }

                if (alerts.length > 0) {
                    await supabase.functions.invoke('send-alert', {
                        body: {
                            site_id: site.id,
                            alert_type: 'weather_alert',
                            title: '⚠️ Alerta Climática',
                            body: alerts.join(' • '),
                            data: {
                                temp: current.temp_c,
                                wind: current.wind_kph,
                                rain: current.precip_mm,
                                condition: current.condition.text
                            }
                        }
                    })

                    // Store weather status for UI indicator
                    await supabase
                        .from('site_weather_status')
                        .upsert({
                            site_id: site.id,
                            status: alerts[0].split(':')[0].trim(), // e.g., "🥶 Frío extremo"
                            updated_at: new Date().toISOString()
                        }, {
                            onConflict: 'site_id'
                        })

                    alertsSent++
                } else {
                    // Clear alert if conditions are normal
                    await supabase
                        .from('site_weather_status')
                        .delete()
                        .eq('site_id', site.id)
                }
            } catch (err) {
                console.error(`Error checking weather for site ${site.id}:`, err)
            }
        }

        return new Response(
            JSON.stringify({ success: true, alerts_sent: alertsSent }),
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
