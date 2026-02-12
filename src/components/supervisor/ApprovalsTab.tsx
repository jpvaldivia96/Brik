import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { logAuditEvent } from '@/lib/auditLog';
import { Check, X, Clock, User, Camera, FileText } from 'lucide-react';

interface PendingEdit {
    id: string;
    site_id: string;
    person_id: string;
    requested_by: string;
    field_name: string;
    table_name: string;
    old_value: string | null;
    new_value: string;
    status: string;
    created_at: string;
    // Joined data
    person_name?: string;
    person_ci?: string;
    requester_email?: string;
}

// Field labels for display
const FIELD_LABELS: Record<string, string> = {
    ci: 'CI / RUT',
    full_name: 'Nombre completo',
    contractor: 'Contratista',
    role: 'Cargo / Rol',
    phone: 'Teléfono',
    insurance_number: 'Nº Seguro',
    insurance_expiry: 'Vencimiento Seguro',
    blood_type: 'Tipo de Sangre',
    emergency_contact: 'Contacto de Emergencia',
    photo_url: 'Foto de Perfil',
    ci_front_url: 'CI Anverso',
    ci_back_url: 'CI Reverso',
};

const isPhotoField = (field: string) =>
    ['photo_url', 'ci_front_url', 'ci_back_url'].includes(field);

