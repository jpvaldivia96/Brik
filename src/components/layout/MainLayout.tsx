import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Building2, LogOut, ChevronDown, Briefcase, Crown, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import BottomActionBar from './BottomActionBar';
import AdminDrawer from './AdminDrawer';
import ActionDrawer from './ActionDrawer';
import DashboardPanel from '@/components/dashboard/DashboardPanel';
import SettingsTab from '@/components/supervisor/SettingsTab';
import AuditLogTab from '@/components/supervisor/AuditLogTab';
import ToolsTab from '@/components/supervisor/ToolsTab';
import ReportsTab from '@/components/supervisor/ReportsTab';
import ImportTab from '@/components/supervisor/ImportTab';
import PeopleTab from '@/components/supervisor/PeopleTab';
import UserManagementTab from '@/components/supervisor/UserManagementTab';
import { PersonalNotificationSettings } from '@/components/settings/PersonalNotificationSettings';
import { UsageBanner } from '@/components/subscription/UsageBanner';
import { LimitBlockModal } from '@/components/subscription/LimitBlockModal';
import { useSubscription } from '@/hooks/useSubscription';

// Live Date/Time Display Component with Weather
function DateTimeDisplay() {
  const [now, setNow] = useState(new Date());
  const [weatherStatus, setWeatherStatus] = useState<string | null>(null);
  const { currentSite } = useSite();

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (currentSite) {
      fetchWeatherStatus();
      const interval = setInterval(fetchWeatherStatus, 5 * 60 * 1000); // Check every 5 min
      return () => clearInterval(interval);
    }
  }, [currentSite]);

  const fetchWeatherStatus = async () => {
    if (!currentSite) return;

    try {
      const { data } = await (supabase as any)
        .from('site_weather_status')
        .select('status')
        .eq('site_id', currentSite.id)
        .single();

      setWeatherStatus(data?.status || null);
    } catch (err) {
      setWeatherStatus(null);
    }
  };

  const formatDate = () => now.toLocaleDateString('es-BO', { weekday: 'short', day: 'numeric', month: 'short' });
  const formatTime = () => now.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-white/50 mt-0.5">
        {formatDate()} · {formatTime()}
      </span>
      {weatherStatus && (
        <span className="text-xs bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full border border-orange-500/30">
          {weatherStatus}
        </span>
      )}
    </div>
  );
}

