import { useState, useEffect, useMemo } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Spinner } from '@/components/ui/spinner';
import { AttendanceFilters } from './AttendanceFilters';
import { PersonRow, PersonCard } from './PersonRow';
import { Users, AlertTriangle, Clock, Building2, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InsideLog {
  id: string;
  name_snapshot: string | null;
  ci_snapshot: string | null;
  contractor_snapshot: string | null;
  entry_at: string;
  hours: number;
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
  const [loading, setLoading] = useState(true);
  const [insideList, setInsideList] = useState<InsideLog[]>([]);
  const [contractors, setContractors] = useState<ContractorStat[]>([]);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'people' | 'companies'>('people');
  const [statusFilter, setStatusFilter] = useState<'all' | 'crit' | 'warn' | 'ok'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'entry'>('entry');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Stats
  const stats = useMemo(() => {
    const onSite = insideList.length;
    const atRisk = insideList.filter(l => l.status === 'warn').length;
    const alert = insideList.filter(l => l.status === 'crit').length;
    return { onSite, atRisk, alert };
  }, [insideList]);

  const fetchData = async () => {
    if (!currentSite) return;
    setLoading(true);

    const warnH = Number(currentSettings?.warn_hours) || 10;
    const critH = Number(currentSettings?.crit_hours) || 12;
    const today = new Date().toISOString().split('T')[0];
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
    const inside: InsideLog[] = logs.map(log => {
      const entryTime = new Date(log.entry_at).getTime();
      const exitTime = log.exit_at ? new Date(log.exit_at).getTime() : now;
      const hours = (exitTime - entryTime) / 3600000;
      const status: 'ok' | 'warn' | 'crit' = isViewingToday
        ? (hours >= critH ? 'crit' : hours >= warnH ? 'warn' : 'ok')
        : 'ok'; // Historical logs always show as 'ok'

      // Get workers_profile data (it's related to people, which is related to access_logs)
      const wp = log.people?.workers_profile;

      return {
        id: log.id,
        name_snapshot: log.name_snapshot,
        ci_snapshot: log.ci_snapshot,
        contractor_snapshot: log.contractor_snapshot,
        entry_at: log.entry_at,
        hours,
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
      const c = log.contractor_snapshot || 'Sin contratista';
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
      const c = log.contractor_snapshot || 'Sin contratista';
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
  };

  useEffect(() => {
    fetchData();
  }, [currentSite, currentSettings, selectedDate]);

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
  }, [currentSite, currentSettings]);

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
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40">Live</span>
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
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
                        photoUrl={log.photo_url}
                        insuranceExpiry={log.insurance_expiry}
                        inductionDate={log.induction_date}
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
                        photoUrl={log.photo_url}
                        insuranceExpiry={log.insurance_expiry}
                        inductionDate={log.induction_date}
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
                  {contractors.map((c) => (
                    <div
                      key={c.contractor}
                      className="flex items-center justify-between p-3 bg-card/30 rounded-lg border border-border/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">{c.contractor}</div>
                          <div className="text-sm text-muted-foreground">{c.entriesToday} entradas hoy</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-primary">{c.inside}</div>
                        <div className="text-xs text-muted-foreground">dentro</div>
                      </div>
                    </div>
                  ))}
                  {contractors.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">Sin contratistas</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