export default function ApprovalsTab() {
    const { currentSite } = useSite();
    const { user } = useAuth();
    const { toast } = useToast();
    const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState<string | null>(null);

    useEffect(() => {
        if (currentSite) fetchPendingEdits();
    }, [currentSite]);

    const fetchPendingEdits = async () => {
        if (!currentSite) return;
        setLoading(true);

        try {
            // Get pending edits with person data
            const { data: edits, error } = await (supabase as any)
                .from('pending_edits')
                .select('*')
                .eq('site_id', currentSite.id)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Enrich with person names and requester emails
            const enriched: PendingEdit[] = [];
            const personCache: Record<string, { name: string; ci: string }> = {};
            const userCache: Record<string, string> = {};

            for (const edit of (edits || [])) {
                // Get person name
                if (!personCache[edit.person_id]) {
                    const { data: person } = await supabase
                        .from('people')
                        .select('full_name, ci')
                        .eq('id', edit.person_id)
                        .single();
                    personCache[edit.person_id] = {
                        name: person?.full_name || 'Desconocido',
                        ci: person?.ci || '',
                    };
                }

                // Get requester email from memberships
                if (!userCache[edit.requested_by]) {
                    const { data: membership } = await supabase
                        .from('site_memberships')
                        .select('user_id')
                        .eq('user_id', edit.requested_by)
                        .eq('site_id', currentSite.id)
                        .single();

                    if (membership) {
                        // We can use the user_id as identifier since we don't have direct access to auth.users
                        userCache[edit.requested_by] = edit.requested_by.substring(0, 8) + '...';
                    }
                }

                enriched.push({
                    ...edit,
                    person_name: personCache[edit.person_id]?.name,
                    person_ci: personCache[edit.person_id]?.ci,
                    requester_email: userCache[edit.requested_by],
                });
            }

            setPendingEdits(enriched);
        } catch (err: any) {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (edit: PendingEdit) => {
        if (!currentSite || !user) return;
        setProcessing(edit.id);

        try {
            // Race condition check: verify current value matches old_value
            let currentValue: string | null = null;

            if (edit.table_name === 'people') {
                const { data } = await supabase
                    .from('people')
                    .select(edit.field_name)
                    .eq('id', edit.person_id)
                    .single();
                currentValue = data?.[edit.field_name] || null;
            } else {
                const { data } = await supabase
                    .from('workers_profile')
                    .select(edit.field_name)
                    .eq('person_id', edit.person_id)
                    .single();
                currentValue = data?.[edit.field_name] || null;
            }

            // Check if value has changed since the request was made
            if (edit.old_value && currentValue !== edit.old_value) {
                const confirmOverwrite = confirm(
                    `⚠️ El valor actual de "${FIELD_LABELS[edit.field_name] || edit.field_name}" ` +
                    `ya fue modificado desde que se hizo la solicitud.\n\n` +
                    `Valor cuando se solicitó: ${edit.old_value}\n` +
                    `Valor actual: ${currentValue}\n` +
                    `Valor propuesto: ${edit.new_value}\n\n` +
                    `¿Desea aplicar el cambio de todas formas?`
                );
                if (!confirmOverwrite) {
                    setProcessing(null);
                    return;
                }
            }

            // Apply the change
            if (edit.table_name === 'people') {
                const { error } = await supabase
                    .from('people')
                    .update({ [edit.field_name]: edit.new_value || null })
                    .eq('id', edit.person_id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('workers_profile')
                    .upsert({
                        person_id: edit.person_id,
                        [edit.field_name]: edit.new_value || null,
                    }, { onConflict: 'person_id' });
                if (error) throw error;
            }

            // Mark as approved
            await (supabase as any)
                .from('pending_edits')
                .update({
                    status: 'approved',
                    reviewed_by: user.id,
                    reviewed_at: new Date().toISOString(),
                })
                .eq('id', edit.id);

            // Audit log
            logAuditEvent({
                siteId: currentSite.id,
                userId: user.id,
                action: 'EDIT_APPROVED',
                entityType: 'person',
                entityId: edit.person_id,
                before: { [edit.field_name]: edit.old_value },
                after: { [edit.field_name]: edit.new_value },
                note: `Aprobó cambio de ${FIELD_LABELS[edit.field_name] || edit.field_name} para ${edit.person_name}`,
            });

            toast({ title: '✅ Aprobado', description: `Cambio de ${FIELD_LABELS[edit.field_name] || edit.field_name} aplicado` });
            fetchPendingEdits();
        } catch (err: any) {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        } finally {
            setProcessing(null);
        }
    };

    const handleReject = async (edit: PendingEdit) => {
        if (!currentSite || !user) return;
        setProcessing(edit.id);

        try {
            await (supabase as any)
                .from('pending_edits')
                .update({
                    status: 'rejected',
                    reviewed_by: user.id,
                    reviewed_at: new Date().toISOString(),
                })
                .eq('id', edit.id);

            // Audit log
            logAuditEvent({
                siteId: currentSite.id,
                userId: user.id,
                action: 'EDIT_REJECTED',
                entityType: 'person',
                entityId: edit.person_id,
                note: `Rechazó cambio de ${FIELD_LABELS[edit.field_name] || edit.field_name} para ${edit.person_name}`,
            });

            toast({ title: '❌ Rechazado', description: 'La solicitud fue rechazada' });
            fetchPendingEdits();
        } catch (err: any) {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        } finally {
            setProcessing(null);
        }
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Spinner size="lg" />
            </div>
        );
    }

    if (pendingEdits.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                <Check className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-lg font-medium">Sin solicitudes pendientes</p>
                <p className="text-sm mt-1">Todas las solicitudes han sido procesadas</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
                {pendingEdits.length} solicitud{pendingEdits.length > 1 ? 'es' : ''} pendiente{pendingEdits.length > 1 ? 's' : ''}
            </p>

            {pendingEdits.map((edit) => (
                <div
                    key={edit.id}
                    className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3"
                >
                    {/* Header: Person + time */}
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-purple-400" />
                            <div>
                                <p className="font-medium text-sm">{edit.person_name}</p>
                                <p className="text-xs text-muted-foreground">CI: {edit.person_ci}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {formatDate(edit.created_at)}
                        </div>
                    </div>

                    {/* Field label */}
                    <div className="flex items-center gap-2 text-xs font-medium text-amber-400">
                        {isPhotoField(edit.field_name)
                            ? <Camera className="w-3.5 h-3.5" />
                            : <FileText className="w-3.5 h-3.5" />}
                        {FIELD_LABELS[edit.field_name] || edit.field_name}
                    </div>

                    {/* Before → After comparison */}
                    {isPhotoField(edit.field_name) ? (
                        // Photo comparison: side by side
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <p className="text-[10px] uppercase text-muted-foreground font-medium">Actual</p>
                                <div className="aspect-[4/3] rounded-lg overflow-hidden bg-muted border border-border">
                                    {edit.old_value ? (
                                        <img src={edit.old_value} alt="Actual" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">Sin foto</div>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] uppercase text-emerald-400 font-medium">Propuesto</p>
                                <div className="aspect-[4/3] rounded-lg overflow-hidden bg-muted border border-emerald-500/30">
                                    <img src={edit.new_value} alt="Propuesto" className="w-full h-full object-cover" />
                                </div>
                            </div>
                        </div>
                    ) : (
                        // Text comparison
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                                <p className="text-[10px] uppercase text-red-400 font-medium mb-1">Actual</p>
                                <p className="text-white/80 break-words">{edit.old_value || '(vacío)'}</p>
                            </div>
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
                                <p className="text-[10px] uppercase text-emerald-400 font-medium mb-1">Propuesto</p>
                                <p className="text-white break-words">{edit.new_value || '(vacío)'}</p>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                        <Button
                            size="sm"
                            onClick={() => handleApprove(edit)}
                            disabled={processing === edit.id}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                        >
                            {processing === edit.id ? <Spinner size="sm" className="mr-1" /> : <Check className="w-4 h-4 mr-1" />}
                            Aprobar
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(edit)}
                            disabled={processing === edit.id}
                            className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
                        >
                            <X className="w-4 h-4 mr-1" />
                            Rechazar
                        </Button>
                    </div>
                </div>
            ))}
        </div>
    );
}
