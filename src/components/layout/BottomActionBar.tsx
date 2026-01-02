import { LogIn, LogOut, UserPlus, Users, Star, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSite } from '@/contexts/SiteContext';

interface BottomActionBarProps {
  activeAction: string;
  onActionChange: (action: string) => void;
  onAdminClick: () => void;
}

const actions = [
  { id: 'entry', icon: LogIn, label: 'Entrada' },
  { id: 'exit', icon: LogOut, label: 'Salida' },
  { id: 'worker', icon: UserPlus, label: 'Trabajador' },
  { id: 'visitor', icon: Users, label: 'Visitante' },
  { id: 'favorites', icon: Star, label: 'Favoritos' },
];

export default function BottomActionBar({ activeAction, onActionChange }: Omit<BottomActionBarProps, 'onAdminClick'>) {
  return (
    <div className="fixed bottom-0 left-0 right-0 backdrop-blur-xl bg-slate-900/80 border-t border-white/10 z-50 pb-safe">
      <div className="flex items-center justify-around px-2 py-2">
        {actions.map((action) => {
          const Icon = action.icon;
          const isActive = activeAction === action.id;
          return (
            <button
              key={action.id}
              onClick={() => onActionChange(action.id)}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-all min-w-[60px]",
                isActive
                  ? "bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-lg shadow-purple-500/20"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{action.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

