import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Building2, LogOut, ChevronDown, Briefcase, Crown, X } from 'lucide-react';
import BillingPage from '@/components/billing/BillingPage';
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
import StatisticsPanel from '@/components/analytics/StatisticsPanel';
import InspectionNotesPanel from '@/components/inspection/InspectionNotesPanel';
import TrustDatabasePanel from '@/components/trust/TrustDatabasePanel';
import { UsageBanner } from '@/components/subscription/UsageBanner';
import { LimitBlockModal } from '@/components/subscription/LimitBlockModal';
import { useSubscription } from '@/hooks/useSubscription';
import WelcomeModal from '@/components/onboarding/WelcomeModal';
import SubscribeModal from '@/components/subscription/SubscribeModal';
import { SuspendedOverlay } from '@/components/subscription/SuspendedOverlay';
import { SpotlightTutorial } from '@/components/tutorial/SpotlightTutorial';
import { getCountryFlag, formatSiteDateShort, formatSiteTime, getSiteCurrentTime } from '@/lib/dateUtils';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { AssistantChat } from '@/components/assistant/AssistantChat';
import { useFeatureGate } from '@/hooks/useFeatureGate';

// Live Date/Time Display Component with Weather and Country Flag
function DateTimeDisplay() {
  const [now, setNow] = useState(new Date());
  const [weatherStatus, setWeatherStatus] = useState<string | null>(null);
  const { currentSite } = useSite();

  // Get timezone from site or default to Bolivia
  const timezone = currentSite?.timezone || 'America/La_Paz';
  const countryFlag = getCountryFlag(timezone);

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

  // Format date/time in SITE's timezone (not user's local)
  const formatDate = () => formatSiteDateShort(now, timezone);
  const formatTime = () => formatSiteTime(now, timezone);

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-white/35 font-light whitespace-nowrap">
        {formatDate()} · {formatTime()} {countryFlag}
      </span>
      {weatherStatus && (
        <span className="text-[10px] bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded-full border border-orange-500/30">
          {weatherStatus}
        </span>
      )}
    </div>
  );
}

