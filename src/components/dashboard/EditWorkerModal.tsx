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
import { Save, X, Pencil, User } from 'lucide-react';

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
    workers_profile?: {
        role: string | null;
        insurance_number: string | null;
        insurance_expiry: string | null;
        induction_date: string | null;
        phone: string | null;
        emergency_contact: string | null;
        blood_type: string | null;
    };
}

export function EditWorkerModal({ open, onClose, personId, onSaved }: EditWorkerModalProps) {
    const { user } = useAuth();
    const { currentSite } = useSite();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);
    const [workerData, setWorkerData] = useState<WorkerData | null>(null);
    const [form, setForm] = useState({
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
        });
        setLoading(false);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
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
                }, { onConflict: 'person_id' });

            if (profileError) throw profileError;

            // Log audit event for person edit
            if (workerData && currentSite) {
                logAuditEvent({
                    siteId: currentSite.id,
                    userId: user?.id || null,
                    action: 'PERSON_EDITED',
                    entityType: 'person',
                    entityId: personId,
                    before: { ci: workerData.ci, full_name: workerData.full_name, contractor: workerData.contractor },
                    after: { ci: form.ci.trim(), full_name: form.fullName.trim(), contractor: form.contractor.trim() },
                    note: `Editado por guardia`,
                });
            }

            toast({ title: 'Guardado', description: 'Datos actualizados correctamente.' });
            setEditing(false);
            onSaved();
        } catch (err: any) {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    const handleClose = () => {
        setEditing(false);
        onClose();
    };

    // View mode: Display data in read-only format with photo
    const ViewMode = () => (
        <div className="space-y-4">
            {/* Photo and basic info */}
            <div className="flex gap-4 items-start">
                <div className="w-24 h-24 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                    {workerData?.photo_url ? (
                        <img
                            src={workerData.photo_url}
                            alt={workerData.full_name}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-primary/10">
                            <User className="w-10 h-10 text-muted-foreground" />
                        </div>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold truncate">{workerData?.full_name}</h3>
                    <p className="text-muted-foreground">CI: {workerData?.ci}</p>
                    <p className="text-sm text-muted-foreground">{workerData?.contractor || 'Sin contratista'}</p>
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
                    <p className="font-medium">{form.phone || '-'}</p>
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
                    <p className="font-medium truncate">{form.emergencyContact || '-'}</p>
                </div>
            </div>

            <div className="p-3 bg-card/50 rounded-lg flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${form.inductionCompleted ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm">{form.inductionCompleted ? 'Inducción completada' : 'Inducción pendiente'}</span>
            </div>

            <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={handleClose}>
                    Cerrar
                </Button>
            </div>
        </div>
    );

    // Edit mode: Full form with inputs
    const EditMode = () => (
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
                    <Input
                        value={form.contractor}
                        onChange={(e) => setForm({ ...form, contractor: e.target.value })}
                    />
                </div>

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
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
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
                        value={form.emergencyContact}
                        onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
                    />
                </div>
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

    return (
        <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader className="flex flex-row items-center justify-between">
                    <DialogTitle>{editing ? 'Editar Trabajador' : 'Ver Trabajador'}</DialogTitle>
                    {!editing && !loading && (
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
                ) : editing ? (
                    <EditMode />
                ) : (
                    <ViewMode />
                )}
            </DialogContent>
        </Dialog>
    );
}
