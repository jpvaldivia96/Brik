import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useSite } from '@/contexts/SiteContext';
import { logAuditEvent } from '@/lib/auditLog';
import { Save, X, Pencil, User, Moon, Calendar, Tag, Briefcase } from 'lucide-react';
import { ContractorAutocomplete } from '@/components/ui/contractor-autocomplete';
import { TagAutocomplete, TagBadge } from '@/components/ui/tag-autocomplete';
import { CategoryAutocomplete, CategoryBadge, CategoryDefinition } from '@/components/ui/category-autocomplete';
import { PhotoEditor } from './PhotoEditor';

interface EditWorkerModalProps {
    open: boolean;
    onClose: () => void;
    personId: string;
    onSaved: () => void;
}

interface WorkerData {
    id: string;
    ci: string;
    full_name: string;
    contractor: string | null;
    photo_url: string | null;
    ci_front_url?: string | null;
    ci_back_url?: string | null;
    workers_profile?: {
        role: string | null;
        insurance_number: string | null;
        insurance_expiry: string | null;
        induction_date: string | null;
        phone: string | null;
        emergency_contact: string | null;
        blood_type: string | null;
        night_permit_permanent?: boolean;
        night_permit_until?: string | null;
        is_inspector?: boolean;
        is_dependent?: boolean;
    };
}

interface TagDefinition {
    id: string;
    name: string;
    color: string;
}

