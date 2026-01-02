import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import EntryTab from '@/components/operation/EntryTab';
import ExitTab from '@/components/operation/ExitTab';
import NewWorkerTab from '@/components/operation/NewWorkerTab';
import NewVisitorTab from '@/components/operation/NewVisitorTab';
import FavoritesTab from '@/components/operation/FavoritesTab';

interface ActionDrawerProps {
    activeAction: string;
    onOpenChange: (open: boolean) => void;
}

export default function ActionDrawer({ activeAction, onOpenChange }: ActionDrawerProps) {
    // If activeAction is not empty, the sheet is open
    const isOpen = !!activeAction;

    const renderContent = () => {
        switch (activeAction) {
            case 'entry':
                return <EntryTab />;
            case 'exit':
                return <ExitTab />;
            case 'worker':
                return <NewWorkerTab />;
            case 'visitor':
                return <NewVisitorTab />;
            case 'favorites':
                return <FavoritesTab />;
            default:
                return null;
        }
    };

    const getTitle = () => {
        switch (activeAction) {
            case 'entry': return 'Registrar Entrada';
            case 'exit': return 'Registrar Salida';
            case 'worker': return 'Nuevo Trabajador';
            case 'visitor': return 'Nueva Visita';
            case 'favorites': return 'Favoritos';
            default: return '';
        }
    };

    return (
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="rounded-t-3xl h-[90vh] sm:h-full sm:w-[400px] sm:max-w-none sm:right-0 sm:left-auto sm:border-l sm:rounded-none">
                <SheetHeader className="pb-4">
                    <SheetTitle>{getTitle()}</SheetTitle>
                </SheetHeader>
                <div className="overflow-y-auto h-full pb-20">
                    {renderContent()}
                </div>
            </SheetContent>
        </Sheet>
    );
}
