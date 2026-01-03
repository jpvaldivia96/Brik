import { useState, useRef } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCosmos } from '@/components/ui/alert-cosmos';
import { Spinner } from '@/components/ui/spinner';
import { Users, LogIn } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { HCaptcha, HCaptchaRef } from '@/components/ui/hcaptcha';
import { useRateLimit } from '@/hooks/useRateLimit';

export default function NewVisitorTab() {
  const { currentSite } = useSite();
  const { user } = useAuth();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  const [form, setForm] = useState({ ci: '', fullName: '', company: '' });

  const captchaRef = useRef<HCaptchaRef>(null);
  const { checkRateLimit, isLimited, retryAfter } = useRateLimit();

  const formatRetryTime = (seconds: number) => {
    if (seconds >= 60) {
      return `${Math.ceil(seconds / 60)} minuto(s)`;
    }
    return `${seconds} segundos`;
  };

  const handleSubmit = async (e: React.FormEvent, createEntry = false) => {
    e.preventDefault();
    if (!currentSite || !user) return;

    setSubmitting(true);
    setMessage(null);

    try {
      // Get hCaptcha token (invisible)
      const captchaToken = await captchaRef.current?.execute();

      // Check rate limit
      const rateLimitResult = await checkRateLimit(
        'register_person',
        user.id,
        currentSite.id,
        captchaToken || undefined
      );

      if (!rateLimitResult.allowed) {
        if (rateLimitResult.requiresCaptcha) {
          setMessage({ type: 'error', text: 'Verificación de seguridad fallida. Por favor intenta de nuevo.' });
        } else {
          const minutes = Math.ceil((rateLimitResult.retryAfter || 3600) / 60);
          setMessage({
            type: 'warning',
            text: `Has excedido el límite de registros (20 por hora). Por favor espera ${minutes} minuto(s).`
          });
        }
        captchaRef.current?.reset();
        setSubmitting(false);
        return;
      }

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

      if (createEntry) {
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
        setMessage({ type: 'success', text: `${form.fullName} creado e ingresado exitosamente.` });
      } else {
        toast({ title: 'Visitante creado', description: `${form.fullName} registrado correctamente.` });
        setMessage({ type: 'success', text: `Visitante ${form.fullName} creado exitosamente.` });
      }

      setForm({ ci: '', fullName: '', company: '' });
    } catch (err: any) {
      if (err.message?.includes('duplicate')) {
        setMessage({ type: 'error', text: 'Ya existe una persona con ese CI en esta obra.' });
      } else {
        setMessage({ type: 'error', text: err.message });
      }
    } finally {
      captchaRef.current?.reset();
      setSubmitting(false);
    }
  };

  return (
    <div className="operation-panel">
      <div className="flex items-center gap-3 mb-6">
        <Users className="w-6 h-6 text-primary" />
        <h2 className="text-lg font-medium">Nuevo Visitante</h2>
      </div>

      {isLimited && retryAfter && (
        <AlertCosmos type="warning" className="mb-4">
          Límite de registros excedido. Podrás intentar de nuevo en {formatRetryTime(retryAfter)}.
        </AlertCosmos>
      )}

      <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ci">CI *</Label>
            <Input
              id="ci"
              value={form.ci}
              onChange={(e) => setForm({ ...form, ci: e.target.value })}
              required
              disabled={isLimited}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fullName">Nombre completo *</Label>
            <Input
              id="fullName"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
              disabled={isLimited}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="company">Empresa / Contratista</Label>
            <Input
              id="company"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              disabled={isLimited}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 mt-6">
          <Button type="submit" disabled={submitting || isLimited} variant="outline" className="w-full h-12">
            {submitting ? <Spinner size="sm" className="mr-2" /> : <Users className="w-5 h-5 mr-2" />}
            Solo Registrar
          </Button>
          <Button
            type="button"
            onClick={(e) => handleSubmit(e, true)}
            disabled={submitting || isLimited || !form.ci || !form.fullName}
            className="w-full h-12 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600"
          >
            {submitting ? <Spinner size="sm" className="mr-2" /> : <LogIn className="w-5 h-5 mr-2" />}
            Registrar e Ingresar
          </Button>
        </div>

        {/* Invisible hCaptcha */}
        <HCaptcha ref={captchaRef} />
      </form>

      {message && <AlertCosmos type={message.type} className="mt-4">{message.text}</AlertCosmos>}
    </div>
  );
}
