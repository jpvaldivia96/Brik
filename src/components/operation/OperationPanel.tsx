import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogIn, LogOut, UserPlus, Users, Star } from 'lucide-react';
import EntryTab from './EntryTab';
import ExitTab from './ExitTab';
import NewWorkerTab from './NewWorkerTab';
import NewVisitorTab from './NewVisitorTab';
import FavoritesTab from './FavoritesTab';

export default function OperationPanel() {
  const [activeTab, setActiveTab] = useState('entry');

  return (
    <div className="animate-fade-in">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5 h-auto p-1 bg-muted/50 rounded-xl mb-6">
          <TabsTrigger value="entry" className="tab-cosmos flex-col gap-1 py-3">
            <LogIn className="w-5 h-5" />
            <span className="text-xs">Entrada</span>
          </TabsTrigger>
          <TabsTrigger value="exit" className="tab-cosmos flex-col gap-1 py-3">
            <LogOut className="w-5 h-5" />
            <span className="text-xs">Salida</span>
          </TabsTrigger>
          <TabsTrigger value="worker" className="tab-cosmos flex-col gap-1 py-3">
            <UserPlus className="w-5 h-5" />
            <span className="text-xs">Trabajador</span>
          </TabsTrigger>
          <TabsTrigger value="visitor" className="tab-cosmos flex-col gap-1 py-3">
            <Users className="w-5 h-5" />
            <span className="text-xs">Visitante</span>
          </TabsTrigger>
          <TabsTrigger value="favorites" className="tab-cosmos flex-col gap-1 py-3">
            <Star className="w-5 h-5" />
            <span className="text-xs">Favoritos</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="entry" className="mt-0">
          <EntryTab />
        </TabsContent>
        <TabsContent value="exit" className="mt-0">
          <ExitTab />
        </TabsContent>
        <TabsContent value="worker" className="mt-0">
          <NewWorkerTab />
        </TabsContent>
        <TabsContent value="visitor" className="mt-0">
          <NewVisitorTab />
        </TabsContent>
        <TabsContent value="favorites" className="mt-0">
          <FavoritesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
