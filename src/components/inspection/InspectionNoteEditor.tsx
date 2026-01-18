import { useEffect, useState } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, List, ListOrdered, Heading2, Heading3, X, Search, Users, HardHat } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Worker {
    id: string;
    full_name: string;
    ci: string;
    contractor: string | null;
}

interface InspectionNoteEditorProps {
    note?: {
        id: string;
        content: string;
        date: string;
        workers?: Worker[];
    } | null;
    onClose: () => void;
    onSave: () => void;
}

export default function InspectionNoteEditor({ note, onClose, onSave }: InspectionNoteEditorProps) {
    const { currentSite } = useSite();
    const [saving, setSaving] = useState(false);
    const [charCount, setCharCount] = useState(0);
    const MAX_CHARS = 10000;

    // Worker selection state
    const [workersInside, setWorkersInside] = useState<Worker[]>([]);
    const [selectedWorkers, setSelectedWorkers] = useState<Worker[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loadingWorkers, setLoadingWorkers] = useState(true);

    const editor = useEditor({
        extensions: [
            StarterKit,
            Placeholder.configure({
                placeholder: 'Describe los trabajos realizados, observaciones, falencias detectadas...',
            }),
        ],
        content: note?.content || '',
        onUpdate: ({ editor }) => {
            const text = editor.getText();
            setCharCount(text.length);
        },
        editorProps: {
            attributes: {
                class: 'prose prose-sm max-w-none focus:outline-none min-h-[300px] p-4',
            },
        },
    });

    // Load workers who are INSIDE the site (have open entry)
    useEffect(() => {
        if (currentSite) {
            loadWorkersInside();
        }
    }, [currentSite]);

    // Load existing note content and workers
    useEffect(() => {
        if (editor && note?.content) {
            editor.commands.setContent(note.content);
            setCharCount(editor.getText().length);
        }
        if (note?.workers) {
            setSelectedWorkers(note.workers);
        }
    }, [editor, note]);

    const loadWorkersInside = async () => {
        setLoadingWorkers(true);
        try {
            // Get all open access logs (workers currently inside)
            const { data: logs, error } = await supabase
                .from('access_logs')
                .select('person_id, people!inner(id, full_name, ci, contractor, type)')
                .eq('site_id', currentSite?.id)
                .is('exit_at', null)
                .is('voided_at', null);

            if (error) throw error;

            // Filter only workers (not visitors)
            const workers: Worker[] = (logs || [])
                .filter((log: any) => log.people?.type === 'worker')
                .map((log: any) => ({
                    id: log.people.id,
                    full_name: log.people.full_name,
                    ci: log.people.ci,
                    contractor: log.people.contractor,
                }));

            // Remove duplicates
            const uniqueWorkers = workers.filter((worker, index, self) =>
                index === self.findIndex(w => w.id === worker.id)
            );

            setWorkersInside(uniqueWorkers);
        } catch (error) {
            console.error('Error loading workers inside:', error);
        } finally {
            setLoadingWorkers(false);
        }
    };

    const toggleWorker = (worker: Worker) => {
        setSelectedWorkers(prev => {
            const isSelected = prev.some(w => w.id === worker.id);
            if (isSelected) {
                return prev.filter(w => w.id !== worker.id);
            } else {
                return [...prev, worker];
            }
        });
    };

    const removeWorker = (workerId: string) => {
        setSelectedWorkers(prev => prev.filter(w => w.id !== workerId));
    };

    // Filter workers by search query
    const filteredWorkers = workersInside.filter(w =>
        w.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.ci.includes(searchQuery) ||
        (w.contractor && w.contractor.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const handleSave = async () => {
        if (!editor) return;

        const content = editor.getHTML();
        const textContent = editor.getText();

        if (textContent.trim().length === 0) {
            toast.error('La nota no puede estar vacía');
            return;
        }

        if (textContent.length > MAX_CHARS) {
            toast.error(`La nota excede el límite de ${MAX_CHARS} caracteres`);
            return;
        }

        if (selectedWorkers.length === 0) {
            toast.error('Debes seleccionar al menos un trabajador');
            return;
        }

        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('No user found');

            let noteId = note?.id;

            if (note?.id) {
                // Update existing note
                const { error } = await (supabase as any)
                    .from('inspection_notes')
                    .update({
                        content,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', note.id);

                if (error) throw error;

                // Delete old worker links
                await (supabase as any)
                    .from('inspection_note_workers')
                    .delete()
                    .eq('note_id', note.id);

            } else {
                // Create new note
                const { data: newNote, error } = await (supabase as any)
                    .from('inspection_notes')
                    .insert({
                        site_id: currentSite?.id,
                        inspector_user_id: user.id,
                        content,
                        date: new Date().toISOString().split('T')[0],
                    })
                    .select('id')
                    .single();

                if (error) throw error;
                noteId = newNote.id;
            }

            // Insert worker links
            if (noteId && selectedWorkers.length > 0) {
                const workerLinks = selectedWorkers.map(w => ({
                    note_id: noteId,
                    person_id: w.id,
                }));

                const { error: linkError } = await (supabase as any)
                    .from('inspection_note_workers')
                    .insert(workerLinks);

                if (linkError) throw linkError;
            }

            toast.success(note?.id ? 'Nota actualizada correctamente' : 'Nota creada correctamente');
            onSave();
        } catch (error: any) {
            console.error('Error saving note:', error);
            toast.error(error.message || 'Error al guardar la nota');
        } finally {
            setSaving(false);
        }
    };

    const toggleBold = () => editor?.chain().focus().toggleBold().run();
    const toggleItalic = () => editor?.chain().focus().toggleItalic().run();
    const toggleBulletList = () => editor?.chain().focus().toggleBulletList().run();
    const toggleOrderedList = () => editor?.chain().focus().toggleOrderedList().run();
    const toggleH2 = () => editor?.chain().focus().toggleHeading({ level: 2 }).run();
    const toggleH3 = () => editor?.chain().focus().toggleHeading({ level: 3 }).run();

    if (!editor) return null;

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-xl flex items-center gap-2">
                        <HardHat className="h-5 w-5" />
                        {note ? 'Editar Nota de Fiscalización' : 'Nueva Nota de Fiscalización'}
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground">
                        Fecha: {note?.date || new Date().toLocaleDateString('es-CL')}
                    </p>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Worker Selection */}
                    <div className="space-y-3">
                        <Label className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Trabajadores asociados a esta nota
                        </Label>

                        {/* Selected Workers Tags */}
                        {selectedWorkers.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {selectedWorkers.map(worker => (
                                    <div
                                        key={worker.id}
                                        className="flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                                    >
                                        <span>{worker.full_name}</span>
                                        <button
                                            type="button"
                                            onClick={() => removeWorker(worker.id)}
                                            className="hover:bg-primary/20 rounded-full p-0.5"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Search Input */}
                        <div className="relative">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar trabajador por nombre, CI o contratista..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>

                        {/* Workers List */}
                        <div className="border border-border rounded-lg max-h-40 overflow-y-auto">
                            {loadingWorkers ? (
                                <div className="p-4 text-center text-muted-foreground">
                                    Cargando trabajadores...
                                </div>
                            ) : filteredWorkers.length === 0 ? (
                                <div className="p-4 text-center text-muted-foreground">
                                    {workersInside.length === 0
                                        ? 'No hay trabajadores dentro de la obra'
                                        : 'No se encontraron trabajadores con ese criterio'
                                    }
                                </div>
                            ) : (
                                <div className="divide-y divide-border">
                                    {filteredWorkers.map(worker => {
                                        const isSelected = selectedWorkers.some(w => w.id === worker.id);
                                        return (
                                            <button
                                                key={worker.id}
                                                type="button"
                                                onClick={() => toggleWorker(worker)}
                                                className={cn(
                                                    "w-full px-4 py-2 text-left hover:bg-muted/50 transition-colors flex items-center justify-between",
                                                    isSelected && "bg-primary/10"
                                                )}
                                            >
                                                <div>
                                                    <p className="font-medium text-sm">{worker.full_name}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        CI: {worker.ci} {worker.contractor && `• ${worker.contractor}`}
                                                    </p>
                                                </div>
                                                {isSelected && (
                                                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                                        <span className="text-primary-foreground text-xs">✓</span>
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Toolbar */}
                    <div className="flex flex-wrap gap-2 p-2 border border-border rounded-lg bg-muted/30">
                        <Button
                            type="button"
                            variant={editor.isActive('bold') ? 'default' : 'outline'}
                            size="sm"
                            onClick={toggleBold}
                            title="Negrita"
                        >
                            <Bold className="h-4 w-4" />
                        </Button>
                        <Button
                            type="button"
                            variant={editor.isActive('italic') ? 'default' : 'outline'}
                            size="sm"
                            onClick={toggleItalic}
                            title="Cursiva"
                        >
                            <Italic className="h-4 w-4" />
                        </Button>
                        <div className="w-px h-6 bg-border" />
                        <Button
                            type="button"
                            variant={editor.isActive('bulletList') ? 'default' : 'outline'}
                            size="sm"
                            onClick={toggleBulletList}
                            title="Lista con viñetas"
                        >
                            <List className="h-4 w-4" />
                        </Button>
                        <Button
                            type="button"
                            variant={editor.isActive('orderedList') ? 'default' : 'outline'}
                            size="sm"
                            onClick={toggleOrderedList}
                            title="Lista numerada"
                        >
                            <ListOrdered className="h-4 w-4" />
                        </Button>
                        <div className="w-px h-6 bg-border" />
                        <Button
                            type="button"
                            variant={editor.isActive('heading', { level: 2 }) ? 'default' : 'outline'}
                            size="sm"
                            onClick={toggleH2}
                            title="Título 2"
                        >
                            <Heading2 className="h-4 w-4" />
                        </Button>
                        <Button
                            type="button"
                            variant={editor.isActive('heading', { level: 3 }) ? 'default' : 'outline'}
                            size="sm"
                            onClick={toggleH3}
                            title="Título 3"
                        >
                            <Heading3 className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Editor */}
                    <div className="border border-border rounded-lg overflow-hidden bg-card">
                        <div className="p-2 border-b border-border bg-muted/30">
                            <p className="text-sm font-medium">Comentarios de Fiscalización</p>
                            <p className="text-xs text-muted-foreground">
                                Describe trabajos realizados, observaciones y falencias
                            </p>
                        </div>
                        <EditorContent editor={editor} />
                    </div>

                    {/* Character Counter */}
                    <div className="flex justify-end">
                        <p className={`text-sm ${charCount > MAX_CHARS ? 'text-red-500' : 'text-muted-foreground'}`}>
                            {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()} caracteres
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={saving || charCount > MAX_CHARS || selectedWorkers.length === 0}>
                        {saving ? 'Guardando...' : 'Guardar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
