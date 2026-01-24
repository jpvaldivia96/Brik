// Supabase Edge Function: update-user-email
// Allows site owners to update other users' email addresses.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const url = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
        const anonKey =
            Deno.env.get("SUPABASE_ANON_KEY") ??
            Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
            Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY");
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        const missing: string[] = [];
        if (!url) missing.push("SUPABASE_URL");
        if (!anonKey) missing.push("SUPABASE_ANON_KEY");
        if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

        if (missing.length) {
            console.error("[update-user-email] Backend misconfigured. Missing:", missing.join(", "));
            return new Response(JSON.stringify({ error: "Backend misconfigured", missing }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const authHeader = req.headers.get("Authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

        if (!token) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Verify caller using a non-privileged client
        const authClient = createClient(url!, anonKey!, {
            global: {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            },
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        });

        const { data: userData, error: userError } = await authClient.auth.getUser(token);
        if (userError || !userData?.user) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const callerId = userData.user.id;

        // Parse request body
        const body = await req.json().catch(() => ({}));
        const { siteId, targetUserId, newEmail } = body;

        if (!siteId || !targetUserId || !newEmail) {
            return new Response(
                JSON.stringify({ error: "Faltan campos requeridos: siteId, targetUserId, newEmail" }),
                {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
            return new Response(
                JSON.stringify({ error: "Formato de email inválido" }),
                {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        // Use privileged client for admin operations
        const admin = createClient(url!, serviceKey!, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        });

        // Verify caller is owner of the site
        const { data: callerMembership, error: membershipError } = await admin
            .from("site_memberships")
            .select("role")
            .eq("site_id", siteId)
            .eq("user_id", callerId)
            .single();

        if (membershipError || !callerMembership) {
            return new Response(
                JSON.stringify({ error: "No tienes acceso a esta obra" }),
                {
                    status: 403,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        if (callerMembership.role !== "owner") {
            return new Response(
                JSON.stringify({ error: "Solo el owner puede modificar emails de usuarios" }),
                {
                    status: 403,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        // Verify target user belongs to the same site
        const { data: targetMembership } = await admin
            .from("site_memberships")
            .select("role")
            .eq("site_id", siteId)
            .eq("user_id", targetUserId)
            .single();

        if (!targetMembership) {
            return new Response(
                JSON.stringify({ error: "El usuario no pertenece a esta obra" }),
                {
                    status: 404,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        // Prevent owner from changing their own email through this endpoint
        if (targetUserId === callerId) {
            return new Response(
                JSON.stringify({ error: "No puedes cambiar tu propio email desde aquí. Usa la opción de perfil." }),
                {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        // Update user email using Admin API
        const { data: updatedUser, error: updateError } = await admin.auth.admin.updateUserById(
            targetUserId,
            { email: newEmail }
        );

        if (updateError) {
            console.error("[update-user-email] Error updating user:", updateError);
            return new Response(
                JSON.stringify({ error: updateError.message }),
                {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        // Log audit event
        await admin.from("audit_events").insert({
            site_id: siteId,
            action: "USER_EMAIL_CHANGED",
            entity_type: "auth.users",
            entity_id: targetUserId,
            after: { email: newEmail },
        });

        console.log("[update-user-email] Successfully updated email for user:", targetUserId);

        return new Response(
            JSON.stringify({ success: true, user: { id: updatedUser.user.id, email: updatedUser.user.email } }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[update-user-email] unhandled error:", message);
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
