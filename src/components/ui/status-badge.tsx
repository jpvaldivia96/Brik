import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: 'ok' | 'warn' | 'crit' | 'inside' | 'outside' | 'expired' | 'expiring';
  children?: React.ReactNode;
  className?: string;
}

const statusConfig = {
  ok: {
    label: 'OK',
    className: 'badge-ok',
  },
  warn: {
    label: 'WARN',
    className: 'badge-warn',
  },
  crit: {
    label: 'CRIT',
    className: 'badge-crit',
  },
  inside: {
    label: 'Dentro',
    className: 'badge-ok',
  },
  outside: {
    label: 'Fuera',
    className: 'badge-neutral',
  },
  expired: {
    label: 'Vencido',
    className: 'badge-crit',
  },
  expiring: {
    label: 'Por vencer',
    className: 'badge-warn',
  },
};

export function StatusBadge({ status, children, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  
  return (
    <span className={cn('badge-status', config.className, className)}>
      {children || config.label}
    </span>
  );
}
