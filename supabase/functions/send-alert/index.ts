// Supabase Edge Function to send push notifications via FCM V1 API
// Deploy with: supabase functions deploy send-alert

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper to generate OAuth2 access token from service account
async function getAccessToken(serviceAccount: any): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    const payload = {
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    }

    const header = { alg: 'RS256', typ: 'JWT' }

    // Create JWT manually
    const encodedHeader = btoa(JSON.stringify(header))
    const encodedPayload = btoa(JSON.stringify(payload))
    const unsignedToken = `${encodedHeader}.${encodedPayload}`

    // Sign with private key
    const privateKey = serviceAccount.private_key
    const encoder = new TextEncoder()
    const data = encoder.encode(unsignedToken)

    // Import the private key
    const pemHeader = '-----BEGIN PRIVATE KEY-----'
    const pemFooter = '-----END PRIVATE KEY-----'
    const pemContents = privateKey.substring(
        pemHeader.length,
        privateKey.length - pemFooter.length
    ).replace(/\s/g, '')

    const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))

    const key = await crypto.subtle.importKey(
        'pkcs8',
        binaryDer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    )

    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, data)
    const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    const jwt = `${unsignedToken}.${encodedSignature}`

    // Exchange JWT for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    })

    const tokenData = await tokenResponse.json()
    return tokenData.access_token
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
        // Get service account from environment
        const serviceAccountStr = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')
        if (!serviceAccountStr) {
            throw new Error('FIREBASE_SERVICE_ACCOUNT not configured')
        }

        const serviceAccount = JSON.parse(serviceAccountStr)
        const projectId = serviceAccount.project_id

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

        const supervisorIds = memberships.map((m: any) => m.user_id)

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

        const fcmTokens = tokens.map((t: any) => t.token)

        // Get OAuth access token
        const accessToken = await getAccessToken(serviceAccount)

        // Send to each token using FCM V1 API
        let successCount = 0
        let failureCount = 0
        const failedTokens: string[] = []

        for (const token of fcmTokens) {
            try {
                const fcmResponse = await fetch(
                    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            message: {
                                token,
                                notification: {
                                    title,
                                    body,
                                },
                                data: {
                                    alert_type,
                                    site_id,
                                    timestamp: new Date().toISOString(),
                                    ...Object.fromEntries(
                                        Object.entries(data).map(([k, v]) => [k, String(v)])
                                    ),
                                },
                                android: {
                                    priority: 'high',
                                    notification: {
                                        sound: 'default',
                                        click_action: 'FCM_PLUGIN_ACTIVITY',
                                    },
                                },
                            },
                        }),
                    }
                )

                if (fcmResponse.ok) {
                    successCount++
                } else {
                    failureCount++
                    failedTokens.push(token)
                }
            } catch (err) {
                failureCount++
                failedTokens.push(token)
            }
        }

        // Cleanup invalid tokens
        if (failedTokens.length > 0) {
            await supabase
                .from('notification_tokens')
                .delete()
                .in('token', failedTokens)
        }

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
                success_count: successCount,
                failure_count: failureCount
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        console.error('Error sending alert:', error)
        return new Response(
            JSON.stringify({ success: false, error: error?.message || 'Unknown error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
