import { useState } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Building2, LogOut, ChevronDown, Settings } from 'lucide-react';
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

export default function MainLayout() {
  const { currentSite, selectSite, isSupervisor } = useSite();
  const { signOut } = useAuth();
  const [activeAction, setActiveAction] = useState('');
  const [activeAdminPanel, setActiveAdminPanel] = useState('dashboard');
  const [adminDrawerOpen, setAdminDrawerOpen] = useState(false);

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
        <div className="max-w-2xl mx-auto px-4 h-24 flex items-center justify-between">
          <div className="flex items-center">
            {/* BRIK Brand - Home Button */}
            <Button variant="ghost" className="p-0 hover:bg-transparent" onClick={goHome}>
              <img src="/brik-logo-white.png" alt="BRIK" className="h-16 w-auto object-contain" />
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-white/60">{currentSite?.name}</span>
            {isSupervisor && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setAdminDrawerOpen(true)}
                className="hover:bg-white/10"
              >
                <Settings className="w-5 h-5 text-white/70" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto p-4 animate-fade-in">
        {renderContent()}
      </main>

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

