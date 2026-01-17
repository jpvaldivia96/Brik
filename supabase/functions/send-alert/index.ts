// Supabase Edge Function to send push notifications via FCM
// Deploy with: supabase functions deploy send-alert

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AlertPayload {
    site_id: string
    alert_type: 'contractor_attendance' | 'favorite_entry' | 'blocked_entry' | 'min_capacity' | 'max_capacity' | 'overtime'
    title: string
    body: string
    data?: Record<string, any>
}

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Get FCM Server Key from environment
        const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY')
        if (!FCM_SERVER_KEY) {
            throw new Error('FCM_SERVER_KEY not configured')
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const payload: AlertPayload = await req.json()
        const { site_id, alert_type, title, body, data = {} } = payload

        if (!site_id || !alert_type || !title || !body) {
            throw new Error('Missing required fields: site_id, alert_type, title, body')
        }

        // Check alert settings to see if this alert type is enabled
        const { data: settings } = await supabase
            .from('alert_settings')
            .select('*')
            .eq('site_id', site_id)
            .single()

        if (settings) {
            const enabledMap: Record<string, boolean> = {
                'contractor_attendance': settings.contractor_attendance_enabled,
                'favorite_entry': settings.favorite_entry_enabled,
                'blocked_entry': settings.blocked_entry_enabled,
                'min_capacity': settings.min_capacity_enabled,
                'max_capacity': settings.max_capacity_enabled,
                'overtime': settings.overtime_enabled,
            }

            if (enabledMap[alert_type] === false) {
                return new Response(
                    JSON.stringify({ success: false, message: 'Alert type disabled for this site' }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
        }

        // Get supervisors of this site
        const { data: memberships } = await supabase
            .from('site_memberships')
            .select('user_id')
            .eq('site_id', site_id)
            .eq('role', 'supervisor')

        if (!memberships || memberships.length === 0) {
            return new Response(
                JSON.stringify({ success: false, message: 'No supervisors found for site' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const supervisorIds = memberships.map(m => m.user_id)

        // Get FCM tokens for supervisors
        const { data: tokens } = await supabase
            .from('notification_tokens')
            .select('token')
            .in('user_id', supervisorIds)

        if (!tokens || tokens.length === 0) {
            return new Response(
                JSON.stringify({ success: false, message: 'No push tokens found for supervisors' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Send to FCM
        const fcmTokens = tokens.map(t => t.token)

        const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
                'Authorization': `key=${FCM_SERVER_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                registration_ids: fcmTokens,
                notification: {
                    title,
                    body,
                    sound: 'default',
                    click_action: 'FCM_PLUGIN_ACTIVITY',
                },
                data: {
                    ...data,
                    alert_type,
                    site_id,
                },
                priority: 'high',
            }),
        })

        const fcmResult = await fcmResponse.json()

        // Log to alert_history
        await supabase.from('alert_history').insert({
            site_id,
            alert_type,
            title,
            body,
            data,
            recipients: fcmTokens.length,
        })

        return new Response(
            JSON.stringify({
                success: true,
                recipients: fcmTokens.length,
                fcm_result: fcmResult
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Error sending alert:', error)
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