export default function MainLayout() {
  const navigate = useNavigate();
  const { currentSite, sites, selectSite, isSupervisor, isInAdminMode, exitAdminMode, isPlatformAdmin } = useSite();
  const { signOut, user } = useAuth();
  const [activeAction, setActiveAction] = useState('');
  const [activeAdminPanel, setActiveAdminPanel] = useState('dashboard');
  const [adminDrawerOpen, setAdminDrawerOpen] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const { subscription } = useSubscription();

  const handleExitAdminMode = () => {
    exitAdminMode();
    navigate('/brik-control');
  };

  const handleChangeSite = () => {
    localStorage.removeItem('brik_current_site');
    selectSite('');
    window.location.reload();
  };

  const goHome = () => {
    setActiveAction('');
    setActiveAdminPanel('dashboard');
  };

  const handleActionChange = (action: string) => {
    setActiveAction(action);
  };

  const handleDrawerOpenChange = (open: boolean) => {
    if (!open) setActiveAction('');
  };

  const renderContent = () => {
    switch (activeAdminPanel) {
      case 'dashboard':
        return <DashboardPanel />;
      case 'people':
        return <PeopleTab />;
      case 'users':
        return <UserManagementTab />;
      case 'alerts':
        return <PersonalNotificationSettings />;

      case 'settings':
        return <SettingsTab />;
      case 'audit':
        return <AuditLogTab />;
      case 'tools':
        return <ToolsTab />;
      case 'reports':
        return <ReportsTab />;
      case 'import':
        return <ImportTab />;
      default:
        return <DashboardPanel />;
    }
  };

  const getTitle = () => {
    const titles: Record<string, string> = {
      dashboard: 'Dashboard',
      people: 'Personal',
      users: 'Usuarios',
      settings: 'Configuración',
      audit: 'Auditoría',
      tools: 'Herramientas',
      reports: 'Reportes',
      import: 'Importar',
    };
    return titles[activeAdminPanel] || 'BRIK';
  };

  return (
    <div className="min-h-screen pb-24 relative">
      {/* Gradient background */}
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-purple-900/90 to-slate-900 -z-10" />

      {/* Subtle pattern overlay */}
      <div
        className="fixed inset-0 opacity-10 -z-10"
        style={{
          backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(139, 92, 246, 0.4) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(59, 130, 246, 0.3) 0%, transparent 40%)',
        }}
      />

      {/* Header */}
      <header className="backdrop-blur-xl bg-white/5 border-b border-white/10 sticky top-0 z-40">
        {/* Admin Mode Banner */}
        {isInAdminMode && (
          <div className="bg-purple-600/90 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-white" />
              <span className="text-sm font-medium text-white">Modo Admin</span>
              <span className="text-xs text-white/70">— Viendo como supervisor</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleExitAdminMode}
              className="h-7 text-white hover:bg-white/20 gap-1"
            >
              <X className="w-4 h-4" />
              Salir
            </Button>
          </div>
        )}
        <div className="max-w-2xl mx-auto px-4 h-40 flex items-center justify-between">
          <div className="flex items-center">
            {/* BRIK Brand - Home Button */}
            <Button variant="ghost" className="p-0 hover:bg-transparent" onClick={goHome}>
              <img src="/brik-logo-white.png" alt="BRIK" className="h-36 w-auto object-contain" />
            </Button>
          </div>

          <div className="flex items-start gap-3">
            {/* Site Dropdown + Plan + Date/Time */}
            <div className="flex flex-col items-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 text-sm font-medium text-white/80 hover:text-white transition-colors cursor-pointer">
                    {currentSite?.name}
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-slate-800 border-white/20 min-w-[180px]">
                  {sites.map(site => (
                    <DropdownMenuItem
                      key={site.id}
                      onClick={() => selectSite(site.id)}
                      className={`cursor-pointer text-white hover:!bg-white/20 focus:!bg-white/20 ${currentSite?.id === site.id ? 'bg-white/10' : ''}`}
                    >
                      <Building2 className="w-4 h-4 mr-2" />
                      {site.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {/* Plan Badge */}
              <span className="text-xs text-white/50 mt-0.5">
                {subscription?.plan === 'enterprise' ? 'Enterprise' :
                  subscription?.plan === 'pro' ? 'Pro' :
                    subscription?.status === 'trial' ? 'Trial' : 'Free'}
              </span>
              {/* Date/Time */}
              <DateTimeDisplay />
            </div>

            {/* Platform Admin Button - only for juanpablovaldc@gmail.com */}
            {isPlatformAdmin && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/brik-control')}
                className="w-10 h-10 rounded-xl transition-all duration-300 hover:bg-purple-500/20 hover:scale-105 -mt-1"
                title="Panel de Control"
              >
                <Crown className="w-5 h-5 text-purple-400" />
              </Button>
            )}

            {/* Admin Button - only for supervisors */}
            {isSupervisor && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setAdminDrawerOpen(true)}
                className="w-10 h-10 rounded-xl transition-all duration-300 hover:bg-white/10 hover:scale-105 -mt-1"
              >
                <Briefcase className="w-7 h-7 text-white/80" />
              </Button>
            )}

            {/* Logout Button - only for guards (non-supervisors) */}
            {!isSupervisor && (
              <Button
                variant="ghost"
                size="icon"
                onClick={signOut}
                className="w-10 h-10 rounded-xl transition-all duration-300 hover:bg-white/10 hover:scale-105 -mt-1"
                title="Cerrar sesión"
              >
                <LogOut className="w-6 h-6 text-white/60" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto p-4 animate-fade-in">
        {/* Usage Banner */}
        <UsageBanner className="mb-4" />

        {renderContent()}
      </main>

      {/* Limit Block Modal */}
      {subscription.isOverLimit && showLimitModal && (
        <LimitBlockModal onClose={() => setShowLimitModal(false)} />
      )}

      {/* Bottom Action Bar */}
      <BottomActionBar
        activeAction={activeAction}
        onActionChange={handleActionChange}
      />

      {/* Admin Drawer */}
      <AdminDrawer
        open={adminDrawerOpen}
        onOpenChange={setAdminDrawerOpen}
        activePanel={activeAdminPanel}
        onPanelChange={setActiveAdminPanel}
      />

      {/* Action Drawer */}
      <ActionDrawer
        activeAction={activeAction}
        onOpenChange={handleDrawerOpenChange}
      />
    </div>
  );
}

