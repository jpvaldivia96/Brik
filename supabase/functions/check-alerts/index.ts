// Supabase Edge Function: check-alerts
// Runs periodically to check for various alert conditions
// Call via cron every 15 minutes

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FCM_PROJECT_ID = Deno.env.get("FCM_PROJECT_ID")!;
const FCM_CLIENT_EMAIL = Deno.env.get("FCM_CLIENT_EMAIL")!;
const FCM_PRIVATE_KEY = Deno.env.get("FCM_PRIVATE_KEY")!.replace(/\\n/g, "\n");

interface Alert {
    site_id: string;
    type: string;
    title: string;
    body: string;
    data?: Record<string, string>;
}

serve(async (req) => {
    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const alerts: Alert[] = [];
        const now = new Date();
        const currentHour = now.getHours();

        // Get all sites with their settings
        const { data: sites } = await supabase
            .from("sites")
            .select("id, name, site_settings(warn_hours, crit_hours)");

        if (!sites || sites.length === 0) {
            return jsonResponse({ message: "No sites found" });
        }

        for (const site of sites) {
            const settings = (site as any).site_settings?.[0] || { warn_hours: 10, crit_hours: 12 };
            const warnHours = settings.warn_hours || 10;
            const critHours = settings.crit_hours || 12;

            // ===== 1. HOURS EXCEEDED (WARN/CRIT) =====
            const { data: activeLogs } = await supabase
                .from("access_logs")
                .select("id, person_id, entry_at, people(full_name)")
                .eq("site_id", site.id)
                .is("exit_at", null)
                .is("voided_at", null);

            for (const log of activeLogs || []) {
                const entryAt = new Date(log.entry_at);
                const hoursActive = (now.getTime() - entryAt.getTime()) / (1000 * 60 * 60);
                const personName = (log as any).people?.full_name || "Persona";
                const notifKey = `hours_${log.id}_${Math.floor(hoursActive)}`;

                if (await wasRecentlyNotified(supabase, site.id, notifKey)) continue;

                if (hoursActive >= critHours) {
                    alerts.push({
                        site_id: site.id,
                        type: "crit",
                        title: "⚠️ Alerta CRÍTICA de Horas",
                        body: `${personName} lleva ${hoursActive.toFixed(1)} horas en sitio`,
                        data: { key: notifKey, person_id: log.person_id },
                    });
                } else if (hoursActive >= warnHours) {
                    alerts.push({
                        site_id: site.id,
                        type: "warn",
                        title: "⏰ Alerta de Horas",
                        body: `${personName} lleva ${hoursActive.toFixed(1)} horas en sitio`,
                        data: { key: notifKey, person_id: log.person_id },
                    });
                }
            }

            // ===== 2. LOW ATTENDANCE (<50% by 9 AM) =====
            if (currentHour >= 9 && currentHour < 12) {
                const todayStart = new Date(now);
                todayStart.setHours(0, 0, 0, 0);

                // Get all workers grouped by contractor
                const { data: allWorkers } = await supabase
                    .from("people")
                    .select("id, contractor")
                    .eq("site_id", site.id)
                    .eq("type", "worker")
                    .not("contractor", "is", null);

                // Group by contractor
                const workersByContractor: Record<string, string[]> = {};
                for (const w of allWorkers || []) {
                    const contractor = w.contractor?.toUpperCase() || "SIN CONTRATISTA";
                    if (!workersByContractor[contractor]) workersByContractor[contractor] = [];
                    workersByContractor[contractor].push(w.id);
                }

                // Get today's entries
                const { data: todayEntries } = await supabase
                    .from("access_logs")
                    .select("person_id")
                    .eq("site_id", site.id)
                    .gte("entry_at", todayStart.toISOString())
                    .is("voided_at", null);

                const enteredPersonIds = new Set((todayEntries || []).map(e => e.person_id));

                // Check each contractor
                for (const [contractor, workerIds] of Object.entries(workersByContractor)) {
                    const total = workerIds.length;
                    if (total < 4) continue; // Skip if too few workers to be meaningful

                    const entered = workerIds.filter(id => enteredPersonIds.has(id)).length;
                    const percentage = (entered / total) * 100;

                    if (percentage < 50) {
                        const notifKey = `low_attendance_${contractor}_${todayStart.toISOString().split('T')[0]}`;
                        if (await wasRecentlyNotified(supabase, site.id, notifKey, 4)) continue; // 4 hour cooldown

                        alerts.push({
                            site_id: site.id,
                            type: "low_attendance",
                            title: "📉 Baja Asistencia",
                            body: `${contractor}: Solo ${entered}/${total} trabajadores (${percentage.toFixed(0)}%)`,
                            data: { key: notifKey, contractor },
                        });
                    }
                }
            }

            // ===== 3. NO EXIT REGISTERED (check at 8-10 PM for yesterday) =====
            if (currentHour >= 20 && currentHour < 22) {
                const yesterdayStart = new Date(now);
                yesterdayStart.setDate(yesterdayStart.getDate() - 1);
                yesterdayStart.setHours(0, 0, 0, 0);
                const yesterdayEnd = new Date(yesterdayStart);
                yesterdayEnd.setHours(23, 59, 59, 999);

                const { data: noExitLogs } = await supabase
                    .from("access_logs")
                    .select("id, person_id, entry_at, people(full_name)")
                    .eq("site_id", site.id)
                    .gte("entry_at", yesterdayStart.toISOString())
                    .lte("entry_at", yesterdayEnd.toISOString())
                    .is("exit_at", null)
                    .is("voided_at", null);

                if (noExitLogs && noExitLogs.length > 0) {
                    const notifKey = `no_exit_${yesterdayStart.toISOString().split('T')[0]}`;
                    if (!(await wasRecentlyNotified(supabase, site.id, notifKey, 12))) {
                        const names = noExitLogs.slice(0, 5).map((l: any) => l.people?.full_name || "?").join(", ");
                        const extra = noExitLogs.length > 5 ? ` y ${noExitLogs.length - 5} más` : "";

                        alerts.push({
                            site_id: site.id,
                            type: "no_exit",
                            title: "🚪 Sin Salida Registrada",
                            body: `${noExitLogs.length} personas ayer: ${names}${extra}`,
                            data: { key: notifKey, count: String(noExitLogs.length) },
                        });
                    }
                }
            }

            // ===== 4. INSURANCE EXPIRING =====
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 7); // 7 days ahead
            const todayStr = now.toISOString().split("T")[0];

            const { data: expiringWorkers } = await supabase
                .from("workers_profile")
                .select("person_id, insurance_expiry, people!inner(full_name, site_id)")
                .eq("people.site_id", site.id)
                .lte("insurance_expiry", expiryDate.toISOString().split("T")[0])
                .gte("insurance_expiry", todayStr);

            for (const worker of expiringWorkers || []) {
                const notifKey = `insurance_${worker.person_id}_${worker.insurance_expiry}`;
                if (await wasRecentlyNotified(supabase, site.id, notifKey, 24)) continue;

                const personName = (worker as any).people?.full_name || "Trabajador";
                const daysLeft = Math.ceil(
                    (new Date(worker.insurance_expiry!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
                );

                alerts.push({
                    site_id: site.id,
                    type: "insurance",
                    title: "📋 Seguro por Vencer",
                    body: `El seguro de ${personName} vence en ${daysLeft} día${daysLeft !== 1 ? 's' : ''}`,
                    data: { key: notifKey, person_id: worker.person_id },
                });
            }
        }

        // Send all alerts
        let sent = 0;
        const accessToken = alerts.length > 0 ? await getAccessToken() : null;

        for (const alert of alerts) {
            try {
                await sendNotification(supabase, alert, accessToken!);
                sent++;
            } catch (e) {
                console.error("Error sending alert:", e);
            }
        }

        return jsonResponse({ checked: sites.length, alerts_sent: sent });
    } catch (error: any) {
        console.error("Error in check-alerts:", error);
        return jsonResponse({ error: error.message }, 500);
    }
});

