// Supabase Edge Function: rate-limit
// Implements rate limiting for login and API actions
// Uses in-memory storage (resets on cold start) - consider Redis for production

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HCAPTCHA_SECRET = Deno.env.get("HCAPTCHA_SECRET") || "";

// Rate limit configurations per action type
const RATE_LIMITS: Record<string, { maxAttempts: number; windowSeconds: number }> = {
    login: { maxAttempts: 5, windowSeconds: 60 },           // 5 attempts per minute
    register_person: { maxAttempts: 20, windowSeconds: 3600 }, // 20 per hour
    api: { maxAttempts: 100, windowSeconds: 60 },           // 100 per minute
};

// In-memory store for rate limiting (resets on cold start)
// Key: action:identifier, Value: { count, resetAt }
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Cleanup old entries periodically
function cleanupStore() {
    const now = Date.now();
    for (const [key, value] of rateLimitStore.entries()) {
        if (value.resetAt < now) {
            rateLimitStore.delete(key);
        }
    }
}

// Run cleanup every minute
setInterval(cleanupStore, 60000);

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
        });
    }

    try {
        const { action, identifier, siteId, hcaptchaToken } = await req.json();

        if (!action || !identifier) {
            return jsonResponse({ error: "Missing action or identifier" }, 400);
        }

        const config = RATE_LIMITS[action] || RATE_LIMITS.api;
        const key = `${action}:${identifier}${siteId ? `:${siteId}` : ""}`;
        const now = Date.now();

        // Get or create rate limit entry
        let entry = rateLimitStore.get(key);
        if (!entry || entry.resetAt < now) {
            entry = { count: 0, resetAt: now + config.windowSeconds * 1000 };
        }

        // Increment count
        entry.count++;
        rateLimitStore.set(key, entry);

        const remaining = Math.max(0, config.maxAttempts - entry.count);
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

        // Check if rate limited
        if (entry.count > config.maxAttempts) {
            // If hCaptcha token provided, verify it to allow bypass
            if (hcaptchaToken && HCAPTCHA_SECRET) {
                const captchaValid = await verifyHCaptcha(hcaptchaToken);
                if (captchaValid) {
                    // Reset count on successful captcha
                    entry.count = 1;
                    rateLimitStore.set(key, entry);
                    return jsonResponse({
                        allowed: true,
                        remaining: config.maxAttempts - 1,
                        retryAfter: null,
                    });
                }
            }

            // Log rate limit hit for monitoring
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
            await supabase.from("audit_events").insert({
                action: "RATE_LIMITED",
                entity_type: action,
                note: `Rate limit exceeded for ${identifier}`,
                created_at: new Date().toISOString(),
            }).catch(() => { }); // Don't fail on logging error

            return jsonResponse({
                allowed: false,
                remaining: 0,
                retryAfter,
                requiresCaptcha: entry.count > config.maxAttempts * 2,
            });
        }

        return jsonResponse({
            allowed: true,
            remaining,
            retryAfter: null,
        });
    } catch (error: any) {
        console.error("Rate limit error:", error);
        // On error, allow the request (don't block users due to errors)
        return jsonResponse({ allowed: true, error: error.message });
    }
});

async function verifyHCaptcha(token: string): Promise<boolean> {
    if (!HCAPTCHA_SECRET) return false;

    try {
        const response = await fetch("https://hcaptcha.com/siteverify", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `secret=${HCAPTCHA_SECRET}&response=${token}`,
        });
        const data = await response.json();
        return data.success === true;
    } catch {
        return false;
    }
}

function jsonResponse(data: any, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
    });
}
