```
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Settings, FileText, Wrench, Upload, History, LayoutDashboard, X, Users, UserCog, Bell, BarChart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSite } from '@/contexts/SiteContext';

interface AdminDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activePanel: string;
  onPanelChange: (panel: string) => void;
}

const adminOptions = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', description: 'KPIs y resumen', supervisorOnly: false },
  { id: 'people', icon: Users, label: 'Personal', description: 'Gestionar y eliminar', supervisorOnly: false },
  { id: 'users', icon: UserCog, label: 'Usuarios', description: 'Gestionar accesos', supervisorOnly: true },
  { id: 'alerts', icon: Bell, label: 'Mis Alertas', description: 'Preferencias personales', supervisorOnly: false },
  { id: 'stats', icon: BarChart, label: 'Estadísticas', description: 'Análisis y reportes', supervisorOnly: true },
  { id: 'settings', icon: Settings, label: 'Configuración', description: 'Ajustes de la obra', supervisorOnly: true },
  { id: 'audit', icon: History, label: 'Auditoría', description: 'Historial de cambios', supervisorOnly: true },
  { id: 'tools', icon: Wrench, label: 'Herramientas', description: 'Correcciones y ajustes', supervisorOnly: true },
  { id: 'reports', icon: FileText, label: 'Reportes', description: 'Descargar informes', supervisorOnly: true },
  { id: 'import', icon: Upload, label: 'Importar', description: 'Cargar datos CSV', supervisorOnly: true },
];

export default function AdminDrawer({ open, onOpenChange, activePanel, onPanelChange }: AdminDrawerProps) {
  const { isSupervisor } = useSite();

  const handleSelect = (panelId: string) => {
    onPanelChange(panelId);
    onOpenChange(false);
  };

  // Filter options based on role
  const visibleOptions = adminOptions.filter(option =>
    !option.supervisorOnly || isSupervisor
  );

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
      </SheetContent>
    </Sheet>
  );
}
