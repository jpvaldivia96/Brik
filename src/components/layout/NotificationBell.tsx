import { useState, useEffect, useRef } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Bell, X, AlertTriangle, Star, Users, Clock, Megaphone, TrendingUp, TrendingDown, Shield, ChevronDown } from 'lucide-react';
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

// Map alert_type to icon + color + label
function getAlertMeta(alertType: string): { icon: typeof Bell; color: string; bg: string; label: string } {
  const map: Record<string, { icon: typeof Bell; color: string; bg: string; label: string }> = {
    blocked_entry: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/20', label: 'Bloqueados' },
    favorite_entry: { icon: Star, color: 'text-purple-400', bg: 'bg-purple-500/20', label: 'Favoritos' },
    contractor_attendance: { icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: 'Asistencia' },
    min_capacity: { icon: TrendingDown, color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'Capacidad Mínima' },
    max_capacity: { icon: TrendingUp, color: 'text-orange-400', bg: 'bg-orange-500/20', label: 'Capacidad Máxima' },
    overtime: { icon: Clock, color: 'text-orange-400', bg: 'bg-orange-500/20', label: 'Horas Extra' },
    announcement: { icon: Megaphone, color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Anuncios' },
    accident_reported: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/30', label: 'Accidentes' },
    safety_milestone: { icon: Shield, color: 'text-green-400', bg: 'bg-green-500/20', label: 'Seguridad' },
  };
  return map[alertType] || { icon: Bell, color: 'text-white/70', bg: 'bg-white/10', label: 'Otros' };
}

// Get date group label (like Apple)
function getDateGroup(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateDay.getTime() === today.getTime()) return 'Hoy';
  if (dateDay.getTime() === yesterday.getTime()) return 'Ayer';
  
  const diffDays = Math.floor((today.getTime() - dateDay.getTime()) / 86400000);
  if (diffDays < 7) return 'Esta Semana';
  if (diffDays < 30) return 'Este Mes';
  return date.toLocaleDateString('es-BO', { month: 'long', year: 'numeric' });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
}

// Group alerts by date → alert_type
interface AlertGroup {
  alertType: string;
  meta: ReturnType<typeof getAlertMeta>;
  items: AlertHistoryItem[];
  latestTime: string;
}

interface DateSection {
  label: string;
  groups: AlertGroup[];
}

function groupAlerts(alerts: AlertHistoryItem[]): DateSection[] {
  // 1. Group by date
  const dateMap = new Map<string, AlertHistoryItem[]>();
  for (const alert of alerts) {
    const dateLabel = getDateGroup(alert.sent_at);
    if (!dateMap.has(dateLabel)) dateMap.set(dateLabel, []);
    dateMap.get(dateLabel)!.push(alert);
  }

  // 2. Within each date, group by alert_type
  const sections: DateSection[] = [];
  for (const [label, items] of dateMap) {
    const typeMap = new Map<string, AlertHistoryItem[]>();
    for (const item of items) {
      if (!typeMap.has(item.alert_type)) typeMap.set(item.alert_type, []);
      typeMap.get(item.alert_type)!.push(item);
    }

    const groups: AlertGroup[] = [];
    for (const [alertType, typeItems] of typeMap) {
      groups.push({
        alertType,
        meta: getAlertMeta(alertType),
        items: typeItems.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()),
        latestTime: typeItems[0].sent_at,
      });
    }

    // Sort groups by latest time (most recent first)
    groups.sort((a, b) => new Date(b.latestTime).getTime() - new Date(a.latestTime).getTime());
    sections.push({ label, groups });
  }

  return sections;
}

