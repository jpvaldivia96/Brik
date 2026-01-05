/**
 * Notification utility for sending alerts to Slack, Teams, or Push
 */

import { supabase } from '@/integrations/supabase/client';

export interface NotificationSettings {
    slack_webhook_url: string | null;
    teams_webhook_url: string | null;
    notify_on_watchlist_entry: boolean;
    notify_on_contractor_complete: boolean;
    notify_on_late_arrivals: boolean;
    notify_on_fatigue_alerts: boolean;
    notify_on_visitor_entry: boolean;
    late_arrival_time: string | null;
}

export type NotificationType =
    | 'watchlist_entry'
    | 'contractor_complete'
    | 'late_arrivals'
    | 'fatigue_alert'
    | 'visitor_entry';

interface NotificationPayload {
    type: NotificationType;
    title: string;
    message: string;
    siteName: string;
    timestamp: Date;
    data?: Record<string, any>;
}

// Get notification settings for a site
export async function getNotificationSettings(siteId: string): Promise<NotificationSettings | null> {
    const { data, error } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('site_id', siteId)
        .maybeSingle();

    if (error || !data) return null;

    return data as unknown as NotificationSettings;
}

// Check if notification type is enabled
function isNotificationEnabled(settings: NotificationSettings, type: NotificationType): boolean {
    switch (type) {
        case 'watchlist_entry':
            return settings.notify_on_watchlist_entry;
        case 'contractor_complete':
            return settings.notify_on_contractor_complete;
        case 'late_arrivals':
            return settings.notify_on_late_arrivals;
        case 'fatigue_alert':
            return settings.notify_on_fatigue_alerts;
        case 'visitor_entry':
            return settings.notify_on_visitor_entry;
        default:
            return false;
    }
}

// Get emoji for notification type
function getEmoji(type: NotificationType): string {
    switch (type) {
        case 'watchlist_entry':
            return '⚠️';
        case 'contractor_complete':
            return '✅';
        case 'late_arrivals':
            return '⏰';
        case 'fatigue_alert':
            return '🔴';
        case 'visitor_entry':
            return '👔';
        default:
            return '📢';
    }
}

// Format for Slack
function formatSlackMessage(payload: NotificationPayload): object {
    const emoji = getEmoji(payload.type);

    return {
        blocks: [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: `${emoji} ${payload.title}`,
                    emoji: true
                }
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: payload.message
                }
            },
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: `📍 *${payload.siteName}* | ${payload.timestamp.toLocaleTimeString('es-BO')}`
                    }
                ]
            }
        ]
    };
}

// Format for Microsoft Teams
function formatTeamsMessage(payload: NotificationPayload): object {
    const emoji = getEmoji(payload.type);

    return {
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        themeColor: payload.type === 'watchlist_entry' || payload.type === 'fatigue_alert' ? 'FF0000' : '0076D7',
        summary: payload.title,
        sections: [
            {
                activityTitle: `${emoji} ${payload.title}`,
                activitySubtitle: payload.siteName,
                facts: [
                    {
                        name: 'Hora',
                        value: payload.timestamp.toLocaleTimeString('es-BO')
                    }
                ],
                text: payload.message
            }
        ]
    };
}

// Send notification to webhook
async function sendToWebhook(url: string, payload: object): Promise<boolean> {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return response.ok;
    } catch (error) {
        console.error('Failed to send webhook notification:', error);
        return false;
    }
}

// Main notification function
export async function sendNotification(
    siteId: string,
    payload: NotificationPayload
): Promise<{ sent: boolean; channels: string[] }> {
    const settings = await getNotificationSettings(siteId);

    if (!settings) {
        return { sent: false, channels: [] };
    }

    // Check if this notification type is enabled
    if (!isNotificationEnabled(settings, payload.type)) {
        return { sent: false, channels: [] };
    }

    const channels: string[] = [];

    // Send to Slack
    if (settings.slack_webhook_url) {
        const slackPayload = formatSlackMessage(payload);
        const success = await sendToWebhook(settings.slack_webhook_url, slackPayload);
        if (success) channels.push('slack');
    }

    // Send to Teams
    if (settings.teams_webhook_url) {
        const teamsPayload = formatTeamsMessage(payload);
        const success = await sendToWebhook(settings.teams_webhook_url, teamsPayload);
        if (success) channels.push('teams');
    }

    return { sent: channels.length > 0, channels };
}

// Helper functions for common notification types
export const NotificationHelpers = {
    watchlistEntry: (siteName: string, personName: string, reason?: string) => ({
        type: 'watchlist_entry' as NotificationType,
        title: 'ALERTA: Persona en Lista de Bloqueo',
        message: `*${personName}* intentó ingresar.${reason ? `\n_Motivo: ${reason}_` : ''}`,
        siteName,
        timestamp: new Date()
    }),

    contractorComplete: (siteName: string, contractorName: string, count: number) => ({
        type: 'contractor_complete' as NotificationType,
        title: 'Contratista Completo',
        message: `*${contractorName}* tiene todos sus ${count} trabajadores en sitio.`,
        siteName,
        timestamp: new Date()
    }),

    fatigueAlert: (siteName: string, workers: Array<{ name: string; hours: number }>) => ({
        type: 'fatigue_alert' as NotificationType,
        title: 'Alerta de Fatiga',
        message: workers.map(w => `• ${w.name}: ${w.hours.toFixed(1)}h`).join('\n'),
        siteName,
        timestamp: new Date()
    }),

    visitorEntry: (siteName: string, visitorName: string, company?: string) => ({
        type: 'visitor_entry' as NotificationType,
        title: 'Visitante Ingresado',
        message: `*${visitorName}*${company ? ` de ${company}` : ''} ingresó al sitio.`,
        siteName,
        timestamp: new Date()
    })
};
