import { useState } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, History, Wrench, FileText, Upload } from 'lucide-react';
import SettingsTab from './SettingsTab';
import AuditLogTab from './AuditLogTab';
import ToolsTab from './ToolsTab';
import ReportsTab from './ReportsTab';
import ImportTab from './ImportTab';

export default function SupervisorPanel() {
  const { isSupervisor } = useSite();
  const [activeTab, setActiveTab] = useState('settings');

  if (!isSupervisor) {
    return (
      <div className="card-cosmos p-8 text-center">
        <p className="text-muted-foreground">
          No tienes permisos de supervisor para acceder a este panel.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-primary" />
        <h2 className="text-xl font-semibold">Panel Supervisor</h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-flex">
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="w-4 h-4 hidden sm:block" />
            <span>Config</span>
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <History className="w-4 h-4 hidden sm:block" />
            <span>Historial</span>
          </TabsTrigger>
          <TabsTrigger value="tools" className="gap-2">
            <Wrench className="w-4 h-4 hidden sm:block" />
            <span>Herram.</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <FileText className="w-4 h-4 hidden sm:block" />
            <span>Reportes</span>
          </TabsTrigger>
          <TabsTrigger value="import" className="gap-2">
            <Upload className="w-4 h-4 hidden sm:block" />
            <span>Importar</span>
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="settings">
            <SettingsTab />
          </TabsContent>
          <TabsContent value="audit">
            <AuditLogTab />
          </TabsContent>
          <TabsContent value="tools">
            <ToolsTab />
          </TabsContent>
          <TabsContent value="reports">
            <ReportsTab />
          </TabsContent>
          <TabsContent value="import">
            <ImportTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
