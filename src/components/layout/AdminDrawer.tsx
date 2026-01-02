import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Settings, FileText, Wrench, Upload, History, LayoutDashboard, X, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activePanel: string;
  onPanelChange: (panel: string) => void;
}

const adminOptions = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', description: 'KPIs y resumen' },
  { id: 'people', icon: Users, label: 'Personal', description: 'Gestionar y eliminar' },
  { id: 'settings', icon: Settings, label: 'Configuración', description: 'Ajustes de la obra' },
  { id: 'audit', icon: History, label: 'Auditoría', description: 'Historial de cambios' },
  { id: 'tools', icon: Wrench, label: 'Herramientas', description: 'Correcciones y ajustes' },
  { id: 'reports', icon: FileText, label: 'Reportes', description: 'Descargar informes' },
  { id: 'import', icon: Upload, label: 'Importar', description: 'Cargar datos CSV' },
];

export default function AdminDrawer({ open, onOpenChange, activePanel, onPanelChange }: AdminDrawerProps) {
  const handleSelect = (panelId: string) => {
    onPanelChange(panelId);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl pb-8">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-lg font-semibold">Administración</SheetTitle>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-3">
          {adminOptions.map((option) => {
            const Icon = option.icon;
            const isActive = activePanel === option.id;
            return (
              <button
                key={option.id}
                onClick={() => handleSelect(option.id)}
                className={cn(
                  "flex items-start gap-3 p-4 rounded-2xl border transition-all text-left",
                  isActive
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-card border-border hover:border-primary/50"
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
