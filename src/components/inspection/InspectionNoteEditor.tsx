import { useEffect, useState } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, List, ListOrdered, Heading2, Heading3 } from 'lucide-react';
import { toast } from 'sonner';

interface InspectionNoteEditorProps {
    note?: {
        id: string;
        content: string;
        date: string;
    } | null;
    onClose: () => void;
    onSave: () => void;
}

export default function InspectionNoteEditor({ note, onClose, onSave }: InspectionNoteEditorProps) {
    const { currentSite } = useSite();
    const [saving, setSaving] = useState(false);
    const [charCount, setCharCount] = useState(0);
    const MAX_CHARS = 10000;

    const editor = useEditor({
        extensions: [
            StarterKit,
            Placeholder.configure({
                placeholder: 'Expone trabajos realizados,  falencias detectadas y observaciones de control del día...',
            }),
        ],
        content: note?.content || '',
        onUpdate: ({ editor }) => {
            const text = editor.getText();
            setCharCount(text.length);
        },
        editorProps: {
            attributes: {
                class: 'prose prose-sm max-w-none focus:outline-none min-h-[400px] p-4 text-white prose-invert',
            },
        },
    });

    useEffect(() => {
        if (editor && note?.content) {
            editor.commands.setContent(note.content);
            setCharCount(editor.getText().length);
        }
    }, [editor, note]);

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

        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('No user found');

            if (note?.id) {
                // Update existing note
                const { error } = await supabase
                    .from('inspection_notes')
                    .update({
                        content,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', note.id);

                if (error) throw error;
                toast.success('Nota actualizada correctamente');
            } else {
                // Create new note
                const { error } = await supabase
                    .from('inspection_notes')
                    .insert({
                        site_id: currentSite?.id,
                        inspector_user_id: user.id,
                        content,
                        date: new Date().toISOString().split('T')[0],
                    });

                if (error) throw error;
                toast.success('Nota creada correctamente');
            }

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
                    <DialogTitle className="text-xl">
                        {note ? 'Editar Nota de Control' : 'Nueva Nota de Control'}
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground">
                        Fecha: {note?.date || new Date().toLocaleDateString('es-CL')}
                    </p>
                </DialogHeader>

                <div className="space-y-4">
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
                            <p className="text-sm font-medium">Comentarios</p>
                            <p className="text-xs text-muted-foreground">
                                Expone trabajos, falencias y control del día
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
                    <Button onClick={handleSave} disabled={saving || charCount > MAX_CHARS}>
                        {saving ? 'Guardando...' : 'Guardar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
