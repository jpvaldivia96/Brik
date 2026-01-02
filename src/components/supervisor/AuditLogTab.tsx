import { useState, useEffect } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { History, Search, ChevronDown, ChevronUp } from 'lucide-react';

interface AuditEvent {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before: any;
  after: any;
  note: string | null;
  created_at: string;
  user_id: string | null;
  role_snapshot: string | null;
}

export default function AuditLogTab() {
  const { currentSite } = useSite();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const actions = [
    'all',
    'ENTRY_CREATED',
    'EXIT_SET',
    'PERSON_CREATED',
    'ACCESS_LOG_EDITED',
    'ACCESS_LOG_VOIDED',
    'ACCESS_LOG_FORCE_EXIT',
    'SETTINGS_UPDATED',
    'IMPORT_COMPLETED',
  ];

  const fetchEvents = async () => {
    if (!currentSite) return;
    setLoading(true);

    let query = supabase
      .from('audit_events')
      .select('*')
      .eq('site_id', currentSite.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (dateFrom) {
      query = query.gte('created_at', new Date(dateFrom).toISOString());
    }
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      query = query.lte('created_at', endDate.toISOString());
    }
    if (actionFilter !== 'all') {
      query = query.eq('action', actionFilter);
    }

    const { data, error } = await query;
    if (!error) {
      setEvents(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchEvents(); }, [currentSite]);

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString('es-BO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getActionColor = (action: string) => {
    if (action.includes('VOIDED') || action.includes('DELETE')) return 'text-status-crit';
    if (action.includes('EDITED') || action.includes('FORCE')) return 'text-status-warn';
    if (action.includes('CREATED') || action.includes('SET')) return 'text-status-ok';
    return 'text-foreground';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <History className="w-6 h-6 text-primary" />
        <h3 className="text-lg font-medium">Historial de Auditoría</h3>
      </div>

      {/* Filters */}
      <div className="card-cosmos p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Desde</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Hasta</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Acción</label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {actions.map(a => (
                  <SelectItem key={a} value={a}>{a === 'all' ? 'Todas' : a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={fetchEvents} className="w-full">
              <Search className="w-4 h-4 mr-2" /> Buscar
            </Button>
          </div>
        </div>
      </div>

      {/* Events list */}
      <div className="card-cosmos overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No se encontraron eventos de auditoría.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {events.map(event => (
              <div key={event.id} className="p-4">
                <div 
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
                >
                  <div className="flex items-center gap-4">
                    <span className={`font-mono text-sm font-medium ${getActionColor(event.action)}`}>
                      {event.action}
                    </span>
                    {event.entity_type && (
                      <span className="text-sm text-muted-foreground">
                        {event.entity_type}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">
                      {formatDate(event.created_at)}
                    </span>
                    {expandedId === event.id ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </div>

                {expandedId === event.id && (
                  <div className="mt-4 space-y-3 text-sm">
                    {event.note && (
                      <div>
                        <span className="text-muted-foreground">Nota:</span>
                        <p className="mt-1 p-2 bg-muted/50 rounded">{event.note}</p>
                      </div>
                    )}
                    {event.before && (
                      <div>
                        <span className="text-muted-foreground">Antes:</span>
                        <pre className="mt-1 p-2 bg-muted/50 rounded overflow-x-auto text-xs">
                          {JSON.stringify(event.before, null, 2)}
                        </pre>
                      </div>
                    )}
                    {event.after && (
                      <div>
                        <span className="text-muted-foreground">Después:</span>
                        <pre className="mt-1 p-2 bg-muted/50 rounded overflow-x-auto text-xs">
                          {JSON.stringify(event.after, null, 2)}
                        </pre>
                      </div>
                    )}
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>ID: {event.entity_id?.slice(0, 8) || '-'}</span>
                      <span>Rol: {event.role_snapshot || '-'}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
