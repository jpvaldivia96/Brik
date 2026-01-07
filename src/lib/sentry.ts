import * as Sentry from "@sentry/react";

// DSN from Sentry dashboard - hardcoded for production
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN ||
    "https://a1f501784492ad9cb3fc930a0357e4f4@o4510663563542528.ingest.us.sentry.io/4510663575470080";

export function initSentry() {
    // Skip in development unless DSN is explicitly set via env
    if (import.meta.env.DEV && !import.meta.env.VITE_SENTRY_DSN) {
        console.log('Sentry: Skipping in development mode');
        return;
    }

    Sentry.init({
        dsn: SENTRY_DSN,
        environment: import.meta.env.MODE,

        // Send default PII data (IP, etc)
        sendDefaultPii: true,

        // Performance monitoring - sample 10% of transactions
        tracesSampleRate: 0.1,

        // Integrations
        integrations: [
            Sentry.browserTracingIntegration(),
        ],
    });

    console.log('Sentry initialized for', import.meta.env.MODE);
}

// Capture exception with optional context
export function captureError(error: Error, context?: Record<string, any>) {
    Sentry.captureException(error, {
        extra: context,
    });
}

// Log a message to Sentry
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
    Sentry.captureMessage(message, level);
}

// Set user context after login
export function setUser(userId: string, email?: string) {
    Sentry.setUser({ id: userId, email });
}

// Clear user on logout
export function clearUser() {
    Sentry.setUser(null);
}

// Export Sentry for advanced usage
export { Sentry };
