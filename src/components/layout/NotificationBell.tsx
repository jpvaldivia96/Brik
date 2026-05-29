import { useState, useEffect, useRef } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Bell, X, AlertTriangle, Star, Users, Clock, Megaphone, TrendingUp, TrendingDown, Shield, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AlertHistoryItem {
  id: string;
  site_id: string;
  alert_type: string;
  title: string;
  body: string;
  sent_at: string;
  recipients: number;
}

function getAlertMeta(alertType: string): { icon: typeof Bell; color: string; bg: string; label: string } {
  const map: Record<string, { icon: typeof Bell; color: string; bg: string; label: string }> = {
    blocked_entry: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/20', label: 'Bloqueados' },
    favorite_entry: { icon: Star, color: 'text-purple-400', bg: 'bg-purple-500/20', label: 'Favoritos' },
    contractor_attendance: { icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: 'Asistencia' },
    min_capacity: { icon: TrendingDown, color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'Cap. Mínima' },
    max_capacity: { icon: TrendingUp, color: 'text-orange-400', bg: 'bg-orange-500/20', label: 'Cap. Máxima' },
    overtime: { icon: Clock, color: 'text-orange-400', bg: 'bg-orange-500/20', label: 'Horas Extra' },
    announcement: { icon: Megaphone, color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Anuncios' },
    accident_reported: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/30', label: 'Accidentes' },
    safety_milestone: { icon: Shield, color: 'text-green-400', bg: 'bg-green-500/20', label: 'Seguridad' },
  };
  return map[alertType] || { icon: Bell, color: 'text-white/70', bg: 'bg-white/10', label: 'Otros' };
}

function getDateBounds() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const cutoff = new Date(yesterdayStart.getTime()); // anything before yesterday = delete
  return { todayStart, yesterdayStart, cutoff };
}

function getDateLabel(dateStr: string, todayStart: Date, yesterdayStart: Date): 'Hoy' | 'Ayer' | null {
  const date = new Date(dateStr);
  if (date >= todayStart) return 'Hoy';
  if (date >= yesterdayStart) return 'Ayer';
  return null; // older than yesterday → discard
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
}

interface AlertGroup {
  alertType: string;
  meta: ReturnType<typeof getAlertMeta>;
  items: AlertHistoryItem[];
  latestTime: string;
}

interface DateSection {
  label: 'Hoy' | 'Ayer';
  groups: AlertGroup[];
}

function groupAlerts(alerts: AlertHistoryItem[]): DateSection[] {
  const { todayStart, yesterdayStart } = getDateBounds();

  const todayAlerts: AlertHistoryItem[] = [];
  const yesterdayAlerts: AlertHistoryItem[] = [];

  for (const alert of alerts) {
    const label = getDateLabel(alert.sent_at, todayStart, yesterdayStart);
    if (label === 'Hoy') todayAlerts.push(alert);
    else if (label === 'Ayer') yesterdayAlerts.push(alert);
    // older → ignored
  }

  const buildGroups = (items: AlertHistoryItem[]): AlertGroup[] => {
    const typeMap = new Map<string, AlertHistoryItem[]>();
    for (const item of items) {
      if (!typeMap.has(item.alert_type)) typeMap.set(item.alert_type, []);
      typeMap.get(item.alert_type)!.push(item);
    }
    const groups: AlertGroup[] = [];
    for (const [alertType, typeItems] of typeMap) {
      const sorted = typeItems.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());
      groups.push({
        alertType,
        meta: getAlertMeta(alertType),
        items: sorted,
        latestTime: sorted[0].sent_at,
      });
    }
    return groups.sort((a, b) => new Date(b.latestTime).getTime() - new Date(a.latestTime).getTime());
  };

  const sections: DateSection[] = [];
  if (todayAlerts.length > 0) sections.push({ label: 'Hoy', groups: buildGroups(todayAlerts) });
  if (yesterdayAlerts.length > 0) sections.push({ label: 'Ayer', groups: buildGroups(yesterdayAlerts) });
  return sections;
}

