import { useState, useEffect, useRef } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Bell, X, AlertTriangle, Star, Users, Clock, Megaphone, TrendingUp, TrendingDown, Shield } from 'lucide-react';
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

// Map alert_type to icon + color
function getAlertMeta(alertType: string): { icon: typeof Bell; color: string; bg: string } {
  const map: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
    blocked_entry: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/20' },
    favorite_entry: { icon: Star, color: 'text-purple-400', bg: 'bg-purple-500/20' },
    contractor_attendance: { icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    min_capacity: { icon: TrendingDown, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
    max_capacity: { icon: TrendingUp, color: 'text-orange-400', bg: 'bg-orange-500/20' },
    overtime: { icon: Clock, color: 'text-orange-400', bg: 'bg-orange-500/20' },
    announcement: { icon: Megaphone, color: 'text-blue-400', bg: 'bg-blue-500/20' },
    accident_reported: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/30' },
    safety_milestone: { icon: Shield, color: 'text-green-400', bg: 'bg-green-500/20' },
  };
  return map[alertType] || { icon: Bell, color: 'text-white/70', bg: 'bg-white/10' };
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHour < 24) return `${diffHour}h`;
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString('es-BO', { day: 'numeric', month: 'short' });
}

export function NotificationBell() {
  const { currentSite } = useSite();
  const [alerts, setAlerts] = useState<AlertHistoryItem[]>([]);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
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
          .limit(20);

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
          // First time: show all as unread (up to 9)
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
          setAlerts(prev => [newAlert, ...prev].slice(0, 20));
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
      // Mark all as seen
      const now = new Date().toISOString();
      const key = `brik_alerts_seen_${currentSite.id}`;
      localStorage.setItem(key, now);
      lastSeenRef.current = now;
      setUnreadCount(0);
    }
  };

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
              Alertas Recientes
            </h3>
            <button
              onClick={() => setOpen(false)}
              className="text-white/40 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Alert List */}
          <div className="max-h-[400px] overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Bell className="w-8 h-8 text-white/20 mx-auto mb-3" />
                <p className="text-sm text-white/40">Sin alertas aún</p>
                <p className="text-xs text-white/20 mt-1">Las alertas aparecerán aquí cuando se disparen</p>
              </div>
            ) : (
              alerts.map((alert) => {
                const meta = getAlertMeta(alert.alert_type);
                const Icon = meta.icon;
                const isNew = lastSeenRef.current
                  ? new Date(alert.sent_at) > new Date(lastSeenRef.current)
                  : false;

                return (
                  <div
                    key={alert.id}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 border-b border-white/5 transition-colors hover:bg-white/5",
                      isNew && "bg-purple-500/5"
                    )}
                  >
                    {/* Icon */}
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5", meta.bg)}>
                      <Icon className={cn("w-4 h-4", meta.color)} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-white/90 truncate">
                          {alert.title}
                        </p>
                        <span className="text-[10px] text-white/30 flex-shrink-0 mt-0.5">
                          {timeAgo(alert.sent_at)}
                        </span>
                      </div>
                      <p className="text-xs text-white/50 mt-0.5 line-clamp-2">
                        {alert.body}
                      </p>
                    </div>

                    {/* New indicator */}
                    {isNew && (
                      <div className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0 mt-2" />
                    )}
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
