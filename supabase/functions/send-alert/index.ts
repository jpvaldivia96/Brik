// Supabase Edge Function to send push notifications via FCM V1 API + Email via Resend
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
    alert_type: string
    title: string
    body: string
    data?: Record<string, any>
}

// Get emoji for alert type
function getAlertEmoji(alertType: string): string {
    const emojis: Record<string, string> = {
        blocked_entry: '🚫',
        favorite_entry: '⭐',
        contractor_attendance: '👷',
        min_capacity: '📉',
        max_capacity: '📈',
        overtime: '⏰',
        announcement: '📢',
        accident_reported: '🚨',
        weather_alert: '🌧️',
        birthday: '🎂',
        worker_of_month: '🏆',
        meeting_reminder: '📅',
    }
    return emojis[alertType] || '🔔'
}

// Get color for alert type
function getAlertColor(alertType: string): string {
    const colors: Record<string, string> = {
        blocked_entry: '#ef4444',
        accident_reported: '#ef4444',
        overtime: '#f97316',
        max_capacity: '#f97316',
        min_capacity: '#eab308',
        weather_alert: '#3b82f6',
        favorite_entry: '#a855f7',
        announcement: '#3b82f6',
        birthday: '#ec4899',
        worker_of_month: '#eab308',
        meeting_reminder: '#06b6d4',
        contractor_attendance: '#10b981',
    }
    return colors[alertType] || '#8b5cf6'
}

