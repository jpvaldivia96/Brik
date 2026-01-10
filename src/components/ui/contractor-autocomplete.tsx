import { useState, useEffect, useMemo } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useSite } from '@/contexts/SiteContext';

interface ContractorAutocompleteProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string; // Add className prop for better styling control
}

export function ContractorAutocomplete({
    value,
    onChange,
    placeholder = "Seleccionar contratista",
    disabled = false,
    className
}: ContractorAutocompleteProps) {
    const { currentSite } = useSite();
    const [open, setOpen] = useState(false);
    const [contractors, setContractors] = useState<string[]>([]);
    const [search, setSearch] = useState('');

    // Load contractors
    useEffect(() => {
        const loadContractors = async () => {
            if (!currentSite) return;

            const { data } = await supabase
                .from('people')
                .select('contractor')
                .eq('site_id', currentSite.id)
                .not('contractor', 'is', null);

            if (data) {
                const unique = Array.from(new Set(data.map(p => p.contractor?.toUpperCase()).filter(Boolean) as string[])).sort();
                setContractors(unique);
            }
        };

        if (open) {
            loadContractors();
        }
    }, [currentSite, open]);

    // Handle setting value (always uppercase)
    const handleSelect = (val: string) => {
        const upper = val.toUpperCase();
        onChange(upper);
        setOpen(false);
        setSearch('');
    };

    const displayValue = value ? value.toUpperCase() : "Seleccionar contratista";

    // Check if search term exists exactly (case insensitive)
    const exactMatch = contractors.some(c => c === search.toUpperCase());

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between h-10 px-3 border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground", className)}
                    disabled={disabled}
                >
                    {value ? value.toUpperCase() : <span className="text-muted-foreground">{placeholder}</span>}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
                <Command>
                    <CommandInput
                        placeholder="Buscar o crear contratista..."
                        value={search}
                        onValueChange={setSearch}
                    />
                    <CommandList className="max-h-[200px] overflow-y-auto">
                        <CommandEmpty className="py-2 px-2 text-sm text-muted-foreground text-center">
                            {search ? (
                                <button
                                    className="flex items-center gap-2 w-full p-2 rounded hover:bg-accent text-left"
                                    onClick={() => handleSelect(search)}
                                >
                                    <UserPlus className="w-4 h-4 text-green-500" />
                                    <span>Crear "{search.toUpperCase()}"</span>
                                </button>
                            ) : (
                                "No encontrado."
                            )}
                        </CommandEmpty>
                        <CommandGroup>
                            {contractors.map((contractor) => (
                                <CommandItem
                                    key={contractor}
                                    value={contractor}
                                    onSelect={(currentValue) => handleSelect(currentValue)}
                                    className="cursor-pointer"
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4 text-green-500",
                                            value?.toUpperCase() === contractor ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {contractor}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
