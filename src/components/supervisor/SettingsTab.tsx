import { useState, useEffect } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Settings, Save, Building2, LogOut, AlertTriangle, Play, RotateCcw, Key } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Super usuarios que pueden resetear demos
const SUPER_USER_EMAILS = [
  'juanpablovaldc@gmail.com',
  'admin@brik.pro',
];

// ID de la obra demo - único sitio donde Reset Demo está habilitado
const DEMO_SITE_ID = 'a838f172-736d-48b5-8eee-5b83c74ac37c';



export default function SettingsTab() {
  const { currentSite, currentSettings, refreshSites } = useSite();
  const { signOut, user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [resettingDemo, setResettingDemo] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  const [activating, setActivating] = useState(false);

  // Verificar si es super usuario Y está en la obra demo
  const isSuperUser = user?.email && SUPER_USER_EMAILS.includes(user.email);
  const isDemoSite = currentSite?.id === DEMO_SITE_ID;
  const [siteForm, setSiteForm] = useState({
    name: '',
  });

  useEffect(() => {
    if (currentSite) {
      setSiteForm({
        name: currentSite.name || '',
      });
      checkIfOwner();
    }
  }, [currentSite]);



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

  const handleActivateCode = async () => {
    if (!currentSite || !activationCode.trim()) return;
    setActivating(true);
    
    try {
      const { data: keyData, error: keyError } = await supabase
        .from('license_keys')
        .select('*')
        .eq('code', activationCode.trim())
        .maybeSingle();
        
      if (keyError) throw keyError;
      if (!keyData) throw new Error('Código inválido o no existe.');
      if (keyData.status !== 'available') throw new Error('Este código ya fue utilizado.');
      
      const { error: updateError } = await supabase
        .from('license_keys')
        .update({ 
          status: 'redeemed', 
          redeemed_by: currentSite.id, 
          redeemed_at: new Date().toISOString() 
        })
        .eq('id', keyData.id);
        
      if (updateError) throw updateError;
      
      const { error: subError } = await supabase
        .from('site_subscriptions')
        .update({
          plan: keyData.plan_tier,
          status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('site_id', currentSite.id);
        
      if (subError) throw subError;
      
      toast({ title: '¡Plan Activado!', description: `Se ha activado el plan ${keyData.plan_tier.toUpperCase()} exitosamente.` });
      setActivationCode('');
      await refreshSites();
    } catch (e: any) {
      toast({ title: 'Error activando código', description: e.message, variant: 'destructive' });
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Building2 className="w-6 h-6 text-purple-400" />
        <h3 className="text-lg font-medium text-white">Configuración de Obra</h3>
      </div>

      {/* Site Name */}
      {isOwner && (
        <div className="card-cosmos p-6">
          <h4 className="font-medium mb-4 text-white/90">Información de la Obra</h4>
          <div className="space-y-2">
            <Label htmlFor="site_name" className="text-white/80">Nombre de la obra</Label>
            <Input
              id="site_name"
              value={siteForm.name}
              onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })}
              className="bg-white/10 border-white/20 text-white"
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={handleSaveSiteInfo} disabled={saving} className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600">
              {saving ? <Spinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Guardar
            </Button>
          </div>
        </div>
      )}

      {/* Code Activation in Settings */}
      {isOwner && (
        <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-blue-500/5 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Key className="w-24 h-24" />
          </div>
          <h3 className="text-lg font-medium text-white flex items-center gap-2 mb-2">
            <Key className="w-5 h-5 text-purple-400" />
            Activar Licencia
          </h3>
          <p className="text-sm text-white/60 mb-4">Si recibiste o compraste un código de licencia (ej. BRIK-PRO-...), introdúcelo aquí para actualizar el plan de esta obra.</p>
          <div className="flex gap-3 max-w-md">
            <Input
              value={activationCode}
              onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
              placeholder="BRIK-PRO-XXXX-XXXX"
              className="bg-black/40 border-white/10 text-white uppercase font-mono h-11 focus:border-purple-500/50"
            />
            <Button
              onClick={handleActivateCode}
              disabled={activating || !activationCode.trim()}
              className="h-11 bg-purple-500 hover:bg-purple-600 text-white font-medium shadow-lg shadow-purple-500/20 px-6"
            >
              {activating ? <Spinner size="sm" /> : 'Activar'}
            </Button>
          </div>
        </div>
      )}

      {/* Super User Demo Reset */}
      {isSuperUser && isDemoSite && (
        <div className="card-cosmos p-6 border-2 border-amber-500/50">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h4 className="font-medium text-amber-400">Super Usuario - Reset Demo</h4>
          </div>
          <p className="text-white/60 text-sm mb-4">
            Eliminará TODOS los datos y regenerará datos de demo frescos.
          </p>
          <Button
            variant="outline"
            onClick={async () => {
              if (!currentSite) return;
              const confirm1 = confirm('⚠️ ADVERTENCIA: Esto eliminará TODOS los datos.\n\n¿Estás seguro?');
              if (!confirm1) return;
              const confirm2 = prompt('Escribe "RESET" para confirmar:');
              if (confirm2 !== 'RESET') {
                toast({ title: 'Cancelado', description: 'No se escribió RESET.' });
                return;
              }
              setResettingDemo(true);
              try {
                const { data, error } = await supabase.rpc('reset_demo_site', { p_site_id: currentSite.id });
                if (error) throw error;
                toast({ title: '✅ Demo Reseteada', description: 'Datos regenerados.' });
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
            {resettingDemo ? <Spinner size="sm" className="mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
            Reset Demo
          </Button>

          <div className="mt-4 pt-4 border-t border-white/10">
            <Button
              variant="outline"
              onClick={async () => {
                if (!currentSite) return;
                setSimulating(true);
                try {
                  const { data, error } = await supabase.rpc('simulate_demo_activity' as any, { p_site_id: currentSite.id });
                  if (error) throw error;
                  const result = data as any;
                  toast({ title: '✅ Actividad Simulada', description: `Backfill: ${result?.backfill_days} días. Hoy: ${result?.entries_created} entradas.` });
                  await refreshSites();
                } catch (err: any) {
                  toast({ title: 'Error', description: err.message, variant: 'destructive' });
                } finally {
                  setSimulating(false);
                }
              }}
              disabled={simulating}
              className="bg-green-500/20 border-green-500/50 text-green-400 hover:bg-green-500/30 hover:text-green-300 w-full"
            >
              {simulating ? <Spinner size="sm" className="mr-2" /> : <Play className="w-4 h-4 mr-2" />}
              Simular Actividad
            </Button>
          </div>
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
    </div>
  );
}

