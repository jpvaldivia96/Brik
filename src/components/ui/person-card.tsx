import { cn } from '@/lib/utils';
import { PersonType } from '@/lib/types';
import { User, Briefcase, Phone, AlertTriangle } from 'lucide-react';
import { StatusBadge } from './status-badge';

interface PersonCardProps {
  name: string;
  ci: string;
  type: PersonType;
  contractor?: string | null;
  photoUrl?: string | null;
  insuranceExpiry?: string | null;
  phone?: string | null;
  isInside?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function PersonCard({
  name,
  ci,
  type,
  contractor,
  photoUrl,
  insuranceExpiry,
  phone,
  isInside,
  className,
  children,
}: PersonCardProps) {
  const isExpired = insuranceExpiry && new Date(insuranceExpiry) < new Date();
  const isExpiringSoon = insuranceExpiry && !isExpired && 
    new Date(insuranceExpiry) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return (
    <div className={cn('card-cosmos overflow-hidden', className)}>
      <div className="flex gap-4 p-4">
        {/* Photo */}
        <div className="flex-shrink-0">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={name}
              className="w-16 h-16 rounded-xl object-cover bg-muted"
            />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center">
              <User className="w-8 h-8 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="font-medium truncate">{name}</h4>
              <p className="text-sm text-muted-foreground">CI: {ci}</p>
            </div>
            <div className="flex gap-2">
              <StatusBadge status={type === 'worker' ? 'ok' : 'warn'}>
                {type === 'worker' ? 'Trabajador' : 'Visitante'}
              </StatusBadge>
              {typeof isInside === 'boolean' && (
                <StatusBadge status={isInside ? 'inside' : 'outside'} />
              )}
            </div>
          </div>

          {/* Details */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {contractor && (
              <span className="flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5" />
                {contractor}
              </span>
            )}
            {phone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" />
                {phone}
              </span>
            )}
          </div>

          {/* Insurance warning */}
          {type === 'worker' && insuranceExpiry && (isExpired || isExpiringSoon) && (
            <div className={cn(
              'mt-2 flex items-center gap-1.5 text-xs',
              isExpired ? 'text-status-crit' : 'text-status-warn'
            )}>
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>
                Seguro {isExpired ? 'vencido' : 'vence'}: {' '}
                {new Date(insuranceExpiry).toLocaleDateString('es-BO')}
              </span>
            </div>
          )}
        </div>
      </div>

      {children && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}
