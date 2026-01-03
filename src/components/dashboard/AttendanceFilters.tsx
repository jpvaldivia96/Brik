import { Search, Calendar, Users, AlertTriangle, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface FilterBadge {
    label: string;
    count: number;
    active: boolean;
    variant?: 'default' | 'warn' | 'crit';
    icon?: React.ReactNode;
}

interface AttendanceFiltersProps {
    searchQuery: string;
    onSearchChange: (value: string) => void;
    dateFilter: 'today' | 'week' | 'all';
    onDateFilterChange: (value: 'today' | 'week' | 'all') => void;
    filters: FilterBadge[];
    onFilterClick: (label: string) => void;
}

export function AttendanceFilters({
    searchQuery,
    onSearchChange,
    dateFilter,
    onDateFilterChange,
    filters,
    onFilterClick,
}: AttendanceFiltersProps) {
    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            {/* Search and Date */}
            <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Buscar..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-9 h-9 bg-card/50 border-border"
                    />
                </div>

                <div className="relative">
                    <select
                        value={dateFilter}
                        onChange={(e) => onDateFilterChange(e.target.value as 'today' | 'week' | 'all')}
                        className="h-9 px-3 pr-8 rounded-lg bg-card/50 border border-border text-sm text-foreground appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                        <option value="today">Hoy</option>
                        <option value="week">Esta semana</option>
                        <option value="all">Todo</option>
                    </select>
                    <Calendar className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
            </div>

            {/* Filter Badges */}
            <div className="flex items-center gap-2 flex-wrap">
                {filters.map((filter) => (
                    <button
                        key={filter.label}
                        onClick={() => onFilterClick(filter.label)}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                            filter.active
                                ? filter.variant === 'crit'
                                    ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/50"
                                    : filter.variant === 'warn'
                                        ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/50"
                                        : "bg-primary/20 text-primary ring-1 ring-primary/50"
                                : "bg-card/50 text-muted-foreground hover:bg-card hover:text-foreground"
                        )}
                    >
                        {filter.icon}
                        <span>{filter.label}</span>
                        <span className={cn(
                            "ml-1 px-1.5 py-0.5 rounded-full text-[10px]",
                            filter.active
                                ? "bg-white/20"
                                : "bg-muted"
                        )}>
                            {filter.count}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}
