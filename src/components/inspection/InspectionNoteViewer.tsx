import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar, User, Clock, Edit } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface InspectionNoteViewerProps {
    note: {
        id: string;
        date: string;
        inspector_email: string;
        content: string;
        created_at: string;
        updated_at: string;
    };
    onClose: () => void;
    onEdit: () => void;
    canEdit: boolean;
}

export default function InspectionNoteViewer({ note, onClose, onEdit, canEdit }: InspectionNoteViewerProps) {
    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-xl">Nota de Control</DialogTitle>
                    <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(note.date), "EEEE, d 'de' MMMM yyyy", { locale: es })}
                        </div>
                        <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            {note.inspector_email}
                        </div>
                        <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            Actualizado: {format(new Date(note.updated_at), "d/MM/yyyy HH:mm", { locale: es })}
                        </div>
                    </div>
                </DialogHeader>

                <div className="border border-border rounded-lg p-6 bg-card">
                    <div
                        className="prose prose-sm max-w-none text-white prose-invert"
                        dangerouslySetInnerHTML={{ __html: note.content }}
                    />
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cerrar
                    </Button>
                    {canEdit && (
                        <Button onClick={onEdit} className="gap-2">
                            <Edit className="h-4 w-4" />
                            Editar
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
