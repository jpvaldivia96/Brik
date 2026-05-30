// Telegram Bot Webhook - handles /start commands to link users
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BOT_TOKEN = '8825992226:AAGHxy_dAXKo_FHOM6L46Sq4FvkUJ6zapdg'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const body = await req.json()

        // Telegram sends updates with message objects
        const message = body?.message
        if (!message?.text) {
            return new Response('ok', { status: 200 })
        }

        const chatId = message.chat.id.toString()
        const text = message.text
        const firstName = message.from?.first_name || 'Usuario'

        // Handle /start with user_id parameter
        if (text.startsWith('/start')) {
            const parts = text.split(' ')
            const userId = parts[1] // user_id passed via deep link

            if (userId) {
                // Link this Telegram chat to the user
                // First find all sites this user belongs to
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
                        }, {
                            onConflict: 'user_id,site_id',
                        })

                    if (!error) linked++
                }

                // Send confirmation
                await sendTelegramMessage(chatId,
                    `✅ *¡Conectado exitosamente!*\n\n` +
                    `Hola ${firstName}, tu cuenta BRIK está vinculada.\n` +
                    `Recibirás alertas de ${linked} obra(s) directamente aquí.\n\n` +
                    `📱 Puedes configurar qué alertas recibir desde la app BRIK → Alertas.`
                )
            } else {
                // No user_id — generic start
                await sendTelegramMessage(chatId,
                    `👋 *¡Hola ${firstName}!*\n\n` +
                    `Soy el bot de alertas de BRIK Pro.\n\n` +
                    `Para conectar tu cuenta, ve a:\n` +
                    `📱 BRIK → Configuración → Alertas → *Conectar Telegram*\n\n` +
                    `Tu Chat ID: \`${chatId}\``
                )
            }
        } else if (text === '/status') {
            // Check if user is linked
            const { data } = await supabase
                .from('user_notification_preferences')
                .select('site_id, sites!inner(name)')
                .eq('telegram_chat_id', chatId)

            if (data && data.length > 0) {
                const sites = data.map((d: any) => `• ${d.sites?.name || d.site_id}`).join('\n')
                await sendTelegramMessage(chatId,
                    `✅ *Estado: Conectado*\n\nObras vinculadas:\n${sites}`
                )
            } else {
                await sendTelegramMessage(chatId,
                    `❌ *No estás conectado*\n\nVe a BRIK → Alertas → Conectar Telegram`
                )
            }
        } else if (text === '/desconectar') {
            // Remove telegram_chat_id from all preferences
            await supabase
                .from('user_notification_preferences')
                .update({ telegram_chat_id: null })
                .eq('telegram_chat_id', chatId)

            await sendTelegramMessage(chatId,
                `🔌 *Desconectado*\n\nYa no recibirás alertas de BRIK aquí.`
            )
        } else if (text === '/help') {
            await sendTelegramMessage(chatId,
                `🤖 *Comandos disponibles:*\n\n` +
                `/start - Conectar cuenta BRIK\n` +
                `/status - Ver estado de conexión\n` +
                `/desconectar - Dejar de recibir alertas\n` +
                `/help - Ver esta ayuda`
            )
        }

        return new Response('ok', { status: 200 })
    } catch (error: any) {
        console.error('Webhook error:', error)
        return new Response('ok', { status: 200 }) // Always return 200 to Telegram
    }
})

async function sendTelegramMessage(chatId: string, text: string) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'Markdown',
        }),
    })
}
