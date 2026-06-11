import { Search, Calendar, Users, AlertTriangle, Clock, X, ChevronLeft, ChevronRight } from 'lucide-react';
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
    selectedDate: string; // ISO date string YYYY-MM-DD
    onDateChange: (date: string) => void;
    filters: FilterBadge[];
    onFilterClick: (label: string) => void;
}

export function AttendanceFilters({
    searchQuery,
    onSearchChange,
    selectedDate,
    onDateChange,
    filters,
    onFilterClick,
}: AttendanceFiltersProps) {
    // Use local date instead of UTC
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const isToday = selectedDate === today;

    const goDay = (offset: number) => {
        const current = new Date(selectedDate + 'T12:00:00');
        current.setDate(current.getDate() + offset);
        const newDate = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
        if (newDate <= today) {
            onDateChange(newDate);
        }
    };

    return (
        <div className="space-y-3 mb-4">
            {/* Row 1: Search and Date with arrows */}
            <div className="flex items-center gap-2">
                <div id="tutorial-search" className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Buscar..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-9 h-10 bg-card/50 border-border"
                    />
                </div>

                {/* Date Navigation: ← date → */}
                <div id="tutorial-calendar" className="flex items-center gap-1">
                    <button
                        onClick={() => goDay(-1)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <input
                        type="date"
                        value={selectedDate}
                        max={today}
                        onChange={(e) => onDateChange(e.target.value)}
                        className="h-10 px-3 rounded-lg bg-card/50 border border-border text-sm text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <button
                        onClick={() => goDay(1)}
                        disabled={isToday}
                        className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                            isToday
                                ? "text-white/20 cursor-not-allowed"
                                : "text-white/60 hover:text-white hover:bg-white/10"
                        )}
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                    {!isToday && (
                        <button
                            onClick={() => onDateChange(today)}
                            className="px-3 py-2 text-xs bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-500 transition-colors"
                        >
                            Hoy
                        </button>
                    )}
                </div>
            </div>

            {/* Row 2: Filter Badges */}
            <div className="flex items-center gap-2">
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
