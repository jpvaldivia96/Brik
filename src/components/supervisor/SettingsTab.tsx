import { useState, useEffect } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCosmos } from '@/components/ui/alert-cosmos';
import { Spinner } from '@/components/ui/spinner';
import { Settings, Save, Building2, LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function SettingsTab() {
  const { currentSite, currentSettings, refreshSites, selectSite } = useSite();
  const { signOut } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    warn_hours: 10,
    crit_hours: 12,
    seguro_warn_days: 30,
  });

  useEffect(() => {
    if (currentSettings) {
      setForm({
        warn_hours: Number(currentSettings.warn_hours) || 10,
        crit_hours: Number(currentSettings.crit_hours) || 12,
        seguro_warn_days: currentSettings.seguro_warn_days || 30,
      });
    }
  }, [currentSettings]);

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

  const handleChangeSite = () => {
    localStorage.removeItem('brik_current_site');
    selectSite('');
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-purple-400" />
        <h3 className="text-lg font-medium text-white">Configuración de Obra</h3>
      </div>

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

      <div className="card-cosmos p-6">
        <h4 className="font-medium mb-4 text-white/90">Información de la Obra</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-white/50">Nombre:</span>
            <p className="font-medium text-white">{currentSite?.name}</p>
          </div>
          <div>
            <span className="text-white/50">Zona horaria:</span>
            <p className="font-medium text-white">{currentSite?.timezone}</p>
          </div>
        </div>
      </div>

      {/* Account Actions */}
      <div className="card-cosmos p-6">
        <h4 className="font-medium mb-4 text-white/90">Cuenta</h4>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            onClick={handleChangeSite}
            className="bg-white/10 border-white/20 text-white/80 hover:bg-white/20 hover:text-white"
          >
            <Building2 className="w-4 h-4 mr-2" />
            Cambiar obra
          </Button>
          <Button
            variant="outline"
            onClick={signOut}
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

