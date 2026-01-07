import { supabase } from '@/integrations/supabase/client';
import {
    db,
    getPendingOperations,
    markOperationSynced,
    markOperationError,
    type PendingOperation
} from './db';

// Sync pending operations to Supabase
export async function syncPendingOperations(): Promise<{ synced: number; failed: number }> {
    const pending = await getPendingOperations();
    let synced = 0;
    let failed = 0;

    for (const op of pending) {
        try {
            await syncOperation(op);
            if (op.id) await markOperationSynced(op.id);
            synced++;
        } catch (error: any) {
            if (op.id) await markOperationError(op.id, error.message);
            failed++;
            console.error('Sync failed for operation:', op.id, error);
        }
    }

    return { synced, failed };
}

async function syncOperation(op: PendingOperation) {
    switch (op.type) {
        case 'entry':
            const { error: entryError } = await supabase
                .from('access_logs')
                .insert({
                    person_id: op.data.person_id,
                    site_id: op.data.site_id,
                    entry_at: op.data.entry_at || new Date().toISOString(),
                });
            if (entryError) throw entryError;
            break;

        case 'exit':
            const { error: exitError } = await supabase
                .from('access_logs')
                .update({ exit_at: op.data.exit_at || new Date().toISOString() })
                .eq('id', op.data.access_log_id);
            if (exitError) throw exitError;
            break;

        case 'void':
            const { error: voidError } = await supabase
                .from('access_logs')
                .update({
                    voided_at: new Date().toISOString(),
                    voided_reason: op.data.voided_reason || 'Voided offline'
                })
                .eq('id', op.data.access_log_id);
            if (voidError) throw voidError;
            break;
    }
}

// Auto-sync when coming online
let syncInProgress = false;

export function startAutoSync() {
    window.addEventListener('online', async () => {
        if (syncInProgress) return;
        syncInProgress = true;

        console.log('Back online, syncing...');
        const result = await syncPendingOperations();
        console.log('Sync complete:', result);

        syncInProgress = false;
    });
}

// Manual sync trigger
export async function triggerSync() {
    if (syncInProgress) return { synced: 0, failed: 0 };
    syncInProgress = true;

    const result = await syncPendingOperations();
    syncInProgress = false;

    return result;
}
