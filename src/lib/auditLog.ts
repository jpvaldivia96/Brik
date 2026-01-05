import { supabase } from '@/integrations/supabase/client';

// Log an audit event for manual changes or edits
export async function logAuditEvent(params: {
    siteId: string;
    userId: string | null;
    action: 'MANUAL_ENTRY' | 'MANUAL_EXIT' | 'PERSON_EDITED' | 'PERSON_CREATED' | 'PERSON_DELETED' | string;
    entityType: 'person' | 'access_log' | 'settings' | string;
    entityId?: string;
    before?: Record<string, any>;
    after?: Record<string, any>;
    note?: string;
    roleSnapshot?: string;
}) {
    try {
        const { error } = await supabase.from('audit_events').insert({
            site_id: params.siteId,
            user_id: params.userId,
            action: params.action,
            entity_type: params.entityType,
            entity_id: params.entityId || null,
            before: params.before || null,
            after: params.after || null,
            note: params.note || null,
            role_snapshot: (params.roleSnapshot as 'guard' | 'supervisor') || null,
        });

        if (error) {
            console.error('Failed to log audit event:', error);
        }
    } catch (err) {
        console.error('Audit log error:', err);
    }
}

// Format audit data for human-readable display
export function formatAuditChanges(before: Record<string, any>, after: Record<string, any>): string {
    const changes: string[] = [];

    for (const key of Object.keys(after)) {
        if (before[key] !== after[key]) {
            changes.push(`${key}: "${before[key] || '-'}" → "${after[key] || '-'}"`);
        }
    }

    return changes.join(', ');
}
