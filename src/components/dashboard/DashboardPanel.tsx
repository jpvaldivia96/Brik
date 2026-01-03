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
  people?: { full_name: string; ci: string; photo_url: string | null } | null;
  full_name: string;
  ci: string;
  photo_url: string | null;
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
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'all'>('today');
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'people' | 'companies'>('people');

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

    // Get open logs
    const { data: openLogs } = await supabase
      .from('access_logs')
      .select('*, people(full_name, ci, photo_url)')
      .eq('site_id', currentSite.id)
      .is('exit_at', null)
      .is('voided_at', null);

    const now = Date.now();
    const inside: InsideLog[] = (openLogs || []).map(log => {
      const hours = (now - new Date(log.entry_at).getTime()) / 3600000;
      const status = hours >= critH ? 'crit' : hours >= warnH ? 'warn' : 'ok';
      return {
        ...log,
        hours,
        status,
        full_name: log.name_snapshot || log.people?.full_name || 'Sin nombre',
        ci: log.ci_snapshot || log.people?.ci || '',
        photo_url: log.people?.photo_url || null
      } as InsideLog;
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: todayLogs } = await supabase
      .from('access_logs')
      .select('contractor_snapshot')
      .eq('site_id', currentSite.id)
      .is('voided_at', null)
      .gte('entry_at', today.toISOString());

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
  }, [currentSite, currentSettings]);

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

    // Status filters
    if (activeFilters.has('At-risk')) {
      result = result.filter(l => l.status === 'warn');
    }
    if (activeFilters.has('Alert')) {
      result = result.filter(l => l.status === 'crit');
    }
    if (activeFilters.has('On site') && !activeFilters.has('At-risk') && !activeFilters.has('Alert')) {
      // Show all on-site if only "On site" is active
    }

    return result;
  }, [insideList, searchQuery, activeFilters]);

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
    { label: 'On site', count: stats.onSite, active: activeFilters.has('On site'), icon: <Users className="w-3 h-3" /> },
    { label: 'At-risk', count: stats.atRisk, active: activeFilters.has('At-risk'), variant: 'warn' as const, icon: <Clock className="w-3 h-3" /> },
    { label: 'Alert', count: stats.alert, active: activeFilters.has('Alert'), variant: 'crit' as const, icon: <AlertTriangle className="w-3 h-3" /> },
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

      {/* Alert Badges Summary (SignOnSite style) */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-xl border",
          stats.alert > 0 ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-card/30 border-border text-muted-foreground"
        )}>
          <AlertTriangle className="w-4 h-4" />
          <span className="text-2xl font-bold">{stats.alert}</span>
          <span className="text-sm">Alert</span>
        </div>
        <div className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-xl border",
          stats.atRisk > 0 ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-card/30 border-border text-muted-foreground"
        )}>
          <Clock className="w-4 h-4" />
          <span className="text-2xl font-bold">{stats.atRisk}</span>
          <span className="text-sm">Warning</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl border bg-card/30 border-border text-muted-foreground">
          <UserCheck className="w-4 h-4" />
          <span className="text-2xl font-bold">{stats.onSite}</span>
          <span className="text-sm">On site</span>
        </div>
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
                    : "text-muted-foreground hover:text-foreground hover:bg-card"
                )}
              >
                <Users className="w-4 h-4 inline mr-2" />
                People
              </button>
              <button
                onClick={() => setActiveTab('companies')}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  activeTab === 'companies'
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-card"
                )}
              >
                <Building2 className="w-4 h-4 inline mr-2" />
                Companies
              </button>
            </div>

            <div className="p-4">
              {/* Filters */}
              <AttendanceFilters
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                dateFilter={dateFilter}
                onDateFilterChange={setDateFilter}
                filters={filterBadges}
                onFilterClick={toggleFilter}
              />

              {activeTab === 'people' ? (
                <>
                  {/* Desktop Table Header */}
                  <div className="hidden md:grid grid-cols-[auto_1fr_120px_100px] gap-4 items-center px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                    <div className="w-10"></div>
                    <div>Name</div>
                    <div>Status</div>
                    <div>Checked in</div>
                  </div>

                  {/* Desktop Rows */}
                  <div className="hidden md:block">
                    {filteredList.map((log) => (
                      <PersonRow
                        key={log.id}
                        name={log.full_name}
                        contractor={log.contractor_snapshot}
                        status={log.status === 'crit' ? 'crit' : log.status === 'warn' ? 'at-risk' : 'on-site'}
                        checkedIn={formatTime(log.entry_at)}
                        hours={log.hours}
                        photoUrl={log.photo_url}
                      />
                    ))}
                    {filteredList.length === 0 && (
                      <div className="text-center text-muted-foreground py-8">
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
                        contractor={log.contractor_snapshot}
                        status={log.status === 'crit' ? 'crit' : log.status === 'warn' ? 'at-risk' : 'on-site'}
                        checkedIn={formatTime(log.entry_at)}
                        hours={log.hours}
                        photoUrl={log.photo_url}
                      />
                    ))}
                    {filteredList.length === 0 && (
                      <div className="text-center text-muted-foreground py-8">
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
