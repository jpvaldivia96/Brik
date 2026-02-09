import { useState, useEffect, useMemo } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { isNetworkError } from '@/lib/offline/errorHandler';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCosmos } from '@/components/ui/alert-cosmos';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription
} from '@/components/ui/dialog';
import { Users, Trash2, Search, UserX, RefreshCw, User, Tag, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { EditWorkerModal } from '@/components/dashboard/EditWorkerModal';
import { TagBadge } from '@/components/ui/tag-autocomplete';

interface PersonResult {
    id: string;
    full_name: string;
    ci: string;
    type: string;
    contractor: string | null;
    photo_url: string | null;
    created_at: string;
    tags?: { id: string; name: string; color: string }[];
}

interface TagDefinition {
    id: string;
    name: string;
    color: string;
}

export default function PeopleTab() {
    const { currentSite, isInspector } = useSite();
    const { toast } = useToast();
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [allPeople, setAllPeople] = useState<PersonResult[]>([]);
    const [selectedContractor, setSelectedContractor] = useState<string>('all');
    const [contractorSearch, setContractorSearch] = useState('');
    const [showContractorDropdown, setShowContractorDropdown] = useState(false);
    const [selectedPerson, setSelectedPerson] = useState<PersonResult | null>(null);
    const [editingPersonId, setEditingPersonId] = useState<string | null>(null);

    // Tags state
    const [availableTags, setAvailableTags] = useState<TagDefinition[]>([]);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
    const [showTagDropdown, setShowTagDropdown] = useState(false);

    // Delete Dialog
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Load all people on mount
    const loadPeople = async () => {
        if (!currentSite) return;
        setLoading(true);

        try {
            const { data, error } = await supabase
                .from('people')
                .select('id, full_name, ci, type, contractor, photo_url, created_at')
                .eq('site_id', currentSite.id)
                .order('contractor', { ascending: true, nullsFirst: false })
                .order('full_name', { ascending: true });

            if (error) throw error;

            // Load tags for each person
            const peopleWithTags = await Promise.all((data || []).map(async (person) => {
                const { data: tagsData } = await (supabase as any)
                    .from('worker_tags')
                    .select('tag_id, worker_tags_definitions(id, name, color)')
                    .eq('person_id', person.id);

                const tags = (tagsData || []).map((t: any) => ({
                    id: t.worker_tags_definitions?.id,
                    name: t.worker_tags_definitions?.name,
                    color: t.worker_tags_definitions?.color,
                })).filter((t: any) => t.id);

                return { ...person, tags };
            }));

            setAllPeople(peopleWithTags);

            // Load available tags for filtering
            const { data: tagsData } = await (supabase as any)
                .from('worker_tags_definitions')
                .select('id, name, color')
                .eq('site_id', currentSite.id)
                .order('name');

            setAvailableTags((tagsData || []) as TagDefinition[]);
        } catch (err: any) {
            if (!isNetworkError(err)) {
                toast({ title: 'Error', description: err.message, variant: 'destructive' });
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPeople();
    }, [currentSite]);

    // Get unique contractors for filter
    const contractors = useMemo(() => {
        const set = new Set<string>();
        allPeople.forEach(p => {
            if (p.contractor) {
                // Normalize to uppercase and trim to avoid duplicates
                set.add(p.contractor.trim().toUpperCase());
            }
        });
        return Array.from(set).sort();
    }, [allPeople]);

    // Filter results based on query, contractor, and tags
    const filteredPeople = useMemo(() => {
        let filtered = allPeople;

        // Filter by contractor
        if (selectedContractor !== 'all') {
            filtered = filtered.filter(p => (p.contractor || '').trim().toUpperCase() === selectedContractor.toUpperCase());
        }

        // Filter by query (CI or name) - case insensitive
        if (query.trim()) {
            const q = query.trim().toLowerCase();
            filtered = filtered.filter(p =>
                p.ci.toLowerCase().includes(q) ||
                p.full_name.toLowerCase().includes(q)
            );
        }

        // Filter by selected tags - must have ALL selected tags
        if (selectedTagIds.length > 0) {
            filtered = filtered.filter(p => {
                const personTagIds = (p.tags || []).map(t => t.id);
                return selectedTagIds.every(tagId => personTagIds.includes(tagId));
            });
        }

        return filtered;
    }, [allPeople, query, selectedContractor, selectedTagIds]);

    const handleDelete = async () => {
        if (!selectedPerson || !currentSite) return;
        setSubmitting(true);

        console.log('Deleting person:', selectedPerson.id, selectedPerson.full_name);

        try {
            // 1. Delete access logs for this person
            const { error: logsError, count: logsCount } = await supabase
                .from('access_logs')
                .delete({ count: 'exact' })
                .eq('site_id', currentSite.id)
                .eq('person_id', selectedPerson.id);

            console.log('Deleted access_logs:', { count: logsCount, error: logsError });
            if (logsError) throw new Error(`Error borrando logs: ${logsError.message}`);

            // 2. Delete workers_profile if exists
            const { error: workerError } = await supabase
                .from('workers_profile')
                .delete()
                .eq('person_id', selectedPerson.id);

            console.log('Deleted workers_profile:', { error: workerError });
            if (workerError) throw new Error(`Error borrando perfil trabajador: ${workerError.message}`);

            // 3. Delete visitors_profile if exists
            const { error: visitorError } = await supabase
                .from('visitors_profile')
                .delete()
                .eq('person_id', selectedPerson.id);

            console.log('Deleted visitors_profile:', { error: visitorError });
            if (visitorError) throw new Error(`Error borrando perfil visita: ${visitorError.message}`);

            // 4. Delete favorites if exists
            const { error: favError } = await supabase
                .from('favorites')
                .delete()
                .eq('person_id', selectedPerson.id);

            console.log('Deleted favorites:', { error: favError });
            if (favError) throw new Error(`Error borrando favoritos: ${favError.message}`);

            // 5. Finally delete the person
            const { error, count } = await supabase
                .from('people')
                .delete({ count: 'exact' })
                .eq('id', selectedPerson.id);

            console.log('Deleted person:', { count, error });
            if (error) throw error;

            if (count === 0) {
                throw new Error('La persona no fue eliminada. Puede haber restricciones de permisos en la base de datos.');
            }

            toast({ title: 'Eliminado', description: `${selectedPerson.full_name} y todos sus datos han sido eliminados.` });
            setDeleteOpen(false);
            setAllPeople(prev => prev.filter(p => p.id !== selectedPerson.id));
            setSelectedPerson(null);
        } catch (err: any) {
            console.error('Delete error:', err);
            toast({ title: 'Error al eliminar', description: err.message, variant: 'destructive' });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Users className="w-6 h-6 text-purple-400" />
                    <h3 className="text-lg font-medium text-white">Gestión de Personal</h3>
                </div>
                <Button
                    variant="outline"
                    size="icon"
                    onClick={loadPeople}
                    className="bg-white/10 border-white/20 text-white/80 hover:bg-white/20"
                >
                    <RefreshCw className="w-4 h-4" />
                </Button>
            </div>

            {/* Search & Filters */}
            <div className="card-cosmos p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                        <Input
                            placeholder="Buscar por CI o nombre..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/40"
                        />
                    </div>
                    <div className="relative w-full sm:w-48">
                        <Input
                            placeholder="Todos los contratistas"
                            value={contractorSearch}
                            onChange={(e) => {
                                setContractorSearch(e.target.value);
                                setShowContractorDropdown(true);
                                if (!e.target.value.trim()) {
                                    setSelectedContractor('all');
                                }
                            }}
                            onFocus={() => setShowContractorDropdown(true)}
                            onBlur={() => setTimeout(() => setShowContractorDropdown(false), 200)}
                            className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                        />
                        {showContractorDropdown && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800/95 backdrop-blur-xl border border-white/10 rounded-lg max-h-48 overflow-y-auto z-50">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedContractor('all');
                                        setContractorSearch('');
                                        setShowContractorDropdown(false);
                                    }}
                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 ${selectedContractor === 'all' ? 'text-primary' : 'text-white/80'}`}
                                >
                                    ✓ Todos
                                </button>
                                {contractors
                                    .filter(c => c.toLowerCase().includes(contractorSearch.toLowerCase()))
                                    .map(c => (
                                        <button
                                            type="button"
                                            key={c}
                                            onClick={() => {
                                                setSelectedContractor(c);
                                                setContractorSearch(c);
                                                setShowContractorDropdown(false);
                                            }}
                                            className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 ${selectedContractor === c ? 'text-primary' : 'text-white/80'}`}
                                        >
                                            {c}
                                        </button>
                                    ))}
                            </div>
                        )}
                    </div>

                    {/* Tag Filter */}
                    {availableTags.length > 0 && (
                        <div className="relative w-full sm:w-48">
                            <button
                                type="button"
                                onClick={() => setShowTagDropdown(!showTagDropdown)}
                                className="w-full h-10 px-3 flex items-center justify-between rounded-md border bg-white/10 border-white/20 text-white hover:bg-white/20 transition-colors"
                            >
                                <span className="flex items-center gap-2 text-sm text-white/70">
                                    <Tag className="w-4 h-4" />
                                    {selectedTagIds.length > 0 ? `${selectedTagIds.length} etiquetas` : 'Filtrar por etiqueta'}
                                </span>
                            </button>
                            {showTagDropdown && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800/95 backdrop-blur-xl border border-white/10 rounded-lg max-h-48 overflow-y-auto z-50">
                                    {selectedTagIds.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedTagIds([]);
                                                setShowTagDropdown(false);
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 border-b border-white/10"
                                        >
                                            ✕ Limpiar filtros
                                        </button>
                                    )}
                                    {availableTags.map(tag => (
                                        <button
                                            type="button"
                                            key={tag.id}
                                            onClick={() => {
                                                setSelectedTagIds(prev =>
                                                    prev.includes(tag.id)
                                                        ? prev.filter(id => id !== tag.id)
                                                        : [...prev, tag.id]
                                                );
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 flex items-center gap-2"
                                        >
                                            <span
                                                className="w-3 h-3 rounded-full"
                                                style={{ backgroundColor: tag.color }}
                                            />
                                            <span className={selectedTagIds.includes(tag.id) ? 'text-primary' : 'text-white/80'}>
                                                {selectedTagIds.includes(tag.id) && '✓ '}{tag.name}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Selected Tags Display */}
                {selectedTagIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {selectedTagIds.map(tagId => {
                            const tag = availableTags.find(t => t.id === tagId);
                            if (!tag) return null;
                            return (
                                <span
                                    key={tag.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white cursor-pointer hover:opacity-80"
                                    style={{ backgroundColor: tag.color }}
                                    onClick={() => setSelectedTagIds(prev => prev.filter(id => id !== tag.id))}
                                >
                                    {tag.name}
                                    <X className="w-3 h-3" />
                                </span>
                            );
                        })}
                    </div>
                )}

                <div className="mt-3 text-sm text-white/50">
                    {filteredPeople.length} de {allPeople.length} personas
                </div>
            </div>

            {/* Results */}
            {loading ? (
                <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : filteredPeople.length > 0 ? (
                <div className="card-cosmos overflow-hidden">
                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto">
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
                                {filteredPeople.map((p) => (
                                    <tr
                                        key={p.id}
                                        onClick={!isInspector ? () => setEditingPersonId(p.id) : undefined}
                                        className={`hover:bg-white/5 transition-colors ${!isInspector ? 'cursor-pointer' : ''}`}
                                    >
                                        <td>
                                            <div className="flex items-center gap-3">
                                                <Avatar className="w-10 h-10">
                                                    <AvatarImage src={p.photo_url || ''} alt={p.full_name} />
                                                    <AvatarFallback className="bg-purple-500/30 text-white">
                                                        {p.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <div className="font-medium text-white">{p.full_name}</div>
                                                    <div className="text-xs text-white/50">{p.ci}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <StatusBadge status={p.type === 'worker' ? 'ok' : 'warn'}>
                                                {p.type === 'worker' ? 'TRABAJADOR' : 'VISITA'}
                                            </StatusBadge>
                                        </td>
                                        <td className="text-white/70">{p.contractor || '-'}</td>
                                        <td className="text-right">
                                            {!isInspector && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedPerson(p);
                                                        setDeleteOpen(true);
                                                    }}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Cards */}
                    <div className="md:hidden p-4 space-y-3">
                        {filteredPeople.map((p) => (
                            <div
                                key={p.id}
                                className={`bg-white/5 border border-white/10 rounded-xl p-4 flex justify-between items-start transition-colors ${!isInspector ? 'cursor-pointer active:bg-white/10' : ''}`}
                                onClick={!isInspector ? () => setEditingPersonId(p.id) : undefined}
                            >
                                <div className="flex items-start gap-3">
                                    <Avatar className="w-12 h-12">
                                        <AvatarImage src={p.photo_url || ''} alt={p.full_name} />
                                        <AvatarFallback className="bg-purple-500/30 text-white">
                                            {p.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <div className="font-medium text-white">{p.full_name}</div>
                                        <div className="text-sm text-white/50">CI: {p.ci}</div>
                                        <div className="text-sm text-white/50">{p.contractor || 'Sin contratista'}</div>
                                        <div className="flex gap-2 mt-2">
                                            <StatusBadge status={p.type === 'worker' ? 'ok' : 'warn'}>
                                                {p.type === 'worker' ? 'Trabajador' : 'Visita'}
                                            </StatusBadge>
                                        </div>
                                    </div>
                                    {!isInspector && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-400 hover:bg-red-500/10"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedPerson(p);
                                                setDeleteOpen(true);
                                            }}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="text-center text-white/50 py-8">
                    {query || selectedContractor !== 'all' ? 'No se encontraron personas con esos filtros' : 'No hay personal registrado'}
                </div>
            )}

            {/* Delete Dialog */}
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent className="bg-gradient-to-br from-slate-900 via-purple-900/95 to-slate-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle className="text-white">Eliminar Persona</DialogTitle>
                        <DialogDescription className="text-white/60">
                            ¿Estás seguro de que deseas eliminar a este trabajador?
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4">
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex gap-3 items-start">
                            <UserX className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="font-medium text-red-400">Acción Irreversible</p>
                                <p className="text-sm text-red-300/80">
                                    Se eliminarán: registros de acceso, perfil, biometría y favoritos.
                                </p>
                            </div>
                        </div>

                        {selectedPerson && (
                            <div className="mt-4 p-4 bg-white/5 border border-white/10 rounded-lg">
                                <p className="font-medium text-white">{selectedPerson.full_name}</p>
                                <p className="text-sm text-white/60">CI: {selectedPerson.ci}</p>
                                <p className="text-sm text-white/60">Contratista: {selectedPerson.contractor || '-'}</p>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteOpen(false)}
                            className="bg-white/10 border-white/20 text-white/80 hover:bg-white/20"
                        >
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={submitting}
                            className="bg-red-500 hover:bg-red-600"
                        >
                            {submitting ? <Spinner size="sm" className="mr-2" /> : null}
                            Eliminar Todo
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Modal */}
            {editingPersonId && (
                <EditWorkerModal
                    open={!!editingPersonId}
                    onClose={() => setEditingPersonId(null)}
                    personId={editingPersonId}
                    onSaved={() => {
                        loadPeople();
                        setEditingPersonId(null);
                    }}
                />
            )}
        </div>
    );
}

