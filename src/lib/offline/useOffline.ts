import { useState, useEffect, useCallback } from 'react';
import { getPendingCount } from './db';
import { triggerSync } from './sync';

export function useOffline() {
    const [isOnline, setIsOnline] = useState(true); // Start assuming online
    const [pendingCount, setPendingCount] = useState(0);
    const [syncing, setSyncing] = useState(false);

    // Track online/offline status using navigator.onLine + network events
    useEffect(() => {
        // Initial state
        setIsOnline(navigator.onLine);

        const handleOnline = () => {
            console.log('[Offline] Network online event');
            setIsOnline(true);
        };

        const handleOffline = () => {
            console.log('[Offline] Network offline event');
            setIsOnline(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Update pending count periodically
    useEffect(() => {
        const updateCount = async () => {
            try {
                const count = await getPendingCount();
                setPendingCount(count);
            } catch (e) {
                // Ignore errors reading count
            }
        };

        updateCount();
        const interval = setInterval(updateCount, 5000);

        return () => clearInterval(interval);
    }, []);

    // Manual sync function
    const sync = useCallback(async () => {
        if (!isOnline || syncing) return { synced: 0, failed: 0 };

        setSyncing(true);
        try {
            const result = await triggerSync();

            // Update pending count after sync
            const count = await getPendingCount();
            setPendingCount(count);

            return result;
        } finally {
            setSyncing(false);
        }
    }, [isOnline, syncing]);

    return {
        isOnline,
        pendingCount,
        syncing,
        sync,
    };
}
