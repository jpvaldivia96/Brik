import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { Save, X } from 'lucide-react';

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
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
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
            fetchWorkerData();
        }
    }, [open, personId]);

    const fetchWorkerData = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('people')
            .select('*, workers_profile(*)')
            .eq('id', personId)
            .single();

        if (error) {
            toast({ title: 'Error', description: 'No se pudo cargar datos del trabajador', variant: 'destructive' });
            onClose();
            return;
        }

        const worker = data as unknown as WorkerData;
        const wp = worker.workers_profile;

        setForm({
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
            // Update people table
            const { error: personError } = await supabase
                .from('people')
                .update({
                    full_name: form.fullName.trim(),
                    contractor: form.contractor.trim() || null,
                })
                .eq('id', personId);

            if (personError) throw personError;

            // Update workers_profile
            const { error: profileError } = await supabase
                .from('workers_profile')
                .update({
                    role: form.role.trim() || null,
                    insurance_number: form.insuranceNumber.trim() || null,
                    insurance_expiry: form.insuranceExpiry || null,
                    induction_date: form.inductionCompleted ? (form.inductionCompleted ? new Date().toISOString().split('T')[0] : null) : null,
                    phone: form.phone.trim() || null,
                    emergency_contact: form.emergencyContact.trim() || null,
                    blood_type: form.bloodType.trim() || null,
                })
                .eq('person_id', personId);

            if (profileError) throw profileError;

            toast({ title: 'Guardado', description: 'Datos actualizados correctamente' });
            onSaved();
            onClose();
        } catch (err: any) {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Editar Trabajador</DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="flex justify-center py-8">
                        <Spinner size="lg" />
                    </div>
                ) : (
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
                                <Label>Teléfono</Label>
                                <Input
                                    value={form.phone}
                                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Contacto emergencia</Label>
                                <Input
                                    value={form.emergencyContact}
                                    onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Tipo de sangre</Label>
                                <Input
                                    value={form.bloodType}
                                    onChange={(e) => setForm({ ...form, bloodType: e.target.value })}
                                    placeholder="Ej: O+"
                                />
                            </div>
                        </div>

                        {/* Induction Checkbox */}
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
                            <Button variant="outline" onClick={onClose} className="flex-1">
                                <X className="w-4 h-4 mr-2" />
                                Cancelar
                            </Button>
                            <Button onClick={handleSave} disabled={saving} className="flex-1">
                                {saving ? <Spinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                Guardar
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