// Send email via Resend API
async function sendEmailViaResend(
    resendApiKey: string,
    toEmails: string[],
    alertTitle: string,
    alertBody: string,
    alertType: string,
    siteName: string,
    appUrl: string,
): Promise<{ success: number; failed: number }> {
    const emoji = getAlertEmoji(alertType)
    const color = getAlertColor(alertType)
    const timestamp = new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz' })

    let success = 0
    let failed = 0

    for (const email of toEmails) {
        try {
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${resendApiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: Deno.env.get('RESEND_FROM_EMAIL') || 'BRIK Pro <onboarding@resend.dev>',
                    to: [email],
                    subject: `${emoji} ${alertTitle}`,
                    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <!-- Logo -->
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:28px;font-weight:800;color:#a855f7;letter-spacing:-1px;">BRIK</span>
      <span style="font-size:12px;color:#64748b;margin-left:4px;">PRO</span>
    </div>

    <!-- Alert Card -->
    <div style="background:#1e293b;border-radius:16px;border:1px solid ${color}44;overflow:hidden;">
      <!-- Color bar -->
      <div style="height:4px;background:${color};"></div>

      <div style="padding:24px;">
        <!-- Emoji + Title -->
        <div style="font-size:20px;font-weight:700;color:#f8fafc;margin-bottom:8px;">
          ${emoji} ${alertTitle}
        </div>

        <!-- Body -->
        <div style="font-size:15px;color:#cbd5e1;line-height:1.6;margin-bottom:20px;">
          ${alertBody}
        </div>

        <!-- Meta -->
        <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#0f172a;border-radius:8px;margin-bottom:20px;">
          <span style="font-size:13px;color:#64748b;">📍 ${siteName} · ${timestamp}</span>
        </div>

        <!-- CTA Button -->
        <a href="${appUrl}" style="display:block;text-align:center;background:linear-gradient(135deg,#8b5cf6,#3b82f6);color:white;text-decoration:none;padding:14px;border-radius:12px;font-weight:600;font-size:15px;">
          Ver en BRIK →
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;margin-top:24px;">
      <p style="font-size:12px;color:#475569;">Puedes configurar tus alertas desde BRIK → Mis Alertas</p>
    </div>
  </div>
</body>
</html>`,
                }),
            })

            if (response.ok) {
                success++
            } else {
                const errBody = await response.text()
                console.error(`Resend error for ${email}:`, errBody)
                failed++
            }
        } catch (err) {
            console.error(`Email send error for ${email}:`, err)
            failed++
        }
    }

    return { success, failed }
}

// Send to Slack webhook
async function sendSlackWebhook(webhookUrl: string, title: string, body: string, siteName: string, alertType: string): Promise<boolean> {
    try {
        const emoji = getAlertEmoji(alertType)
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                blocks: [
                    { type: 'header', text: { type: 'plain_text', text: `${emoji} ${title}`, emoji: true } },
                    { type: 'section', text: { type: 'mrkdwn', text: body } },
                    { type: 'context', elements: [{ type: 'mrkdwn', text: `📍 *${siteName}* | ${new Date().toLocaleTimeString('es-BO')}` }] },
                ],
            }),
        })
        return response.ok
    } catch {
        return false
    }
}

// Send to Teams webhook
async function sendTeamsWebhook(webhookUrl: string, title: string, body: string, siteName: string, alertType: string): Promise<boolean> {
    try {
        const emoji = getAlertEmoji(alertType)
        const isUrgent = ['blocked_entry', 'accident_reported', 'overtime', 'max_capacity'].includes(alertType)
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                '@type': 'MessageCard',
                '@context': 'http://schema.org/extensions',
                themeColor: isUrgent ? 'FF0000' : '0076D7',
                summary: title,
                sections: [{
                    activityTitle: `${emoji} ${title}`,
                    activitySubtitle: siteName,
                    facts: [{ name: 'Hora', value: new Date().toLocaleTimeString('es-BO') }],
                    text: body,
                }],
            }),
        })
        return response.ok
    } catch {
        return false
    }
}

// Send to Telegram Bot
async function sendTelegram(botToken: string, chatId: string, title: string, body: string, siteName: string, alertType: string): Promise<boolean> {
    try {
        const emoji = getAlertEmoji(alertType)
        const timestamp = new Date().toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz' })
        const text = `${emoji} *${title}*\n\n${body}\n\n📍 _${siteName}_ • ${timestamp}`

        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'Markdown',
                disable_web_page_preview: true,
            }),
        })

        const result = await response.json()
        if (!result.ok) {
            console.error('Telegram error:', result)
        }
        return result.ok === true
    } catch (err) {
        console.error('Telegram send error:', err)
        return false
    }
}

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const resendApiKey = Deno.env.get('RESEND_API_KEY')
        const appUrl = Deno.env.get('APP_URL') || 'https://brik-pro.vercel.app'

        const payload: AlertPayload = await req.json()
        const { site_id, alert_type, title, body, data = {} } = payload

        if (!site_id || !alert_type || !title || !body) {
            throw new Error('Missing required fields: site_id, alert_type, title, body')
        }

        // Get site name
        const { data: siteData } = await supabase
            .from('sites')
            .select('name')
            .eq('id', site_id)
            .single()
        const siteName = siteData?.name || 'Obra'

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

        // Filter supervisors based on personal notification preferences
        const { data: preferences } = await supabase
            .from('user_notification_preferences')
            .select('user_id, ' + alert_type)
            .eq('site_id', site_id)
            .in('user_id', supervisorIds)

        // Keep only users who have this alert enabled personally
        // If no preferences found, default to all supervisors (new users)
        let filteredUserIds: string[]
        if (preferences && preferences.length > 0) {
            filteredUserIds = preferences
                .filter((pref: any) => pref[alert_type] === true)
                .map((pref: any) => pref.user_id)
        } else {
            // No preferences set = default to all supervisors
            filteredUserIds = supervisorIds
        }

        if (filteredUserIds.length === 0) {
            return new Response(
                JSON.stringify({ success: false, message: 'No users have this alert enabled' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const channels: string[] = []

        // ─── CHANNEL 1: Push Notifications via FCM ───────────────────────
        let pushSuccess = 0
        let pushFailed = 0

        const serviceAccountStr = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')
        if (serviceAccountStr) {
            try {
                const serviceAccount = JSON.parse(serviceAccountStr)
                const projectId = serviceAccount.project_id

                const { data: tokens } = await supabase
                    .from('notification_tokens')
                    .select('token')
                    .in('user_id', filteredUserIds)

                if (tokens && tokens.length > 0) {
                    const fcmTokens = tokens.map((t: any) => t.token)
                    const accessToken = await getAccessToken(serviceAccount)

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
                                            notification: { title, body },
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
                            if (fcmResponse.ok) pushSuccess++
                            else {
                                pushFailed++
                                failedTokens.push(token)
                            }
                        } catch {
                            pushFailed++
                            failedTokens.push(token)
                        }
                    }

                    // Cleanup invalid tokens
                    if (failedTokens.length > 0) {
                        await supabase.from('notification_tokens').delete().in('token', failedTokens)
                    }

                    if (pushSuccess > 0) channels.push('push')
                }
            } catch (err) {
                console.error('FCM error:', err)
            }
        }

        // ─── CHANNEL 2: Email via Resend ─────────────────────────────────
        let emailSuccess = 0
        let emailFailed = 0

        if (resendApiKey) {
            try {
                // Get supervisor emails from auth.users
                const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()

                console.log('Auth admin listUsers error:', usersError)
                console.log('Total users found:', users?.length || 0)
                console.log('Filtered user IDs:', filteredUserIds)

                if (!usersError && users) {
                    const supervisorEmails = users
                        .filter(u => filteredUserIds.includes(u.id) && u.email)
                        .map(u => u.email!)

                    console.log('Supervisor emails to send:', supervisorEmails)

                    if (supervisorEmails.length > 0) {
                        const emailResult = await sendEmailViaResend(
                            resendApiKey,
                            supervisorEmails,
                            title,
                            body,
                            alert_type,
                            siteName,
                            appUrl,
                        )
                        emailSuccess = emailResult.success
                        emailFailed = emailResult.failed
                        if (emailSuccess > 0) channels.push('email')
                    }
                }
            } catch (err) {
                console.error('Email error:', err)
            }
        }

        // ─── CHANNEL 3: Slack/Teams Webhooks ─────────────────────────────
        const { data: notifSettings } = await supabase
            .from('notification_settings')
            .select('slack_webhook_url, teams_webhook_url, telegram_bot_token, telegram_chat_id')
            .eq('site_id', site_id)
            .maybeSingle()

        if (notifSettings?.slack_webhook_url) {
            const ok = await sendSlackWebhook(notifSettings.slack_webhook_url, title, body, siteName, alert_type)
            if (ok) channels.push('slack')
        }

        if (notifSettings?.teams_webhook_url) {
            const ok = await sendTeamsWebhook(notifSettings.teams_webhook_url, title, body, siteName, alert_type)
            if (ok) channels.push('teams')
        }

        // ─── CHANNEL 4: Telegram Bot (site-wide + personal) ────────────────
        const TELEGRAM_BOT_TOKEN = '8825992226:AAGHxy_dAXKo_FHOM6L46Sq4FvkUJ6zapdg'

        // 4a. Site-wide Telegram (notification_settings)
        if (notifSettings?.telegram_bot_token && notifSettings?.telegram_chat_id) {
            const ok = await sendTelegram(
                notifSettings.telegram_bot_token,
                notifSettings.telegram_chat_id,
                title, body, siteName, alert_type
            )
            if (ok) channels.push('telegram')
        }

        // 4b. Personal Telegram (per-user chat_id from user_notification_preferences)
        const { data: userTgPrefs } = await supabase
            .from('user_notification_preferences')
            .select('telegram_chat_id')
            .eq('site_id', site_id)
            .in('user_id', filteredUserIds)
            .not('telegram_chat_id', 'is', null)

        if (userTgPrefs && userTgPrefs.length > 0) {
            const personalChatIds = userTgPrefs
                .map((p: any) => p.telegram_chat_id)
                .filter((id: string) => id && id !== notifSettings?.telegram_chat_id) // avoid duplicate to site-wide

            for (const chatId of personalChatIds) {
                const ok = await sendTelegram(
                    TELEGRAM_BOT_TOKEN,
                    chatId,
                    title, body, siteName, alert_type
                )
                if (ok && !channels.includes('telegram_personal')) {
                    channels.push('telegram_personal')
                }
            }
        }

        // ─── Log to alert_history ────────────────────────────────────────
        await supabase.from('alert_history').insert({
            site_id,
            alert_type,
            title,
            body,
            data,
            recipients: filteredUserIds.length,
        })

        return new Response(
            JSON.stringify({
                success: true,
                channels,
                push: { success: pushSuccess, failed: pushFailed },
                email: { success: emailSuccess, failed: emailFailed },
                recipients: filteredUserIds.length,
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
