import { useEffect, useState } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { PlusCircle, Search, Calendar, User, Edit, Eye, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import InspectionNoteEditor from './InspectionNoteEditor';
import InspectionNoteViewer from './InspectionNoteViewer';
import { toast } from 'sonner';

interface InspectionNote {
    id: string;
    site_id: string;
    inspector_user_id: string;
    inspector_email: string;
    date: string;
    content: string;
    created_at: string;
    updated_at: string;
}

export default function InspectionNotesPanel() {
    const { currentSite } = useSite();
    const [loading, setLoading] = useState(true);
    const [notes, setNotes] = useState<InspectionNote[]>([]);
    const [filteredNotes, setFilteredNotes] = useState<InspectionNote[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<string>('');

    const [showEditor, setShowEditor] = useState(false);
    const [showViewer, setShowViewer] = useState(false);
    const [selectedNote, setSelectedNote] = useState<InspectionNote | null>(null);
    const [editMode, setEditMode] = useState(false);

    useEffect(() => {
        if (currentSite) {
            fetchNotes();
            fetchCurrentUser();
        }
    }, [currentSite]);

    useEffect(() => {
        applyFilters();
    }, [searchQuery, startDate, endDate, notes]);

    const fetchCurrentUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setCurrentUserId(user.id);

            // Get user role
            const { data: membership } = await supabase
                .from('site_memberships')
                .select('role')
                .eq('site_id', currentSite?.id)
                .eq('user_id', user.id)
                .single();

            if (membership) {
                setUserRole(membership.role);
            }
        }
    };

    const fetchNotes = async () => {
        setLoading(true);
        try {
            const { data, error } = await (supabase.rpc as any)('search_inspection_notes', {
                target_site_id: currentSite?.id
            });

            if (error) throw error;
            setNotes(data || []);
            setFilteredNotes(data || []);
        } catch (error) {
            console.error('Error fetching inspection notes:', error);
            toast.error('Error al cargar notas de control');
        } finally {
            setLoading(false);
        }
    };

    const applyFilters = () => {
        let filtered = [...notes];

        // Search query filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(note =>
                note.content.toLowerCase().includes(query) ||
                note.inspector_email.toLowerCase().includes(query)
            );
        }

        // Date range filter
        if (startDate) {
            filtered = filtered.filter(note => note.date >= startDate);
        }
        if (endDate) {
            filtered = filtered.filter(note => note.date <= endDate);
        }

        setFilteredNotes(filtered);
    };

    const handleNewNote = () => {
        setSelectedNote(null);
        setEditMode(false);
        setShowEditor(true);
    };

    const handleViewNote = (note: InspectionNote) => {
        setSelectedNote(note);
        setShowViewer(true);
    };

    const handleEditNote = (note: InspectionNote) => {
        setSelectedNote(note);
        setEditMode(true);
        setShowEditor(true);
    };

    const handleSaveComplete = () => {
        setShowEditor(false);
        setSelectedNote(null);
        setEditMode(false);
        fetchNotes();
    };

    const canEditNote = (note: InspectionNote): boolean => {
        if (!currentUserId) return false;
        // User can edit their own notes
        if (note.inspector_user_id === currentUserId) return true;
        // Supervisors and admins can edit any note
        if (['supervisor', 'admin', 'owner'].includes(userRole)) return true;
        return false;
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Spinner size="lg" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <FileText className="h-6 w-6" />
                        Control de Obra
                    </h2>
                    <p className="text-muted-foreground">Notas de fiscalización y seguimiento diario</p>
                </div>
                <Button onClick={handleNewNote} className="gap-2">
                    <PlusCircle className="h-4 w-4" />
                    Nueva Nota
                </Button>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Buscar y Filtrar</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid md:grid-cols-3 gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por palabras clave..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="pl-10"
                                placeholder="Desde"
                            />
                        </div>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="pl-10"
                                placeholder="Hasta"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Notes List */}
            {filteredNotes.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16">
                        <FileText className="h-16 w-16 text-muted-foreground/50 mb-4" />
                        <p className="text-lg font-medium text-muted-foreground">
                            {notes.length === 0 ? 'No hay notas de control registradas' : 'No se encontraron notas con los filtros aplicados'}
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                            {notes.length === 0 ? 'Crea la primera nota usando el botón "Nueva Nota"' : 'Intenta ajustar los filtros de búsqueda'}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {filteredNotes.map((note) => (
                        <Card key={note.id} className="hover:shadow-lg transition-shadow">
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            <Calendar className="h-4 w-4" />
                                            {format(new Date(note.date), "EEEE, d 'de' MMMM yyyy", { locale: es })}
                                        </CardTitle>
                                        <CardDescription className="flex items-center gap-2">
                                            <User className="h-3 w-3" />
                                            {note.inspector_email}
                                        </CardDescription>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleViewNote(note)}
                                            className="gap-2"
                                        >
                                            <Eye className="h-4 w-4" />
                                            Ver
                                        </Button>
                                        {canEditNote(note) && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleEditNote(note)}
                                                className="gap-2"
                                            >
                                                <Edit className="h-4 w-4" />
                                                Editar
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-sm text-muted-foreground line-clamp-3">
                                    {note.content.substring(0, 200)}
                                    {note.content.length > 200 && '...'}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Modals */}
            {showEditor && (
                <InspectionNoteEditor
                    note={selectedNote}
                    onClose={() => {
                        setShowEditor(false);
                        setSelectedNote(null);
                        setEditMode(false);
                    }}
                    onSave={handleSaveComplete}
                />
            )}

            {showViewer && selectedNote && (
                <InspectionNoteViewer
                    note={selectedNote}
                    onClose={() => {
                        setShowViewer(false);
                        setSelectedNote(null);
                    }}
                    onEdit={() => {
                        setShowViewer(false);
                        handleEditNote(selectedNote);
                    }}
                    canEdit={canEditNote(selectedNote)}
                />
            )}
        </div>
    );
}
