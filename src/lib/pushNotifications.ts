import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

// Check if running on native platform
const isNative = Capacitor.isNativePlatform();

/**
 * Initialize push notifications
 * Call this after user logs in
 */
export async function initPushNotifications(userId: string): Promise<string | null> {
    if (!isNative) {
        console.log('Push notifications only available on native platforms');
        return null;
    }

    try {
        // Request permission
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            console.log('Push notification permission not granted');
            return null;
        }

        // Register with FCM
        await PushNotifications.register();

        // Wait for registration and return token
        return new Promise((resolve) => {
            PushNotifications.addListener('registration', async (token: Token) => {
                console.log('Push registration success, token:', token.value);

                // Save token to database
                await saveToken(userId, token.value);
                resolve(token.value);
            });

            PushNotifications.addListener('registrationError', (error: any) => {
                console.error('Push registration error:', error);
                resolve(null);
            });
        });
    } catch (error) {
        console.error('Error initializing push notifications:', error);
        return null;
    }
}

/**
 * Save FCM token to database
 */
async function saveToken(userId: string, token: string): Promise<void> {
    const platform = Capacitor.getPlatform(); // 'android', 'ios', or 'web'

    const { error } = await (supabase as any)
        .from('notification_tokens')
        .upsert({
            user_id: userId,
            token,
            platform,
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'user_id,token'
        });

    if (error) {
        console.error('Error saving push token:', error);
    }
}

/**
 * Remove token when user logs out
 */
export async function removePushToken(userId: string): Promise<void> {
    if (!isNative) return;

    const { error } = await (supabase as any)
        .from('notification_tokens')
        .delete()
        .eq('user_id', userId);

    if (error) {
        console.error('Error removing push token:', error);
    }
}

/**
 * Setup notification listeners
 * Call this once when app starts
 */
export function setupPushListeners(
    onNotificationReceived?: (notification: PushNotificationSchema) => void,
    onNotificationTapped?: (notification: ActionPerformed) => void
): void {
    if (!isNative) return;

    // Notification received while app is in foreground
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Push notification received:', notification);
        onNotificationReceived?.(notification);
    });

    // User tapped on notification
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('Push notification action performed:', action);
        onNotificationTapped?.(action);
    });
}

/**
 * Remove all listeners (call on cleanup)
 */
export async function removePushListeners(): Promise<void> {
    if (!isNative) return;
    await PushNotifications.removeAllListeners();
}
