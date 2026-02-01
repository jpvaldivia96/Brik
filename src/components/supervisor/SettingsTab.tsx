import { useState, useEffect } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Settings, Save, Building2, LogOut, UserCog, Bell, Upload, Sliders, RotateCcw, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import UserManagementTab from './UserManagementTab';
import { PersonalNotificationSettings } from '../settings/PersonalNotificationSettings';
import ImportTab from './ImportTab';

// Super usuarios que pueden resetear demos
const SUPER_USER_EMAILS = [
  'juanpablovaldc@gmail.com',
  'admin@brik.pro',
];

type SettingsSubTab = 'obra' | 'users' | 'alerts' | 'import';

const subTabs = [
  { id: 'obra' as const, icon: Sliders, label: 'Obra' },
  { id: 'users' as const, icon: UserCog, label: 'Usuarios' },
  { id: 'alerts' as const, icon: Bell, label: 'Alertas' },
  { id: 'import' as const, icon: Upload, label: 'Importar' },
];

export default function SettingsTab() {
  const { currentSite, currentSettings, refreshSites, selectSite } = useSite();
  const { signOut, user } = useAuth();
  const { toast } = useToast();
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>('obra');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [resettingDemo, setResettingDemo] = useState(false);

  // Verificar si es super usuario
  const isSuperUser = user?.email && SUPER_USER_EMAILS.includes(user.email);
  const [form, setForm] = useState({
    warn_hours: 10,
    crit_hours: 12,
    seguro_warn_days: 30,
  });
  const [siteForm, setSiteForm] = useState({
    name: '',
  });

  useEffect(() => {
    if (currentSettings) {
      setForm({
        warn_hours: Number(currentSettings.warn_hours) || 10,
        crit_hours: Number(currentSettings.crit_hours) || 12,
        seguro_warn_days: currentSettings.seguro_warn_days || 30,
      });
    }
    if (currentSite) {
      setSiteForm({
        name: currentSite.name || '',
      });
      checkIfOwner();
    }
  }, [currentSettings, currentSite]);

  const checkIfOwner = async () => {
    if (!currentSite || !user) return;
    try {
      const { data: membership } = await supabase
        .from('site_memberships')
        .select('role')
        .eq('site_id', currentSite.id)
        .eq('user_id', user.id)
        .single();

      const role = membership?.role as string;
      setIsOwner(role === 'owner' || role === 'admin');
    } catch (error) {
      setIsOwner(false);
    }
  };

  const handleSave = async () => {
    if (!currentSite) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('site_settings')
        .update({
          warn_hours: form.warn_hours,
          crit_hours: form.crit_hours,
          seguro_warn_days: form.seguro_warn_days,
        })
        .eq('site_id', currentSite.id);

      if (error) throw error;

      // Log audit event
      await supabase.from('audit_events').insert({
        site_id: currentSite.id,
        action: 'SETTINGS_UPDATED',
        entity_type: 'site_settings',
        entity_id: currentSite.id,
        after: form,
      });

      await refreshSites();
      toast({ title: 'Configuración guardada', description: 'Los cambios se aplicaron correctamente.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSiteInfo = async () => {
    if (!currentSite || !isOwner) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('sites')
        .update({
          name: siteForm.name,
        })
        .eq('id', currentSite.id);

      if (error) throw error;

      // Log audit event
      await supabase.from('audit_events').insert({
        site_id: currentSite.id,
        action: 'SITE_INFO_UPDATED',
        entity_type: 'sites',
        entity_id: currentSite.id,
        after: siteForm,
      });

      await refreshSites();
      toast({ title: 'Información actualizada', description: 'Los datos de la obra se guardaron correctamente.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleExportData = async () => {
    if (!currentSite || !isOwner) return;
    setLoading(true);

    try {
      // Fetch all site data for export
      const [accessLogs, people, settings, memberships, invitations] = await Promise.all([
        supabase.from('access_logs').select('*').eq('site_id', currentSite.id),
        supabase.from('people').select('*').eq('site_id', currentSite.id),
        supabase.from('site_settings').select('*').eq('site_id', currentSite.id),
        supabase.from('site_memberships').select('*').eq('site_id', currentSite.id),
        supabase.from('user_invitations').select('*').eq('site_id', currentSite.id),
      ]);

      const exportData = {
        site: currentSite,
        access_logs: accessLogs.data || [],
        people: people.data || [],
        settings: settings.data || [],
        memberships: memberships.data || [],
        invitations: invitations.data || [],
        exported_at: new Date().toISOString(),
      };

      // Create download
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `brik-backup-${currentSite.name}-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Datos exportados', description: 'Se descargó el backup completo del sitio.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAllLogs = async () => {
    if (!currentSite || !isOwner) return;

    const siteName = prompt(`⚠️ PELIGRO: Esto eliminará TODOS los registros de acceso.\n\nEscribe el nombre exacto de la obra "${currentSite.name}" para confirmar:`);

    if (siteName !== currentSite.name) {
      toast({ title: 'Cancelado', description: 'El nombre no coincide.' });
      return;
    }

    const finalConfirm = confirm('¿Estás ABSOLUTAMENTE seguro? Esta acción NO se puede deshacer.');
    if (!finalConfirm) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('access_logs')
        .delete()
        .eq('site_id', currentSite.id);

      if (error) throw error;

      // Log audit event
      await supabase.from('audit_events').insert({
        site_id: currentSite.id,
        action: 'ALL_LOGS_DELETED',
        entity_type: 'access_logs',
        entity_id: currentSite.id,
      });

      toast({ title: 'Logs eliminados', description: 'Todos los registros de acceso fueron eliminados.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivateSite = async () => {
    if (!currentSite || !isOwner) return;

    const confirm1 = confirm('⚠️ Esto marcará la obra como inactiva.\n\nLos usuarios no podrán acceder hasta que se reactive.\n\n¿Continuar?');
    if (!confirm1) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('sites')
        .update({ is_active: false })
        .eq('id', currentSite.id);

      if (error) throw error;

      //Log audit event
      await supabase.from('audit_events').insert({
        site_id: currentSite.id,
        action: 'SITE_DEACTIVATED',
        entity_type: 'sites',
        entity_id: currentSite.id,
      });

      toast({ title: 'Obra desactivada', description: 'La obra ha sido marcada como inactiva.' });
      await refreshSites();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleChangeSite = () => {
    localStorage.removeItem('brik_current_site');
    sessionStorage.setItem('brik_force_site_selector', 'true');
    // Force full page reload to reset all React state
    window.location.replace('/');
  };

  return (
    <div className="space-y-6">
      {/* Header with title */}
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-purple-400" />
        <h3 className="text-lg font-medium text-white">Configuración</h3>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all",
                activeSubTab === tab.id
                  ? "bg-purple-500 text-white shadow-lg"
                  : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      {activeSubTab === 'obra' && (
        <>
          {isOwner ? (
            <div className="card-cosmos p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="warn_hours" className="text-white/80">Horas para WARN</Label>
                  <Input
                    id="warn_hours"
                    type="number"
                    step="0.5"
                    min="1"
                    value={form.warn_hours}
                    onChange={(e) => setForm({ ...form, warn_hours: parseFloat(e.target.value) || 0 })}
                    className="bg-white/10 border-white/20 text-white"
                  />
                  <p className="text-xs text-white/50">Alerta amarilla después de X horas</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="crit_hours" className="text-white/80">Horas para CRIT</Label>
                  <Input
                    id="crit_hours"
                    type="number"
                    step="0.5"
                    min="1"
                    value={form.crit_hours}
                    onChange={(e) => setForm({ ...form, crit_hours: parseFloat(e.target.value) || 0 })}
                    className="bg-white/10 border-white/20 text-white"
                  />
                  <p className="text-xs text-white/50">Alerta roja después de X horas</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="seguro_warn_days" className="text-white/80">Días aviso seguro</Label>
                  <Input
                    id="seguro_warn_days"
                    type="number"
                    min="1"
                    value={form.seguro_warn_days}
                    onChange={(e) => setForm({ ...form, seguro_warn_days: parseInt(e.target.value) || 0 })}
                    className="bg-white/10 border-white/20 text-white"
                  />
                  <p className="text-xs text-white/50">Alertar X días antes del vencimiento</p>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <Button onClick={handleSave} disabled={saving} className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600">
                  {saving ? <Spinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Guardar Configuración
                </Button>
              </div>
            </div>
          ) : (
            <div className="card-cosmos p-6 text-center">
              <p className="text-white/60">Solo el propietario de la obra puede modificar los ajustes de alertas.</p>
            </div>
          )}

          {/* Super User Demo Reset */}
          {isSuperUser && (
            <div className="card-cosmos p-6 border-2 border-amber-500/50">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h4 className="font-medium text-amber-400">Super Usuario - Reset Demo</h4>
              </div>
              <p className="text-white/60 text-sm mb-4">
                Esto eliminará TODOS los datos de esta obra y regenerará datos de demo frescos
                (~130 trabajadores, 15 contratistas, 1 mes de registros).
              </p>
              <Button
                variant="outline"
                onClick={async () => {
                  if (!currentSite) return;
                  const confirm1 = confirm('⚠️ ADVERTENCIA: Esto eliminará TODOS los datos de la obra y regenerará datos de demo.\n\n¿Estás seguro?');
                  if (!confirm1) return;

                  const confirm2 = prompt(`Escribe "RESET" para confirmar:`);
                  if (confirm2 !== 'RESET') {
                    toast({ title: 'Cancelado', description: 'No se escribió RESET correctamente.' });
                    return;
                  }

                  setResettingDemo(true);
                  try {
                    const { data, error } = await supabase.rpc('reset_demo_site', {
                      p_site_id: currentSite.id
                    });

                    if (error) throw error;

                    toast({
                      title: '✅ Demo Reseteada',
                      description: 'Los datos de demo fueron regenerados exitosamente.'
                    });

                    // Refrescar para ver nuevos datos
                    await refreshSites();
                  } catch (err: any) {
                    toast({ title: 'Error', description: err.message, variant: 'destructive' });
                  } finally {
                    setResettingDemo(false);
                  }
                }}
                disabled={resettingDemo}
                className="bg-amber-500/20 border-amber-500/50 text-amber-400 hover:bg-amber-500/30 hover:text-amber-300"
              >
                {resettingDemo ? (
                  <Spinner size="sm" className="mr-2" />
                ) : (
                  <RotateCcw className="w-4 h-4 mr-2" />
                )}
                Reset Demo a Valores Iniciales
              </Button>
            </div>
          )}

          {/* Account Actions */}
          <div className="card-cosmos p-6">
            <h4 className="font-medium mb-4 text-white/90">Cuenta</h4>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleChangeSite();
                }}
                className="bg-white/10 border-white/20 text-white/80 hover:bg-white/20 hover:text-white"
              >
                <Building2 className="w-4 h-4 mr-2" />
                Cambiar obra
              </Button>
              <Button
                variant="outline"
                onClick={async (e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  try {
                    await signOut();
                  } finally {
                    window.location.href = '/auth';
                  }
                }}
                className="bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-300"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Cerrar sesión
              </Button>
            </div>
          </div>
        </>
      )}

      {activeSubTab === 'users' && <UserManagementTab />}
      {activeSubTab === 'alerts' && <PersonalNotificationSettings />}
      {activeSubTab === 'import' && <ImportTab />}
    </div>
  );
}