export default function MainLayout() {
  const navigate = useNavigate();
  const { currentSite, sites, selectSite, isSupervisor, isInspector, isInAdminMode, exitAdminMode, isPlatformAdmin } = useSite();
  const { signOut, user } = useAuth();
  const [activeAction, setActiveAction] = useState('');
  
  // Persist the active tab to localStorage so PWA state isn't lost on iOS reload
  const [activeAdminPanel, setActiveAdminPanel] = useState(() => {
    return localStorage.getItem('brik_active_panel') || 'dashboard';
  });

  useEffect(() => {
    localStorage.setItem('brik_active_panel', activeAdminPanel);
  }, [activeAdminPanel]);

  const [adminDrawerOpen, setAdminDrawerOpen] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const { subscription } = useSubscription();
  const { isProOrAbove } = useFeatureGate();

  // Check if this is a first-time user
  useEffect(() => {
    const shouldShowWelcome = localStorage.getItem('brik_show_welcome');
    if (shouldShowWelcome === 'true') {
      setShowWelcome(true);
    }
    // Check if tutorial should be shown
    const shouldShowTutorial = localStorage.getItem('brik_show_tutorial');
    if (shouldShowTutorial === 'true') {
      setShowTutorial(true);
      localStorage.removeItem('brik_show_tutorial');
    }
  }, []);

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
      case 'stats':
        return <StatisticsPanel />;
      case 'inspection':
        return <InspectionNotesPanel />;
      case 'alerts':
        return <PersonalNotificationSettings />;
      case 'settings':
      case 'site-settings':
        return <SettingsTab />;
      case 'audit':
        return <AuditLogTab />;
      case 'tools':
        return <ToolsTab />;
      case 'reports':
        return <ReportsTab />;
      case 'import':
        return <ImportTab />;
      case 'billing':
        return <BillingPage />;
      case 'trust-db':
        return <TrustDatabasePanel />;
      default:
        return <DashboardPanel />;
    }
  };

  const getTitle = () => {
    const titles: Record<string, string> = {
      dashboard: 'Dashboard',
      people: 'Personal',
      users: 'Usuarios',
      stats: 'Estadísticas',
      inspection: 'Control de Obra',
      alerts: 'Alertas',
      settings: 'Configuración',
      'site-settings': 'Configuración de Obra',
      audit: 'Auditoría',
      tools: 'Herramientas',
      reports: 'Reportes',
      import: 'Importar',
      billing: 'Facturación',
      'trust-db': 'Red de Seguridad',
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
      <header className="backdrop-blur-xl bg-white/5 border-b border-white/10 sticky top-0 z-40" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
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
        {/* Row 1: Logo left + Site name & icons right */}
        <div className="max-w-2xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center">
            {/* BRIK Brand - Home Button */}
            <Button id="tutorial-logo" variant="ghost" className="p-0 hover:bg-transparent" onClick={goHome}>
              <img src="/brik-logo-white.png" alt="BRIK" className="h-36 w-auto object-contain" />
            </Button>
          </div>

          {/* Right: Site name + all icons in one clean row */}
          <div className="flex items-center gap-1.5">
            {/* Site Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button id="tutorial-site-selector" className="flex items-center gap-1 text-sm font-medium text-white/80 hover:text-white transition-colors cursor-pointer mr-1">
                  {currentSite?.name}
                  <ChevronDown className="w-3.5 h-3.5" />
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

            {/* Notification Bell - visible to all */}
            <NotificationBell />

            {/* Platform Admin Button - only for juanpablovaldc@gmail.com */}
            {isPlatformAdmin && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/brik-control')}
                className="w-9 h-9 rounded-xl transition-all duration-300 hover:bg-purple-500/20 hover:scale-105"
                title="Panel de Control"
              >
                <Crown className="w-5 h-5 text-purple-400" />
              </Button>
            )}

            {/* Admin Button - for supervisors and inspectors */}
            {(isSupervisor || isInspector) && (
              <Button
                id="tutorial-menu-button"
                variant="ghost"
                size="icon"
                onClick={() => setAdminDrawerOpen(true)}
                className="w-9 h-9 rounded-xl transition-all duration-300 hover:bg-white/10 hover:scale-105"
              >
                <Briefcase className="w-6 h-6 text-white/80" />
              </Button>
            )}

            {/* Logout Button - for guards and inspectors (non-supervisors) */}
            {(!isSupervisor || isInspector) && (
              <Button
                variant="ghost"
                size="icon"
                onClick={signOut}
                className="w-9 h-9 rounded-xl transition-all duration-300 hover:bg-white/10 hover:scale-105"
                title="Cerrar sesión"
              >
                <LogOut className="w-5 h-5 text-white/60" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto p-4 animate-fade-in">
        {/* Usage Banner */}
        <UsageBanner className="mb-4" onSubscribeClick={() => setShowSubscribe(true)} />

        {renderContent()}
      </main>

      {/* Suspended Overlay - blocks everything */}
      {subscription.isSuspended && <SuspendedOverlay />}

      {/* Limit Block Modal */}
      {subscription.isOverLimit && showLimitModal && (
        <LimitBlockModal onClose={() => setShowLimitModal(false)} />
      )}

      {/* Bottom Action Bar - NOT for inspectors */}
      {!isInspector && (
        <BottomActionBar
          activeAction={activeAction}
          onActionChange={handleActionChange}
        />
      )}

      {/* Admin Drawer */}
      <AdminDrawer
        open={adminDrawerOpen}
        onOpenChange={setAdminDrawerOpen}
        activePanel={activeAdminPanel}
        onPanelChange={setActiveAdminPanel}
      />

      {/* Action Drawer - NOT for inspectors */}
      {!isInspector && (
        <ActionDrawer
          activeAction={activeAction}
          onOpenChange={handleDrawerOpenChange}
        />
      )}

      {showWelcome && (
        <WelcomeModal
          onComplete={() => {
            localStorage.removeItem('brik_show_welcome');
            setShowWelcome(false);
            // Trigger tutorial after welcome modal closes
            setShowTutorial(true);
          }}
        />
      )}

      {/* Subscribe Modal */}
      <SubscribeModal
        open={showSubscribe}
        onOpenChange={setShowSubscribe}
      />

      {/* Spotlight Tutorial */}
      {showTutorial && activeAdminPanel === 'dashboard' && (
        <SpotlightTutorial onComplete={() => setShowTutorial(false)} />
      )}

      {/* In-App AI Assistant (Pro+ only) */}
      {isProOrAbove && <AssistantChat />}
    </div>
  );
}