// ===== HELPER FUNCTIONS =====

function jsonResponse(data: any, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

async function wasRecentlyNotified(
    supabase: any,
    siteId: string,
    key: string,
    hoursAgo = 1
): Promise<boolean> {
    const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
        .from("notification_log")
        .select("id")
        .eq("site_id", siteId)
        .eq("data->>key", key)
        .gte("sent_at", cutoff)
        .limit(1);
    return data && data.length > 0;
}

async function sendNotification(supabase: any, alert: Alert, accessToken: string) {
    const { site_id, type, title, body, data } = alert;

    // Get tokens for site members with notifications enabled
    const { data: members } = await supabase
        .from("site_memberships")
        .select("user_id")
        .eq("site_id", site_id)
        .eq("receive_notifications", true);

    const memberIds = (members || []).map((m: any) => m.user_id);
    if (memberIds.length === 0) return;

    const { data: tokens } = await supabase
        .from("notification_tokens")
        .select("token, user_id")
        .in("user_id", memberIds);

    if (!tokens || tokens.length === 0) return;

    // Send to each token
    for (const tokenObj of tokens) {
        try {
            await sendToFCMv1(accessToken, tokenObj.token, title, body, data);
        } catch (e) {
            console.error("FCM error:", e);
        }
    }

    // Log notification
    for (const userId of memberIds) {
        await supabase.from("notification_log").insert({
            site_id,
            user_id: userId,
            type,
            title,
            body,
            data,
        });
    }
}

async function getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
        iss: FCM_CLIENT_EMAIL,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
    };

    const jwt = await createSignedJWT(header, payload, FCM_PRIVATE_KEY);

    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    const data = await response.json();
    if (!response.ok) throw new Error(`OAuth error: ${JSON.stringify(data)}`);
    return data.access_token;
}

async function createSignedJWT(header: object, payload: object, privateKey: string): Promise<string> {
    const encoder = new TextEncoder();
    const headerB64 = btoa(JSON.stringify(header));
    const payloadB64 = btoa(JSON.stringify(payload));
    const dataToSign = `${headerB64}.${payloadB64}`;

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

    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(dataToSign));
    const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
    return `${dataToSign}.${signatureB64}`;
}

async function sendToFCMv1(accessToken: string, token: string, title: string, body: string, data?: Record<string, string>) {
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
                    android: { priority: "high", notification: { sound: "default" } },
                },
            }),
        }
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(JSON.stringify(error));
    }
}
