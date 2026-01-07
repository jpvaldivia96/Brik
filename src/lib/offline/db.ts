import Dexie, { type Table } from 'dexie';

// Types for offline storage
export interface PendingOperation {
    id?: number;
    type: 'entry' | 'exit' | 'void';
    data: {
        person_id: string;
        site_id: string;
        entry_at?: string;
        exit_at?: string;
        access_log_id?: string;
        voided_reason?: string;
    };
    created_at: string;
    synced?: boolean;
    error?: string;
}

export interface CachedPerson {
    id: string;
    site_id: string;
    full_name: string;
    ci: string;
    contractor: string;
    type: 'worker' | 'visitor';
    photo_url?: string;
    updated_at: string;
}

// Dexie database class
class BrikOfflineDB extends Dexie {
    pendingOperations!: Table<PendingOperation>;
    cachedPeople!: Table<CachedPerson>;

    constructor() {
        super('BrikOfflineDB');

        this.version(1).stores({
            pendingOperations: '++id, type, synced, created_at',
            cachedPeople: 'id, site_id, full_name, ci',
        });
    }
}

// Singleton instance
export const db = new BrikOfflineDB();

// Helper functions
export async function addPendingOperation(operation: Omit<PendingOperation, 'id' | 'created_at' | 'synced'>) {
    return db.pendingOperations.add({
        ...operation,
        created_at: new Date().toISOString(),
        synced: false,
    });
}

export async function getPendingOperations() {
    return db.pendingOperations.where('synced').equals(0).toArray();
}

export async function markOperationSynced(id: number) {
    return db.pendingOperations.update(id, { synced: true });
}

export async function markOperationError(id: number, error: string) {
    return db.pendingOperations.update(id, { error });
}

export async function getPendingCount() {
    return db.pendingOperations.where('synced').equals(0).count();
}

// Cache people for offline search
export async function cachePeople(people: CachedPerson[]) {
    return db.cachedPeople.bulkPut(people);
}

export async function searchCachedPeople(siteId: string, query: string) {
    const q = query.toLowerCase();
    return db.cachedPeople
        .where('site_id')
        .equals(siteId)
        .filter(p =>
            p.full_name.toLowerCase().includes(q) ||
            p.ci.toLowerCase().includes(q)
        )
        .limit(10)
        .toArray();
}

export async function clearCache() {
    await db.pendingOperations.where('synced').equals(1).delete();
    await db.cachedPeople.clear();
}
