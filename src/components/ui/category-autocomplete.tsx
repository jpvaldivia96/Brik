import { useState, useEffect } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Plus, X, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useSite } from '@/contexts/SiteContext';

export interface CategoryDefinition {
    id: string;
    category_name: string;
    color: string;
}

interface CategoryAutocompleteProps {
    contractorName: string;
    selectedCategories: CategoryDefinition[];
    onChange: (categories: CategoryDefinition[]) => void;
    disabled?: boolean;
    className?: string;
}

const CATEGORY_COLORS = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#9333ea', // purple
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#8b5cf6', // violet
];

export function CategoryAutocomplete({
    contractorName,
    selectedCategories,
    onChange,
    disabled = false,
    className
}: CategoryAutocompleteProps) {
    const { currentSite } = useSite();
    const [open, setOpen] = useState(false);
    const [availableCategories, setAvailableCategories] = useState<CategoryDefinition[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);

    // Load categories for this contractor
    useEffect(() => {
        const loadCategories = async () => {
            if (!currentSite || !contractorName) {
                setAvailableCategories([]);
                return;
            }
            setLoading(true);

            const { data, error } = await (supabase as any)
                .from('contractor_categories')
                .select('id, category_name, color')
                .eq('site_id', currentSite.id)
                .ilike('contractor_name', contractorName.trim())
                .order('sort_order', { ascending: true });

            if (data && !error) {
                setAvailableCategories(data as CategoryDefinition[]);
            }
            setLoading(false);
        };

        if (open || contractorName) {
            loadCategories();
        }
    }, [currentSite, contractorName, open]);

    // Filter based on search
    const filteredCategories = availableCategories.filter(cat =>
        cat.category_name.toLowerCase().includes(search.toLowerCase()) &&
        !selectedCategories.some(sc => sc.id === cat.id)
    );

    const exactMatch = availableCategories.some(c =>
        c.category_name.toLowerCase() === search.toLowerCase()
    );

    const handleSelect = (cat: CategoryDefinition) => {
        if (!selectedCategories.some(sc => sc.id === cat.id)) {
            onChange([...selectedCategories, cat]);
        }
        setSearch('');
    };

    const handleCreateNew = async () => {
        if (!currentSite || !search.trim() || !contractorName) return;

        const randomColor = CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)];

        const { data, error } = await (supabase as any)
            .from('contractor_categories')
            .insert({
                site_id: currentSite.id,
                contractor_name: contractorName.trim().toUpperCase(),
                category_name: search.trim(),
                color: randomColor,
                sort_order: availableCategories.length,
            })
            .select('id, category_name, color')
            .single();

        if (data && !error) {
            const newCat = data as CategoryDefinition;
            onChange([...selectedCategories, newCat]);
            setAvailableCategories([...availableCategories, newCat]);
            setSearch('');
        }
    };

    const handleRemove = (catId: string) => {
        onChange(selectedCategories.filter(c => c.id !== catId));
    };

    if (!contractorName) return null;

    return (
        <div className={cn("space-y-2", className)}>
            {/* Selected categories as badges */}
            {selectedCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {selectedCategories.map(cat => (
                        <span
                            key={cat.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                            style={{ backgroundColor: cat.color }}
                        >
                            {cat.category_name}
                            {!disabled && (
                                <button
                                    type="button"
                                    onClick={() => handleRemove(cat.id)}
                                    className="hover:bg-white/20 rounded-full p-0.5"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </span>
                    ))}
                </div>
            )}

            {/* Autocomplete combobox */}
            {!disabled && (
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            type="button"
                            aria-expanded={open}
                            className="w-full justify-between h-9 px-3 text-sm"
                            disabled={disabled}
                        >
                            <span className="flex items-center gap-2 text-muted-foreground">
                                <Layers className="w-4 h-4" />
                                Agregar categoría de trabajo...
                            </span>
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0" align="start">
                        <Command>
                            <CommandInput
                                placeholder="Buscar o crear categoría..."
                                value={search}
                                onValueChange={setSearch}
                            />
                            <CommandList className="max-h-[200px] overflow-y-auto">
                                <CommandEmpty className="py-2 px-2">
                                    {search && !exactMatch ? (
                                        <button
                                            className="flex items-center gap-2 w-full p-2 rounded hover:bg-accent text-left text-sm"
                                            onClick={handleCreateNew}
                                        >
                                            <Plus className="w-4 h-4 text-green-500" />
                                            <span>Crear "{search}"</span>
                                        </button>
                                    ) : (
                                        <span className="text-sm text-muted-foreground">
                                            {loading ? 'Cargando...' : 'No encontrado'}
                                        </span>
                                    )}
                                </CommandEmpty>
                                <CommandGroup>
                                    {filteredCategories.map((cat) => (
                                        <CommandItem
                                            key={cat.id}
                                            value={cat.category_name}
                                            onSelect={() => handleSelect(cat)}
                                            className="cursor-pointer"
                                        >
                                            <span
                                                className="w-3 h-3 rounded-full mr-2 flex-shrink-0"
                                                style={{ backgroundColor: cat.color }}
                                            />
                                            {cat.category_name}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
}

// Badge for displaying a category in lists/dashboard
export function CategoryBadge({ name, color }: { name: string; color: string }) {
    return (
        <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
            style={{ backgroundColor: color }}
        >
            {name}
        </span>
    );
}
