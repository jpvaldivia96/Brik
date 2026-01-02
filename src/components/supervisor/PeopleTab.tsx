import { useState } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { AlertCosmos } from '@/components/ui/alert-cosmos';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription
} from '@/components/ui/dialog';
import { Users, Trash2, Search, UserX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PersonResult {
    id: string;
    full_name: string;
    ci: string;
    type: string;
    contractor: string | null;
    created_at: string;
}

export default function PeopleTab() {
    const { currentSite } = useSite();
    const { toast } = useToast();
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState<PersonResult[]>([]);
    const [selectedPerson, setSelectedPerson] = useState<PersonResult | null>(null);

    // Delete Dialog
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const handleSearch = async () => {
        if (!query.trim() || !currentSite) return;
        setSearching(true);

        try {
            const { data, error } = await supabase
                .from('people')
                .select('*')
                .eq('site_id', currentSite.id)
                .or(`ci.eq.${query.trim()},full_name.ilike.%${query.trim()}%`)
                .limit(20);

            if (error) throw error;
            setResults(data || []);
        } catch (err: any) {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        } finally {
            setSearching(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedPerson) return;
        setSubmitting(true);

        try {
            // Delete person (cascade should handle related profiles/logs if configured, 
            // but usually better to soft delete. For now hard delete as requested for testing cleanup)
            const { error } = await supabase
                .from('people')
                .delete()
                .eq('id', selectedPerson.id);

            if (error) throw error;

            toast({ title: 'Eliminado', description: `${selectedPerson.full_name} ha sido eliminado.` });
            setDeleteOpen(false);
            setResults(results.filter(p => p.id !== selectedPerson.id));
        } catch (err: any) {
            toast({ title: 'Error', description: 'No se pudo eliminar. Puede tener registros vinculados.', variant: 'destructive' });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Users className="w-6 h-6 text-primary" />
                <h3 className="text-lg font-medium">Gestión de Personal</h3>
            </div>

            {/* Search */}
            <div className="card-cosmos p-4">
                <div className="flex gap-3">
                    <SearchInput
                        placeholder="Buscar por CI o nombre..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        containerClassName="flex-1"
                    />
                    <Button onClick={handleSearch} disabled={searching}>
                        {searching ? <Spinner size="sm" /> : <Search className="w-4 h-4 mr-2" />}
                        Buscar
                    </Button>
                </div>
            </div>

            {/* Results */}
            {results.length > 0 ? (
                <div className="card-cosmos overflow-hidden">
                    <table className="table-cosmos">
                        <thead>
                            <tr>
                                <th>Nombre / CI</th>
                                <th>Tipo</th>
                                <th>Contratista</th>
                                <th className="text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map((p) => (
                                <tr key={p.id}>
                                    <td>
                                        <div className="font-medium">{p.full_name}</div>
                                        <div className="text-xs text-muted-foreground">{p.ci}</div>
                                    </td>
                                    <td>
                                        <StatusBadge status={p.type === 'worker' ? 'ok' : 'warn'}>
                                            {p.type === 'worker' ? 'TRABAJADOR' : 'VISITA'}
                                        </StatusBadge>
                                    </td>
                                    <td>{p.contractor || '-'}</td>
                                    <td className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-status-crit hover:bg-status-crit/10 hover:text-status-crit"
                                            onClick={() => { setSelectedPerson(p); setDeleteOpen(true); }}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                query && !searching && (
                    <div className="text-center text-muted-foreground py-8">
                        No se encontraron personas
                    </div>
                )
            )}

            {/* Delete Dialog */}
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Eliminar Persona</DialogTitle>
                        <DialogDescription>
                            ¿Estás seguro de que deseas eliminar a este trabajador?
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4">
                        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex gap-3 items-start">
                            <UserX className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="font-medium text-destructive">Acción Irreversible</p>
                                <p className="text-sm text-destructive/80">
                                    Se eliminarán todos sus datos, incluyendo biometría y perfiles.
                                    (Si tiene historial de accesos, podría fallar si no se borran primero).
                                </p>
                            </div>
                        </div>

                        {selectedPerson && (
                            <div className="mt-4 p-4 bg-muted rounded-lg">
                                <p className="font-medium">{selectedPerson.full_name}</p>
                                <p className="text-sm text-muted-foreground">CI: {selectedPerson.ci}</p>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={submitting}
                        >
                            {submitting ? <Spinner size="sm" className="mr-2" /> : null}
                            Eliminar Definitivamente
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
