import { cn } from '@/lib/utils';

interface PersonRowProps {
    name: string;
    contractor: string | null;
    status: 'on-site' | 'off-site' | 'at-risk' | 'warn' | 'crit';
    checkedIn: string;
    hours?: number;
    photoUrl?: string | null;
    className?: string;
}

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

function getStatusConfig(status: PersonRowProps['status']) {
    switch (status) {
        case 'on-site':
            return { label: 'On site', className: 'bg-emerald-500/20 text-emerald-400' };
        case 'off-site':
            return { label: 'Off site', className: 'bg-slate-500/20 text-slate-400' };
        case 'at-risk':
        case 'warn':
            return { label: 'At-risk', className: 'bg-amber-500/20 text-amber-400' };
        case 'crit':
            return { label: 'Alert', className: 'bg-red-500/20 text-red-400' };
        default:
            return { label: 'Unknown', className: 'bg-slate-500/20 text-slate-400' };
    }
}

function Avatar({
    name,
    photoUrl,
    status,
    size = 'md'
}: {
    name: string;
    photoUrl?: string | null;
    status: PersonRowProps['status'];
    size?: 'sm' | 'md' | 'lg';
}) {
    const initials = getInitials(name);
    const sizeClasses = {
        sm: 'w-8 h-8 text-xs',
        md: 'w-10 h-10 text-sm',
        lg: 'w-11 h-11 text-sm'
    };

    const bgClass = status === 'crit'
        ? "bg-red-500/20 text-red-400"
        : status === 'warn' || status === 'at-risk'
            ? "bg-amber-500/20 text-amber-400"
            : "bg-primary/20 text-primary";

    if (photoUrl) {
        return (
            <img
                src={photoUrl}
                alt={name}
                className={cn(
                    "rounded-full object-cover flex-shrink-0",
                    sizeClasses[size],
                    status === 'crit' && "ring-2 ring-red-500/50",
                    status === 'warn' || status === 'at-risk' && "ring-2 ring-amber-500/50"
                )}
            />
        );
    }

    return (
        <div className={cn(
            "flex-shrink-0 rounded-full flex items-center justify-center font-semibold",
            sizeClasses[size],
            bgClass
        )}>
            {initials}
        </div>
    );
}

export function PersonRow({ name, contractor, status, checkedIn, hours, photoUrl, className }: PersonRowProps) {
    const statusConfig = getStatusConfig(status);

    return (
        <div className={cn(
            "flex items-center gap-3 px-4 py-3 hover:bg-card/50 transition-colors border-b border-border/50 last:border-b-0",
            className
        )}>
            {/* Avatar */}
            <Avatar name={name} photoUrl={photoUrl} status={status} size="md" />

            {/* Name and contractor */}
            <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground truncate">{name}</div>
                <div className="text-sm text-muted-foreground truncate">
                    {contractor || 'Sin contratista'}
                </div>
            </div>

            {/* Status badge */}
            <div className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap",
                statusConfig.className
            )}>
                {statusConfig.label}
            </div>

            {/* Check-in time */}
            <div className="text-sm text-muted-foreground whitespace-nowrap hidden sm:block">
                {checkedIn}
                {hours !== undefined && hours > 0 && (
                    <span className="ml-1 text-xs">({hours.toFixed(1)}h)</span>
                )}
            </div>
        </div>
    );
}

// Mobile card variant
export function PersonCard({ name, contractor, status, checkedIn, hours, photoUrl, className }: PersonRowProps) {
    const statusConfig = getStatusConfig(status);

    return (
        <div className={cn(
            "flex items-start gap-3 p-4 bg-card/30 rounded-xl border border-border/50",
            className
        )}>
            {/* Avatar */}
            <Avatar name={name} photoUrl={photoUrl} status={status} size="lg" />

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-foreground truncate">{name}</div>
                    <div className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap flex-shrink-0",
                        statusConfig.className
                    )}>
                        {statusConfig.label}
                    </div>
                </div>
                <div className="text-sm text-muted-foreground truncate mt-0.5">
                    {contractor || 'Sin contratista'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                    {checkedIn}
                    {hours !== undefined && hours > 0 && (
                        <span className="ml-1">• {hours.toFixed(1)}h</span>
                    )}
                </div>
            </div>
        </div>
    );
}
