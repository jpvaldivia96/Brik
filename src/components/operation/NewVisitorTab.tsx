import { useState } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCosmos } from '@/components/ui/alert-cosmos';
import { Spinner } from '@/components/ui/spinner';
import { Users, LogIn } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function NewVisitorTab() {
  const { currentSite } = useSite();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [form, setForm] = useState({ ci: '', fullName: '', company: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSite) return;

    setSubmitting(true);
    setMessage(null);

    try {
      const { data: person, error: personError } = await supabase
        .from('people')
        .insert({
          site_id: currentSite.id,
          ci: form.ci.trim(),
          full_name: form.fullName.trim(),
          type: 'visitor',
          contractor: form.company.trim() || null,
        })
        .select()
        .single();

      if (personError) throw personError;

      const { error: profileError } = await supabase
        .from('visitors_profile')
        .insert({ person_id: person.id, company: form.company.trim() || null });

      if (profileError) throw profileError;

      toast({ title: 'Visitante creado', description: `${form.fullName} registrado correctamente.` });
      setForm({ ci: '', fullName: '', company: '' });
      setMessage({ type: 'success', text: `Visitante ${form.fullName} creado exitosamente.` });
    } catch (err: any) {
      if (err.message?.includes('duplicate')) {
        setMessage({ type: 'error', text: 'Ya existe una persona con ese CI en esta obra.' });
      } else {
        setMessage({ type: 'error', text: err.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="operation-panel">
      <div className="flex items-center gap-3 mb-6">
        <Users className="w-6 h-6 text-primary" />
        <h2 className="text-lg font-medium">Nuevo Visitante</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ci">CI *</Label>
            <Input id="ci" value={form.ci} onChange={(e) => setForm({ ...form, ci: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fullName">Nombre completo *</Label>
            <Input id="fullName" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="company">Empresa / Contratista</Label>
            <Input id="company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting} variant="outline" className="flex-1 btn-touch">
            {submitting ? <Spinner size="sm" className="mr-2" /> : <Users className="w-5 h-5 mr-2" />}
            Solo Registrar
          </Button>
          <Button
            type="button"
            onClick={async (e) => {
              e.preventDefault();
              if (!currentSite || submitting) return;

              setSubmitting(true);
              setMessage(null);

              try {
                const { data: person, error: personError } = await supabase
                  .from('people')
                  .insert({
                    site_id: currentSite.id,
                    ci: form.ci.trim(),
                    full_name: form.fullName.trim(),
                    type: 'visitor',
                    contractor: form.company.trim() || null,
                  })
                  .select()
                  .single();

                if (personError) throw personError;

                const { error: profileError } = await supabase
                  .from('visitors_profile')
                  .insert({ person_id: person.id, company: form.company.trim() || null });

                if (profileError) throw profileError;

                // Create entry log immediately
                const { error: logError } = await supabase
                  .from('access_logs')
                  .insert({
                    site_id: currentSite.id,
                    person_id: person.id,
                    entry_at: new Date().toISOString(),
                    ci_snapshot: form.ci.trim(),
                    name_snapshot: form.fullName.trim(),
                    type_snapshot: 'visitor',
                    contractor_snapshot: form.company.trim() || null,
                  });

                if (logError) throw logError;

                toast({ title: 'Visitante creado e ingresado', description: `${form.fullName} registrado y ya está dentro.` });
                setForm({ ci: '', fullName: '', company: '' });
                setMessage({ type: 'success', text: `${form.fullName} creado e ingresado exitosamente.` });
              } catch (err: any) {
                if (err.message?.includes('duplicate')) {
                  setMessage({ type: 'error', text: 'Ya existe una persona con ese CI en esta obra.' });
                } else {
                  setMessage({ type: 'error', text: err.message });
                }
              } finally {
                setSubmitting(false);
              }
            }}
            disabled={submitting || !form.ci || !form.fullName}
            className="flex-1 btn-touch bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600"
          >
            {submitting ? <Spinner size="sm" className="mr-2" /> : <LogIn className="w-5 h-5 mr-2" />}
            Registrar e Ingresar
          </Button>
        </div>
      </form>

      {message && <AlertCosmos type={message.type} className="mt-4">{message.text}</AlertCosmos>}
    </div>
  );
}
