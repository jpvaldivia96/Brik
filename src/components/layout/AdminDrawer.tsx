import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Settings, FileText, History, LayoutDashboard, X, Users, ClipboardCheck, Bell, Upload, Building2, CreditCard } from 'lucide-react';
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
  { id: 'people', icon: Users, label: 'Personal', description: 'Gestionar trabajadores', supervisorOnly: false },
  { id: 'inspection', icon: ClipboardCheck, label: 'Control de Obra', description: 'Notas de fiscalización', supervisorOnly: true, allowInspector: true },
  { id: 'reports', icon: FileText, label: 'Reportes', description: 'Descargar informes', supervisorOnly: true, allowInspector: true },
  { id: 'alerts', icon: Bell, label: 'Alertas', description: 'Notificaciones y umbrales', supervisorOnly: true },
  { id: 'users', icon: Settings, label: 'Usuarios', description: 'Gestionar equipo', supervisorOnly: true },
  { id: 'import', icon: Upload, label: 'Importar', description: 'Carga masiva', supervisorOnly: true },
  { id: 'audit', icon: History, label: 'Auditoría', description: 'Historial de cambios', supervisorOnly: true },
  { id: 'site-settings', icon: Building2, label: 'Obra', description: 'Config. y cuenta', supervisorOnly: true },
  { id: 'billing', icon: CreditCard, label: 'Facturación', description: 'Plan y pagos', supervisorOnly: true },
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
      <SheetContent
        side="bottom"
        className="pb-8 border-0"
        style={{
          borderRadius: '28px 28px 0 0',
          background: 'rgba(30, 30, 40, 0.55)',
          backdropFilter: 'blur(40px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.4)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderBottom: 'none',
          boxShadow: '0 -4px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <SheetHeader className="pb-4">
          <SheetTitle style={{ fontSize: '16px', fontWeight: 600, color: 'white' }}>Administración</SheetTitle>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-2.5">
          {visibleOptions.map((option) => {
            const Icon = option.icon;
            const isActive = activePanel === option.id;
            return (
              <button
                key={option.id}
                onClick={() => handleSelect(option.id)}
                className="flex items-start gap-3 p-4 transition-all duration-200 text-left active:scale-95"
                style={{
                  borderRadius: '16px',
                  background: isActive ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
                  border: isActive ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: isActive ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.06)',
                    border: isActive ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <Icon className="w-5 h-5" style={{ color: isActive ? '#c4b5fd' : 'rgba(255,255,255,0.5)', strokeWidth: 1.5 }} />
                </div>
                <div className="min-w-0">
                  <p style={{ fontSize: '13px', fontWeight: 500, color: isActive ? 'white' : 'rgba(255,255,255,0.8)' }}>{option.label}</p>
                  <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }} className="truncate">{option.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Version Badge */}
        <div className="mt-5 flex justify-center">
          <button
            onClick={() => setShowBuild(!showBuild)}
            className="flex items-center gap-1.5 px-3 py-1.5 transition-all duration-300"
            style={{
              borderRadius: '999px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>
              BRIK v{VERSION.display}
            </span>
            {showBuild && (
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>
                build {VERSION.build}
              </span>
            )}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
