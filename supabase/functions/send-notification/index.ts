// Supabase Edge Function: send-notification
// Sends push notifications via Firebase Cloud Messaging HTTP v1 API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// FCM v1 uses Service Account credentials
const FCM_PROJECT_ID = Deno.env.get("FCM_PROJECT_ID")!; // e.g., "brik-pro-12345"
const FCM_CLIENT_EMAIL = Deno.env.get("FCM_CLIENT_EMAIL")!; // Service account email
const FCM_PRIVATE_KEY = Deno.env.get("FCM_PRIVATE_KEY")!.replace(/\\n/g, "\n"); // Private key

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface NotificationPayload {
    site_id: string;
    type: "warn" | "crit" | "insurance" | "emergency" | "entry" | "exit";
    title: string;
    body: string;
    data?: Record<string, string>;
    user_ids?: string[];
}

serve(async (req) => {
    try {
        const payload: NotificationPayload = await req.json();
        const { site_id, type, title, body, data, user_ids } = payload;

        if (!site_id || !title || !body) {
            return new Response(
                JSON.stringify({ error: "Missing required fields: site_id, title, body" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Get tokens to send to
        let tokensQuery = supabase.from("notification_tokens").select("token, user_id");

        if (user_ids && user_ids.length > 0) {
            tokensQuery = tokensQuery.in("user_id", user_ids);
        } else {
            const { data: members } = await supabase
                .from("site_memberships")
                .select("user_id")
                .eq("site_id", site_id)
                .eq("receive_notifications", true);

            const memberIds = (members || []).map((m) => m.user_id);
            if (memberIds.length === 0) {
                return new Response(
                    JSON.stringify({ sent: 0, message: "No users to notify" }),
                    { headers: { "Content-Type": "application/json" } }
                );
            }
            tokensQuery = tokensQuery.in("user_id", memberIds);
        }

        const { data: tokens, error: tokensError } = await tokensQuery;

        if (tokensError) throw new Error(`Error fetching tokens: ${tokensError.message}`);
        if (!tokens || tokens.length === 0) {
            return new Response(
                JSON.stringify({ sent: 0, message: "No device tokens found" }),
                { headers: { "Content-Type": "application/json" } }
            );
        }

        // Get OAuth2 access token for FCM v1
        const accessToken = await getAccessToken();

        // Send to each device (FCM v1 sends one at a time)
        let success = 0;
        let failure = 0;

        for (const tokenObj of tokens) {
            try {
                await sendToFCMv1(accessToken, tokenObj.token, title, body, data);
                success++;
            } catch (error) {
                console.error(`Failed to send to token:`, error);
                failure++;
            }
        }

        // Log the notification
        const userIds = [...new Set(tokens.map((t) => t.user_id))];
        for (const userId of userIds) {
            await supabase.from("notification_log").insert({
                site_id,
                user_id: userId,
                type,
                title,
                body,
                data,
            });
        }

        return new Response(
            JSON.stringify({ sent: success, failed: failure }),
            { headers: { "Content-Type": "application/json" } }
        );
    } catch (error: any) {
        console.error("Error sending notification:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
});

// Get OAuth2 access token using Service Account
async function getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 3600; // 1 hour

    // Create JWT header and payload
    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
        iss: FCM_CLIENT_EMAIL,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: exp,
    };

    // Encode and sign JWT
    const jwt = await createSignedJWT(header, payload, FCM_PRIVATE_KEY);

    // Exchange JWT for access token
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(`OAuth error: ${JSON.stringify(data)}`);
    }
    return data.access_token;
}

// Create signed JWT
async function createSignedJWT(
    header: object,
    payload: object,
    privateKey: string
): Promise<string> {
    const encoder = new TextEncoder();

    const headerB64 = btoa(JSON.stringify(header));
    const payloadB64 = btoa(JSON.stringify(payload));
    const dataToSign = `${headerB64}.${payloadB64}`;

    // Import private key
    const pemContents = privateKey
        .replace("-----BEGIN PRIVATE KEY-----", "")
        .replace("-----END PRIVATE KEY-----", "")
        .replace(/\n/g, "");
    const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

    const key = await crypto.subtle.importKey(
        "pkcs8",
        binaryDer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
    );

    // Sign
    const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        encoder.encode(dataToSign)
    );

    const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
    return `${dataToSign}.${signatureB64}`;
}

// Send notification using FCM HTTP v1 API
async function sendToFCMv1(
    accessToken: string,
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>
): Promise<void> {
    const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                message: {
                    token,
                    notification: { title, body },
                    data: data || {},
                    android: {
                        priority: "high",
                        notification: { sound: "default" },
                    },
                },
            }),
        }
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(JSON.stringify(error));
    }
}
