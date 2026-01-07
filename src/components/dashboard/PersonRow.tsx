import { cn } from '@/lib/utils';
import { Shield, GraduationCap, Check, X } from 'lucide-react';

interface PersonRowProps {
    name: string;
    role?: string | null;
    contractor: string | null;
    status: 'on-site' | 'off-site' | 'at-risk' | 'warn' | 'crit';
    checkedIn: string;
    hours?: number;
    totalHoursToday?: number; // Accumulated hours for the day
    photoUrl?: string | null;
    insuranceExpiry?: string | null;
    inductionDate?: string | null;
    className?: string;
    onClick?: () => void;
}

// Compliance status check
function isComplianceValid(date: string | null | undefined): boolean {
    if (!date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(date);
    return expiry >= today;
}

function ComplianceIcons({ insuranceExpiry, inductionDate }: { insuranceExpiry?: string | null; inductionDate?: string | null }) {
    const insuranceOk = isComplianceValid(insuranceExpiry);
    const inductionOk = !!inductionDate; // Just needs to exist

    // Format date for tooltip
    const formatDate = (dateStr: string | null | undefined) => {
        if (!dateStr) return null;
        return new Date(dateStr).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const insuranceTooltip = insuranceExpiry
        ? (insuranceOk ? `Seguro vence: ${formatDate(insuranceExpiry)}` : `Seguro VENCIDO: ${formatDate(insuranceExpiry)}`)
        : 'Sin seguro registrado';

    const inductionTooltip = inductionDate
        ? `Inducción: ${formatDate(inductionDate)}`
        : 'Sin inducción';

    return (
        <div className="flex items-center gap-1">
            <div
                title={insuranceTooltip}
                className={cn(
                    "flex items-center gap-0.5 text-[10px] cursor-help",
                    insuranceOk ? "text-emerald-400" : "text-red-400"
                )}
            >
                <Shield className="w-3 h-3" />
                {insuranceOk ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
            </div>
            <div
                title={inductionTooltip}
                className={cn(
                    "flex items-center gap-0.5 text-[10px] cursor-help",
                    inductionOk ? "text-emerald-400" : "text-red-400"
                )}
            >
                <GraduationCap className="w-3 h-3" />
                {inductionOk ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
            </div>
        </div>
    );
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

export function PersonRow({ name, role, contractor, status, checkedIn, hours, totalHoursToday, photoUrl, insuranceExpiry, inductionDate, className, onClick }: PersonRowProps) {
    const statusConfig = getStatusConfig(status);

    return (
        <div
            onClick={onClick}
            className={cn(
                "flex items-center gap-3 px-4 py-3 hover:bg-card/50 transition-colors border-b border-border/50 last:border-b-0",
                onClick && "cursor-pointer",
                className
            )}
        >
            {/* Avatar */}
            <Avatar name={name} photoUrl={photoUrl} status={status} size="md" />

            {/* Name, role and contractor */}
            <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground truncate">{name}</div>
                <div className="text-xs text-yellow-300 truncate">
                    {role && <span className="text-yellow-300">{role}</span>}
                    {role && contractor && <span className="mx-1 text-white/60">·</span>}
                    <span className="text-white/70">{contractor || (!role && 'Sin contratista')}</span>
                </div>
            </div>

            {/* Compliance Icons */}
            <ComplianceIcons insuranceExpiry={insuranceExpiry} inductionDate={inductionDate} />

            {/* Status badge */}
            <div className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap",
                statusConfig.className
            )}>
                {statusConfig.label}
            </div>

            {/* Check-in time */}
            <div className="text-sm text-white/80 whitespace-nowrap hidden sm:block">
                {checkedIn}
                {hours !== undefined && hours > 0 && (
                    <span className="ml-1 text-xs text-white/60">({hours.toFixed(1)}h)</span>
                )}
                {totalHoursToday !== undefined && totalHoursToday > 0 && Math.abs(totalHoursToday - (hours || 0)) > 0.1 && (
                    <span className="ml-1 text-xs text-cyan-300">(Total: {totalHoursToday.toFixed(1)}h)</span>
                )}
            </div>
        </div>
    );
}

// Mobile card variant
export function PersonCard({ name, role, contractor, status, checkedIn, hours, totalHoursToday, photoUrl, insuranceExpiry, inductionDate, className, onClick }: PersonRowProps) {
    const statusConfig = getStatusConfig(status);

    return (
        <div
            onClick={onClick}
            className={cn(
                "flex items-start gap-3 p-4 bg-card/30 rounded-xl border border-border/50",
                onClick && "cursor-pointer",
                className
            )}
        >
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
                <div className="text-xs text-yellow-300 truncate mt-0.5">
                    {role && <span className="text-yellow-300">{role}</span>}
                    {role && contractor && <span className="mx-1 text-white/60">·</span>}
                    <span className="text-white/70">{contractor || (!role && 'Sin contratista')}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                    <div className="text-xs text-white/70">
                        {checkedIn}
                        {hours !== undefined && hours > 0 && (
                            <span className="ml-1 text-white/50">• {hours.toFixed(1)}h</span>
                        )}
                        {totalHoursToday !== undefined && totalHoursToday > 0 && totalHoursToday !== hours && (
                            <span className="ml-1 text-cyan-300">(Total: {totalHoursToday.toFixed(1)}h)</span>
                        )}
                    </div>
                    <ComplianceIcons insuranceExpiry={insuranceExpiry} inductionDate={inductionDate} />
                </div>
            </div>
        </div>
    );
}
