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
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 h-24 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* BRIK Brand - Home Button */}
            <Button variant="ghost" className="gap-2 px-0 hover:bg-transparent" onClick={goHome}>
              <img src="/brik-logo.png" alt="BRIK" className="h-20 w-auto object-contain rounded-lg" />
            </Button>

            <div className="h-6 w-px bg-border/50" />

            {/* Site Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2 text-muted-foreground hover:text-foreground">
                  <span className="text-sm font-medium loading-none max-w-[150px] truncate">
                    {currentSite?.name}
                  </span>
                  <ChevronDown className="w-4 h-4 ml-1 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={handleChangeSite}>
                  <Building2 className="w-4 h-4 mr-2" />
                  Cambiar obra
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="text-destructive">
                  <LogOut className="w-4 h-4 mr-2" />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-2">
            <h1 className="text-sm font-medium text-muted-foreground hidden sm:block">{getTitle()}</h1>
            {isSupervisor && (
              <Button variant="ghost" size="icon" onClick={() => setAdminDrawerOpen(true)}>
                <Settings className="w-5 h-5 text-muted-foreground" />
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
