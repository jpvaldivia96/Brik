import { useState, useEffect } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCosmos } from '@/components/ui/alert-cosmos';
import { Spinner } from '@/components/ui/spinner';
import { Settings, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function SettingsTab() {
  const { currentSite, currentSettings, refreshSites } = useSite();
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-primary" />
        <h3 className="text-lg font-medium">Configuración de Obra</h3>
      </div>

      <div className="card-cosmos p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label htmlFor="warn_hours">Horas para WARN</Label>
            <Input
              id="warn_hours"
              type="number"
              step="0.5"
              min="1"
              value={form.warn_hours}
              onChange={(e) => setForm({ ...form, warn_hours: parseFloat(e.target.value) || 0 })}
            />
            <p className="text-xs text-muted-foreground">Alerta amarilla después de X horas</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="crit_hours">Horas para CRIT</Label>
            <Input
              id="crit_hours"
              type="number"
              step="0.5"
              min="1"
              value={form.crit_hours}
              onChange={(e) => setForm({ ...form, crit_hours: parseFloat(e.target.value) || 0 })}
            />
            <p className="text-xs text-muted-foreground">Alerta roja después de X horas</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="seguro_warn_days">Días aviso seguro</Label>
            <Input
              id="seguro_warn_days"
              type="number"
              min="1"
              value={form.seguro_warn_days}
              onChange={(e) => setForm({ ...form, seguro_warn_days: parseInt(e.target.value) || 0 })}
            />
            <p className="text-xs text-muted-foreground">Alertar X días antes del vencimiento</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Guardar Configuración
          </Button>
        </div>
      </div>

      <div className="card-cosmos p-6">
        <h4 className="font-medium mb-4">Información de la Obra</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Nombre:</span>
            <p className="font-medium">{currentSite?.name}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Zona horaria:</span>
            <p className="font-medium">{currentSite?.timezone}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
