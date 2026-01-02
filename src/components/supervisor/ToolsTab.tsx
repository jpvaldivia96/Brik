import { useState } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import { Wrench, LogOut, Edit, Trash2, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AccessLogResult {
  id: string;
  entry_at: string;
  exit_at: string | null;
  voided_at: string | null;
  name_snapshot: string | null;
  ci_snapshot: string | null;
  contractor_snapshot: string | null;
  observations: string | null;
  people: { full_name: string; ci: string } | null;
}

export default function ToolsTab() {
  const { currentSite } = useSite();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<AccessLogResult[]>([]);
  const [selectedLog, setSelectedLog] = useState<AccessLogResult | null>(null);

  // Dialogs
  const [forceExitOpen, setForceExitOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit form
  const [editForm, setEditForm] = useState({ entry_at: '', exit_at: '', observations: '' });

  const handleSearch = async () => {
    if (!query.trim() || !currentSite) return;
    setSearching(true);

    try {
      // Search by person CI or name
      const { data: logs, error } = await supabase
        .from('access_logs')
        .select('id, entry_at, exit_at, voided_at, name_snapshot, ci_snapshot, contractor_snapshot, observations, people(full_name, ci)')
        .eq('site_id', currentSite.id)
        .or(`ci_snapshot.eq.${query.trim()},name_snapshot.ilike.%${query.trim()}%`)
        .order('entry_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setResults((logs || []) as AccessLogResult[]);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  const handleForceExit = async () => {
    if (!selectedLog || !reason.trim()) return;
    setSubmitting(true);

    try {
      const { data: before } = await supabase
        .from('access_logs')
        .select('*')
        .eq('id', selectedLog.id)
        .single();

      const { error } = await supabase
        .from('access_logs')
        .update({ exit_at: new Date().toISOString() })
        .eq('id', selectedLog.id);

      if (error) throw error;

      await supabase.from('audit_events').insert({
        site_id: currentSite!.id,
        action: 'ACCESS_LOG_FORCE_EXIT',
        entity_type: 'access_log',
        entity_id: selectedLog.id,
        before,
        note: reason,
      });

      toast({ title: 'Salida forzada', description: 'Se registró la salida correctamente.' });
      setForceExitOpen(false);
      setReason('');
      handleSearch();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (log: AccessLogResult) => {
    setSelectedLog(log);
    setEditForm({
      entry_at: log.entry_at.slice(0, 16),
      exit_at: log.exit_at?.slice(0, 16) || '',
      observations: log.observations || '',
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!selectedLog || !reason.trim()) return;
    setSubmitting(true);

    try {
      const { data: before } = await supabase
        .from('access_logs')
        .select('*')
        .eq('id', selectedLog.id)
        .single();

      const updates: any = {
        entry_at: new Date(editForm.entry_at).toISOString(),
        observations: editForm.observations || null,
      };
      if (editForm.exit_at) {
        updates.exit_at = new Date(editForm.exit_at).toISOString();
      }

      const { error } = await supabase
        .from('access_logs')
        .update(updates)
        .eq('id', selectedLog.id);

      if (error) throw error;

      await supabase.from('audit_events').insert({
        site_id: currentSite!.id,
        action: 'ACCESS_LOG_EDITED',
        entity_type: 'access_log',
        entity_id: selectedLog.id,
        before,
        after: updates,
        note: reason,
      });

      toast({ title: 'Registro editado', description: 'Los cambios se guardaron correctamente.' });
      setEditOpen(false);
      setReason('');
      handleSearch();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoid = async () => {
    if (!selectedLog || !reason.trim()) return;
    setSubmitting(true);

    try {
      const { data: before } = await supabase
        .from('access_logs')
        .select('*')
        .eq('id', selectedLog.id)
        .single();

      const { error } = await supabase
        .from('access_logs')
        .update({ 
          voided_at: new Date().toISOString(),
          void_reason: reason,
        })
        .eq('id', selectedLog.id);

      if (error) throw error;

      await supabase.from('audit_events').insert({
        site_id: currentSite!.id,
        action: 'ACCESS_LOG_VOIDED',
        entity_type: 'access_log',
        entity_id: selectedLog.id,
        before,
        note: reason,
      });

      toast({ title: 'Registro anulado', description: 'El registro fue anulado correctamente.' });
      setVoidOpen(false);
      setReason('');
      handleSearch();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const formatDateTime = (isoString: string) => {
    return new Date(isoString).toLocaleString('es-BO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Wrench className="w-6 h-6 text-primary" />
        <h3 className="text-lg font-medium">Herramientas de Corrección</h3>
      </div>

      {/* Search */}
      <div className="card-cosmos p-4">
        <div className="flex gap-3">
          <SearchInput
            placeholder="Buscar registros por CI o nombre..."
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
      {results.length > 0 && (
        <div className="card-cosmos overflow-hidden">
          <table className="table-cosmos">
            <thead>
              <tr>
                <th>Estado</th>
                <th>Nombre</th>
                <th>CI</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {results.map((log) => {
                const isOpen = !log.exit_at && !log.voided_at;
                const isVoided = !!log.voided_at;

                return (
                  <tr key={log.id} className={isVoided ? 'opacity-50' : ''}>
                    <td>
                      {isVoided ? (
                        <StatusBadge status="crit">ANULADO</StatusBadge>
                      ) : isOpen ? (
                        <StatusBadge status="ok">ABIERTO</StatusBadge>
                      ) : (
                        <StatusBadge status="outside">CERRADO</StatusBadge>
                      )}
                    </td>
                    <td className="font-medium">{log.name_snapshot || log.people?.full_name}</td>
                    <td>{log.ci_snapshot || log.people?.ci}</td>
                    <td>{formatDateTime(log.entry_at)}</td>
                    <td>{log.exit_at ? formatDateTime(log.exit_at) : '-'}</td>
                    <td>
                      {!isVoided && (
                        <div className="flex gap-2">
                          {isOpen && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => { setSelectedLog(log); setForceExitOpen(true); }}
                            >
                              <LogOut className="w-3 h-3 mr-1" /> Forzar Salida
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(log)}
                          >
                            <Edit className="w-3 h-3 mr-1" /> Editar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-status-crit hover:text-status-crit"
                            onClick={() => { setSelectedLog(log); setVoidOpen(true); }}
                          >
                            <Trash2 className="w-3 h-3 mr-1" /> Anular
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Force Exit Dialog */}
      <Dialog open={forceExitOpen} onOpenChange={setForceExitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forzar Salida</DialogTitle>
            <DialogDescription>
              Se registrará la salida ahora para {selectedLog?.name_snapshot}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Motivo (obligatorio)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explica el motivo de esta acción..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForceExitOpen(false)}>Cancelar</Button>
            <Button onClick={handleForceExit} disabled={submitting || !reason.trim()}>
              {submitting ? <Spinner size="sm" className="mr-2" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Registro</DialogTitle>
            <DialogDescription>
              Modificar entrada/salida de {selectedLog?.name_snapshot}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Fecha/Hora Entrada</Label>
              <Input
                type="datetime-local"
                value={editForm.entry_at}
                onChange={(e) => setEditForm({ ...editForm, entry_at: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Fecha/Hora Salida</Label>
              <Input
                type="datetime-local"
                value={editForm.exit_at}
                onChange={(e) => setEditForm({ ...editForm, exit_at: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Observaciones</Label>
              <Textarea
                value={editForm.observations}
                onChange={(e) => setEditForm({ ...editForm, observations: e.target.value })}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Motivo del cambio (obligatorio)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explica el motivo de esta edición..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={submitting || !reason.trim()}>
              {submitting ? <Spinner size="sm" className="mr-2" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void Dialog */}
      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular Registro</DialogTitle>
            <DialogDescription>
              Esta acción marcará el registro como anulado. No se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <AlertCosmos type="warning">
              El registro de {selectedLog?.name_snapshot} será anulado permanentemente.
            </AlertCosmos>
            <div className="space-y-2">
              <Label>Motivo (obligatorio)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explica el motivo de la anulación..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)}>Cancelar</Button>
            <Button 
              variant="destructive" 
              onClick={handleVoid} 
              disabled={submitting || !reason.trim()}
            >
              {submitting ? <Spinner size="sm" className="mr-2" /> : null}
              Anular Registro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
