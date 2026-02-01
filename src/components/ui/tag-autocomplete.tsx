import { useState, useEffect } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown, Plus, X, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useSite } from '@/contexts/SiteContext';

interface TagDefinition {
    id: string;
    name: string;
    color: string;
}

interface TagAutocompleteProps {
    selectedTags: TagDefinition[];
    onChange: (tags: TagDefinition[]) => void;
    disabled?: boolean;
    className?: string;
}

// Colores predefinidos para etiquetas
const TAG_COLORS = [
    '#9333ea', // purple
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#8b5cf6', // violet
];

export function TagAutocomplete({
    selectedTags,
    onChange,
    disabled = false,
    className
}: TagAutocompleteProps) {
    const { currentSite } = useSite();
    const [open, setOpen] = useState(false);
    const [availableTags, setAvailableTags] = useState<TagDefinition[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);

    // Load available tags for this site
    useEffect(() => {
        const loadTags = async () => {
            if (!currentSite) return;
            setLoading(true);

            // NOTE: Using 'as any' because worker_tags tables are new and not in generated types yet
            // Run 'npx supabase gen types typescript' after migration to remove this
            const { data, error } = await (supabase as any)
                .from('worker_tags_definitions')
                .select('id, name, color')
                .eq('site_id', currentSite.id)
                .order('name');

            if (data && !error) {
                setAvailableTags(data as TagDefinition[]);
            }
            setLoading(false);
        };

        if (open) {
            loadTags();
        }
    }, [currentSite, open]);

    // Filter tags based on search
    const filteredTags = availableTags.filter(tag =>
        tag.name.toLowerCase().includes(search.toLowerCase()) &&
        !selectedTags.some(st => st.id === tag.id)
    );

    // Check if search matches existing tag
    const exactMatch = availableTags.some(t => t.name.toLowerCase() === search.toLowerCase());

    // Handle selecting an existing tag
    const handleSelect = (tag: TagDefinition) => {
        if (!selectedTags.some(st => st.id === tag.id)) {
            onChange([...selectedTags, tag]);
        }
        setSearch('');
    };

    // Handle creating a new tag
    const handleCreateNew = async () => {
        if (!currentSite || !search.trim()) return;

        const randomColor = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];

        // NOTE: Using 'as any' because worker_tags tables are new and not in generated types yet
        const { data, error } = await (supabase as any)
            .from('worker_tags_definitions')
            .insert({
                site_id: currentSite.id,
                name: search.trim(),
                color: randomColor
            })
            .select('id, name, color')
            .single();

        if (data && !error) {
            const newTag = data as TagDefinition;
            onChange([...selectedTags, newTag]);
            setAvailableTags([...availableTags, newTag]);
            setSearch('');
        }
    };

    // Handle removing a tag
    const handleRemove = (tagId: string) => {
        onChange(selectedTags.filter(t => t.id !== tagId));
    };

    return (
        <div className={cn("space-y-2", className)}>
            {/* Selected tags as badges */}
            {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {selectedTags.map(tag => (
                        <span
                            key={tag.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                            style={{ backgroundColor: tag.color }}
                        >
                            {tag.name}
                            {!disabled && (
                                <button
                                    onClick={() => handleRemove(tag.id)}
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
                            aria-expanded={open}
                            className="w-full justify-between h-9 px-3 text-sm"
                            disabled={disabled}
                        >
                            <span className="flex items-center gap-2 text-muted-foreground">
                                <Tag className="w-4 h-4" />
                                Agregar etiqueta...
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[250px] p-0" align="start">
                        <Command>
                            <CommandInput
                                placeholder="Buscar o crear etiqueta..."
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
                                        <span className="text-sm text-muted-foreground">No encontrado</span>
                                    )}
                                </CommandEmpty>
                                <CommandGroup>
                                    {filteredTags.map((tag) => (
                                        <CommandItem
                                            key={tag.id}
                                            value={tag.name}
                                            onSelect={() => handleSelect(tag)}
                                            className="cursor-pointer"
                                        >
                                            <span
                                                className="w-3 h-3 rounded-full mr-2"
                                                style={{ backgroundColor: tag.color }}
                                            />
                                            {tag.name}
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

// Simple badge component for displaying tags in lists
export function TagBadge({ name, color }: { name: string; color: string }) {
    return (
        <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
            style={{ backgroundColor: color }}
        >
            {name}
        </span>
    );
}
