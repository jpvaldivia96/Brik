import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Settings, FileText, History, LayoutDashboard, X, Users, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { VERSION } from '@/lib/version';

interface AdminDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activePanel: string;
  onPanelChange: (panel: string) => void;
}

const adminOptions = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', description: 'KPIs y resumen', supervisorOnly: false },
  { id: 'people', icon: Users, label: 'Personal', description: 'Gestionar y eliminar', supervisorOnly: false },
  { id: 'inspection', icon: ClipboardCheck, label: 'Control de Obra', description: 'Notas de fiscalización', supervisorOnly: true, allowInspector: true },
  { id: 'reports', icon: FileText, label: 'Reportes', description: 'Descargar informes', supervisorOnly: true, allowInspector: true },
  { id: 'audit', icon: History, label: 'Auditoría y Control', description: 'Historial y correcciones', supervisorOnly: true },
  { id: 'settings', icon: Settings, label: 'Configuración', description: 'Usuarios, alertas y más', supervisorOnly: true },
];

export default function AdminDrawer({ open, onOpenChange, activePanel, onPanelChange }: AdminDrawerProps) {
  const { isSupervisor, isInspector, currentSite, currentRole } = useSite();
  const [userRole, setUserRole] = useState<string>('');
  const [showBuild, setShowBuild] = useState(false);

  const handleSelect = (panelId: string) => {
    onPanelChange(panelId);
    onOpenChange(false);
  };

  // Fetch user role
  React.useEffect(() => {
    const fetchUserRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && currentSite) {
        const { data: membership } = await supabase
          .from('site_memberships')
          .select('role')
          .eq('site_id', currentSite.id)
          .eq('user_id', user.id)
          .single();

        if (membership) {
          setUserRole(membership.role);
        }
      }
    };
    fetchUserRole();
  }, [currentSite]);

  // Filter options based on role
  const visibleOptions = adminOptions.filter(option => {
    // If option allows inspector and user is inspector, show it
    if (option.allowInspector && isInspector) {
      return true;
    }

    // Supervisor-only options require supervisor role
    if (option.supervisorOnly) {
      return isSupervisor;
    }

    // Non-supervisor-only options are visible to all
    return true;
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl pb-8">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-lg font-semibold">Administración</SheetTitle>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-3">
          {visibleOptions.map((option) => {
            const Icon = option.icon;
            const isActive = activePanel === option.id;
            return (
              <button
                key={option.id}
                onClick={() => handleSelect(option.id)}
                className={cn(
                  "flex items-start gap-3 p-4 rounded-2xl border transition-all duration-200 text-left",
                  isActive
                    ? "bg-primary/10 border-primary text-primary scale-[1.02] shadow-lg shadow-primary/20"
                    : "bg-card border-border hover:border-primary/50 hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/10 active:scale-95"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                  isActive ? "bg-primary text-primary-foreground" : "bg-muted"
                )}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">{option.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{option.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Version Badge */}
        <div className="mt-5 flex justify-center">
          <button
            onClick={() => setShowBuild(!showBuild)}
            className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-white/5 hover:border-purple-500/20 transition-all duration-300"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[11px] font-medium text-muted-foreground/70 tracking-wide">
              BRIK v{VERSION.display}
            </span>
            {showBuild && (
              <span className="text-[10px] text-muted-foreground/40 font-mono">
                build {VERSION.build}
              </span>
            )}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
