import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSite } from '@/contexts/SiteContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { AlertTriangle, CheckCircle2, X, Download, Siren } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Person {
    id: string;
    person_id: string;
    full_name: string;
    contractor_snapshot: string | null;
    entry_at: string;
}

interface EvacuatedPerson extends Person {
    evacuated_at: string;
}

interface EmergencyRollCallProps {
    open: boolean;
    onClose: () => void;
}

export function EmergencyRollCall({ open, onClose }: EmergencyRollCallProps) {
    const { currentSite } = useSite();
    const [loading, setLoading] = useState(true);
    const [people, setPeople] = useState<Person[]>([]);
    const [evacuated, setEvacuated] = useState<Map<string, string>>(new Map());
    const [startTime, setStartTime] = useState<Date | null>(null);
    const [elapsedTime, setElapsedTime] = useState(0);

    // Fetch people currently on site
    const fetchPeople = async () => {
        if (!currentSite) return;
        setLoading(true);

        const { data } = await supabase
            .from('access_logs')
            .select('id, person_id, name_snapshot, contractor_snapshot, entry_at')
            .eq('site_id', currentSite.id)
            .is('exit_at', null)
            .is('voided_at', null)
            .order('contractor_snapshot', { ascending: true })
            .order('name_snapshot', { ascending: true });

        const mapped: Person[] = (data || []).map(log => ({
            id: log.id,
            person_id: log.person_id,
            full_name: log.name_snapshot || 'Sin nombre',
            contractor_snapshot: log.contractor_snapshot,
            entry_at: log.entry_at,
        }));

        setPeople(mapped);
        setLoading(false);
    };

    // Start timer when modal opens
    useEffect(() => {
        if (open) {
            fetchPeople();
            setEvacuated(new Map());
            setStartTime(new Date());
        }
    }, [open, currentSite]);

    // Update elapsed time every second
    useEffect(() => {
        if (!open || !startTime) return;

        const interval = setInterval(() => {
            setElapsedTime(Math.floor((Date.now() - startTime.getTime()) / 1000));
        }, 1000);

        return () => clearInterval(interval);
    }, [open, startTime]);

    const formatElapsedTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const toggleEvacuated = (personId: string) => {
        setEvacuated(prev => {
            const newMap = new Map(prev);
            if (newMap.has(personId)) {
                newMap.delete(personId);
            } else {
                newMap.set(personId, new Date().toISOString());
            }
            return newMap;
        });
    };

    const evacuateAll = () => {
        const now = new Date().toISOString();
        const newMap = new Map<string, string>();
        people.forEach(p => newMap.set(p.person_id, now));
        setEvacuated(newMap);
    };

    const generateReport = () => {
        if (!currentSite || !startTime) return;

        const evacuatedList = people.filter(p => evacuated.has(p.person_id));
        const missingList = people.filter(p => !evacuated.has(p.person_id));

        const reportLines = [
            `REPORTE DE EVACUACIÓN`,
            `Obra: ${currentSite.name}`,
            `Fecha: ${startTime.toLocaleString('es-BO')}`,
            `Duración: ${formatElapsedTime(elapsedTime)}`,
            ``,
            `RESUMEN:`,
            `- Total en sitio: ${people.length}`,
            `- Evacuados: ${evacuatedList.length}`,
            `- Pendientes: ${missingList.length}`,
            ``,
            `--- EVACUADOS (${evacuatedList.length}) ---`,
            ...evacuatedList.map(p => `✅ ${p.full_name} | ${p.contractor_snapshot || 'Sin contratista'} | ${new Date(evacuated.get(p.person_id)!).toLocaleTimeString('es-BO')}`),
            ``,
            `--- PENDIENTES (${missingList.length}) ---`,
            ...missingList.map(p => `⚠️ ${p.full_name} | ${p.contractor_snapshot || 'Sin contratista'} | Entrada: ${new Date(p.entry_at).toLocaleTimeString('es-BO')}`),
        ];

        const content = reportLines.join('\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `evacuacion_${currentSite.name}_${startTime.toISOString().split('T')[0]}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const evacuatedCount = evacuated.size;
    const remainingCount = people.length - evacuatedCount;
    const progress = people.length > 0 ? (evacuatedCount / people.length) * 100 : 0;

    // Group by contractor
    const groupedByContractor = people.reduce((acc, person) => {
        const key = person.contractor_snapshot || 'Sin contratista';
        if (!acc[key]) acc[key] = [];
        acc[key].push(person);
        return acc;
    }, {} as Record<string, Person[]>);

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader className="flex-shrink-0">
                    <DialogTitle className="flex items-center gap-3 text-red-500">
                        <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
                            <Siren className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <span className="text-xl">🚨 MODO EMERGENCIA</span>
                            <p className="text-sm text-muted-foreground font-normal mt-0.5">
                                Tiempo: <span className="font-mono text-red-400">{formatElapsedTime(elapsedTime)}</span>
                            </p>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                {/* Stats Bar */}
                <div className="flex-shrink-0 p-4 bg-gradient-to-r from-red-500/10 to-amber-500/10 rounded-xl border border-red-500/30">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-6">
                            <div className="text-center">
                                <p className="text-2xl font-bold text-foreground">{people.length}</p>
                                <p className="text-xs text-muted-foreground">Total</p>
                            </div>
                            <div className="text-center">
                                <p className="text-2xl font-bold text-emerald-500">{evacuatedCount}</p>
                                <p className="text-xs text-muted-foreground">Evacuados</p>
                            </div>
                            <div className="text-center">
                                <p className="text-2xl font-bold text-red-500">{remainingCount}</p>
                                <p className="text-xs text-muted-foreground">Pendientes</p>
                            </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={evacuateAll} disabled={evacuatedCount === people.length}>
                            Marcar Todos
                        </Button>
                    </div>

                    {/* Progress bar */}
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-green-500 transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                {/* People List */}
                <div className="flex-1 overflow-y-auto mt-4 space-y-4 pr-1">
                    {loading ? (
                        <div className="flex justify-center py-8"><Spinner /></div>
                    ) : people.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No hay personas en sitio.
                        </div>
                    ) : (
                        Object.entries(groupedByContractor).map(([contractor, group]) => (
                            <div key={contractor} className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        {contractor}
                                    </p>
                                    <span className="text-xs text-muted-foreground">
                                        {group.filter(p => evacuated.has(p.person_id)).length}/{group.length}
                                    </span>
                                </div>
                                {group.map((person) => {
                                    const isEvacuated = evacuated.has(person.person_id);
                                    return (
                                        <button
                                            key={person.id}
                                            onClick={() => toggleEvacuated(person.person_id)}
                                            className={cn(
                                                "w-full flex items-center gap-3 p-3 rounded-xl border transition-all",
                                                isEvacuated
                                                    ? "bg-emerald-500/10 border-emerald-500/50"
                                                    : "bg-red-500/10 border-red-500/30 hover:border-red-500/50"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
                                                isEvacuated ? "bg-emerald-500" : "bg-red-500/30"
                                            )}>
                                                {isEvacuated ? (
                                                    <CheckCircle2 className="w-5 h-5 text-white" />
                                                ) : (
                                                    <AlertTriangle className="w-4 h-4 text-red-400" />
                                                )}
                                            </div>
                                            <div className="flex-1 text-left min-w-0">
                                                <p className={cn(
                                                    "font-medium truncate",
                                                    isEvacuated && "line-through text-muted-foreground"
                                                )}>
                                                    {person.full_name}
                                                </p>
                                                {isEvacuated && (
                                                    <p className="text-xs text-emerald-400">
                                                        Evacuado {new Date(evacuated.get(person.person_id)!).toLocaleTimeString('es-BO')}
                                                    </p>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>

                {/* Footer Actions */}
                <div className="flex-shrink-0 flex gap-3 mt-4 pt-4 border-t border-border">
                    <Button variant="outline" onClick={onClose} className="flex-1">
                        <X className="w-4 h-4 mr-2" />
                        Cerrar
                    </Button>
                    <Button
                        onClick={generateReport}
                        disabled={evacuatedCount === 0}
                        className="flex-1 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                    >
                        <Download className="w-4 h-4 mr-2" />
                        Generar Reporte
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