export function NotificationBell() {
  const { currentSite } = useSite();
  const [alerts, setAlerts] = useState<AlertHistoryItem[]>([]);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const lastSeenRef = useRef<string | null>(null);

  // Load last seen timestamp from localStorage
  useEffect(() => {
    if (currentSite) {
      const key = `brik_alerts_seen_${currentSite.id}`;
      lastSeenRef.current = localStorage.getItem(key);
    }
  }, [currentSite]);

  // Fetch alerts
  useEffect(() => {
    if (!currentSite) return;

    const fetchAlerts = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('alert_history')
          .select('*')
          .eq('site_id', currentSite.id)
          .order('sent_at', { ascending: false })
          .limit(50);

        if (error) {
          console.error('Error fetching alerts:', error);
          return;
        }

        const items = (data || []) as AlertHistoryItem[];
        setAlerts(items);

        // Count unread
        const lastSeen = lastSeenRef.current;
        if (lastSeen) {
          const count = items.filter(a => new Date(a.sent_at) > new Date(lastSeen)).length;
          setUnreadCount(count);
        } else {
          setUnreadCount(Math.min(items.length, 9));
        }
      } catch (err) {
        console.error('Error fetching alerts:', err);
      }
    };

    fetchAlerts();

    // Subscribe to realtime inserts
    const channel = supabase
      .channel('alert-history-bell')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'alert_history',
          filter: `site_id=eq.${currentSite.id}`,
        },
        (payload: any) => {
          const newAlert = payload.new as AlertHistoryItem;
          setAlerts(prev => [newAlert, ...prev].slice(0, 50));
          setUnreadCount(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentSite]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleOpen = () => {
    setOpen(!open);

    if (!open && currentSite) {
      const now = new Date().toISOString();
      const key = `brik_alerts_seen_${currentSite.id}`;
      localStorage.setItem(key, now);
      lastSeenRef.current = now;
      setUnreadCount(0);
    }
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const sections = groupAlerts(alerts);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={handleOpen}
        className={cn(
          "relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300",
          open
            ? "bg-purple-500/30 scale-105"
            : "hover:bg-white/10 hover:scale-105"
        )}
        title="Alertas"
      >
        <Bell className={cn("w-5 h-5", open ? "text-purple-400" : "text-white/70")} />

        {/* Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 animate-pulse shadow-lg shadow-red-500/50">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute right-0 top-12 w-80 sm:w-96 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 z-50 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-purple-400" />
              Notificaciones
            </h3>
            <button
              onClick={() => setOpen(false)}
              className="text-white/40 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Grouped Alert List */}
          <div className="max-h-[480px] overflow-y-auto">
            {sections.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Bell className="w-8 h-8 text-white/20 mx-auto mb-3" />
                <p className="text-sm text-white/40">Sin notificaciones aún</p>
                <p className="text-xs text-white/20 mt-1">Las alertas aparecerán aquí cuando se disparen</p>
              </div>
            ) : (
              sections.map((section) => (
                <div key={section.label}>
                  {/* Date Header */}
                  <div className="sticky top-0 z-10 px-4 py-2 bg-slate-900/95 backdrop-blur-sm border-b border-white/5">
                    <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                      {section.label}
                    </span>
                  </div>

                  {/* Alert Type Groups */}
                  {section.groups.map((group) => {
                    const groupKey = `${section.label}-${group.alertType}`;
                    const isExpanded = expandedGroups.has(groupKey);
                    const Icon = group.meta.icon;
                    const hasMultiple = group.items.length > 1;

                    return (
                      <div key={groupKey} className="border-b border-white/5">
                        {/* Group Header (collapsible if multiple) */}
                        <button
                          onClick={() => hasMultiple && toggleGroup(groupKey)}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 transition-colors text-left",
                            hasMultiple ? "hover:bg-white/5 cursor-pointer" : "cursor-default"
                          )}
                        >
                          {/* Icon */}
                          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", group.meta.bg)}>
                            <Icon className={cn("w-[18px] h-[18px]", group.meta.color)} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <p className="text-sm font-medium text-white/90 truncate">
                                  {group.meta.label}
                                </p>
                                {hasMultiple && (
                                  <span className={cn(
                                    "flex-shrink-0 min-w-[20px] h-5 flex items-center justify-center rounded-full text-[10px] font-bold",
                                    group.meta.bg, group.meta.color
                                  )}>
                                    {group.items.length}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-white/30 flex-shrink-0">
                                {formatTime(group.latestTime)}
                              </span>
                            </div>
                            <p className="text-xs text-white/50 mt-0.5 truncate">
                              {hasMultiple && !isExpanded
                                ? `${group.items.length} alertas — ${group.items[0].title}`
                                : group.items[0].body
                              }
                            </p>
                          </div>

                          {/* Expand indicator */}
                          {hasMultiple && (
                            <ChevronDown className={cn(
                              "w-4 h-4 text-white/20 flex-shrink-0 transition-transform duration-200",
                              isExpanded && "rotate-180"
                            )} />
                          )}
                        </button>

                        {/* Expanded items */}
                        {isExpanded && hasMultiple && (
                          <div className="bg-white/[0.02]">
                            {group.items.map((alert) => (
                              <div
                                key={alert.id}
                                className="flex items-start gap-3 pl-16 pr-4 py-2.5 border-t border-white/[0.03] hover:bg-white/[0.03] transition-colors"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-xs font-medium text-white/80 truncate">
                                      {alert.title}
                                    </p>
                                    <span className="text-[10px] text-white/25 flex-shrink-0">
                                      {formatTime(alert.sent_at)}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-white/40 mt-0.5 line-clamp-2">
                                    {alert.body}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
