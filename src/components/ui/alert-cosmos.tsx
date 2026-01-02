import { cn } from '@/lib/utils';
import { CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';

interface AlertCosmosProps {
  type: 'success' | 'warning' | 'error' | 'info';
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const alertConfig = {
  success: {
    icon: CheckCircle,
    className: 'success',
  },
  warning: {
    icon: AlertTriangle,
    className: 'warning',
  },
  error: {
    icon: XCircle,
    className: 'error',
  },
  info: {
    icon: Info,
    className: 'bg-primary/10 border-primary/20 text-primary',
  },
};

export function AlertCosmos({ type, title, children, className }: AlertCosmosProps) {
  const config = alertConfig[type];
  const Icon = config.icon;
  
  return (
    <div className={cn('alert-cosmos', config.className, className)}>
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        {title && <p className="font-medium mb-1">{title}</p>}
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}
