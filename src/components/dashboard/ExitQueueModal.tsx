import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Users, Building2, UserMinus, ChevronRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExitQueuePerson {
    person_id: string;
    full_name: string;
    contractor_snapshot: string | null;
    photo_url: string | null;
    log_id: string;
}

interface ExitQueueModalProps {
    open: boolean;
    onClose: () => void;
    people: ExitQueuePerson[];
    onStartQueue: (queue: ExitQueuePerson[]) => void;
}

export function ExitQueueModal({ open, onClose, people, onStartQueue }: ExitQueueModalProps) {
    const [mode, setMode] = useState<'select' | 'contractor'>('select');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectedContractor, setSelectedContractor] = useState<string | null>(null);

    // Get unique contractors
    const contractors = useMemo(() => {
        const contractorCounts = new Map<string, number>();
        people.forEach(p => {
            const c = p.contractor_snapshot || 'Sin contratista';
            contractorCounts.set(c, (contractorCounts.get(c) || 0) + 1);
        });
        return Array.from(contractorCounts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }, [people]);

    const togglePerson = (personId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(personId)) {
                next.delete(personId);
            } else {
                next.add(personId);
            }
            return next;
        });
    };

    const selectAllByContractor = (contractor: string) => {
        const ids = people
            .filter(p => (p.contractor_snapshot || 'Sin contratista') === contractor)
            .map(p => p.person_id);
        setSelectedIds(new Set(ids));
        setSelectedContractor(contractor);
    };

    const handleStartQueue = () => {
        const queue = people.filter(p => selectedIds.has(p.person_id));
        if (queue.length > 0) {
            onStartQueue(queue);
            onClose();
        }
    };

    const selectedCount = selectedIds.size;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-md max-h-[80vh]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserMinus className="w-5 h-5" />
                        Preparar Cola de Salida
                    </DialogTitle>
                </DialogHeader>

                {/* Mode Toggle */}
                <div className="flex gap-2 p-1 bg-card/50 rounded-lg">
                    <button
                        onClick={() => setMode('select')}
                        className={cn(
                            "flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2",
                            mode === 'select' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Users className="w-4 h-4" />
                        Seleccionar
                    </button>
                    <button
                        onClick={() => setMode('contractor')}
                        className={cn(
                            "flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2",
                            mode === 'contractor' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Building2 className="w-4 h-4" />
                        Por Contratista
                    </button>
                </div>

                {/* Content */}
                <div className="max-h-[40vh] overflow-y-auto">
                    {mode === 'contractor' ? (
                        <div className="space-y-2">
                            {contractors.map(c => (
                                <button
                                    key={c.name}
                                    onClick={() => selectAllByContractor(c.name)}
                                    className={cn(
                                        "w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left",
                                        selectedContractor === c.name
                                            ? "border-primary bg-primary/10"
                                            : "border-border hover:bg-card/50"
                                    )}
                                >
                                    <div>
                                        <div className="font-medium">{c.name}</div>
                                        <div className="text-xs text-muted-foreground">{c.count} persona{c.count !== 1 ? 's' : ''}</div>
                                    </div>
                                    {selectedContractor === c.name && (
                                        <Check className="w-5 h-5 text-primary" />
                                    )}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {people.map(p => (
                                <button
                                    key={p.person_id}
                                    onClick={() => togglePerson(p.person_id)}
                                    className={cn(
                                        "w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left",
                                        selectedIds.has(p.person_id)
                                            ? "bg-primary/10 border border-primary"
                                            : "hover:bg-card/50 border border-transparent"
                                    )}
                                >
                                    <div className={cn(
                                        "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                                        selectedIds.has(p.person_id)
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : "border-muted-foreground"
                                    )}>
                                        {selectedIds.has(p.person_id) && <Check className="w-3 h-3" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium truncate">{p.full_name}</div>
                                        <div className="text-xs text-muted-foreground truncate">
                                            {p.contractor_snapshot || 'Sin contratista'}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-border">
                    <div className="text-sm text-muted-foreground">
                        {selectedCount} seleccionado{selectedCount !== 1 ? 's' : ''}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button onClick={handleStartQueue} disabled={selectedCount === 0}>
                            <ChevronRight className="w-4 h-4 mr-2" />
                            Iniciar Cola
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
