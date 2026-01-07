/**
 * Check if an error is a network/offline error
 */
export function isNetworkError(error: any): boolean {
    if (!error) return false;

    const message = error.message?.toLowerCase() || '';
    const name = error.name?.toLowerCase() || '';

    return (
        message.includes('failed to fetch') ||
        message.includes('network') ||
        message.includes('offline') ||
        message.includes('net::err_') ||
        name === 'typeerror' && message.includes('fetch') ||
        !navigator.onLine
    );
}

/**
 * Handle error with offline awareness
 * Returns true if error was handled silently (offline), false otherwise
 */
export function handleOfflineError(error: any, toast?: any): boolean {
    if (isNetworkError(error) && !navigator.onLine) {
        // Silently ignore network errors when offline
        console.log('[Offline] Suppressed error:', error.message);
        return true;
    }

    // If online, show the error via toast if provided
    if (toast) {
        toast({
            title: 'Error',
            description: error.message || 'Error desconocido',
            variant: 'destructive',
        });
    }

    return false;
}

/**
 * Wrap an async function with offline error handling
 */
export function withOfflineSupport<T>(
    fn: () => Promise<T>,
    fallback?: T
): Promise<T | undefined> {
    return fn().catch((error) => {
        if (isNetworkError(error) && !navigator.onLine) {
            console.log('[Offline] Operation failed, will retry when online');
            return fallback;
        }
        throw error;
    });
}
