import { cn } from '@/lib/utils';

interface KPICardProps {
  value: number | string;
  label: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
  variant?: 'default' | 'warn' | 'crit';
}

export function KPICard({ value, label, icon, trend, className, variant = 'default' }: KPICardProps) {
  return (
    <div
      className={cn(
        'kpi-card transition-all hover:shadow-md',
        variant === 'warn' && 'border-status-warn-border bg-status-warn-bg/30',
        variant === 'crit' && 'border-status-crit-border bg-status-crit-bg/30',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p
            className={cn(
              'kpi-value',
              variant === 'warn' && 'text-status-warn',
              variant === 'crit' && 'text-status-crit'
            )}
          >
            {value}
          </p>
          <p className="kpi-label">{label}</p>
        </div>
        {icon && (
          <div className="text-muted-foreground/60">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
