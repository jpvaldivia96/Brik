import { useState, useEffect } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from '@/components/ui/kpi-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, LogIn, LogOut, AlertTriangle, RefreshCw, Star, ShieldAlert, Building2 } from 'lucide-react';

interface InsideLog {
  id: string;
  name_snapshot: string | null;
  ci_snapshot: string | null;
  contractor_snapshot: string | null;
  entry_at: string;
  hours: number;
  status: 'ok' | 'warn' | 'crit';
  people?: { full_name: string; ci: string } | null;
}

interface ContractorStat {
  contractor: string;
  inside: number;
  entriesToday: number;
}

interface InsuranceAlert {
  id: string;
  full_name: string;
  ci: string;
  contractor: string | null;
  insurance_expiry: string;
  days_left: number;
  status: 'expired' | 'expiring';
}

interface FavoriteStatus {
  id: string;
  full_name: string;
  ci: string;
  is_inside: boolean;
  hours: number | null;
  status: 'ok' | 'warn' | 'crit' | null;
}

export default function DashboardPanel() {
  const { currentSite, currentSettings } = useSite();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ insideNow: 0, entriesToday: 0, exitsToday: 0, warnCount: 0, critCount: 0 });
  const [insideList, setInsideList] = useState<InsideLog[]>([]);
  const [contractors, setContractors] = useState<ContractorStat[]>([]);
  const [insuranceAlerts, setInsuranceAlerts] = useState<InsuranceAlert[]>([]);
  const [favorites, setFavorites] = useState<FavoriteStatus[]>([]);

  const fetchData = async () => {
    if (!currentSite) return;
    setLoading(true);

    const warnH = Number(currentSettings?.warn_hours) || 10;
    const critH = Number(currentSettings?.crit_hours) || 12;
    const seguroWarnDays = currentSettings?.seguro_warn_days || 30;

    // Get open logs
    const { data: openLogs } = await supabase
      .from('access_logs')
      .select('*, people(full_name, ci)')
      .eq('site_id', currentSite.id)
      .is('exit_at', null)
      .is('voided_at', null);

    const now = Date.now();
    const inside: InsideLog[] = (openLogs || []).map(log => {
      const hours = (now - new Date(log.entry_at).getTime()) / 3600000;
      const status = hours >= critH ? 'crit' : hours >= warnH ? 'warn' : 'ok';
      return { ...log, hours, status } as InsideLog;
    }).sort((a, b) => b.hours - a.hours);

    // Today's entries/exits using site timezone
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    const { data: todayLogs } = await supabase
      .from('access_logs')
      .select('entry_at, exit_at, contractor_snapshot')
      .eq('site_id', currentSite.id)
      .is('voided_at', null)
      .gte('entry_at', todayStr);

    const entriesToday = (todayLogs || []).length;
    const exitsToday = (todayLogs || []).filter(l => l.exit_at).length;

    // Contractor stats
    const contractorMap = new Map<string, { inside: number; entriesToday: number }>();
    inside.forEach(log => {
      const c = log.contractor_snapshot || 'Sin contratista';
      const stat = contractorMap.get(c) || { inside: 0, entriesToday: 0 };
      stat.inside++;
      contractorMap.set(c, stat);
    });
    (todayLogs || []).forEach(log => {
      const c = log.contractor_snapshot || 'Sin contratista';
      const stat = contractorMap.get(c) || { inside: 0, entriesToday: 0 };
      stat.entriesToday++;
      contractorMap.set(c, stat);
    });
    const contractorStats: ContractorStat[] = Array.from(contractorMap.entries())
      .map(([contractor, stat]) => ({ contractor, ...stat }))
      .sort((a, b) => b.inside - a.inside);

    // Insurance alerts
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + seguroWarnDays);
    const futureDateStr = futureDate.toISOString().split('T')[0];
    const todayDateStr = new Date().toISOString().split('T')[0];

    const { data: workersWithInsurance } = await supabase
      .from('workers_profile')
      .select('person_id, insurance_expiry, people(id, full_name, ci, contractor, site_id)')
      .not('insurance_expiry', 'is', null)
      .lte('insurance_expiry', futureDateStr);

    const insuranceList: InsuranceAlert[] = (workersWithInsurance || [])
      .filter(w => (w.people as any)?.site_id === currentSite.id)
      .map(w => {
        const expiry = new Date(w.insurance_expiry!);
        const daysLeft = Math.floor((expiry.getTime() - now) / (1000 * 60 * 60 * 24));
        const p = w.people as any;
        return {
          id: p.id,
          full_name: p.full_name,
          ci: p.ci,
          contractor: p.contractor,
          insurance_expiry: w.insurance_expiry!,
          days_left: daysLeft,
          status: daysLeft < 0 ? 'expired' : 'expiring',
        } as InsuranceAlert;
      })
      .sort((a, b) => a.days_left - b.days_left);

    // Favorites
    const { data: favs } = await supabase
      .from('favorites')
      .select('id, person_id, people(id, full_name, ci)')
      .eq('site_id', currentSite.id);

    const favPeopleIds = (favs || []).map(f => (f.people as any)?.id).filter(Boolean);
    const { data: favLogs } = await supabase
      .from('access_logs')
      .select('person_id, entry_at')
      .eq('site_id', currentSite.id)
      .is('exit_at', null)
      .is('voided_at', null)
      .in('person_id', favPeopleIds);

    const favInsideMap = new Map((favLogs || []).map(l => [l.person_id, l.entry_at]));

    const favoritesList: FavoriteStatus[] = (favs || []).map(f => {
      const p = f.people as any;
      const entryAt = favInsideMap.get(p.id);
      const hours = entryAt ? (now - new Date(entryAt).getTime()) / 3600000 : null;
      const status = hours !== null ? (hours >= critH ? 'crit' : hours >= warnH ? 'warn' : 'ok') : null;
      return {
        id: f.id,
        full_name: p.full_name,
        ci: p.ci,
        is_inside: !!entryAt,
        hours,
        status,
      };
    });

    setStats({
      insideNow: inside.length,
      entriesToday,
      exitsToday,
      warnCount: inside.filter(i => i.status === 'warn').length,
      critCount: inside.filter(i => i.status === 'crit').length,
    });
    setInsideList(inside.slice(0, 50));
    setContractors(contractorStats);
    setInsuranceAlerts(insuranceList);
    setFavorites(favoritesList);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [currentSite, currentSettings]);

  // Realtime subscription for access_logs changes
  useEffect(() => {
    if (!currentSite) return;

    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'access_logs',
          filter: `site_id=eq.${currentSite.id}`
        },
        () => {
          // Refetch data when any change happens
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentSite, currentSettings]);

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Dashboard</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40">Actualización automática</span>
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KPICard value={stats.insideNow} label="Dentro ahora" icon={<Users className="w-5 h-5" />} />
            <KPICard value={stats.entriesToday} label="Entradas hoy" icon={<LogIn className="w-5 h-5" />} />
            <KPICard value={stats.exitsToday} label="Salidas hoy" icon={<LogOut className="w-5 h-5" />} />
            <KPICard value={stats.warnCount} label="Alerta WARN" variant="warn" icon={<AlertTriangle className="w-5 h-5" />} />
            <KPICard value={stats.critCount} label="Alerta CRIT" variant="crit" icon={<AlertTriangle className="w-5 h-5" />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Inside table */}
            <div className="card-cosmos overflow-hidden lg:col-span-2">
              <div className="card-cosmos-header">
                <h3 className="font-medium flex items-center gap-2">
                  <Users className="w-4 h-4" /> Personas dentro ahora
                </h3>
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="table-cosmos">
                  <thead>
                    <tr><th>Estado</th><th>Nombre</th><th>CI</th><th>Contratista</th><th>Entró</th><th>Horas</th></tr>
                  </thead>
                  <tbody>
                    {insideList.map((log) => (
                      <tr key={log.id}>
                        <td><StatusBadge status={log.status} /></td>
                        <td className="font-medium">{log.name_snapshot || log.people?.full_name}</td>
                        <td>{log.ci_snapshot || log.people?.ci}</td>
                        <td>{log.contractor_snapshot || '-'}</td>
                        <td>{formatTime(log.entry_at)}</td>
                        <td>{log.hours.toFixed(1)}</td>
                      </tr>
                    ))}
                    {insideList.length === 0 && (
                      <tr><td colSpan={6} className="text-center text-muted-foreground py-8">No hay personas dentro</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden p-4 space-y-3">
                {insideList.map((log) => (
                  <div key={log.id} className="bg-card/50 border border-border rounded-lg p-3 flex justify-between items-start">
                    <div>
                      <div className="font-medium">{log.name_snapshot || log.people?.full_name}</div>
                      <div className="text-sm text-muted-foreground">{log.contractor_snapshot || 'Sin contratista'}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Entró: {formatTime(log.entry_at)} • {log.hours.toFixed(1)}h
                      </div>
                    </div>
                    <StatusBadge status={log.status} />
                  </div>
                ))}
                {insideList.length === 0 && (
                  <div className="text-center text-muted-foreground py-4">No hay personas dentro</div>
                )}
              </div>
            </div>

            {/* Contractors table */}
            <div className="card-cosmos overflow-hidden">
              <div className="card-cosmos-header">
                <h3 className="font-medium flex items-center gap-2">
                  <Building2 className="w-4 h-4" /> Por contratista
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="table-cosmos">
                  <thead>
                    <tr><th>Contratista</th><th>Dentro</th><th>Hoy</th></tr>
                  </thead>
                  <tbody>
                    {contractors.map((c) => (
                      <tr key={c.contractor}>
                        <td className="font-medium text-sm md:text-base max-w-[120px] truncate" title={c.contractor}>{c.contractor}</td>
                        <td>{c.inside}</td>
                        <td>{c.entriesToday}</td>
                      </tr>
                    ))}
                    {contractors.length === 0 && (
                      <tr><td colSpan={3} className="text-center text-muted-foreground py-6">Sin datos</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Favorites table */}
            <div className="card-cosmos overflow-hidden">
              <div className="card-cosmos-header">
                <h3 className="font-medium flex items-center gap-2">
                  <Star className="w-4 h-4" /> Favoritos
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="table-cosmos">
                  <thead>
                    <tr><th>Nombre</th><th>Estado</th><th>Horas</th></tr>
                  </thead>
                  <tbody>
                    {favorites.map((f) => (
                      <tr key={f.id}>
                        <td className="font-medium">{f.full_name}</td>
                        <td><StatusBadge status={f.is_inside ? (f.status || 'ok') : 'outside'} /></td>
                        <td>{f.hours !== null ? f.hours.toFixed(1) : '-'}</td>
                      </tr>
                    ))}
                    {favorites.length === 0 && (
                      <tr><td colSpan={3} className="text-center text-muted-foreground py-6">Sin favoritos</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Insurance alerts */}
            <div className="card-cosmos overflow-hidden lg:col-span-2">
              <div className="card-cosmos-header">
                <h3 className="font-medium flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" /> Seguros por vencer / vencidos
                </h3>
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="table-cosmos">
                  <thead>
                    <tr><th>Estado</th><th>Nombre</th><th>CI</th><th>Contratista</th><th>Vencimiento</th><th>Días</th></tr>
                  </thead>
                  <tbody>
                    {insuranceAlerts.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <StatusBadge status={a.status === 'expired' ? 'crit' : 'warn'}>
                            {a.status === 'expired' ? 'VENCIDO' : 'Por vencer'}
                          </StatusBadge>
                        </td>
                        <td className="font-medium">{a.full_name}</td>
                        <td>{a.ci}</td>
                        <td>{a.contractor || '-'}</td>
                        <td>{formatDate(a.insurance_expiry)}</td>
                        <td className={a.days_left < 0 ? 'text-status-crit font-medium' : 'text-status-warn'}>
                          {a.days_left < 0 ? `${Math.abs(a.days_left)}d vencido` : `${a.days_left}d`}
                        </td>
                      </tr>
                    ))}
                    {insuranceAlerts.length === 0 && (
                      <tr><td colSpan={6} className="text-center text-muted-foreground py-6">Sin alertas de seguro</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden p-4 space-y-3">
                {insuranceAlerts.map((a) => (
                  <div key={a.id} className="bg-card/50 border border-border rounded-lg p-3 flex justify-between items-start">
                    <div>
                      <div className="font-medium">{a.full_name}</div>
                      <div className="text-sm text-center text-muted-foreground mb-1">{a.contractor || 'Sin contratista'}</div>
                      <div className={a.days_left < 0 ? 'text-status-crit text-sm font-medium' : 'text-status-warn text-sm'}>
                        {a.days_left < 0 ? `Venció hace ${Math.abs(a.days_left)}d` : `Vence en ${a.days_left}d`} ({formatDate(a.insurance_expiry)})
                      </div>
                    </div>
                    <StatusBadge status={a.status === 'expired' ? 'crit' : 'warn'}>
                      {a.status === 'expired' ? '!' : 'Warn'}
                    </StatusBadge>
                  </div>
                ))}
                {insuranceAlerts.length === 0 && (
                  <div className="text-center text-muted-foreground py-4">Sin alertas de seguro</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