const KNOWN_ALERT_TYPES = [
  'contractor_attendance', 'favorite_entry', 'blocked_entry',
  'min_capacity', 'max_capacity', 'overtime',
  'unusual_rotation', 'mass_entry', 'night_activity',
  'first_entry', 'exit_without_entry', 'low_weekly_attendance',
  'attendance_record', 'contractor_inactive', 'exponential_growth',
  'accident_reported', 'safety_milestone', 'weather_alert',
  'attendance_prediction', 'birthday', 'worker_of_month',
  'meeting_reminder', 'announcement', 'inspector_visit',
];

export function NotificationBell() {
  const { currentSite } = useSite();
  const { user } = useAuth();
  const [allAlerts, setAllAlerts] = useState<AlertHistoryItem[]>([]);
  const [enabledTypes, setEnabledTypes] = useState<Set<string> | null>(null);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['Ayer'])); // Ayer starts collapsed
  const panelRef = useRef<HTMLDivElement>(null);
  const lastSeenRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentSite) {
      lastSeenRef.current = localStorage.getItem(`brik_alerts_seen_${currentSite.id}`);
    }
  }, [currentSite]);

  // Load user notification preferences
  useEffect(() => {
    if (!currentSite || !user) return;
    const loadPrefs = async () => {
      try {
        const { data } = await (supabase as any)
          .from('user_notification_preferences')
          .select('*')
          .eq('user_id', user.id)
          .eq('site_id', currentSite.id)
          .maybeSingle();

        if (!data) {
          setEnabledTypes(new Set(KNOWN_ALERT_TYPES));
          return;
        }
        const enabled = new Set<string>();
        for (const key of KNOWN_ALERT_TYPES) {
          if (data[key] === true || data[key] === undefined) enabled.add(key);
        }
        setEnabledTypes(enabled);
      } catch {
        setEnabledTypes(new Set(KNOWN_ALERT_TYPES));
      }
    };
    loadPrefs();
  }, [currentSite, user]);

  // Fetch alerts (only last 2 days)
  useEffect(() => {
    if (!currentSite) return;
    const { cutoff } = getDateBounds();

    const fetchAlerts = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('alert_history')
          .select('*')
          .eq('site_id', currentSite.id)
          .gte('sent_at', cutoff.toISOString())
          .order('sent_at', { ascending: false })
          .limit(100);

        if (!error) setAllAlerts((data || []) as AlertHistoryItem[]);
      } catch (err) {
        console.error('Error fetching alerts:', err);
      }
    };

    fetchAlerts();

    const channel = supabase
      .channel('alert-history-bell')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alert_history', filter: `site_id=eq.${currentSite.id}` },
        (payload: any) => {
          const newAlert = payload.new as AlertHistoryItem;
          setAllAlerts(prev => [newAlert, ...prev]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentSite]);

  // Filter by preferences
  const filteredAlerts = enabledTypes
    ? allAlerts.filter(a => enabledTypes.has(a.alert_type))
    : allAlerts;

  // Unread count
  useEffect(() => {
    const lastSeen = lastSeenRef.current;
    if (lastSeen) {
      setUnreadCount(filteredAlerts.filter(a => new Date(a.sent_at) > new Date(lastSeen)).length);
    } else {
      setUnreadCount(Math.min(filteredAlerts.length, 9));
    }
  }, [filteredAlerts]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const handleOpen = () => {
    setOpen(!open);
    if (!open && currentSite) {
      const now = new Date().toISOString();
      localStorage.setItem(`brik_alerts_seen_${currentSite.id}`, now);
      lastSeenRef.current = now;
      setUnreadCount(0);
    }
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleSection = (label: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  const sections = groupAlerts(filteredAlerts);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button — same size as other header icons */}
      <button
        onClick={handleOpen}
        className={cn(
          "relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 -mt-1",
          open ? "bg-purple-500/20 scale-105" : "hover:bg-white/10 hover:scale-105"
        )}
        title="Notificaciones"
      >
        <Bell className={cn("w-5 h-5", open ? "text-purple-400" : "text-white/70")} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-0.5 shadow-lg shadow-red-500/50">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute right-0 top-12 w-80 sm:w-96 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 z-50 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
            <h3 className="text-xs font-semibold text-white/80 flex items-center gap-1.5 uppercase tracking-wider">
              <Bell className="w-3.5 h-3.5 text-purple-400" />
              Notificaciones
            </h3>
            <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white transition-colors p-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Content */}
          <div className="max-h-[400px] overflow-y-auto">
            {sections.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="w-7 h-7 text-white/15 mx-auto mb-2" />
                <p className="text-xs text-white/40">Sin notificaciones</p>
              </div>
            ) : (
              sections.map((section) => {
                const isCollapsed = collapsedSections.has(section.label);

                return (
                  <div key={section.label}>
                    {/* Date Header — clickable for Ayer */}
                    <button
                      onClick={() => toggleSection(section.label)}
                      className="w-full sticky top-0 z-10 flex items-center justify-between px-4 py-1.5 bg-slate-900/95 backdrop-blur-sm border-b border-white/5 hover:bg-white/[0.03] transition-colors"
                    >
                      <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
                        {section.label}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isCollapsed && (
                          <span className="text-[10px] text-white/25">
                            {section.groups.reduce((acc, g) => acc + g.items.length, 0)} alertas
                          </span>
                        )}
                        {section.label === 'Ayer' && (
                          <ChevronRight className={cn(
                            "w-3 h-3 text-white/25 transition-transform duration-200",
                            !isCollapsed && "rotate-90"
                          )} />
                        )}
                      </div>
                    </button>

                    {/* Groups — hidden when section is collapsed */}
                    {!isCollapsed && section.groups.map((group) => {
                      const groupKey = `${section.label}-${group.alertType}`;
                      const isExpanded = expandedGroups.has(groupKey);
                      const Icon = group.meta.icon;
                      const hasMultiple = group.items.length > 1;

                      return (
                        <div key={groupKey} className="border-b border-white/[0.04]">
                          <button
                            onClick={() => hasMultiple && toggleGroup(groupKey)}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-3 py-2 transition-colors text-left",
                              hasMultiple ? "hover:bg-white/5 cursor-pointer" : "cursor-default"
                            )}
                          >
                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", group.meta.bg)}>
                              <Icon className={cn("w-4 h-4", group.meta.color)} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <p className="text-xs font-medium text-white/90 truncate">{group.meta.label}</p>
                                  {hasMultiple && (
                                    <span className={cn(
                                      "flex-shrink-0 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[9px] font-bold px-1",
                                      group.meta.bg, group.meta.color
                                    )}>
                                      {group.items.length}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[9px] text-white/25 flex-shrink-0">{formatTime(group.latestTime)}</span>
                              </div>
                              <p className="text-[11px] text-white/45 mt-0.5 truncate">
                                {hasMultiple && !isExpanded
                                  ? `${group.items.length} alertas — ${group.items[0].title}`
                                  : group.items[0].body
                                }
                              </p>
                            </div>
                            {hasMultiple && (
                              <ChevronDown className={cn(
                                "w-3.5 h-3.5 text-white/20 flex-shrink-0 transition-transform duration-200",
                                isExpanded && "rotate-180"
                              )} />
                            )}
                          </button>

                          {isExpanded && hasMultiple && (
                            <div className="bg-white/[0.02]">
                              {group.items.map((alert) => (
                                <div key={alert.id} className="flex items-start gap-2.5 pl-14 pr-3 py-2 border-t border-white/[0.03]">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-1.5">
                                      <p className="text-[11px] font-medium text-white/75 truncate">{alert.title}</p>
                                      <span className="text-[9px] text-white/20 flex-shrink-0">{formatTime(alert.sent_at)}</span>
                                    </div>
                                    <p className="text-[10px] text-white/35 mt-0.5 line-clamp-2">{alert.body}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