// Extracted View Mode Component
const ViewForm = ({ workerData, form, handleClose, setEditing, isExternalInspector, shouldMaskPhone, canEdit }: any) => {
    const hasPermit = form.nightPermitPermanent || (form.nightPermitUntil && new Date(form.nightPermitUntil) > new Date());
    const isInspectorWorker = form.isInspector;
    const tags: TagDefinition[] = form.tags || [];

    // Mask phone numbers for external inspectors AND guards
    const maskPhone = (phone: string | null) => {
        if (!phone || !shouldMaskPhone) return phone || '-';
        return '******';
    };

    return (
        <div className="space-y-4">
            {/* Basic info - photo is now in PhotoEditor above */}
            <div className="space-y-1">
                <h3 className="text-lg font-semibold">{workerData?.full_name}</h3>
                <p className="text-muted-foreground">CI: {workerData?.ci}</p>
                <p className="text-sm text-muted-foreground">{workerData?.contractor || 'Sin contratista'}</p>

                <div className="flex flex-wrap gap-1 mt-2">
                    {isInspectorWorker && (
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-purple-500/10 text-purple-400 text-xs font-medium border border-purple-500/20">
                            <UserCheck className="w-3 h-3" />
                            Inspector
                        </div>
                    )}
                    {form.isDependent && (
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 text-amber-400 text-xs font-medium border border-amber-500/20">
                            <User className="w-3 h-3" />
                            Dependiente
                        </div>
                    )}
                    {hasPermit && (
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-indigo-500/10 text-indigo-400 text-xs font-medium border border-indigo-500/20">
                            <Moon className="w-3 h-3" />
                            {form.nightPermitPermanent ? 'Nocturno Permanente' : `Nocturno hasta ${new Date(form.nightPermitUntil).toLocaleDateString()}`}
                        </div>
                    )}
                    {/* Tags */}
                    {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                            {tags.map((tag: TagDefinition) => (
                                <TagBadge key={tag.id} name={tag.name} color={tag.color} />
                            ))}
                        </div>
                    )}
                    {/* Work Categories */}
                    {(form.categories || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                            {(form.categories || []).map((cat: CategoryDefinition) => (
                                <CategoryBadge key={cat.id} name={cat.category_name} color={cat.color} />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Data fields in a simple grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-card/50 rounded-lg">
                    <p className="text-muted-foreground text-xs">Cargo</p>
                    <p className="font-medium">{form.role || '-'}</p>
                </div>
                <div className="p-3 bg-card/50 rounded-lg">
                    <p className="text-muted-foreground text-xs">Teléfono</p>
                    <p className="font-medium">{maskPhone(form.phone)}</p>
                </div>
                <div className="p-3 bg-card/50 rounded-lg">
                    <p className="text-muted-foreground text-xs">Nº Seguro</p>
                    <p className="font-medium">{form.insuranceNumber || '-'}</p>
                </div>
                <div className="p-3 bg-card/50 rounded-lg">
                    <p className="text-muted-foreground text-xs">Venc. Seguro</p>
                    <p className="font-medium">{form.insuranceExpiry || '-'}</p>
                </div>
                <div className="p-3 bg-card/50 rounded-lg">
                    <p className="text-muted-foreground text-xs">Tipo de Sangre</p>
                    <p className="font-medium">{form.bloodType || '-'}</p>
                </div>
                <div className="p-3 bg-card/50 rounded-lg">
                    <p className="text-muted-foreground text-xs">Contacto Emergencia</p>
                    <p className="font-medium truncate">{maskPhone(form.emergencyContact)}</p>
                </div>
            </div>

            <div className="p-3 bg-card/50 rounded-lg flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${form.inductionCompleted ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm">{form.inductionCompleted ? 'Inducción completada' : 'Inducción pendiente'}</span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
                {canEdit && (
                    <Button onClick={() => setEditing(true)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Editar
                    </Button>
                )}
                <Button variant="outline" onClick={handleClose}>
                    Cerrar
                </Button>
            </div>
        </div>
    );
};

// Extracted Edit Mode Component
import { UserCheck } from 'lucide-react';

const EditForm = ({ form, setForm, saving, handleSave, setEditing, shouldMaskPhone }: any) => (
    <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-2">
                <Label>Nombre completo</Label>
                <Input
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                />
            </div>

            <div className="space-y-2">
                <Label>CI</Label>
                <Input
                    value={form.ci}
                    onChange={(e) => setForm({ ...form, ci: e.target.value })}
                />
            </div>

            <div className="space-y-2">
                <Label>Contratista</Label>
                <ContractorAutocomplete
                    value={form.contractor}
                    onChange={(val) => setForm({ ...form, contractor: val, categories: [] })}
                    placeholder="Seleccionar contratista"
                />
            </div>

            {/* Work Categories */}
            {form.contractor && (
                <div className="col-span-2 space-y-2">
                    <Label className="flex items-center gap-2">
                        <Briefcase className="w-4 h-4 text-blue-400" />
                        Categoría de Trabajo
                    </Label>
                    <CategoryAutocomplete
                        contractorName={form.contractor}
                        selectedCategories={form.categories || []}
                        onChange={(cats) => setForm({ ...form, categories: cats })}
                    />
                </div>
            )}

            <div className="space-y-2">
                <Label>Cargo / Rol</Label>
                <Input
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                />
            </div>

            <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                    value={shouldMaskPhone ? '******' : form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    readOnly={shouldMaskPhone}
                    className={shouldMaskPhone ? 'opacity-50 cursor-not-allowed' : ''}
                />
            </div>

            <div className="space-y-2">
                <Label>Nº Seguro</Label>
                <Input
                    value={form.insuranceNumber}
                    onChange={(e) => setForm({ ...form, insuranceNumber: e.target.value })}
                />
            </div>

            <div className="space-y-2">
                <Label>Vencimiento Seguro</Label>
                <Input
                    type="date"
                    value={form.insuranceExpiry}
                    onChange={(e) => setForm({ ...form, insuranceExpiry: e.target.value })}
                />
            </div>

            <div className="space-y-2">
                <Label>Tipo de Sangre</Label>
                <Input
                    value={form.bloodType}
                    onChange={(e) => setForm({ ...form, bloodType: e.target.value })}
                    placeholder="Ej: O+"
                />
            </div>

            <div className="space-y-2">
                <Label>Contacto Emergencia</Label>
                <Input
                    value={shouldMaskPhone ? '******' : form.emergencyContact}
                    onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
                    readOnly={shouldMaskPhone}
                    className={shouldMaskPhone ? 'opacity-50 cursor-not-allowed' : ''}
                />
            </div>
        </div>

        {/* Permissions Section */}
        <div className="space-y-3 pt-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Permisos especiales & Roles</Label>

            <div className="p-3 bg-card/50 rounded-xl border border-border space-y-4">
                {/* Inspector Flag */}
                <div className="flex items-center gap-3">
                    <input
                        type="checkbox"
                        id="isInspector"
                        checked={form.isInspector}
                        onChange={(e) => setForm({ ...form, isInspector: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-400 bg-transparent text-purple-500 focus:ring-purple-500"
                    />
                    <Label htmlFor="isInspector" className="cursor-pointer flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-purple-400" />
                        <span>Es Inspector / Fiscal de Obra</span>
                    </Label>
                </div>

                {/* Dependent Flag */}
                <div className="flex items-center gap-3">
                    <input
                        type="checkbox"
                        id="isDependent"
                        checked={form.isDependent}
                        onChange={(e) => setForm({ ...form, isDependent: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-400 bg-transparent text-amber-500 focus:ring-amber-500"
                    />
                    <Label htmlFor="isDependent" className="cursor-pointer flex items-center gap-2">
                        <User className="w-4 h-4 text-amber-400" />
                        <span>Dependiente / Seguimiento</span>
                    </Label>
                </div>

                <div className="h-px bg-border/50" />

                {/* Permanent Permit */}
                <div className="flex items-center gap-3">
                    <input
                        type="checkbox"
                        id="permanentPermit"
                        checked={form.nightPermitPermanent}
                        onChange={(e) => setForm({
                            ...form,
                            nightPermitPermanent: e.target.checked,
                            // If permanent is checked, clear date
                            nightPermitUntil: e.target.checked ? '' : form.nightPermitUntil
                        })}
                        className="w-4 h-4 rounded border-gray-400 bg-transparent"
                    />
                    <Label htmlFor="permanentPermit" className="cursor-pointer flex items-center gap-2">
                        <Moon className="w-4 h-4 text-indigo-400" />
                        <span>Permiso nocturno permanente</span>
                    </Label>
                </div>

                {/* Temporary Permit Date - Only show if not permanent */}
                {!form.nightPermitPermanent && (
                    <div className="space-y-1.5 pl-7">
                        <Label className="text-xs text-muted-foreground">O permiso temporal hasta:</Label>
                        <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <Input
                                type="date"
                                className="h-9"
                                value={form.nightPermitUntil ? form.nightPermitUntil.split('T')[0] : ''}
                                onChange={(e) => setForm({ ...form, nightPermitUntil: e.target.value })}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* Tags Section */}
        <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-2">
                <Tag className="w-3 h-3" />
                Etiquetas de personalidad
            </Label>
            <TagAutocomplete
                selectedTags={form.tags || []}
                onChange={(tags) => setForm({ ...form, tags })}
            />
        </div>

        <div className="flex items-center gap-3 p-3 bg-card/50 rounded-xl border border-border">
            <input
                type="checkbox"
                id="inductionEdit"
                checked={form.inductionCompleted}
                onChange={(e) => setForm({ ...form, inductionCompleted: e.target.checked })}
                className="w-5 h-5 rounded"
            />
            <Label htmlFor="inductionEdit" className="cursor-pointer">
                Inducción completada
            </Label>
        </div>

        <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => setEditing(false)} className="flex-1">
                <X className="w-4 h-4 mr-2" />
                Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? <Spinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Guardar
            </Button>
        </div>
    </div>
);

export function EditWorkerModal({ open, onClose, personId, onSaved }: EditWorkerModalProps) {
    const { user } = useAuth();
    const { currentSite, isExternalInspector, isSupervisor, isInspector, currentRole } = useSite();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);
    const [workerData, setWorkerData] = useState<WorkerData | null>(null);
    const [form, setForm] = useState<{
        ci: string;
        fullName: string;
        contractor: string;
        role: string;
        insuranceNumber: string;
        insuranceExpiry: string;
        phone: string;
        emergencyContact: string;
        bloodType: string;
        inductionCompleted: boolean;
        nightPermitPermanent: boolean;
        nightPermitUntil: string;
        isInspector: boolean;
        isDependent: boolean;
        tags: TagDefinition[];
    }>({
        ci: '',
        fullName: '',
        contractor: '',
        role: '',
        insuranceNumber: '',
        insuranceExpiry: '',
        phone: '',
        emergencyContact: '',
        bloodType: '',
        inductionCompleted: false,
        nightPermitPermanent: false,
        nightPermitUntil: '',
        isInspector: false,
        isDependent: false,
        tags: [],
        categories: [] as CategoryDefinition[],
    });
    const { toast } = useToast();

    useEffect(() => {
        if (open && personId) {
            setEditing(false); // Always start in view mode
            fetchWorkerData();
        }
    }, [open, personId]);

    const fetchWorkerData = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('people')
            .select('*, workers_profile(*)')
            .eq('id', personId)
            .maybeSingle();

        if (error || !data) {
            toast({ title: 'Error', description: error?.message || 'No encontrado', variant: 'destructive' });
            onClose();
            return;
        }

        const worker = data as unknown as WorkerData;
        const wp = worker.workers_profile;

        // Load tags for this worker
        // NOTE: Using 'as any' because worker_tags tables are new and not in generated types yet
        const { data: tagsData } = await (supabase as any)
            .from('worker_tags')
            .select('tag_id, worker_tags_definitions(id, name, color)')
            .eq('person_id', personId);

        const tags: TagDefinition[] = (tagsData || []).map((t: any) => ({
            id: t.worker_tags_definitions.id,
            name: t.worker_tags_definitions.name,
            color: t.worker_tags_definitions.color,
        }));

        // Load categories for this worker
        const { data: catsData } = await (supabase as any)
            .from('worker_categories')
            .select('category_id, contractor_categories(id, category_name, color)')
            .eq('person_id', personId);

        const categories: CategoryDefinition[] = (catsData || []).map((c: any) => ({
            id: c.contractor_categories.id,
            category_name: c.contractor_categories.category_name,
            color: c.contractor_categories.color,
        }));

        setWorkerData(worker);
        setForm({
            ci: worker.ci || '',
            fullName: worker.full_name || '',
            contractor: worker.contractor || '',
            role: wp?.role || '',
            insuranceNumber: wp?.insurance_number || '',
            insuranceExpiry: wp?.insurance_expiry || '',
            phone: wp?.phone || '',
            emergencyContact: wp?.emergency_contact || '',
            bloodType: wp?.blood_type || '',
            inductionCompleted: !!wp?.induction_date,
            nightPermitPermanent: wp?.night_permit_permanent || false,
            nightPermitUntil: wp?.night_permit_until ? wp.night_permit_until.split('T')[0] : '',
            isInspector: wp?.is_inspector || false,
            isDependent: wp?.is_dependent || false,
            tags,
            categories,
        });
        setLoading(false);

        // 4. Audit Log: Registrar acceso de inspector externo
        if (isExternalInspector && currentSite && user) {
            logAuditEvent({
                siteId: currentSite.id,
                userId: user.id,
                action: 'EXTERNAL_INSPECTOR_VIEW',
                entityType: 'people',
                entityId: personId,
                note: `Inspector externo visualizó ficha de ${worker.full_name} (CI: ${worker.ci})`,
                roleSnapshot: 'external_inspector',
            });
        }
    };

    // Determine if guard needs approval flow
    const needsApproval = !isSupervisor; // Guards need approval, supervisors/owners/admins don't
    // Can edit: not inspector (internal or external)
    const canEdit = !isInspector && !isExternalInspector;
    // Should mask phone: guards and inspectors
    const shouldMaskPhone = !isSupervisor;

    const handleSave = async () => {
        setSaving(true);
        try {
            if (needsApproval && currentSite) {
                // GUARD FLOW: Create pending_edits instead of direct update
                await handleGuardSave();
            } else {
                // SUPERVISOR/OWNER/ADMIN FLOW: Direct update (unchanged)
                await handleDirectSave();
            }
        } catch (err: any) {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    // Guard save: compare fields and create pending_edits
    const handleGuardSave = async () => {
        if (!currentSite || !workerData) return;
        const wp = workerData.workers_profile;

        // Field mapping: { formKey, dbFieldName, tableName, oldValue, newValue }
        const fieldChanges = [
            { field: 'ci', dbField: 'ci', table: 'people', old: workerData.ci || '', new: form.ci.trim() },
            { field: 'fullName', dbField: 'full_name', table: 'people', old: workerData.full_name || '', new: form.fullName.trim() },
            { field: 'contractor', dbField: 'contractor', table: 'people', old: workerData.contractor || '', new: form.contractor.trim() },
            { field: 'role', dbField: 'role', table: 'workers_profile', old: wp?.role || '', new: form.role.trim() },
            { field: 'phone', dbField: 'phone', table: 'workers_profile', old: wp?.phone || '', new: form.phone.trim() },
            { field: 'insuranceNumber', dbField: 'insurance_number', table: 'workers_profile', old: wp?.insurance_number || '', new: form.insuranceNumber.trim() },
            { field: 'insuranceExpiry', dbField: 'insurance_expiry', table: 'workers_profile', old: wp?.insurance_expiry || '', new: form.insuranceExpiry },
            { field: 'bloodType', dbField: 'blood_type', table: 'workers_profile', old: wp?.blood_type || '', new: form.bloodType.trim() },
            { field: 'emergencyContact', dbField: 'emergency_contact', table: 'workers_profile', old: wp?.emergency_contact || '', new: form.emergencyContact.trim() },
        ];

        // Find fields that actually changed
        const changedFields = fieldChanges.filter(f => f.old !== f.new);

        if (changedFields.length === 0) {
            toast({ title: 'Sin cambios', description: 'No se detectaron modificaciones.' });
            setEditing(false);
            return;
        }

        // Cancel any previous pending edits for the same person/fields
        for (const change of changedFields) {
            await (supabase as any)
                .from('pending_edits')
                .update({ status: 'rejected', reviewed_at: new Date().toISOString(), review_note: 'Reemplazado por nueva solicitud' })
                .eq('person_id', personId)
                .eq('site_id', currentSite.id)
                .eq('field_name', change.dbField)
                .eq('status', 'pending');
        }

        // Insert new pending edits
        const pendingInserts = changedFields.map(change => ({
            site_id: currentSite.id,
            person_id: personId,
            requested_by: user?.id,
            field_name: change.dbField,
            table_name: change.table,
            old_value: change.old || null,
            new_value: change.new,
            status: 'pending',
        }));

        const { error } = await (supabase as any)
            .from('pending_edits')
            .insert(pendingInserts);

        if (error) throw error;

        // Audit log
        logAuditEvent({
            siteId: currentSite.id,
            userId: user?.id || null,
            action: 'EDIT_REQUESTED',
            entityType: 'person',
            entityId: personId,
            after: { fields_changed: changedFields.map(f => f.dbField) },
            note: `Solicitud de edición por ${currentRole} (${changedFields.length} campo${changedFields.length > 1 ? 's' : ''})`,
        });

        toast({
            title: '📋 Solicitud enviada',
            description: `${changedFields.length} cambio${changedFields.length > 1 ? 's' : ''} pendiente${changedFields.length > 1 ? 's' : ''} de aprobación`,
        });
        setEditing(false);
        onSaved();
    };

    // Direct save for supervisors/owners/admins (original logic)
    const handleDirectSave = async () => {
        const { error: personError } = await supabase
            .from('people')
            .update({
                ci: form.ci.trim(),
                full_name: form.fullName.trim(),
                contractor: form.contractor.trim() || null,
            })
            .eq('id', personId);

        if (personError) throw personError;

        const { error: profileError } = await supabase
            .from('workers_profile')
            .upsert({
                person_id: personId,
                role: form.role.trim() || null,
                insurance_number: form.insuranceNumber.trim() || null,
                insurance_expiry: form.insuranceExpiry || null,
                phone: form.phone.trim() || null,
                emergency_contact: form.emergencyContact.trim() || null,
                blood_type: form.bloodType.trim() || null,
                induction_date: form.inductionCompleted ? new Date().toISOString().split('T')[0] : null,
                night_permit_permanent: form.nightPermitPermanent,
                night_permit_until: form.nightPermitUntil || null,
                is_inspector: form.isInspector,
                is_dependent: form.isDependent,
            }, { onConflict: 'person_id' });

        if (profileError) throw profileError;

        // Update tags
        await (supabase as any)
            .from('worker_tags')
            .delete()
            .eq('person_id', personId);

        if (form.tags.length > 0) {
            const tagInserts = form.tags.map(t => ({
                person_id: personId,
                tag_id: t.id,
            }));
            await (supabase as any).from('worker_tags').insert(tagInserts);
        }

        // Update work categories
        await (supabase as any)
            .from('worker_categories')
            .delete()
            .eq('person_id', personId);

        if ((form.categories || []).length > 0) {
            const catInserts = form.categories.map((c: CategoryDefinition) => ({
                person_id: personId,
                category_id: c.id,
            }));
            await (supabase as any).from('worker_categories').insert(catInserts);
        }

        // Audit log
        if (workerData && currentSite) {
            logAuditEvent({
                siteId: currentSite.id,
                userId: user?.id || null,
                action: 'PERSON_EDITED',
                entityType: 'person',
                entityId: personId,
                before: { ci: workerData.ci, full_name: workerData.full_name, contractor: workerData.contractor },
                after: { ci: form.ci.trim(), full_name: form.fullName.trim(), contractor: form.contractor.trim() },
                note: `Editado por ${currentRole}`,
            });
        }

        toast({ title: 'Guardado', description: 'Datos actualizados correctamente.' });
        setEditing(false);
        onSaved();
    };

    const handleClose = () => {
        setEditing(false);
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader className="flex flex-row items-center justify-between">
                    <DialogTitle>{editing ? (needsApproval ? 'Solicitar Cambios' : 'Editar Trabajador') : 'Ver Trabajador'}</DialogTitle>
                    {!editing && !loading && canEdit && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditing(true)}
                            className="h-8 w-8"
                        >
                            <Pencil className="w-4 h-4" />
                        </Button>
                    )}
                </DialogHeader>

                {loading ? (
                    <div className="flex justify-center py-8">
                        <Spinner size="lg" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Photos Section - always visible */}
                        <PhotoEditor
                            personId={personId}
                            currentPhotoUrl={workerData?.photo_url || null}
                            ciFrontUrl={(workerData as any)?.ci_front_url || null}
                            ciBackUrl={(workerData as any)?.ci_back_url || null}
                            editing={editing}
                            onPhotosUpdated={(photos) => {
                                // Update local workerData state with new photos
                                setWorkerData(prev => prev ? { ...prev, ...photos } : null);
                            }}
                        />

                        {/* Form content */}
                        {editing ? (
                            <EditForm
                                form={form}
                                setForm={setForm}
                                saving={saving}
                                handleSave={handleSave}
                                setEditing={setEditing}
                                shouldMaskPhone={shouldMaskPhone}
                            />
                        ) : (
                            <ViewForm
                                workerData={workerData}
                                form={form}
                                handleClose={handleClose}
                                setEditing={setEditing}
                                isExternalInspector={isExternalInspector}
                                shouldMaskPhone={shouldMaskPhone}
                                canEdit={canEdit}
                            />
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
