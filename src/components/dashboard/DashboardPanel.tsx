import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { AttendanceFilters } from './AttendanceFilters';
import { PersonRow, PersonCard } from './PersonRow';
import { EditWorkerModal } from './EditWorkerModal';
import { ExportButton } from './ExportButton';
import { ExitQueueModal } from './ExitQueueModal';
import { EmergencyRollCall } from './EmergencyRollCall';
import { Users, AlertTriangle, Clock, Building2, UserCheck, UserMinus, Siren } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InsideLog {
  id: string;
  person_id: string;
  name_snapshot: string | null;
  ci_snapshot: string | null;
  contractor_snapshot: string | null;
  entry_at: string;
  hours: number;
  totalHoursToday: number; // Accumulated hours for the day
  status: 'ok' | 'warn' | 'crit';
  full_name: string;
  ci: string;
  photo_url: string | null;
  role: string | null;
  // Compliance fields
  insurance_expiry: string | null;
  induction_date: string | null;
}

interface ContractorStat {
  contractor: string;
  inside: number;
  entriesToday: number;
}

export default function DashboardPanel() {
  const { currentSite, currentSettings } = useSite();

  // Use local date instead of UTC to ensure "Today" matches user's local timezone
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const [loading, setLoading] = useState(true);
  const [insideList, setInsideList] = useState<InsideLog[]>([]);
  const [contractors, setContractors] = useState<ContractorStat[]>([]);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(today);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'people' | 'companies'>('people');
  const [statusFilter, setStatusFilter] = useState<'all' | 'crit' | 'warn' | 'ok'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'entry'>('entry');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [showExitQueue, setShowExitQueue] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);
  const [expandedContractors, setExpandedContractors] = useState<Set<string>>(new Set());

  // Stats
  const stats = useMemo(() => {
    const onSite = insideList.length;
    const atRisk = insideList.filter(l => l.status === 'warn').length;
    const alert = insideList.filter(l => l.status === 'crit').length;
    return { onSite, atRisk, alert };
  }, [insideList]);

  const fetchData = useCallback(async () => {
    if (!currentSite) return;
    setLoading(true);

    const warnH = Number(currentSettings?.warn_hours) || 10;
    const critH = Number(currentSettings?.crit_hours) || 12;
    // 'today' variable is now defined at component level
    const isViewingToday = selectedDate === today;

    let logs: any[] = [];

    if (isViewingToday) {
      // Show currently open (inside) logs for today
      const { data: openLogs } = await supabase
        .from('access_logs')
        .select('*, people(full_name, ci, photo_url, workers_profile(insurance_expiry, induction_date, role))')
        .eq('site_id', currentSite.id)
        .is('exit_at', null)
        .is('voided_at', null);
      logs = openLogs || [];
    } else {
      // Show historical logs for selected date (all entries that day)
      const startOfDay = `${selectedDate}T00:00:00`;
      const endOfDay = `${selectedDate}T23:59:59`;
      const { data: historicalLogs } = await supabase
        .from('access_logs')
        .select('*, people(full_name, ci, photo_url, workers_profile(insurance_expiry, induction_date, role))')
        .eq('site_id', currentSite.id)
        .is('voided_at', null)
        .gte('entry_at', startOfDay)
        .lte('entry_at', endOfDay);
      logs = historicalLogs || [];
    }

    const now = Date.now();

    // Fetch ALL logs for today to calculate accumulated hours per person
    const accStartOfDay = `${selectedDate}T00:00:00`;
    const accEndOfDay = `${selectedDate}T23:59:59`;
    const { data: allTodayLogs } = await supabase
      .from('access_logs')
      .select('person_id, entry_at, exit_at')
      .eq('site_id', currentSite.id)
      .is('voided_at', null)
      .gte('entry_at', accStartOfDay)
      .lte('entry_at', accEndOfDay);

    // Calculate total hours per person for the day
    const personTotalHours = new Map<string, number>();
    (allTodayLogs || []).forEach(log => {
      const entryTime = new Date(log.entry_at).getTime();
      const exitTime = log.exit_at ? new Date(log.exit_at).getTime() : now;
      const hrs = (exitTime - entryTime) / 3600000;
      personTotalHours.set(log.person_id, (personTotalHours.get(log.person_id) || 0) + hrs);
    });

    const inside: InsideLog[] = logs.map(log => {
      const entryTime = new Date(log.entry_at).getTime();
      const exitTime = log.exit_at ? new Date(log.exit_at).getTime() : now;
      const hours = (exitTime - entryTime) / 3600000;
      const totalHoursToday = personTotalHours.get(log.person_id) || hours;
      const status: 'ok' | 'warn' | 'crit' = isViewingToday
        ? (hours >= critH ? 'crit' : hours >= warnH ? 'warn' : 'ok')
        : 'ok'; // Historical logs always show as 'ok'

      // Get workers_profile data (it's related to people, which is related to access_logs)
      const wp = log.people?.workers_profile;

      return {
        id: log.id,
        person_id: log.person_id,
        name_snapshot: log.name_snapshot,
        ci_snapshot: log.ci_snapshot,
        contractor_snapshot: log.contractor_snapshot,
        entry_at: log.entry_at,
        hours,
        totalHoursToday,
        status,
        full_name: log.name_snapshot || log.people?.full_name || 'Sin nombre',
        ci: log.ci_snapshot || log.people?.ci || '',
        photo_url: log.people?.photo_url || null,
        role: wp?.role || null,
        insurance_expiry: wp?.insurance_expiry || null,
        induction_date: wp?.induction_date || null
      };
    }).sort((a, b) => b.hours - a.hours);

    // Contractor stats
    const contractorMap = new Map<string, { inside: number; entriesToday: number }>();
    inside.forEach(log => {
      // Normalize to uppercase to avoid duplicates from different cases
      const c = (log.contractor_snapshot || 'Sin contratista').trim().toUpperCase();
      const stat = contractorMap.get(c) || { inside: 0, entriesToday: 0 };
      stat.inside++;
      contractorMap.set(c, stat);
    });

    // Today's entries per contractor
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todayLogs } = await supabase
      .from('access_logs')
      .select('contractor_snapshot')
      .eq('site_id', currentSite.id)
      .is('voided_at', null)
      .gte('entry_at', todayStart.toISOString());

    (todayLogs || []).forEach(log => {
      // Normalize to uppercase to avoid duplicates from different cases
      const c = (log.contractor_snapshot || 'Sin contratista').trim().toUpperCase();
      const stat = contractorMap.get(c) || { inside: 0, entriesToday: 0 };
      stat.entriesToday++;
      contractorMap.set(c, stat);
    });

    const contractorStats = Array.from(contractorMap.entries())
      .map(([contractor, stat]) => ({ contractor, ...stat }))
      .sort((a, b) => b.inside - a.inside);

    setInsideList(inside);
    setContractors(contractorStats);
    setLoading(false);
  }, [currentSite, currentSettings, selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription
  useEffect(() => {
    if (!currentSite) return;

    const channel = supabase
      .channel('dashboard-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'access_logs',
          filter: `site_id=eq.${currentSite.id}`
        },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentSite, currentSettings, fetchData]);

  // Listen for refresh events from entry/exit components
  useEffect(() => {
    const handleRefresh = () => fetchData();
    window.addEventListener('dashboard-refresh', handleRefresh);
    return () => window.removeEventListener('dashboard-refresh', handleRefresh);
  }, [fetchData]);

  // Filtered list
  const filteredList = useMemo(() => {
    let result = insideList;

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l =>
        l.full_name.toLowerCase().includes(q) ||
        l.ci.toLowerCase().includes(q) ||
        (l.contractor_snapshot || '').toLowerCase().includes(q)
      );
    }

    // Status filter from clickable badges
    if (statusFilter !== 'all') {
      result = result.filter(l => l.status === statusFilter);
    }

    // Apply sorting
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') {
        cmp = a.full_name.localeCompare(b.full_name);
      } else if (sortBy === 'status') {
        const order = { crit: 0, warn: 1, ok: 2 };
        cmp = order[a.status] - order[b.status];
      } else { // entry
        cmp = new Date(b.entry_at).getTime() - new Date(a.entry_at).getTime();
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [insideList, searchQuery, statusFilter, sortBy, sortDir]);

  const toggleFilter = (label: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  };

  const filterBadges = [
    { label: 'En sitio', count: stats.onSite, active: activeFilters.has('En sitio'), icon: <Users className="w-3 h-3" /> },
    { label: 'En riesgo', count: stats.atRisk, active: activeFilters.has('En riesgo'), variant: 'warn' as const, icon: <Clock className="w-3 h-3" /> },
    { label: 'Alerta', count: stats.alert, active: activeFilters.has('Alerta'), variant: 'crit' as const, icon: <AlertTriangle className="w-3 h-3" /> },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Dashboard</h2>
        <div className="flex items-center gap-3">
          {/* Emergency Button - only show when people on site */}
          {stats.onSite > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowEmergency(true)}
              className="gap-2 bg-red-600 hover:bg-red-700 animate-pulse"
            >
              <Siren className="w-4 h-4" />
              <span className="hidden sm:inline">Emergencia</span>
            </Button>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/40">Live</span>
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Alert Badges Summary - Clickable to filter */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => setStatusFilter(statusFilter === 'crit' ? 'all' : 'crit')}
          className={cn(
            "flex items-center gap-1.5 px-2 py-2 rounded-xl border justify-center transition-all",
            statusFilter === 'crit'
              ? "bg-red-500/30 border-red-400 text-red-300 ring-2 ring-red-400/50"
              : stats.alert > 0
                ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
                : "bg-card/30 border-border text-white/70 hover:bg-card/50"
          )}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span className="text-xl font-bold">{stats.alert}</span>
          <span className="text-xs hidden sm:inline">Alerta</span>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'warn' ? 'all' : 'warn')}
          className={cn(
            "flex items-center gap-1.5 px-2 py-2 rounded-xl border justify-center transition-all",
            statusFilter === 'warn'
              ? "bg-amber-500/30 border-amber-400 text-amber-300 ring-2 ring-amber-400/50"
              : stats.atRisk > 0
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                : "bg-card/30 border-border text-white/70 hover:bg-card/50"
          )}
        >
          <Clock className="w-3.5 h-3.5" />
          <span className="text-xl font-bold">{stats.atRisk}</span>
          <span className="text-xs hidden sm:inline">Riesgo</span>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'ok' ? 'all' : 'ok')}
          className={cn(
            "flex items-center gap-1.5 px-2 py-2 rounded-xl border justify-center transition-all",
            statusFilter === 'ok'
              ? "bg-emerald-500/30 border-emerald-400 text-emerald-300 ring-2 ring-emerald-400/50"
              : "bg-card/30 border-border text-white/70 hover:bg-card/50"
          )}
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span className="text-xl font-bold">{stats.onSite}</span>
          <span className="text-xs hidden sm:inline">En sitio</span>
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <>
          {/* Attendance Section */}
          <div className="card-cosmos overflow-hidden">
            {/* Tabs */}
            <div className="flex items-center gap-1 p-2 border-b border-border bg-card/30">
              <button
                onClick={() => setActiveTab('people')}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  activeTab === 'people'
                    ? "bg-primary text-primary-foreground"
                    : "text-white/60 hover:text-white/90 hover:bg-white/10"
                )}
              >
                <Users className="w-4 h-4 inline mr-2" />
                Personas
              </button>
              <button
                onClick={() => setActiveTab('companies')}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  activeTab === 'companies'
                    ? "bg-primary text-primary-foreground"
                    : "text-white/60 hover:text-white/90 hover:bg-white/10"
                )}
              >
                <Building2 className="w-4 h-4 inline mr-2" />
                Contratistas
              </button>
            </div>

            <div className="p-4">
              {/* Filters */}
              <AttendanceFilters
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                filters={filterBadges}
                onFilterClick={toggleFilter}
              />

              {/* Action Buttons - Same row as filters */}
              <div className="flex items-center gap-2 -mt-1 mb-4">
                <div className="flex-1" />
                {selectedDate === today && filteredList.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowExitQueue(true)}
                    className="gap-2"
                  >
                    <UserMinus className="w-4 h-4" />
                    <span className="hidden sm:inline">Preparar Salida</span>
                  </Button>
                )}
                <ExportButton
                  data={filteredList}
                  selectedDate={selectedDate}
                  siteName={currentSite?.name}
                />
              </div>

              {activeTab === 'people' ? (
                <>
                  {/* Desktop Table Header - Sortable */}
                  <div className="hidden md:grid grid-cols-[auto_1fr_120px_100px] gap-4 items-center px-4 py-2 text-xs text-white/60 uppercase tracking-wider border-b border-border">
                    <div className="w-10"></div>
                    <button
                      onClick={() => { setSortBy('name'); setSortDir(sortBy === 'name' && sortDir === 'asc' ? 'desc' : 'asc'); }}
                      className={cn("flex items-center gap-1 hover:text-white transition-colors text-left", sortBy === 'name' && "text-white")}
                    >
                      Nombre {sortBy === 'name' && (sortDir === 'asc' ? '▲' : '▼')}
                    </button>
                    <button
                      onClick={() => { setSortBy('status'); setSortDir(sortBy === 'status' && sortDir === 'asc' ? 'desc' : 'asc'); }}
                      className={cn("flex items-center gap-1 hover:text-white transition-colors text-left", sortBy === 'status' && "text-white")}
                    >
                      Estado {sortBy === 'status' && (sortDir === 'asc' ? '▲' : '▼')}
                    </button>
                    <button
                      onClick={() => { setSortBy('entry'); setSortDir(sortBy === 'entry' && sortDir === 'asc' ? 'desc' : 'asc'); }}
                      className={cn("flex items-center gap-1 hover:text-white transition-colors text-left", sortBy === 'entry' && "text-white")}
                    >
                      Entrada {sortBy === 'entry' && (sortDir === 'asc' ? '▲' : '▼')}
                    </button>
                  </div>

                  {/* Desktop Rows */}
                  <div className="hidden md:block">
                    {filteredList.map((log) => (
                      <PersonRow
                        key={log.id}
                        name={log.full_name}
                        role={log.role}
                        contractor={log.contractor_snapshot}
                        status={log.status === 'crit' ? 'crit' : log.status === 'warn' ? 'at-risk' : 'on-site'}
                        checkedIn={formatTime(log.entry_at)}
                        hours={log.hours}
                        totalHoursToday={log.totalHoursToday}
                        photoUrl={log.photo_url}
                        insuranceExpiry={log.insurance_expiry}
                        inductionDate={log.induction_date}
                        onClick={() => setEditingPersonId(log.person_id)}
                      />
                    ))}
                    {filteredList.length === 0 && (
                      <div className="text-center text-white/60 py-8">
                        {searchQuery ? 'No se encontraron resultados' : 'No hay personas dentro'}
                      </div>
                    )}
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-3">
                    {filteredList.map((log) => (
                      <PersonCard
                        key={log.id}
                        name={log.full_name}
                        role={log.role}
                        contractor={log.contractor_snapshot}
                        status={log.status === 'crit' ? 'crit' : log.status === 'warn' ? 'at-risk' : 'on-site'}
                        checkedIn={formatTime(log.entry_at)}
                        hours={log.hours}
                        totalHoursToday={log.totalHoursToday}
                        photoUrl={log.photo_url}
                        insuranceExpiry={log.insurance_expiry}
                        inductionDate={log.induction_date}
                        onClick={() => setEditingPersonId(log.person_id)}
                      />
                    ))}
                    {filteredList.length === 0 && (
                      <div className="text-center text-white/60 py-8">
                        {searchQuery ? 'No se encontraron resultados' : 'No hay personas dentro'}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* Companies Tab */
                <div className="space-y-2">
                  {contractors.map((c) => {
                    const isExpanded = expandedContractors.has(c.contractor);
                    const contractorWorkers = insideList.filter(l =>
                      (l.contractor_snapshot || '').toUpperCase() === c.contractor.toUpperCase()
                    );

                    return (
                      <div key={c.contractor} className="space-y-1">
                        <button
                          onClick={() => {
                            const next = new Set(expandedContractors);
                            if (isExpanded) {
                              next.delete(c.contractor);
                            } else {
                              next.add(c.contractor);
                            }
                            setExpandedContractors(next);
                          }}
                          className="w-full flex items-center justify-between p-3 bg-card/30 rounded-lg border border-border/50 hover:bg-card/50 transition-colors"
                        >
                          <div className="text-left">
                            <div className="font-medium text-white">{c.contractor}</div>
                            <div className="text-sm text-white/60">{c.entriesToday} entradas hoy</div>
                          </div>
                          <div className="text-right flex items-center gap-3">
                            <div>
                              <div className="text-2xl font-bold text-primary">{c.inside}</div>
                              <div className="text-xs text-white/50">dentro</div>
                            </div>
                            <span className={cn(
                              "text-white/50 transition-transform",
                              isExpanded && "rotate-180"
                            )}>▼</span>
                          </div>
                        </button>

                        {/* Expanded workers list */}
                        {isExpanded && contractorWorkers.length > 0 && (
                          <div className="ml-4 space-y-1 border-l-2 border-primary/30 pl-3">
                            {contractorWorkers.map((worker) => (
                              <div
                                key={worker.id}
                                onClick={() => setEditingPersonId(worker.person_id)}
                                className="flex items-center justify-between p-2 bg-card/20 rounded-lg cursor-pointer hover:bg-card/40 transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  {worker.photo_url ? (
                                    <img src={worker.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary font-medium">
                                      {worker.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                                    </div>
                                  )}
                                  <div>
                                    <div className="text-sm text-white font-medium">{worker.full_name}</div>
                                    {worker.role && <div className="text-xs text-yellow-300">{worker.role}</div>}
                                  </div>
                                </div>
                                <div className="text-xs text-white/60">
                                  {formatTime(worker.entry_at)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {contractors.length === 0 && (
                    <div className="text-center text-white/60 py-8">Sin contratistas</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Edit Worker Modal */}
      {editingPersonId && (
        <EditWorkerModal
          open={!!editingPersonId}
          onClose={() => setEditingPersonId(null)}
          personId={editingPersonId}
          onSaved={fetchData}
        />
      )}

      {/* Exit Queue Modal */}
      <ExitQueueModal
        open={showExitQueue}
        onClose={() => setShowExitQueue(false)}
        people={filteredList.map(l => ({
          person_id: l.person_id,
          full_name: l.full_name,
          contractor_snapshot: l.contractor_snapshot,
          photo_url: l.photo_url,
          log_id: l.id
        }))}
        onStartQueue={(queue) => {
          console.log('Starting exit queue with:', queue);
          // TODO: Navigate to Exit tab with queue
        }}
      />

      {/* Emergency Roll Call Modal */}
      <EmergencyRollCall
        open={showEmergency}
        onClose={() => setShowEmergency(false)}
      />
    </div>
  );
}
